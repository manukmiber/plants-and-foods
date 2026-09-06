/**
 * Tenaga, kelelahan dan kantuk.
 *
 * Ada DUA ukuran yang berjalan berdampingan:
 *
 *   tenaga (energy)  terkuras karena BEKERJA. Habis -> companion berhenti dan
 *                    beristirahat sebentar: duduk di stasiun, bersandar di
 *                    bawah pohon, atau sekadar mengobrol dengan companion lain
 *                    (social.js ikut memulihkan tenaga).
 *   kantuk (sleep)   naik karena WAKTU berjalan, dan jauh lebih cepat saat
 *                    malam. Kalau sudah memuncak, companion mencari RANJANG —
 *                    yang paling utama ranjang di rumah desa buatan Pembangun.
 *                    Tidak ada ranjang? Dia tidur di bawah pohon atau di
 *                    stasiunnya sendiri.
 *
 * Jadi mereka tidak bisa kerja terus-terusan, persis seperti yang diminta.
 */

import { system, world } from "@minecraft/server";
import { BED_IDS, ENERGY, FACE, LOGS, POSE, SLEEP, WORK_MODES } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { threatened } from "./combat.js";
import { hold } from "./hold.js";
import { readVillageHomes } from "./state.js";
import { alive, blockAt, dist2, getOwnerId, isAir, setFace, steer } from "./util.js";
import { entStr, logDebug, logInfo, posStr } from "./logger.js";

const TAG = "ENERGY";
const REST_REACH = 2.6;
const TREE_SEARCH_RADIUS = 10;
const BED_SEARCH_RADIUS = 12;

function clamp(value, max) {
  return Math.max(0, Math.min(max, value));
}

export function energyOf(state) {
  return typeof state.energy === "number" ? state.energy : ENERGY.start;
}

export function sleepOf(state) {
  return typeof state.sleepiness === "number" ? state.sleepiness : 0;
}

export function isResting(state) {
  return Boolean(state.resting);
}

export function isSleeping(state) {
  return Boolean(state.sleeping);
}

/** Ringkasan untuk menu dan jawaban chat. */
export function needsLabel(state) {
  if (state.sleeping) return "sedang tidur";
  if (state.resting) return "sedang istirahat";
  const sleepy = sleepOf(state);
  const energy = energyOf(state);
  if (sleepy >= SLEEP.sleepyAt) return "mengantuk";
  if (energy <= ENERGY.tiredAt) return "kelelahan";
  return "segar";
}

export function isNight() {
  try {
    const t = world.getTimeOfDay();
    return t >= SLEEP.nightFrom && t <= SLEEP.nightTo;
  } catch (e) {
    logDebug(TAG, "Gagal membaca waktu dunia; dianggap siang.", e);
    return false;
  }
}

/** Ngobrol sebentar juga menghitung sebagai istirahat, bukan cuma tidur. */
export function restoreFromChat(entity, state) {
  const before = energyOf(state);
  state.energy = clamp(before + ENERGY.chatRestGain, ENERGY.max);
  logDebug(TAG, `${entStr(entity)} pulih dari mengobrol: ${before.toFixed(1)} -> ${state.energy.toFixed(1)}`);
}

/* ------------------------------------------------------------------ *
 * Mencari tempat
 * ------------------------------------------------------------------ */

