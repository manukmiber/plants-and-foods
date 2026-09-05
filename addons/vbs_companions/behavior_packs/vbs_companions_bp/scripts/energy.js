/**
 * Energi, kelelahan dan istirahat companion.
 *
 * Companion menguras energi selama benar-benar bekerja (bertani, menambang,
 * membangun, mengembara, bertarung, merajin, mencari barang) — follow, stay
 * dan disapa pemilik tidak menguras. Begitu energi habis, mereka berhenti
 * bekerja dan mencari tempat istirahat: rumah desa (kalau sudah ada dan punya
 * pemilik yang sama), lalu stasiun sendiri, lalu pohon terdekat, dan kalau
 * semuanya tidak ada ya berhenti di tempat itu juga.
 */

import { system } from "@minecraft/server";
import { ENERGY, FACE, LOGS, POSE, WORK_MODES } from "./config.js";
import { sayFrom } from "./chat.js";
import { threatened } from "./combat.js";
import { hold } from "./hold.js";
import { readVillageHomes } from "./state.js";
import { alive, blockAt, dist2, getOwnerId, setFace, steer } from "./util.js";
import { entStr, logDebug, logInfo } from "./logger.js";

const TAG = "ENERGY";
const REST_REACH = 2.6;
const TREE_SEARCH_RADIUS = 8;

function clamp(value) {
  return Math.max(0, Math.min(ENERGY.max, value));
}

export function energyOf(state) {
  return typeof state.energy === "number" ? state.energy : ENERGY.start;
}

export function isResting(state) {
  return Boolean(state.resting);
}

// Dipanggil dari social.js: ngobrol sebentar dengan companion lain juga
// menghitung sebagai istirahat, bukan cuma tidur.
export function restoreFromChat(entity, state) {
  const before = energyOf(state);
  state.energy = clamp(before + ENERGY.chatRestGain);
  logDebug(TAG, `${entStr(entity)} pulih sedikit dari mengobrol: ${before.toFixed(1)} -> ${state.energy.toFixed(1)}`);
}

function nearbyTree(dimension, at) {
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  for (let r = 2; r <= TREE_SEARCH_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -2; dy <= 4; dy++) {
          const block = blockAt(dimension, bx + dx, by + dy, bz + dz);
          if (block && LOGS.includes(block.typeId)) {
            return { x: bx + dx + 0.5, y: by + dy, z: bz + dz + 0.5 };
          }
        }
      }
    }
  }
  return undefined;
}

function restSpot(entity, state) {
  const ownerId = getOwnerId(entity);
  if (ownerId) {
    const homes = readVillageHomes(ownerId).filter((h) => !h.dim || h.dim === entity.dimension.id);
    if (homes.length) {
      let best;
      let bestD = Infinity;
      for (const home of homes) {
        const d = dist2(entity.location, home);
        if (d < bestD) {
          bestD = d;
          best = home;
        }
      }
      if (best) {
        logDebug(TAG, `${entStr(entity)} memilih rumah desa sebagai tempat istirahat: ${JSON.stringify(best)}`);
        return { x: best.x + 0.5, y: best.y, z: best.z + 0.5, label: "rumah desa" };
      }
    }
  }
  if (state.station) {
    return { x: state.station.x + 0.5, y: state.station.y, z: state.station.z + 0.5, label: "stasiun" };
  }
  const tree = nearbyTree(entity.dimension, entity.location);
  if (tree) return { ...tree, label: "bawah pohon" };
  const here = entity.location;
  return { x: here.x, y: here.y, z: here.z, label: "tempat ini juga" };
}

/**
 * Mengurus satu denyut energi. Balikan true berarti companion sedang/mulai
 * istirahat sekarang — pemanggil (main.js) wajib melewatkan tick mode kerja
 * selagi ini true.
 */
export function tickEnergy(entity, state, mode) {
  if (!alive(entity)) return false;
  let energy = energyOf(state);

  if (state.resting) {
    const rest = state.resting;
    const target = rest.spot;
    const d2 = dist2(entity.location, target);
    if (d2 > REST_REACH ** 2) {
      steer(entity, target, 0.3);
    } else {
      hold(entity, 24, { pose: POSE.normal, face: FACE.sleepy, reason: "rest" });
      energy = clamp(energy + ENERGY.restPerTick);
    }
    state.energy = energy;

    const longEnough = system.currentTick - rest.since >= ENERGY.minRestTicks;
    if (energy >= ENERGY.max || (longEnough && energy > ENERGY.tiredAt)) {
      logInfo(TAG, `${entStr(entity)} selesai istirahat di ${rest.spot.label} (energi ${energy.toFixed(1)}). Kembali ke mode "${rest.from}".`);
      state.resting = null;
      setFace(entity, FACE.auto);
      sayFrom(entity, "rest");
      return false;
    }
    return true;
  }

  if (!WORK_MODES.has(mode)) {
    state.energy = energy;
    return false;
  }

  energy = clamp(energy - ENERGY.drainPerWork);
  state.energy = energy;
  if (energy <= ENERGY.exhaustedAt) {
    // Jangan paksa companion kabur istirahat di tengah dikepung musuh — itu
    // bisa membunuhnya sendiri. Tunggu sampai amannya baru berangkat tidur.
    if (mode === "attack" && threatened(entity)) {
      logDebug(TAG, `${entStr(entity)} kehabisan tenaga tapi masih dikepung musuh, menahan istirahat dulu.`);
      return false;
    }
    const spot = restSpot(entity, state);
    logInfo(TAG, `${entStr(entity)} kehabisan tenaga (${energy.toFixed(1)}/${ENERGY.max}) saat mode "${mode}". Istirahat ke ${spot.label}.`);
    state.resting = { spot, since: system.currentTick, from: mode };
    sayFrom(entity, "tired");
    return true;
  }
  if (energy <= ENERGY.tiredAt) {
    logDebug(TAG, `${entStr(entity)} mulai lelah (energi ${energy.toFixed(1)}).`);
  }
  return false;
}
