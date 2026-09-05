/**
 * Papan permintaan bantuan antar companion.
 *
 * Tiga jenis permintaan bisa dipasang di sini:
 *
 *   "tool"      alat yang harus ditempa perajin (cangkul, beliung, kapak...)
 *   "item"      barang jadi yang harus ditempa perajin (ember, peti, papan...)
 *   "material"  bahan mentah yang harus dicarikan pencari barang (kayu, batu,
 *               besi, tanah timbun, bibit...)
 *
 * Perajin membaca yang "tool" dan "item", pencari barang membaca yang
 * "material" — jadi petani/penambang/pembangun tidak pernah lagi mentok diam
 * cuma karena petinya kosong. Disimpan di dynamic property dunia per-pemilik
 * supaya bertahan walau dunia ditutup dan dibuka lagi.
 */

import { system, world } from "@minecraft/server";
import { MATERIAL_REQUESTS, PROP } from "./config.js";
import { toolRank } from "./crafting.js";
import { displayName } from "./nametag.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "REQUESTS";
const COOLDOWN = 200;      // ~10 detik antar permintaan dari companion yang sama
const EXPIRE = 24000;      // ~20 menit; permintaan basi dibuang sendiri
const MAX_OPEN = 12;

function key(ownerId) {
  return `${PROP.requests}:${ownerId}`;
}

function writeRequests(ownerId, list) {
  try {
    world.setDynamicProperty(key(ownerId), JSON.stringify(list));
    logDebug(TAG, `Papan permintaan ${ownerId} disimpan (${list.length} entri).`);
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal menyimpan permintaan bantuan milik ${ownerId} (kuota limit?)`, e);
    return false;
  }
}

export function readRequests(ownerId) {
  if (!ownerId) return [];
  let list;
  try {
    const raw = world.getDynamicProperty(key(ownerId));
    list = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) {
    logWarn(TAG, `Gagal membaca permintaan bantuan milik ${ownerId}`, e);
    return [];
  }
  const now = system.currentTick;
  const fresh = list.filter((r) => now - (r.postedAt ?? now) < EXPIRE);
  if (fresh.length !== list.length) {
    logInfo(TAG, `${list.length - fresh.length} permintaan kedaluwarsa dibuang dari papan ${ownerId}.`);
    writeRequests(ownerId, fresh);
  }
  return fresh;
}

/** Permintaan yang boleh dikerjakan perajin. */
export function craftRequests(ownerId) {
  return readRequests(ownerId).filter((r) => r.type === "tool" || r.type === "item");
}

/** Permintaan yang boleh dikerjakan pencari barang. */
export function materialRequests(ownerId) {
  return readRequests(ownerId).filter((r) => r.type === "material");
}

export function postRequest(ownerId, req) {
  if (!ownerId) {
    logDebug(TAG, "postRequest dilewati: companion belum punya pemilik.");
    return undefined;
  }
  const id = `${req.from}-${req.type}-${req.kind}`;
  const list = readRequests(ownerId).filter((r) => r.id !== id);
  const entry = { id, postedAt: system.currentTick, ...req };
  list.push(entry);
  while (list.length > MAX_OPEN) {
    const dropped = list.shift();
    logWarn(TAG, `Papan permintaan penuh, membuang yang paling tua: ${dropped.id}`);
  }
  logInfo(TAG, `Permintaan baru dari ${req.fromName}: ${req.type}/${req.kind}`, entry);
  writeRequests(ownerId, list);
  return entry;
}

export function clearRequest(ownerId, id) {
  const list = readRequests(ownerId);
  const next = list.filter((r) => r.id !== id);
  if (next.length !== list.length) {
    logInfo(TAG, `Permintaan ${id} dihapus dari papan milik ${ownerId}.`);
    writeRequests(ownerId, next);
  }
}

function cooled(state, slot) {
  const now = system.currentTick;
  if (!state.askAt) state.askAt = {};
  const last = state.askAt[slot] ?? -COOLDOWN * 10;
  if (now - last < COOLDOWN) return false;
  state.askAt[slot] = now;
  return true;
}

/** Minta alat (cangkul/beliung/kapak/sekop) ke perajin. */
export function requestTool(entity, state, ownerId, kind, held, stationPos) {
  if (!ownerId || !stationPos) return undefined;
  if (!cooled(state, `tool:${kind}`)) {
    logDebug(TAG, `Permintaan alat ${kind} dari ${entStr(entity)} masih dalam cooldown.`);
    return undefined;
  }
  const neededRank = toolRank(held, kind) + 1;
  logInfo(TAG, `${entStr(entity)} meminta bantuan perajin: ${kind} tingkat ${neededRank}.`);
  return postRequest(ownerId, {
    type: "tool", from: entity.id, fromName: displayName(entity),
    kind, neededRank, stationPos, dim: entity.dimension.id,
  });
}

/** Minta barang jadi (ember, peti, papan nama, meja kerja) ke perajin. */
export function requestItem(entity, state, ownerId, kind, stationPos) {
  if (!ownerId || !stationPos) return undefined;
  if (!cooled(state, `item:${kind}`)) return undefined;
  logInfo(TAG, `${entStr(entity)} meminta barang jadi ke perajin: ${kind}.`);
  return postRequest(ownerId, {
    type: "item", from: entity.id, fromName: displayName(entity),
    kind, stationPos, dim: entity.dimension.id,
  });
}

/** Minta bahan mentah (kayu, batu, besi, tanah, bibit) ke pencari barang. */
export function requestMaterial(entity, state, ownerId, kind, stationPos) {
  if (!ownerId || !stationPos) return undefined;
  if (!MATERIAL_REQUESTS[kind]) {
    logWarn(TAG, `requestMaterial: jenis bahan "${kind}" tidak dikenal.`);
    return undefined;
  }
  if (!cooled(state, `mat:${kind}`)) return undefined;
  logInfo(TAG, `${entStr(entity)} meminta bahan ke pencari barang: ${kind}.`);
  return postRequest(ownerId, {
    type: "material", from: entity.id, fromName: displayName(entity),
    kind, want: MATERIAL_REQUESTS[kind].want, stationPos, dim: entity.dimension.id,
  });
}

/** Ringkasan untuk ditampilkan di menu pemain. */
export function requestLines(ownerId, limit = 8) {
  const list = readRequests(ownerId).slice(-limit).reverse();
  if (!list.length) return ["§8Tidak ada permintaan yang menggantung."];
  return list.map((r) => {
    const what = r.type === "material"
      ? (MATERIAL_REQUESTS[r.kind]?.label ?? r.kind)
      : r.kind;
    const who = r.type === "material" ? "pencari barang" : "perajin";
    return `§7• §f${r.fromName} §7butuh §e${what} §7dari §f${who}`;
  });
}
