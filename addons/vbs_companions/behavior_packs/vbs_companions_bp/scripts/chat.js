/**
 * Companion yang bisa bicara.
 */

import { world } from "@minecraft/server";
import { CHAT } from "./config.js";
import { linesFor } from "./lines.js";
import { displayName, setBubble } from "./nametag.js";
import { readSettings, readState } from "./state.js";
import {
  alive, dist2, getOwnerId, getOwnerName, info, pick, resolveOwner,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "CHAT";

/**
 * Nama yang dipakai di dalam kalimat. Lawan bicaranya tidak selalu companion:
 * sejak companion menyapa pemain lain yang menatapnya (look.js), `{kamu}` bisa
 * berisi nama PEMAIN. displayName cuma mengenal companion dan mengembalikan
 * "?" untuk yang lain, jadi pemain diambil namanya langsung.
 */
function nameOf(who) {
  if (!who) return undefined;
  return info(who) ? displayName(who) : (who.name ?? "?");
}

export function fill(text, entity, other) {
  const filled = text
    .replace(/\{aku\}/g, displayName(entity))
    .replace(/\{kamu\}/g, nameOf(other) ?? getOwnerName(entity))
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
  // Saklar per pemain dari Buku Panduan. Yang di companion membungkam satu
  // companion; yang ini membungkam semua milik pemain itu sekaligus.
  const prefs = readSettings(getOwnerId(entity));
  if (prefs.quiet) {
    logDebug(TAG, `say() dibungkam untuk ${entStr(entity)} (pengaturan pemilik: quiet).`);
    return;
  }

  const meta = info(entity);
  const spoken = fill(text, entity, other);
  logInfo(TAG, `${entStr(entity)} berbicara: "${spoken}" (toOwnerAlways: ${toOwnerAlways})`);

  if (prefs.bubbles) setBubble(entity, spoken, CHAT.bubbleTicks);

  const here = entity.location;
  const line = `§7[${meta.color}${displayName(entity)}§7] §f${spoken}`;
  const owner = resolveOwner(entity);
  // Laporan jarak jauh ("companion selesai membangun", "aku butuh besi") hanya
  // dikirim kalau pemiliknya memang mau menerimanya. Kalimat yang terdengar
  // karena pemainnya kebetulan berdiri dekat tidak ikut dimatikan saklar ini.
  const toOwner = toOwnerAlways && prefs.reports;
  let recipientCount = 0;

  for (const player of world.getAllPlayers()) {
    if (player.dimension.id !== entity.dimension.id) {
      if (toOwner && owner && player.id === owner.id) {
        player.sendMessage(line);
        recipientCount++;
        logDebug(TAG, `Pesan dikirim ke owner di dimensi lain: ${player.name}`);
      }
      continue;
    }
    const d2 = dist2(player.location, here);
    // Pemain yang berdiri dekat membaca gelembungnya, jadi barisnya tidak
    // dikirim dua kali. Kalau gelembungnya dimatikan, baris chat inilah
    // satu-satunya yang tersisa — jadi justru harus dikirim.
    if (prefs.bubbles && d2 <= CHAT.bubbleRadius ** 2) {
      logDebug(TAG, `Pemain ${player.name} dalam radius gelembung (${Math.sqrt(d2).toFixed(1)}m <= ${CHAT.bubbleRadius}m). Chat text dilewati.`);
      continue;
    }
    if (d2 <= CHAT.chatRadius ** 2) {
      player.sendMessage(line);
      recipientCount++;
      logDebug(TAG, `Pesan chat terkirim ke ${player.name} (${Math.sqrt(d2).toFixed(1)}m)`);
    } else if (toOwner && owner && player.id === owner.id) {
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