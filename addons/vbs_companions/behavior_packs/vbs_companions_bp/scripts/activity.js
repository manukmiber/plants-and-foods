/**
 * Apa yang sedang dikerjakan tiap companion, dalam satu kalimat.
 *
 * Cuma catatan sementara di memori — tidak perlu selamat dari dunia ditutup.
 * Gunanya satu: waktu pemain membuka menu, dia langsung tahu companion sedang
 * apa, dan yang lebih penting, tahu ALASAN kalau companion berhenti bekerja
 * ("peti kehabisan bibit", "tidak ada sungai di dekat ladang"). Tanpa ini,
 * companion yang kekurangan bahan cuma terlihat seperti berdiri bengong.
 */

import { system } from "@minecraft/server";

const notes = new Map();     // entityId -> { text, tick }

export function setActivity(entity, text) {
  if (!entity || !text) return;
  notes.set(entity.id, { text, tick: system.currentTick });
}

export function getActivity(entity) {
  const row = notes.get(entity?.id);
  if (!row) return undefined;
  if (system.currentTick - row.tick > 600) return undefined;    // sudah basi
  return row.text;
}

export function forget(id) {
  notes.delete(id);
}
