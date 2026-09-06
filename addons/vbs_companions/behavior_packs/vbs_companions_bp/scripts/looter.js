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
 *
 * Cara mencari dan membongkar bloknya sendiri ada di gather.js, dipakai
 * bersama companion yang terpaksa mencari bahannya sendiri (selfhelp.js).
 */

import { system } from "@minecraft/server";

import { LOGS, MATERIAL_REQUESTS } from "./config.js";
import { report, sayFrom } from "./chat.js";
import {
  countKind, findBlock, findMaterial, forget as forgetCursors, harvestBlock,
  roam, STONE_LIKE,
} from "./gather.js";
import { hold } from "./hold.js";
import { idsOf } from "./items.js";
import { isGreeting } from "./look.js";
import { clearRequest, materialRequests } from "./requests.js";
import { writeState } from "./state.js";
import { ensureStation, stationTravel } from "./station.js";
import {
  alive, containerAt, dist2, face, getGear, getOwnerId, makeItem, putIn, sound,
  steer,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "LOOTER";
const REACH = 3.2;
const BAG_LIMIT = 128;

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
  return countKind(state.bag, kind, idsOf(MATERIAL_REQUESTS[kind]?.ids ?? []));
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

export function forget(id) {
  forgetCursors(id);
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

// Berapa lama satu pesanan dipegang sebelum gilirannya diserahkan ke pesanan
// berikutnya. Tanpa giliran, pesanan PALING TUA memenangkan segalanya: satu
// permintaan "besi" yang tidak ada bijihnya di permukaan membuat pencari barang
// berkeliling selamanya, sementara pembangun di sebelahnya kehabisan kayu dan
// penambang berdiri bertangan kosong. Itu persis keluhan yang ada.
const ORDER_TURN = 1200;   // ~60 detik per pesanan

/**
 * Pesanan mana yang dikerjakan sekarang.
 *
 * Urutannya: yang bahannya sudah cukup di kantong (tinggal diantar), lalu
 * pesanan yang sedang dipegang selama gilirannya belum habis, lalu — saat
 * giliran berganti — pesanan pertama yang bahannya BENAR-BENAR ada di sekitar
 * sini. Kalau tidak satu pun ketemu, giliran tetap bergeser supaya tiap
 * pemesan kebagian dicarikan.
 */
function chooseOrder(entity, state, orders) {
  if (!orders.length) return undefined;
  const now = system.currentTick;

  for (const req of orders) {
    const spec = MATERIAL_REQUESTS[req.kind];
    if (bagHas(state, req.kind) >= (req.want ?? spec?.want ?? 16)) {
      state.order = { id: req.id, since: now };
      return req;
    }
  }

  const held = orders.find((r) => r.id === state.order?.id);
  if (held && now - (state.order.since ?? 0) < ORDER_TURN) return held;

  const start = held ? orders.indexOf(held) + 1 : 0;
  for (let n = 0; n < orders.length; n++) {
    const req = orders[(start + n) % orders.length];
    if (!findMaterial(entity, req.kind)) continue;
    logInfo(TAG, `Giliran pesanan berpindah ke ${req.kind} milik ${req.fromName} (bahannya ada di sekitar).`);
    state.order = { id: req.id, since: now };
    return req;
  }

  const req = orders[start % orders.length];
  logDebug(TAG, `Tidak ada bahan pesanan yang terlihat; giliran diberikan ke ${req.kind} milik ${req.fromName}.`);
  state.order = { id: req.id, since: now };
  return req;
}

export function tickLooter(entity, state, owner) {
  logDebug(TAG, `tickLooter untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  if (!state.bag) state.bag = {};

  // Balai kerja bersama dulu: pencari barang yang mengantar ke peti yang
  // tidak dilihat siapa-siapa sama saja dengan tidak mengantar.
  const trip = stationTravel(entity, station);
  if (trip) {
    writeState(entity, state);
    return trip;
  }

  const tool = getGear(entity).mainhand;
  pickUp(entity, state);

  // 1. Ada yang minta bahan? Itu yang dikerjakan lebih dulu.
  const orders = ownerId ? materialRequests(ownerId) : [];
  const req = chooseOrder(entity, state, orders);
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

    const target = findMaterial(entity, req.kind);
    if (target) {
      const result = harvestBlock(entity, target, (id, n) => addToBag(state, id, n), tool);
      writeState(entity, state);
      if (result.walking) return `menuju ${spec?.label ?? req.kind} untuk ${req.fromName}`;
      if (result.breaking) {
        return `mengambil ${spec?.label ?? req.kind} untuk ${req.fromName} ` +
          `(${Math.round(result.progress * 100)}%)`;
      }
      return `mengumpulkan ${spec?.label ?? req.kind} untuk ${req.fromName} (${have}/${want})`;
    }

    // Tidak ketemu di sekitar: geser area pencarian, tapi tetap dalam
    // jangkauan balai — bahan yang ditemukan seratus blok dari gudang tidak
    // pernah benar-benar sampai ke pemesannya.
    roam(entity, station.chest ?? state.station);
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
    const result = harvestBlock(entity, target, (id, n) => addToBag(state, id, n), tool);
    writeState(entity, state);
    if (result.walking) return "menuju kayu atau batu";
    if (result.breaking) return `menebang/menggali (${Math.round(result.progress * 100)}%)`;
    return "mengumpulkan stok kayu dan batu";
  }

  roam(entity, station.chest ?? state.station);
  writeState(entity, state);
  return "berkeliling mencari kayu atau batu";
}
