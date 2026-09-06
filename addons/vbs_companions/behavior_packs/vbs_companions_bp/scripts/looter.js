/**
 * Mode Mencari Barang.
 *
 * Pencari barang adalah ujung pangkal rantai bahan: dia membaca permintaan
 * bahan (requests.js) dari perajin, pembangun, petani dan penambang, lalu
 * pergi mencari bahan yang DIMINTA — bukan asal menebang apa pun yang lewat.
 * Setelah cukup, bahannya diantar langsung ke peti si pemesan.
 *
 * Kalau tidak ada permintaan sama sekali, dia tetap bekerja: mengumpulkan kayu
 * dan batu untuk stok, dan memungut barang yang tergeletak.
 */

import { LOGS, MATERIAL_REQUESTS, PLANKS, POSE } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { hold } from "./hold.js";
import { idsOf } from "./items.js";
import { isGreeting } from "./look.js";
import { clearRequest, materialRequests } from "./requests.js";
import { writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, blockAt, containerAt, dist2, face, getOwnerId, makeItem,
  particle, putIn, sound, steer,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "LOOTER";
const REACH = 3.2;
const BAG_LIMIT = 128;
const SEARCH_RADIUS = 16;

const STONE_LIKE = [
  "minecraft:stone", "minecraft:cobblestone", "minecraft:andesite",
  "minecraft:diorite", "minecraft:granite", "minecraft:cobbled_deepslate",
  "minecraft:deepslate", "minecraft:tuff",
];
const DIRT_LIKE = [
  "minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt",
  "minecraft:rooted_dirt", "minecraft:podzol",
];
const IRON_LIKE = [
  "minecraft:iron_ore", "minecraft:deepslate_iron_ore", "minecraft:raw_iron_block",
];
const COAL_LIKE = ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"];

// Blok apa yang dicari untuk tiap jenis permintaan bahan.
const HUNT = {
  wood: LOGS,
  planks: LOGS,
  stone: STONE_LIKE,
  dirt: DIRT_LIKE,
  iron: IRON_LIKE,
  coal: COAL_LIKE,
  seed: [],           // bibit hanya bisa dipungut dari tanah, bukan digali
};

// Apa yang dihasilkan blok itu kalau dibongkar tangan kosong.
const YIELD = {
  "minecraft:grass_block": "minecraft:dirt",
  "minecraft:stone": "minecraft:cobblestone",
  "minecraft:iron_ore": "minecraft:raw_iron",
  "minecraft:deepslate_iron_ore": "minecraft:raw_iron",
  "minecraft:coal_ore": "minecraft:coal",
  "minecraft:deepslate_coal_ore": "minecraft:coal",
};

const OFFSETS = (() => {
  const out = [];
  for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
    for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz++) {
      for (let dy = -4; dy <= 5; dy++) out.push([dx, dy, dz]);
    }
  }
  out.sort((a, b) => (a[0] ** 2 + a[2] ** 2) - (b[0] ** 2 + b[2] ** 2));
  return out;
})();

// Menyapu SELURUH OFFSETS tiap denyut berarti membaca lebih dari sepuluh ribu
// blok tiap setengah detik untuk tiap pencari barang — itu membuat dunia
// tersendat. Sapuannya dipotong dan dilanjutkan dari posisi terakhir, jadi
// beban per denyut kecil tapi areanya tetap tersisir habis.
const SCAN_PER_TICK = 700;
const cursors = new Map();

function bagCount(bag) {
  return Object.values(bag ?? {}).reduce((a, b) => a + b, 0);
}

function addToBag(state, id, amount = 1) {
  if (!state.bag) state.bag = {};
  state.bag[id] = (state.bag[id] ?? 0) + amount;
  logDebug(TAG, `Kantong pencari barang: +${amount} ${id} (total ${state.bag[id]})`);
}

/** Berapa banyak bahan jenis ini yang sudah ada di kantong. */
function bagHas(state, kind) {
  const ids = new Set(idsOf(MATERIAL_REQUESTS[kind]?.ids ?? []));
  let n = 0;
  for (const [id, amount] of Object.entries(state.bag ?? {})) {
    if (ids.has(id)) n += amount;
    // Log dihitung setara empat papan kalau yang diminta papan.
    if (kind === "planks" && LOGS.includes(id)) n += amount * 4;
    if (kind === "wood" && PLANKS.includes(id)) n += Math.floor(amount / 4);
  }
  return n;
}

