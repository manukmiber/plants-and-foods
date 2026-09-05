/**
 * Mode Mencari Barang: menebang kayu, menggali batu permukaan, memungut
 * barang yang tergeletak, lalu mengantarnya ke peti Merajin atau Pembangun
 * milik pemilik yang sama — supaya mereka tidak pernah kehabisan bahan.
 */

import { FAMILY, LOGS } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { readState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, allCompanions, blockAt, containerAt, dist2, face, getMode, getOwnerId,
  makeItem, particle, putIn, sound, steer,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "LOOTER";
const REACH = 3.2;
const BAG_LIMIT = 128;
const SEARCH_RADIUS = 14;
const STONE_LIKE = [
  "minecraft:stone", "minecraft:cobblestone", "minecraft:andesite",
  "minecraft:diorite", "minecraft:granite", "minecraft:gravel", "minecraft:dirt",
];

const OFFSETS = (() => {
  const out = [];
  for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
    for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz++) {
      for (let dy = -3; dy <= 5; dy++) out.push([dx, dy, dz]);
    }
  }
  out.sort((a, b) => (a[0] ** 2 + a[2] ** 2) - (b[0] ** 2 + b[2] ** 2));
  return out;
})();

function bagCount(bag) {
  return Object.values(bag).reduce((a, b) => a + b, 0);
}

function addToBag(state, id, amount = 1) {
  state.bag[id] = (state.bag[id] ?? 0) + amount;
}

function pickUp(entity, state) {
  let items;
  try {
    items = entity.dimension.getEntities({
      type: "minecraft:item", location: entity.location, maxDistance: 5,
    });
  } catch {
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

function findGatherTarget(entity) {
  const dimension = entity.dimension;
  const at = entity.location;
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  let stoneFallback;

  for (const [dx, dy, dz] of OFFSETS) {
    const block = blockAt(dimension, bx + dx, by + dy, bz + dz);
    if (!block) continue;
    if (LOGS.includes(block.typeId)) {
      return { kind: "log", x: bx + dx, y: by + dy, z: bz + dz };
    }
    if (!stoneFallback && STONE_LIKE.includes(block.typeId)) {
      stoneFallback = { kind: "stone", x: bx + dx, y: by + dy, z: bz + dz };
    }
  }
  return stoneFallback;
}

function gather(entity, state, target) {
  const dimension = entity.dimension;
  const at = { x: target.x + 0.5, y: target.y, z: target.z + 0.5 };
  const d2 = dist2(entity.location, at);
  if (d2 > REACH ** 2) {
    steer(entity, at);
    return target.kind === "log" ? "menuju pohon" : "menuju batu";
  }

  face(entity, at);
  hold(entity, 14, { reason: "gather" });

  if (target.kind === "log") {
    // Tebang batangnya ke atas selama masih log, seperti menebang pohon.
    let felled = 0;
    for (let dy = 0; dy < 8; dy++) {
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
      return "menebang pohon";
    }
    return "pohon sudah hilang";
  }

  const block = blockAt(dimension, target.x, target.y, target.z);
  if (!block || block.isAir) return "batu sudah hilang";
  try {
    addToBag(state, block.typeId, 1);
    block.setType("minecraft:air");
    logInfo(TAG, `${entStr(entity)} menggali ${block.typeId} di ${posStr(target)}`);
    sound(dimension, "dig.stone", at, { volume: 0.5 });
  } catch (e) {
    logWarn(TAG, `Gagal menggali batu di ${posStr(target)}`, e);
  }
  return "menggali batu";
}

// Mencari peti stasiun milik companion lain (perajin lebih diutamakan, lalu
// pembangun) yang sama pemiliknya — cukup mengintip state.station mereka,
// tidak perlu memanggil ensureStation (itu akan membuatkan stasiun baru kalau
// belum ada, dan itu bukan tugas looter).
function findMateStation(entity, ownerId, wantMode) {
  if (!ownerId) return undefined;
  const mates = allCompanions(FAMILY).filter((c) => alive(c) && c.id !== entity.id &&
    getOwnerId(c) === ownerId && getMode(c) === wantMode);
  for (const mate of mates) {
    const station = readState(mate).station;
    if (station) return station;
  }
  return undefined;
}

export function tickLooter(entity, state, owner) {
  logDebug(TAG, `tickLooter dimulai untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  if (!station) return "tidak ada tempat untuk stasiun";

  pickUp(entity, state);

  const full = bagCount(state.bag) >= BAG_LIMIT || state.plan?.looterGoingHome;
  if (full) {
    if (!state.plan) state.plan = {};
    state.plan.looterGoingHome = true;
    const dropOff = findMateStation(entity, ownerId, "crafter") ??
      findMateStation(entity, ownerId, "build") ?? station.chest;
    const dropContainer = dropOff === station.chest
      ? station.container : containerAt(entity.dimension, dropOff);
    const target = { x: dropOff.x + 0.5, y: dropOff.y, z: dropOff.z + 0.5 };
    const d2 = dist2(entity.location, target);
    if (d2 > REACH ** 2) {
      steer(entity, target, 0.4);
      return "membawa hasil ke perajin/pembangun";
    }
    let moved = 0;
    for (const [id, amount] of Object.entries(state.bag)) {
      let left = amount;
      while (left > 0) {
        const take = Math.min(64, left);
        const item = makeItem(id, take);
        if (!item) break;
        putIn(dropContainer, item, entity.dimension, target);
        left -= take;
        moved += take;
      }
      delete state.bag[id];
    }
    face(entity, target);
    hold(entity, 16, { reason: "deposit" });
    sound(entity.dimension, "random.chestopen", target);
    state.plan.looterGoingHome = false;
    if (moved) {
      logInfo(TAG, `${entStr(entity)} menyetor ${moved} barang ke ${posStr(dropOff)}.`);
      sayFrom(entity, "looter");
      report(entity, `${moved} bahan kukumpulkan, siap dipakai perajin atau tukang bangun.`);
    }
    return "menyetor hasil";
  }

  const target = findGatherTarget(entity);
  if (target) return gather(entity, state, target);

  // Tidak ada apa pun di sekitar: melangkah acak kecil supaya area pencarian
  // bergeser, mirip mengembara tapi radiusnya jauh lebih kecil.
  const at = entity.location;
  const angle = Math.random() * Math.PI * 2;
  const step = { x: at.x + Math.cos(angle) * 6, y: at.y, z: at.z + Math.sin(angle) * 6 };
  steer(entity, step, 0.35);
  return "mencari kayu atau batu di sekitar";
}
