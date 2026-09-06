/**
 * Tulisan yang melayang di atas kepala companion.
 */

import { system } from "@minecraft/server";
import { MODES } from "./config.js";
import { readSettings, readState } from "./state.js";
import { alive, getMode, getOwnerId, getOwnerName, info } from "./util.js";
import { entStr, logDebug, logInfo } from "./logger.js";

const TAG = "NAMETAG";
const bubbles = new Map();

export function displayName(entity) {
  const meta = info(entity);
  if (!meta) return "?";
  const nick = readState(entity).nick;
  return typeof nick === "string" && nick ? nick : meta.name;
}

export function tagOf(entity) {
  const meta = info(entity);
  if (!meta) return "";
  if (!getOwnerId(entity)) {
    return `§7[${meta.color}${displayName(entity)}§7, §cliar§7]`;
  }
  const mode = MODES[getMode(entity)] ?? MODES.follow;
  // Dua saklar: satu khusus companion ini, satu berlaku untuk SEMUA companion
  // milik pemain yang sama. Salah satu menyala sudah cukup untuk menyembunyikan
  // nama pemilik dari pemain lain di server.
  const hideOwner = readState(entity).hideOwner || readSettings(getOwnerId(entity)).hideOwner;
  const ownerPart = hideOwner ? "" : `§7, §b${getOwnerName(entity)}`;
  logDebug(TAG, `tagOf ${entStr(entity)}: mode=${mode.label}, pemilik ${hideOwner ? "disembunyikan" : "ditampilkan"}`);
  return `§7[${meta.color}${displayName(entity)}§7, §f${mode.label}${ownerPart}§7]`;
}

export function refreshName(entity) {
  if (!alive(entity) || !info(entity)) return;
  const bubble = bubbles.get(entity.id);
  const tag = tagOf(entity);
  const newName = bubble && bubble.until > system.currentTick ? `${bubble.text}\n${tag}` : tag;
  if (entity.nameTag !== newName) {
    entity.nameTag = newName;
    logDebug(TAG, `Update nameTag ${entStr(entity)}: "${newName.replace(/\n/g, " | ")}"`);
  }
}

export function setBubble(entity, text, ticks) {
  if (!alive(entity)) return;
  logInfo(TAG, `Set bubble untuk ${entStr(entity)}: "${text}" (${ticks} ticks)`);
  bubbles.set(entity.id, { text: `§f§o“${text}”§r`, until: system.currentTick + ticks });
  refreshName(entity);
}

export function hasBubble(entity) {
  const row = bubbles.get(entity?.id);
  return Boolean(row) && row.until > system.currentTick;
}

export function tickBubbles(byId) {
  const now = system.currentTick;
  for (const [id, row] of [...bubbles]) {
    if (row.until > now) continue;
    bubbles.delete(id);
    const entity = byId.get(id);
    logDebug(TAG, `Bubble kedaluwarsa untuk entity ID: ${id}`);
    if (alive(entity)) refreshName(entity);
  }
}

export function forget(id) {
  logInfo(TAG, `forget bubble data untuk entity ID: ${id}`);
  bubbles.delete(id);
}