/**
 * Companion yang bisa bicara.
 */

import { world } from "@minecraft/server";
import { CHAT } from "./config.js";
import { linesFor } from "./lines.js";
import { displayName, setBubble } from "./nametag.js";
import { readState } from "./state.js";
import { alive, dist2, getOwnerName, info, pick, resolveOwner } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "CHAT";

export function fill(text, entity, other) {
  const filled = text
    .replace(/\{aku\}/g, displayName(entity))
    .replace(/\{kamu\}/g, other ? displayName(other) : getOwnerName(entity))
    .replace(/\{owner\}/g, getOwnerName(entity));
  logDebug(TAG, `Template dialog: "${text}" -> "${filled}"`);
  return filled;
}

export function say(entity, text, { toOwnerAlways = false, other } = {}) {
  if (!alive(entity)) {
    logWarn(TAG, "say() dibatalkan: Entity tidak valid/mati.");
    return;
  }
  if (!text) {
    logWarn(TAG, "say() dibatalkan: Teks kosong.");
    return;
  }
  const state = readState(entity);
  if (state.quiet) {
    logDebug(TAG, `say() dibungkam untuk ${entStr(entity)} (state.quiet = true).`);
    return;
  }

  const meta = info(entity);
  const spoken = fill(text, entity, other);
  logInfo(TAG, `${entStr(entity)} berbicara: "${spoken}" (toOwnerAlways: ${toOwnerAlways})`);

  setBubble(entity, spoken, CHAT.bubbleTicks);

  const here = entity.location;
  const line = `§7[${meta.color}${displayName(entity)}§7] §f${spoken}`;
  const owner = resolveOwner(entity);
  let recipientCount = 0;

  for (const player of world.getAllPlayers()) {
    if (player.dimension.id !== entity.dimension.id) {
      if (toOwnerAlways && owner && player.id === owner.id) {
        player.sendMessage(line);
        recipientCount++;
        logDebug(TAG, `Pesan dikirim ke owner di dimensi lain: ${player.name}`);
      }
      continue;
    }
    const d2 = dist2(player.location, here);
    if (d2 <= CHAT.bubbleRadius ** 2) {
      logDebug(TAG, `Pemain ${player.name} dalam radius gelembung (${Math.sqrt(d2).toFixed(1)}m <= ${CHAT.bubbleRadius}m). Chat text dilewati.`);
      continue;
    }
    if (d2 <= CHAT.chatRadius ** 2) {
      player.sendMessage(line);
      recipientCount++;
      logDebug(TAG, `Pesan chat terkirim ke ${player.name} (${Math.sqrt(d2).toFixed(1)}m)`);
    } else if (toOwnerAlways && owner && player.id === owner.id) {
      player.sendMessage(line);
      recipientCount++;
      logDebug(TAG, `Pesan chat terkirim ke owner di luar jangkauan: ${player.name}`);
    }
  }
  logDebug(TAG, `Total penerima pesan teks: ${recipientCount}`);
}

export function sayFrom(entity, key, options) {
  logDebug(TAG, `sayFrom dipanggil: key="${key}" untuk ${entStr(entity)}`);
  const meta = info(entity);
  if (!meta) {
    logWarn(TAG, `sayFrom gagal: entity ${entStr(entity)} tidak memiliki meta.`);
    return;
  }
  const id = entity.typeId.replace("vbs:", "");
  const pool = linesFor(id, key);
  const chosen = pick(pool);
  logDebug(TAG, `Memilih kalimat acak dari pool [${key}] (tersedia: ${pool.length}): "${chosen}"`);
  say(entity, chosen, options);
}

export function report(entity, text) {
  logInfo(TAG, `Laporan dikirim dari ${entStr(entity)}: "${text}"`);
  say(entity, text, { toOwnerAlways: true });
}