/**
 * Stasiun kerja: satu peti dan satu papan nama.
 *
 * Semua role memakai stasiun yang sama. Peti adalah SATU-SATUNYA jalan masuk dan
 * keluar barang: pemain menaruh bibit, bahan alat, ember dan bahan bangunan di
 * situ, dan companion menyetorkan hasil panen, bijih dan barang temuannya ke
 * situ juga. Papannya bukan hiasan — itu yang bikin pemain tahu peti mana milik
 * companion yang mana, dan itu penting di server yang petinya banyak.
 *
 * Kalau di dekat companion sudah ada peti, peti ITU yang dipakai. Peti baru
 * hanya dipasang kalau memang tidak ada satu pun — companion membawa petinya
 * sendiri, tidak mengambil kayu pemain untuk itu.
 */

import { MODES } from "./config.js";
import { displayName } from "./nametag.js";
import { patchState } from "./state.js";
import {
  blockAt, chunkOf, containerAt, getMode, getOwnerName, isAir, isSolid, sound,
} from "./util.js";

const CHEST = "minecraft:chest";
const SIGN = "minecraft:standing_sign";
const CHESTS = new Set([CHEST, "minecraft:trapped_chest", "minecraft:barrel"]);

function chestNear(dimension, origin, radius = 10) {
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 3; dy++) {
          const block = blockAt(dimension, origin.x + dx, origin.y + dy, origin.z + dz);
          if (block && CHESTS.has(block.typeId)) {
            return { x: block.x, y: block.y, z: block.z };
          }
        }
      }
    }
  }
  return undefined;
}

function freeSpot(dimension, origin, radius = 5) {
  for (let r = 2; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = 1; dy >= -2; dy--) {
          const spot = blockAt(dimension, origin.x + dx, origin.y + dy, origin.z + dz);
          const above = blockAt(dimension, origin.x + dx, origin.y + dy + 1, origin.z + dz);
          const floor = blockAt(dimension, origin.x + dx, origin.y + dy - 1, origin.z + dz);
          if (isAir(spot) && isAir(above) && isSolid(floor)) {
            return { x: spot.x, y: spot.y, z: spot.z };
          }
        }
      }
    }
  }
  return undefined;
}

/** Tulis papan. Diam-diam gagal kalau versi gim tidak menyediakan komponennya. */
function writeSign(dimension, pos, entity) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  if (!block) return false;
  const { cx, cz } = chunkOf(pos);
  const mode = MODES[getMode(entity)] ?? MODES.follow;
  try {
    block.getComponent("minecraft:sign")?.setText(
      `§0${displayName(entity)}\n${mode.label}\nmilik ${getOwnerName(entity)}\n(${cx}, ${cz})`);
    return true;
  } catch {
    return false;
  }
}

/** Perbarui tulisan papan supaya tugasnya selalu cocok dengan mode sekarang. */
export function refreshSign(entity, state) {
  if (!state.sign) return;
  writeSign(entity.dimension, state.sign, entity);
}

/**
 * Pastikan companion punya stasiun. Mengembalikan { chest, container } atau
 * undefined kalau belum bisa dibuat (misalnya masih di udara atau di dalam air).
 */
export function ensureStation(entity, state) {
  const dimension = entity.dimension;
  const here = {
    x: Math.floor(entity.location.x),
    y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };

  // stasiun yang tercatat masih ada?
  if (state.station) {
    const block = blockAt(dimension, state.station.x, state.station.y, state.station.z);
    if (block && CHESTS.has(block.typeId)) {
      return { chest: state.station, container: containerAt(dimension, state.station) };
    }
    state.station = null;                    // petinya dibongkar pemain
  }

  // peti yang sudah ada di sekitar dipakai apa adanya
  const found = chestNear(dimension, here);
  if (found) {
    patchState(entity, { station: found });
    state.station = found;
    return { chest: found, container: containerAt(dimension, found) };
  }

  // belum ada: pasang peti sendiri, lalu papan di sebelahnya
  const spot = freeSpot(dimension, here);
  if (!spot) return undefined;
  const block = blockAt(dimension, spot.x, spot.y, spot.z);
  try {
    block.setType(CHEST);
  } catch {
    return undefined;
  }
  sound(dimension, "random.wood_click", spot);

  let sign = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const at = blockAt(dimension, spot.x + dx, spot.y, spot.z + dz);
    const floor = blockAt(dimension, spot.x + dx, spot.y - 1, spot.z + dz);
    if (!isAir(at) || !isSolid(floor)) continue;
    try {
      at.setType(SIGN);
      sign = { x: at.x, y: at.y, z: at.z };
      writeSign(dimension, sign, entity);
    } catch {
      sign = null;
    }
    break;
  }

  patchState(entity, { station: spot, sign });
  state.station = spot;
  state.sign = sign;
  return { chest: spot, container: containerAt(dimension, spot) };
}

/** Peti stasiun kalau ada, tanpa membuat yang baru. */
export function stationContainer(entity, state) {
  if (!state.station) return undefined;
  return containerAt(entity.dimension, state.station);
}
