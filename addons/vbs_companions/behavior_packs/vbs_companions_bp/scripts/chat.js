/**
 * Companion yang bisa bicara.
 *
 * Satu ucapan sampai ke pemain lewat dua jalan sekaligus, dipilih dari jarak:
 * yang dekat melihat GELEMBUNG TEKS di atas kepala companion, yang jauh membaca
 * baris CHAT biasa. Jadi di server, ngobrolnya companion tidak membanjiri chat
 * semua orang, tapi pemain yang sedang jauh tetap tahu companionnya bilang apa.
 *
 * Batas jaraknya ada di CHAT di config.js.
 */

import { world } from "@minecraft/server";

import { CHAT } from "./config.js";
import { linesFor } from "./lines.js";
import { displayName, setBubble } from "./nametag.js";
import { readState } from "./state.js";
import { alive, dist2, getOwnerName, info, pick, resolveOwner } from "./util.js";

/** Ganti penanda {aku} {kamu} {owner} dengan nama sungguhan. */
export function fill(text, entity, other) {
  return text
    .replace(/\{aku\}/g, displayName(entity))
    .replace(/\{kamu\}/g, other ? displayName(other) : getOwnerName(entity))
    .replace(/\{owner\}/g, getOwnerName(entity));
}

/**
 * Ucapkan satu kalimat.
 *
 * Pemain dalam radius gelembung TIDAK ikut menerima baris chat — kalau dua-duanya
 * dikirim, satu kalimat terbaca dua kali dan itu yang bikin chat terasa berisik.
 */
export function say(entity, text, { toOwnerAlways = false, other } = {}) {
  if (!alive(entity) || !text) return;
  if (readState(entity).quiet) return;
  const meta = info(entity);
  const spoken = fill(text, entity, other);
  setBubble(entity, spoken, CHAT.bubbleTicks);

  const here = entity.location;
  const line = `§7[${meta.color}${displayName(entity)}§7] §f${spoken}`;
  const owner = resolveOwner(entity);
  for (const player of world.getAllPlayers()) {
    if (player.dimension.id !== entity.dimension.id) {
      if (toOwnerAlways && owner && player.id === owner.id) player.sendMessage(line);
      continue;
    }
    const d2 = dist2(player.location, here);
    if (d2 <= CHAT.bubbleRadius ** 2) continue;          // sudah lihat gelembungnya
    if (d2 <= CHAT.chatRadius ** 2) {
      player.sendMessage(line);
    } else if (toOwnerAlways && owner && player.id === owner.id) {
      player.sendMessage(line);
    }
  }
}

/** Ucapkan satu baris acak dari kelompok yang diminta. */
export function sayFrom(entity, key, options) {
  const meta = info(entity);
  if (!meta) return;
  const id = entity.typeId.replace("vbs:", "");
  say(entity, pick(linesFor(id, key)), options);
}

/** Laporan yang harus sampai ke pemilik walau dia sedang jauh atau beda dimensi. */
export function report(entity, text) {
  say(entity, text, { toOwnerAlways: true });
}
