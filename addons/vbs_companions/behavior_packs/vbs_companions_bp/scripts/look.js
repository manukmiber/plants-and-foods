/**
 * Berhenti dan tersenyum saat dilihat pemain.
 *
 * Dua hal terjadi di sini, dan keduanya dipicu tatapan yang sama:
 *
 *   PEMILIKNYA menatap  companion berhenti, berpose menyapa, dan melempar
 *                       kalimat pool "greet" — seperti dari dulu.
 *   PEMAIN LAIN menatap companion menyapa ORANG ITU dengan namanya (pool
 *                       "hail"), lalu memberi tahu pemiliknya bahwa ada orang
 *                       di dekat companionnya, lengkap dengan koordinat.
 *
 * Yang kedua itu untuk server. Companion yang bekerja jauh dari pemiliknya
 * dulu diam saja saat dihampiri orang; sekarang dia menegur, dan pemiliknya
 * tahu ada yang datang tanpa harus kebetulan sedang melihat ke sana.
 */

import { system, world } from "@minecraft/server";
import { FACE, LOOK, POSE } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { hold, isHeld, reasonFor } from "./hold.js";
import { displayName } from "./nametag.js";
import { getMode, getOwnerId, setFace } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "LOOK";
const REASON = "greet";
// Jeda menyapa satu orang asing yang sama, dan jeda memberitahu pemiliknya.
// Yang kedua jauh lebih panjang: pemain yang berdiri lama di dekat ladang
// tidak boleh berubah jadi banjir pesan di chat pemiliknya.
const HAIL_EVERY = 600;
const TELL_OWNER_EVERY = 2400;
const lastWave = new Map();
const lastHail = new Map();
const lastTold = new Map();

function pairKey(entity, player) {
  return `${entity.id}|${player.id}`;
}

/**
 * Menyapa pemain yang BUKAN pemiliknya, dan mengabari pemiliknya.
 * Balikan true kalau memang ada yang diucapkan tick ini.
 */
function hailStranger(entity, player) {
  const now = system.currentTick;
  const key = pairKey(entity, player);
  if (now - (lastHail.get(key) ?? -HAIL_EVERY) < HAIL_EVERY) return false;
  lastHail.set(key, now);
  logInfo(TAG, `${entStr(entity)} menyapa pemain lain: ${player.name}.`);
  sayFrom(entity, "hail", { other: player });

  if (now - (lastTold.get(key) ?? -TELL_OWNER_EVERY) >= TELL_OWNER_EVERY) {
    lastTold.set(key, now);
    const at = entity.location;
    report(entity, `Ada ${player.name} di dekatku, di (${Math.round(at.x)}, ${Math.round(at.z)}).`);
    logInfo(TAG, `Pemilik ${displayName(entity)} diberi tahu soal ${player.name}.`);
  }
  return true;
}

function lookedAt(player, companions) {
  let head;
  let view;
  try {
    head = player.getHeadLocation();
    view = player.getViewDirection();
  } catch (e) {
    logWarn(TAG, `Gagal membaca headLocation/viewDirection pemain ${player?.name}`, e);
    return undefined;
  }
  let best;
  let bestDot = LOOK.cone;

  for (const entity of companions) {
    if (entity.dimension.id !== player.dimension.id) continue;
    const at = entity.location;
    const dx = at.x - head.x;
    const dy = at.y + 1.2 - head.y;
    const dz = at.z - head.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5 || len > LOOK.radius) continue;

    const dot = (dx * view.x + dy * view.y + dz * view.z) / len;
    if (dot < bestDot) continue;

    bestDot = dot;
    best = entity;
  }

  if (best) {
    logDebug(TAG, `Pemain ${player.name} sedang menatap ${entStr(best)} (dot: ${bestDot.toFixed(3)} >= ${LOOK.cone})`);
  }
  return best;
}

export function tickLook(companions) {
  if (!LOOK.enabled || !companions.length) return;
  const seen = new Set();

  for (const player of world.getAllPlayers()) {
    const entity = lookedAt(player, companions);
    if (!entity || seen.has(entity.id)) continue;
    seen.add(entity.id);

    if (!LOOK.stopInCombat && getMode(entity) === "attack") {
      logDebug(TAG, `${entStr(entity)} dalam combat: hanya tersenyum tanpa hold.`);
      setFace(entity, FACE.smile);
      continue;
    }

    logInfo(TAG, `${entStr(entity)} ditatap oleh ${player.name}. Menahan companion & menyapa.`);
    hold(entity, LOOK.holdTicks, { pose: POSE.greet, face: FACE.happy, reason: REASON });

    // Orang asing disapa dengan namanya, bukan dengan sapaan untuk pemilik —
    // dan sapaan itu punya jedanya sendiri, terpisah dari jeda "greet".
    const ownerId = getOwnerId(entity);
    if (ownerId && ownerId !== player.id) {
      hailStranger(entity, player);
      continue;
    }

    const last = lastWave.get(entity.id) ?? -9999;
    if (system.currentTick - last > LOOK.waveEvery) {
      lastWave.set(entity.id, system.currentTick);
      logInfo(TAG, `Memutar sapaan dialog greet untuk ${entStr(entity)}`);
      sayFrom(entity, "greet");
    }
  }

  if (!LOOK.stopInCombat) {
    for (const entity of companions) {
      if (seen.has(entity.id) || isHeld(entity)) continue;
      if (getMode(entity) === "attack") setFace(entity, FACE.auto);
    }
  }
}

export function forget(id) {
  logInfo(TAG, `forget look data untuk entity ID: ${id}`);
  lastWave.delete(id);
  for (const map of [lastHail, lastTold]) {
    for (const key of [...map.keys()]) {
      if (key.startsWith(`${id}|`)) map.delete(key);
    }
  }
}

export function isGreeting(entity) {
  return isHeld(entity) && reasonFor(entity) === REASON;
}