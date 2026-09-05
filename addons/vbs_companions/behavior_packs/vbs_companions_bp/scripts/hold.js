/**
 * Menahan companion di tempat untuk sesaat.
 *
 * Dipakai tiga hal yang semuanya perlu companion berhenti melakukan apa pun:
 * disapa pemain, memanen dengan jongkok, dan mengobrol dengan companion lain.
 * Semuanya lewat satu tempat supaya tidak ada dua sistem yang saling menyalakan
 * dan mematikan mode secara bergantian.
 *
 * Cara menahannya adalah menyalakan component group mode "diam di tempat" tanpa
 * mengubah catatan mode di dynamic property — jadi setelah dilepas, companion
 * kembali ke perintah yang sama, termasuk sesudah dunia ditutup dan dibuka lagi.
 */

import { system } from "@minecraft/server";

import { FACE, MODES, POSE } from "./config.js";
import { alive, applyMode, getMode, setFace, setPose } from "./util.js";

const held = new Map();     // entityId -> { until, reason, pose }

/**
 * Tahan satu companion. Memanggil ulang untuk companion yang sudah ditahan
 * hanya memperpanjang waktunya — tidak menyalakan ulang component group, karena
 * itu akan menghapus jalur yang sedang ditempuh pathfinding tiap denyut.
 */
export function hold(entity, ticks, { pose = POSE.normal, face = FACE.auto, reason = "" } = {}) {
  if (!alive(entity)) return false;
  const until = system.currentTick + ticks;
  const current = held.get(entity.id);
  if (current) {
    current.until = Math.max(current.until, until);
    if (current.pose !== pose) {
      current.pose = pose;
      setPose(entity, pose);
      setFace(entity, face);
    }
    return true;
  }
  try {
    entity.triggerEvent(MODES.stay.event);
  } catch {
    return false;
  }
  setPose(entity, pose);
  setFace(entity, face);
  held.set(entity.id, { until, reason, pose });
  return true;
}

export function isHeld(entity) {
  const row = held.get(entity?.id);
  return Boolean(row) && row.until > system.currentTick;
}

export function reasonFor(entity) {
  return held.get(entity?.id)?.reason;
}

/** Lepaskan sekarang juga, kembalikan ke mode yang tercatat. */
export function release(entity) {
  if (!held.delete(entity?.id)) return false;
  if (!alive(entity)) return false;
  applyMode(entity, getMode(entity));
  setPose(entity, POSE.normal);
  setFace(entity, FACE.auto);
  return true;
}

/** Dipanggil denyut cepat: lepaskan yang waktunya habis. */
export function tickHolds(byId) {
  const now = system.currentTick;
  for (const [id, row] of [...held]) {
    if (row.until > now) continue;
    held.delete(id);
    const entity = byId.get(id);
    if (!alive(entity)) continue;
    applyMode(entity, getMode(entity));
    setPose(entity, POSE.normal);
    setFace(entity, FACE.auto);
  }
}

export function forget(id) {
  held.delete(id);
}