function nearbyBlock(dimension, at, ids, radius) {
  const want = new Set(ids);
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 4; dy++) {
          const block = blockAt(dimension, bx + dx, by + dy, bz + dz);
          if (block && want.has(block.typeId)) {
            return { x: bx + dx, y: by + dy, z: bz + dz };
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Ranjang tempat companion tidur. Prioritas: ranjang rumah desa yang dicatat
 * Pembangun, lalu ranjang apa pun yang kebetulan ada di sekitar.
 */
function bedFor(entity, state) {
  const ownerId = getOwnerId(entity);
  if (ownerId) {
    const homes = readVillageHomes(ownerId)
      .filter((h) => !h.dim || h.dim === entity.dimension.id);
    let best;
    let bestD = Infinity;
    for (const home of homes) {
      const block = blockAt(entity.dimension, home.x, home.y, home.z);
      // Ranjang yang sudah dibongkar tidak dihitung lagi.
      if (block && !BED_IDS.includes(block.typeId)) continue;
      const d = dist2(entity.location, home);
      if (d < bestD) {
        bestD = d;
        best = home;
      }
    }
    if (best) {
      logDebug(TAG, `${entStr(entity)} memilih ranjang rumah desa di ${posStr(best)}`);
      return { x: best.x + 0.5, y: best.y, z: best.z + 0.5, label: "rumah desa" };
    }
  }
  const bed = nearbyBlock(entity.dimension, entity.location, BED_IDS, BED_SEARCH_RADIUS);
  if (bed) return { x: bed.x + 0.5, y: bed.y, z: bed.z + 0.5, label: "ranjang terdekat" };
  return undefined;
}

function treeFor(entity) {
  const log = nearbyBlock(entity.dimension, entity.location, LOGS, TREE_SEARCH_RADIUS);
  if (!log) return undefined;
  // Berteduh di sisi pohon, bukan di dalam batangnya.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const spot = blockAt(entity.dimension, log.x + dx, log.y, log.z + dz);
    if (isAir(spot)) {
      return { x: log.x + dx + 0.5, y: log.y, z: log.z + dz + 0.5, label: "bawah pohon" };
    }
  }
  return { x: log.x + 0.5, y: log.y, z: log.z + 0.5, label: "bawah pohon" };
}

function restSpot(entity, state) {
  const bed = bedFor(entity, state);
  if (bed) return bed;
  if (state.station) {
    return {
      x: state.station.x + 0.5, y: state.station.y, z: state.station.z + 0.5,
      label: "stasiun",
    };
  }
  const tree = treeFor(entity);
  if (tree) return tree;
  const here = entity.location;
  logDebug(TAG, `${entStr(entity)} tidak menemukan tempat khusus; istirahat di tempat.`);
  return { x: here.x, y: here.y, z: here.z, label: "tempat ini juga" };
}

function sleepSpot(entity, state) {
  const bed = bedFor(entity, state);
  if (bed) return bed;
  const tree = treeFor(entity);
  if (tree) return tree;
  if (state.station) {
    return {
      x: state.station.x + 0.5, y: state.station.y, z: state.station.z + 0.5,
      label: "stasiun",
    };
  }
  const here = entity.location;
  return { x: here.x, y: here.y, z: here.z, label: "tempat ini juga" };
}

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

function walkOrSettle(entity, spot, faceId) {
  const d2 = dist2(entity.location, spot);
  if (d2 > REST_REACH ** 2) {
    steer(entity, spot, 0.3);
    return false;
  }
  hold(entity, 24, { pose: POSE.normal, face: faceId, reason: "rest" });
  return true;
}

/**
 * Satu denyut kebutuhan companion. Balikan true berarti dia sedang istirahat
 * atau tidur sekarang — pemanggil (main.js) wajib melewatkan mode kerjanya.
 */
export function tickEnergy(entity, state, mode) {
  if (!alive(entity)) return false;
  let energy = energyOf(state);
  let sleepy = sleepOf(state);
  const night = isNight();

  /* --- sedang tidur --- */
  if (state.sleeping) {
    const nap = state.sleeping;
    if (walkOrSettle(entity, nap.spot, FACE.sleepy)) {
      sleepy = clamp(sleepy - SLEEP.recoverPerTick, SLEEP.max);
      energy = clamp(energy + ENERGY.restPerTick * 0.6, ENERGY.max);
    }
    state.sleepiness = sleepy;
    state.energy = energy;
    const longEnough = system.currentTick - nap.since >= SLEEP.minSleepTicks;
    if (sleepy <= SLEEP.wakeBelow || (longEnough && !night && sleepy < SLEEP.sleepyAt)) {
      logInfo(TAG, `${entStr(entity)} bangun tidur di ${nap.spot.label} (kantuk ${sleepy.toFixed(1)}). Kembali ke mode "${nap.from}".`);
      state.sleeping = null;
      setFace(entity, FACE.auto);
      sayFrom(entity, "wake");
      return false;
    }
    return true;
  }

  /* --- sedang istirahat --- */
  if (state.resting) {
    const rest = state.resting;
    if (walkOrSettle(entity, rest.spot, FACE.sleepy)) {
      energy = clamp(energy + ENERGY.restPerTick, ENERGY.max);
    }
    state.energy = energy;
    const longEnough = system.currentTick - rest.since >= ENERGY.minRestTicks;
    if (energy >= ENERGY.max || (longEnough && energy > ENERGY.tiredAt)) {
      logInfo(TAG, `${entStr(entity)} selesai istirahat di ${rest.spot.label} (tenaga ${energy.toFixed(1)}).`);
      state.resting = null;
      setFace(entity, FACE.auto);
      sayFrom(entity, "rest");
      return false;
    }
    return true;
  }

  /* --- berjalan normal --- */
  sleepy = clamp(sleepy + SLEEP.gainPerTick + (night ? SLEEP.gainAtNight : 0), SLEEP.max);
  state.sleepiness = sleepy;

  if (!WORK_MODES.has(mode)) {
    state.energy = energy;
  } else {
    energy = clamp(energy - ENERGY.drainPerWork, ENERGY.max);
    state.energy = energy;
  }

  const unsafe = mode === "attack" && threatened(entity);

  // Kantuk didahulukan: companion yang sudah sangat mengantuk tidak akan
  // bekerja walau tenaganya masih penuh.
  if (sleepy >= SLEEP.mustSleepAt) {
    if (unsafe) {
      logDebug(TAG, `${entStr(entity)} mengantuk tapi masih dikepung musuh; tidur ditunda.`);
      return false;
    }
    const spot = sleepSpot(entity, state);
    logInfo(TAG, `${entStr(entity)} mengantuk berat (${sleepy.toFixed(1)}/${SLEEP.max}). Tidur di ${spot.label}.`);
    state.sleeping = { spot, since: system.currentTick, from: mode };
    setFace(entity, FACE.sleepy);
    sayFrom(entity, "sleepy");
    if (spot.label === "rumah desa") {
      report(entity, "Aku tidur di rumah baru dulu ya.");
    }
    return true;
  }

  if (sleepy >= SLEEP.sleepyAt) {
    setFace(entity, FACE.sleepy);
    logDebug(TAG, `${entStr(entity)} mulai mengantuk (${sleepy.toFixed(1)}).`);
  }

  if (energy <= ENERGY.exhaustedAt) {
    if (unsafe) {
      logDebug(TAG, `${entStr(entity)} kehabisan tenaga tapi masih dikepung musuh; istirahat ditunda.`);
      return false;
    }
    const spot = restSpot(entity, state);
    logInfo(TAG, `${entStr(entity)} kehabisan tenaga (${energy.toFixed(1)}/${ENERGY.max}) saat mode "${mode}". Istirahat di ${spot.label}.`);
    state.resting = { spot, since: system.currentTick, from: mode };
    sayFrom(entity, "tired");
    return true;
  }

  if (energy <= ENERGY.tiredAt) {
    logDebug(TAG, `${entStr(entity)} mulai lelah (tenaga ${energy.toFixed(1)}).`);
  }
  return false;
}