function pickUp(entity, state) {
  let items;
  try {
    items = entity.dimension.getEntities({
      type: "minecraft:item", location: entity.location, maxDistance: 5,
    });
  } catch (e) {
    logWarn(TAG, "Gagal mencari barang yang tergeletak", e);
    return 0;
  }
  let taken = 0;
  for (const drop of items) {
    let stack;
    try {
      stack = drop.getComponent("minecraft:item")?.itemStack;
    } catch {
      continue;
    }
    if (!stack) continue;
    addToBag(state, stack.typeId, stack.amount);
    taken += stack.amount;
    try {
      drop.remove();
    } catch {
      /* sudah hilang */
    }
  }
  if (taken) {
    logInfo(TAG, `${entStr(entity)} memungut ${taken} barang dari tanah.`);
    sound(entity.dimension, "random.pop", entity.location, { volume: 0.4 });
  }
  return taken;
}

function findBlock(entity, wanted, key = "any") {
  if (!wanted.length) return undefined;
  const want = new Set(wanted);
  const dimension = entity.dimension;
  const at = entity.location;
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  const cursorKey = `${entity.id}:${key}`;
  let cursor = cursors.get(cursorKey) ?? 0;

  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const [dx, dy, dz] = OFFSETS[cursor];
    cursor = (cursor + 1) % OFFSETS.length;
    const block = blockAt(dimension, bx + dx, by + dy, bz + dz);
    if (block && want.has(block.typeId)) {
      cursors.set(cursorKey, cursor);
      logDebug(TAG, `Sasaran ${block.typeId} ditemukan di ${posStr({ x: bx + dx, y: by + dy, z: bz + dz })}`);
      return { x: bx + dx, y: by + dy, z: bz + dz, id: block.typeId };
    }
  }
  cursors.set(cursorKey, cursor);
  return undefined;
}

export function forget(id) {
  for (const key of [...cursors.keys()]) {
    if (key.startsWith(`${id}:`)) cursors.delete(key);
  }
}

function harvestBlock(entity, state, target) {
  const dimension = entity.dimension;
  const at = { x: target.x + 0.5, y: target.y, z: target.z + 0.5 };
  if (dist2(entity.location, at) > REACH ** 2) {
    steer(entity, at, 0.36);
    return { walking: true };
  }
  face(entity, at);
  hold(entity, 14, { pose: POSE.mine, reason: "gather" });

  // Batang pohon ditebang sampai atas, blok lain satu per satu.
  if (LOGS.includes(target.id)) {
    let felled = 0;
    for (let dy = 0; dy < 10; dy++) {
      const block = blockAt(dimension, target.x, target.y + dy, target.z);
      if (!block || !LOGS.includes(block.typeId)) break;
      try {
        addToBag(state, block.typeId, 1);
        block.setType("minecraft:air");
        felled++;
      } catch (e) {
        logWarn(TAG, `Gagal menebang log di ${posStr({ x: target.x, y: target.y + dy, z: target.z })}`, e);
        break;
      }
    }
    if (felled) {
      logInfo(TAG, `${entStr(entity)} menebang ${felled} log di ${posStr(target)}`);
      sound(dimension, "dig.wood", at);
      particle(dimension, "minecraft:villager_happy", { x: at.x, y: at.y + 1, z: at.z });
    }
    return { got: felled };
  }

  const block = blockAt(dimension, target.x, target.y, target.z);
  if (!block || block.isAir) return { got: 0 };
  const id = block.typeId;
  try {
    block.setType("minecraft:air");
    addToBag(state, YIELD[id] ?? id, 1);
    logInfo(TAG, `${entStr(entity)} menggali ${id} di ${posStr(target)} -> ${YIELD[id] ?? id}`);
    sound(dimension, "dig.stone", at, { volume: 0.5 });
  } catch (e) {
    logWarn(TAG, `Gagal menggali ${id} di ${posStr(target)}`, e);
    return { got: 0 };
  }
  return { got: 1 };
}

