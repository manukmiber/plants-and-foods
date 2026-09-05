/**
 * Companion menghias sawahnya sendiri.
 */

import { POSE, PROTECTED } from "./config.js";
import { hold } from "./hold.js";
import {
  alive, blockAt, countIn, dist2, face, isAir, isSolid, particle, sound, steer,
  takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "DECORATE";
const FENCES = [
  "minecraft:oak_fence", "minecraft:spruce_fence", "minecraft:birch_fence",
  "minecraft:jungle_fence", "minecraft:acacia_fence", "minecraft:dark_oak_fence",
  "minecraft:mangrove_fence", "minecraft:cherry_fence", "minecraft:bamboo_fence",
  "minecraft:crimson_fence", "minecraft:warped_fence", "minecraft:nether_brick_fence",
];
const LIGHTS = ["minecraft:lantern", "minecraft:torch"];
const HAY = "minecraft:hay_block";
const PUMPKINS = ["minecraft:carved_pumpkin", "minecraft:lit_pumpkin", "minecraft:pumpkin"];
const FLOWERS = [
  "minecraft:poppy", "minecraft:dandelion", "minecraft:cornflower",
  "minecraft:oxeye_daisy", "minecraft:red_tulip", "minecraft:orange_tulip",
  "minecraft:azure_bluet", "minecraft:allium",
];

const REACH = 5.5;

function perimeter(area) {
  const out = [];
  for (let x = area.x0; x <= area.x1; x++) out.push({ x, z: area.z0 });
  for (let z = area.z0 + 1; z <= area.z1; z++) out.push({ x: area.x1, z });
  for (let x = area.x1 - 1; x >= area.x0; x--) out.push({ x, z: area.z1 });
  for (let z = area.z1 - 1; z > area.z0; z--) out.push({ x: area.x0, z });
  return out;
}

function isCorner(area, p) {
  return (p.x === area.x0 || p.x === area.x1) && (p.z === area.z0 || p.z === area.z1);
}

function standingSpot(dimension, x, z, baseY) {
  logDebug(TAG, `Mencari standingSpot di (${x}, ${z}) sekitar baseY: ${baseY}`);
  for (let y = baseY + 2; y >= baseY - 3; y--) {
    const floor = blockAt(dimension, x, y, z);
    const above = blockAt(dimension, x, y + 1, z);
    const above2 = blockAt(dimension, x, y + 2, z);
    if (!floor || !above) continue;
    if (!isSolid(floor)) continue;
    if (PROTECTED.has(floor.typeId)) return undefined;
    if (!isAir(above)) return undefined;
    return { floor, above, above2 };
  }
  return undefined;
}

function firstAvailable(container, ids) {
  const found = ids.find((id) => countIn(container, id) > 0);
  logDebug(TAG, `firstAvailable cek: ${found ?? "TIDAK ADA"}`);
  return found;
}

export function decorateStep(entity, state, area, container) {
  logDebug(TAG, `decorateStep dijalankan untuk ${entStr(entity)}`);
  if (!alive(entity) || !container) {
    logDebug(TAG, "decorateStep dibatalkan: entity mati atau peti null.");
    return undefined;
  }
  if (state.decorated) {
    logDebug(TAG, "Ladang sudah berstatus 'decorated', langkah dekorasi dilewati.");
    return undefined;
  }

  const dimension = entity.dimension;
  const ring = perimeter(area);
  const plan = state.plan ?? {};
  let cursor = typeof plan.decor === "number" ? plan.decor : 0;

  const fence = firstAvailable(container, FENCES);
  const light = firstAvailable(container, LIGHTS);
  const hay = countIn(container, HAY) > 0 ? HAY : undefined;
  const pumpkin = firstAvailable(container, PUMPKINS);
  const flower = firstAvailable(container, FLOWERS);

  if (!fence && !light && !hay && !pumpkin && !flower) {
    logDebug(TAG, "Tidak ada item dekorasi apapun di peti.");
    return undefined;
  }

  // Orang-orangan sawah di tengah
  if (!plan.scarecrow && fence && pumpkin) {
    logInfo(TAG, "Mencoba membuat orang-orangan sawah di tengah ladang...");
    const cx = Math.floor((area.x0 + area.x1) / 2);
    const cz = Math.floor((area.z0 + area.z1) / 2);
    const spot = standingSpot(dimension, cx, cz, area.y);
    if (spot && spot.above2 && isAir(spot.above2)) {
      const target = { x: cx + 0.5, y: spot.floor.y + 1, z: cz + 0.5 };
      const d2 = dist2(entity.location, target);
      if (d2 > REACH ** 2) {
        logDebug(TAG, `Menuju tengah ladang untuk memasang scarecrow (${Math.sqrt(d2).toFixed(1)}m > ${REACH}m)`);
        steer(entity, target);
        return "menuju tengah ladang";
      }
      if (takeFrom(container, fence, 1) === 1 && takeFrom(container, pumpkin, 1) === 1) {
        try {
          spot.above.setType(fence);
          spot.above2.setType(pumpkin);
          plan.scarecrow = true;
          state.plan = plan;
          face(entity, target);
          hold(entity, 20, { pose: POSE.build, reason: "decor" });
          sound(dimension, "random.wood_click", target);
          logInfo(TAG, `Orang-orangan sawah berhasil dipasang di (${cx}, ${spot.floor.y + 1}, ${cz})`);
          return "memasang orang-orangan sawah";
        } catch (e) {
          logWarn(TAG, "Gagal menaruh blok orang-orangan sawah", e);
        }
      }
    }
    plan.scarecrow = true;
  }

  // Pagar keliling & lampu
  logDebug(TAG, `Memeriksa dekorasi perimeter: total titik = ${ring.length}, cursor = ${cursor}`);
  for (let n = 0; n < ring.length; n++) {
    const p = ring[cursor];
    const index = cursor;
    cursor = (cursor + 1) % ring.length;

    const spot = standingSpot(dimension, p.x, p.z, area.y);
    if (!spot) continue;

    let what;
    let onTop;
    if (isCorner(area, p) && hay) what = hay;
    else if (fence) {
      what = fence;
      if (light && index % 5 === 0) onTop = light;
    } else if (flower) what = flower;
    if (!what) continue;

    const target = { x: p.x + 0.5, y: spot.floor.y + 1, z: p.z + 0.5 };
    const d2 = dist2(entity.location, target);
    if (d2 > REACH ** 2) {
      logDebug(TAG, `Menuju pinggir ladang (${Math.sqrt(d2).toFixed(1)}m > ${REACH}m)`);
      plan.decor = index;
      state.plan = plan;
      steer(entity, target);
      return "menuju pinggir ladang";
    }

    if (takeFrom(container, what, 1) !== 1) {
      logWarn(TAG, `Gagal mengambil ${what} dari peti saat mau dipasang.`);
      continue;
    }
    try {
      spot.above.setType(what);
      logInfo(TAG, `Berhasil memasang dekorasi "${what}" di (${p.x}, ${spot.above.y}, ${p.z})`);
    } catch (e) {
      logWarn(TAG, `Gagal setType dekorasi ${what}`, e);
      continue;
    }
    if (onTop && spot.above2 && isAir(spot.above2) && takeFrom(container, onTop, 1) === 1) {
      try {
        spot.above2.setType(onTop);
        logInfo(TAG, `Berhasil menaruh lampu "${onTop}" di atas pagar.`);
      } catch (e) {
        logWarn(TAG, `Gagal menaruh lampu ${onTop}`, e);
      }
    }
    face(entity, target);
    hold(entity, 14, { pose: POSE.build, reason: "decor" });
    sound(dimension, "random.wood_click", target);
    particle(dimension, "minecraft:villager_happy", { x: target.x, y: target.y + 0.5, z: target.z });
    plan.decor = cursor;
    state.plan = plan;
    return "menghias pinggir ladang";
  }

  plan.decor = cursor;
  state.plan = plan;
  state.decorated = true;
  logInfo(TAG, `Satu putaran penuh selesai, tidak ada lagi yang bisa dihias. state.decorated diset TRUE.`);
  return undefined;
}

export function resetDecor(state) {
  logInfo(TAG, "resetDecor dipanggil: status dekorasi di-reset ke awal.");
  state.decorated = false;
  if (state.plan) {
    state.plan.decor = 0;
    state.plan.scarecrow = false;
  }
}