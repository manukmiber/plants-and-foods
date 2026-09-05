/**
 * Berhenti dan tersenyum saat dilihat pemain.
 *
 * Yang dihitung "dilihat" bukan sekadar dekat: arah pandang pemain harus
 * mengenai companion dalam kerucut sempit (LOOK.cone, kira-kira 15 derajat) dan
 * dalam radius LOOK.radius. Perhitungannya dot product antara arah pandang dan
 * arah ke companion — sengaja tidak memakai raycast entity, supaya tidak
 * bergantung pada API yang belum ada di semua versi.
 *
 * Sesuai permintaan, ini berlaku TANPA KECUALI: companion yang sedang bertarung
 * pun berhenti dan melambai. Saklarnya ada di LOOK.stopInCombat di config.js —
 * satu baris, tanpa perlu menyentuh kode di sini.
 */

import { system, world } from "@minecraft/server";

import { FACE, LOOK, POSE } from "./config.js";
import { sayFrom } from "./chat.js";
import { hold, isHeld, reasonFor } from "./hold.js";
import { alive, dist2, getMode, isCompanion, setFace, setPose } from "./util.js";

const REASON = "greet";
const lastWave = new Map();     // entityId -> tick terakhir dia menyapa

/** Companion yang sedang tepat berada di ujung pandangan pemain ini. */
function lookedAt(player, companions) {
  let head;
  let view;
  try {
    head = player.getHeadLocation();
    view = player.getViewDirection();
  } catch {
    return undefined;
  }
  let best;
  let bestDot = LOOK.cone;
  for (const entity of companions) {
    if (entity.dimension.id !== player.dimension.id) continue;
    const at = entity.location;
    // Dibidik ke dada, bukan ke kaki: kalau ke kaki, melihat wajah companion
    // dari dekat justru tidak terhitung.
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
  return best;
}

/** Dipanggil denyut cepat. */
export function tickLook(companions) {
  if (!LOOK.enabled || !companions.length) return;
  const seen = new Set();

  for (const player of world.getAllPlayers()) {
    const entity = lookedAt(player, companions);
    if (!entity || seen.has(entity.id)) continue;
    seen.add(entity.id);

    if (!LOOK.stopInCombat && getMode(entity) === "attack") {
      // Tidak berhenti, tapi tetap menoleh dan tersenyum.
      setFace(entity, FACE.smile);
      continue;
    }
    // Ditahan berulang tiap denyut selama masih dipandang; begitu pemain
    // memalingkan muka, waktunya habis sendiri setelah LOOK.holdTicks.
    hold(entity, LOOK.holdTicks, { pose: POSE.greet, face: FACE.happy, reason: REASON });

    const last = lastWave.get(entity.id) ?? -9999;
    if (system.currentTick - last > LOOK.waveEvery) {
      lastWave.set(entity.id, system.currentTick);
      sayFrom(entity, "greet");
    }
  }

  // Yang tadinya disapa tapi sekarang tidak lagi dipandang: biarkan hold-nya
  // kedaluwarsa sendiri; wajahnya dikembalikan di sana. Yang perlu dibereskan di
  // sini hanya wajah companion yang tidak ditahan sama sekali (mode attack
  // dengan stopInCombat mati).
  if (!LOOK.stopInCombat) {
    for (const entity of companions) {
      if (seen.has(entity.id) || isHeld(entity)) continue;
      if (getMode(entity) === "attack") setFace(entity, FACE.auto);
    }
  }
}

export function forget(id) {
  lastWave.delete(id);
}

export function isGreeting(entity) {
  return isHeld(entity) && reasonFor(entity) === REASON;
}