function deliverTo(entity, state, pos, ids, ownerId, req) {
  const target = { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 };
  if (dist2(entity.location, target) > REACH ** 2) {
    steer(entity, target, 0.42);
    return `mengantar bahan ke ${req?.fromName ?? "peti"}`;
  }
  const container = containerAt(entity.dimension, pos);
  if (!container) {
    logWarn(TAG, `Peti tujuan ${posStr(pos)} tidak ada; bahan dijatuhkan di situ.`);
  }
  const want = ids ? new Set(idsOf(ids)) : undefined;
  let moved = 0;
  for (const [id, amount] of Object.entries(state.bag ?? {})) {
    if (want && !want.has(id) && !LOGS.includes(id)) continue;
    let left = amount;
    while (left > 0) {
      const take = Math.min(64, left);
      const item = makeItem(id, take);
      if (!item) break;
      putIn(container, item, entity.dimension, target);
      left -= take;
      moved += take;
    }
    delete state.bag[id];
  }
  face(entity, target);
  hold(entity, 16, { reason: "deposit" });
  sound(entity.dimension, "random.chestopen", target);
  if (moved) {
    logInfo(TAG, `${entStr(entity)} menyetor ${moved} bahan ke ${posStr(pos)}.`);
    sayFrom(entity, "looter");
    report(entity, req
      ? `${moved} ${MATERIAL_REQUESTS[req.kind]?.label ?? "bahan"} sudah kuantar ke ${req.fromName}.`
      : `${moved} bahan kusetor ke peti.`);
  }
  if (req && ownerId) clearRequest(ownerId, req.id);
  return "menyetor bahan";
}

export function tickLooter(entity, state, owner) {
  logDebug(TAG, `tickLooter untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  if (!state.bag) state.bag = {};

  pickUp(entity, state);

  // 1. Ada yang minta bahan? Itu yang dikerjakan lebih dulu.
  const orders = ownerId ? materialRequests(ownerId) : [];
  const req = orders[0];
  if (req) {
    const spec = MATERIAL_REQUESTS[req.kind];
    const want = req.want ?? spec?.want ?? 16;
    const have = bagHas(state, req.kind);
    logDebug(TAG, `Pesanan bahan "${req.kind}" dari ${req.fromName}: punya ${have}/${want}`);

    if (have >= want) {
      const status = deliverTo(entity, state, req.stationPos, spec?.ids, ownerId, req);
      writeState(entity, state);
      return status;
    }

    const target = findBlock(entity, HUNT[req.kind] ?? [], req.kind);
    if (target) {
      const result = harvestBlock(entity, state, target);
      writeState(entity, state);
      if (result.walking) return `menuju ${spec?.label ?? req.kind} untuk ${req.fromName}`;
      return `mengumpulkan ${spec?.label ?? req.kind} untuk ${req.fromName} (${have}/${want})`;
    }

    // Tidak ketemu di sekitar: geser area pencarian.
    roam(entity);
    writeState(entity, state);
    return `mencari ${spec?.label ?? req.kind} untuk ${req.fromName}`;
  }

  // 2. Tidak ada pesanan: kumpulkan stok kayu dan batu ke peti sendiri.
  if (bagCount(state.bag) >= BAG_LIMIT) {
    const drop = station.chest ?? state.station;
    if (drop) {
      const status = deliverTo(entity, state, drop, undefined, ownerId, undefined);
      writeState(entity, state);
      return status;
    }
    logDebug(TAG, "Kantong penuh tapi belum ada peti; menunggu peti berdiri.");
  }

  const target = findBlock(entity, LOGS, "log") ?? findBlock(entity, STONE_LIKE, "stone");
  if (target) {
    const result = harvestBlock(entity, state, target);
    writeState(entity, state);
    if (result.walking) return "menuju kayu atau batu";
    return "mengumpulkan stok kayu dan batu";
  }

  roam(entity);
  writeState(entity, state);
  return "berkeliling mencari kayu atau batu";
}

function roam(entity) {
  const at = entity.location;
  const angle = Math.random() * Math.PI * 2;
  const step = { x: at.x + Math.cos(angle) * 8, y: at.y, z: at.z + Math.sin(angle) * 8 };
  logDebug(TAG, `Tidak ada sasaran di sekitar, bergeser ke ${posStr(step)}`);
  steer(entity, step, 0.35);
}
