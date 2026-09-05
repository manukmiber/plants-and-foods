/**
 * Tulisan yang melayang di atas kepala companion.
 *
 * Formatnya [Nama karakter, tugas, Owner] dan selalu tampil — di server, satu
 * pemain harus bisa tahu companion siapa itu dan sedang disuruh apa tanpa perlu
 * mendekat dan membuka menunya.
 *
 * Baris kedua dipakai gelembung teks: kalau companion sedang bicara, pesannya
 * jadi baris ATAS dan penanda tetap di bawahnya, jadi penanda tidak pernah
 * hilang walau dia sedang mengobrol.
 */

import { system } from "@minecraft/server";

import { MODES } from "./config.js";
import { readState } from "./state.js";
import { alive, getMode, getOwnerName, info } from "./util.js";

const bubbles = new Map();   // entityId -> { text, until }

/** Nama panggilan companion: yang diberi pemain, atau nama aslinya. */
export function displayName(entity) {
  const meta = info(entity);
  if (!meta) return "?";
  const nick = readState(entity).nick;
  return typeof nick === "string" && nick ? nick : meta.name;
}

/** Baris penanda [Nama, tugas, Owner]. */
export function tagOf(entity) {
  const meta = info(entity);
  if (!meta) return "";
  const mode = MODES[getMode(entity)] ?? MODES.follow;
  return `§7[${meta.color}${displayName(entity)}§7, §f${mode.label}§7, ` +
    `§b${getOwnerName(entity)}§7]`;
}

export function refreshName(entity) {
  if (!alive(entity) || !info(entity)) return;
  const bubble = bubbles.get(entity.id);
  const tag = tagOf(entity);
  entity.nameTag = bubble && bubble.until > system.currentTick
    ? `${bubble.text}\n${tag}`
    : tag;
}

/** Pasang gelembung teks di atas penanda selama beberapa denyut. */
export function setBubble(entity, text, ticks) {
  if (!alive(entity)) return;
  bubbles.set(entity.id, { text: `§f§o“${text}”§r`, until: system.currentTick + ticks });
  refreshName(entity);
}

export function hasBubble(entity) {
  const row = bubbles.get(entity?.id);
  return Boolean(row) && row.until > system.currentTick;
}

/** Dipanggil denyut cepat: hapus gelembung yang kedaluwarsa. */
export function tickBubbles(byId) {
  const now = system.currentTick;
  for (const [id, row] of [...bubbles]) {
    if (row.until > now) continue;
    bubbles.delete(id);
    const entity = byId.get(id);
    if (alive(entity)) refreshName(entity);
  }
}

export function forget(id) {
  bubbles.delete(id);
}
