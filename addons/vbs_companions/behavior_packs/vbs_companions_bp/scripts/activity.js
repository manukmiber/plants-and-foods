/**
 * Apa yang sedang dikerjakan tiap companion, dalam satu kalimat.
 */

import { system } from "@minecraft/server";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "ACTIVITY";
const notes = new Map(); // entityId -> { text, tick }

export function setActivity(entity, text) {
  if (!entity) {
    logWarn(TAG, "setActivity dipanggil dengan entity null/undefined.");
    return;
  }
  if (!text) {
    logWarn(TAG, `setActivity dipanggil untuk ${entStr(entity)} tanpa teks.`);
    return;
  }
  const prev = notes.get(entity.id);
  notes.set(entity.id, { text, tick: system.currentTick });
  logDebug(TAG, `Update aktivitas ${entStr(entity)}: "${text}" (Sebelumnya: "${prev?.text ?? "none"}")`);
}

export function getActivity(entity) {
  if (!entity) {
    logDebug(TAG, "getActivity dipanggil dengan entity null.");
    return undefined;
  }
  const row = notes.get(entity.id);
  if (!row) {
    logDebug(TAG, `Aktivitas tidak ditemukan untuk ${entStr(entity)}`);
    return undefined;
  }
  const age = system.currentTick - row.tick;
  if (age > 600) {
    logDebug(TAG, `Aktivitas untuk ${entStr(entity)} sudah basi (${age} ticks lalu): "${row.text}"`);
    return undefined;
  }
  logDebug(TAG, `Aktivitas aktif untuk ${entStr(entity)}: "${row.text}" (${age} ticks lalu)`);
  return row.text;
}

export function forget(id) {
  const existed = notes.delete(id);
  logInfo(TAG, `Menghapus aktivitas untuk entity ID: ${id}. Ditemukan? ${existed}`);
}