/**
 * Menahan companion di tempat untuk sesaat.
 */

import { system } from "@minecraft/server";
import { FACE, MODES, POSE } from "./config.js";
import { alive, applyMode, getMode, setFace, setPose } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "HOLD";
const held = new Map(); // entityId -> { until, reason, pose }

export function hold(entity, ticks, { pose = POSE.normal, face = FACE.auto, reason = "" } = {}) {
  if (!alive(entity)) {
    logWarn(TAG, `hold batal: entity ${entStr(entity)} tidak valid.`);
    return false;
  }
  const until = system.currentTick + ticks;
  const current = held.get(entity.id);

  if (current) {
    current.until = Math.max(current.until, until);
    // Alasannya ikut diperbarui. Tanpa ini, hold lama yang alasannya
    // "gather" menutupi hold baru yang alasannya "dig", dan main.js —
    // yang sengaja MEMBIARKAN denyut kerja jalan untuk alasan "dig" —
    // ikut menghentikan pekerjaan. Akibatnya pukulan tidak pernah maju.
    if (reason) current.reason = reason;
    logDebug(TAG, `Memperpanjang hold ${entStr(entity)} (${reason}): sampai tick ${current.until} (+${ticks}t)`);
    if (current.pose !== pose) {
      current.pose = pose;
      setPose(entity, pose);
      setFace(entity, face);
      logDebug(TAG, `Mengubah pose hold ${entStr(entity)} ke pose=${pose}, face=${face}`);
    }
    return true;
  }

  logInfo(TAG, `Menahan ${entStr(entity)} selama ${ticks} tick (sampai tick ${until}). Alasan: "${reason}", pose=${pose}, face=${face}`);
  try {
    entity.triggerEvent(MODES.stay.event);
  } catch (e) {
    logWarn(TAG, `Gagal triggerEvent MODES.stay pada ${entStr(entity)}`, e);
    return false;
  }

  setPose(entity, pose);
  setFace(entity, face);
  held.set(entity.id, { until, reason, pose });
  return true;
}

export function isHeld(entity) {
  const row = held.get(entity?.id);
  const active = Boolean(row) && row.until > system.currentTick;
  logDebug(TAG, `isHeld dicek untuk ${entStr(entity)}: ${active} (sisa: ${row ? row.until - system.currentTick : 0}t)`);
  return active;
}

export function reasonFor(entity) {
  return held.get(entity?.id)?.reason;
}

export function release(entity) {
  if (!held.delete(entity?.id)) {
    logDebug(TAG, `release dipanggil tapi ${entStr(entity)} tidak sedang dalam status hold.`);
    return false;
  }
  if (!alive(entity)) return false;

  const currentMode = getMode(entity);
  logInfo(TAG, `Melepaskan hold pada ${entStr(entity)}, mengembalikan ke mode: ${currentMode}`);
  applyMode(entity, currentMode);
  setPose(entity, POSE.normal);
  setFace(entity, FACE.auto);
  return true;
}

export function tickHolds(byId) {
  const now = system.currentTick;
  for (const [id, row] of [...held]) {
    if (row.until > now) continue;
    held.delete(id);
    const entity = byId.get(id);
    logInfo(TAG, `Waktu hold habis untuk ID: ${id} (${row.reason}). Mengembalikan mode entity...`);
    if (!alive(entity)) continue;
    applyMode(entity, getMode(entity));
    setPose(entity, POSE.normal);
    setFace(entity, FACE.auto);
  }
}

export function forget(id) {
  const existed = held.delete(id);
  logInfo(TAG, `forget hold untuk ID: ${id}. Dihapus? ${existed}`);
}