/**
 * Stasiun kerja: satu peti dan satu papan nama.
 */

import { MODES } from "./config.js";
import { displayName } from "./nametag.js";
import { patchState } from "./state.js";
import {
  blockAt, chunkOf, containerAt, getMode, getOwnerName, isAir, isSolid, sound,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "STATION";
const CHEST = "minecraft:chest";
const SIGN = "minecraft:standing_sign";
const CHESTS = new Set([CHEST, "minecraft:trapped_chest", "minecraft:barrel"]);

function chestNear(dimension, origin, radius = 10) {
  logDebug(TAG, `Mencari peti yang sudah ada di sekitar ${posStr(origin)} radius ${radius}...`);
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 3; dy++) {
          const block = blockAt(dimension, origin.x + dx, origin.y + dy, origin.z + dz);
          if (block && CHESTS.has(block.typeId)) {
            logInfo(TAG, `Peti terdekat ditemukan di: ${posStr(block)} (${block.typeId})`);
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

function writeSign(dimension, pos, entity) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  if (!block) return false;
  const { cx, cz } = chunkOf(pos);
  const mode = MODES[getMode(entity)] ?? MODES.follow;
  try {
    const text = `§0${displayName(entity)}\n${mode.label}\nmilik ${getOwnerName(entity)}\n(${cx}, ${cz})`;
    block.getComponent("minecraft:sign")?.setText(text);
    logInfo(TAG, `Papan stasiun berhasil ditulis di ${posStr(pos)}: "${text.replace(/\n/g, " / ")}"`);
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal menulis teks pada papan di ${posStr(pos)}`, e);
    return false;
  }
}

export function refreshSign(entity, state) {
  if (!state.sign) return;
  writeSign(entity.dimension, state.sign, entity);
}

export function ensureStation(entity, state) {
  logDebug(TAG, `ensureStation dicek untuk ${entStr(entity)}`);
  const dimension = entity.dimension;
  const here = {
    x: Math.floor(entity.location.x),
    y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };

  if (state.station) {
    const block = blockAt(dimension, state.station.x, state.station.y, state.station.z);
    if (block && CHESTS.has(block.typeId)) {
      return { chest: state.station, container: containerAt(dimension, state.station) };
    }
    logWarn(TAG, `Peti stasiun lama di ${posStr(state.station)} hilang/hancur!`);
    state.station = null;
  }

  const found = chestNear(dimension, here);
  if (found) {
    logInfo(TAG, `Menggunakan peti yang ada di sekitar sebagai stasiun: ${posStr(found)}`);
    patchState(entity, { station: found });
    state.station = found;
    return { chest: found, container: containerAt(dimension, found) };
  }

  logInfo(TAG, `Membuat stasiun kerja baru untuk ${entStr(entity)}...`);
  const spot = freeSpot(dimension, here);
  if (!spot) {
    logWarn(TAG, `Tidak ditemukan lokasi kosong untuk menaruh peti stasiun.`);
    return undefined;
  }
  const block = blockAt(dimension, spot.x, spot.y, spot.z);
  try {
    block.setType(CHEST);
    logInfo(TAG, `Peti stasiun baru berhasil dipasang di: ${posStr(spot)}`);
  } catch (e) {
    logError(TAG, `Gagal memasang peti di ${posStr(spot)}`, e);
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

export function stationContainer(entity, state) {
  if (!state.station) return undefined;
  return containerAt(entity.dimension, state.station);
}