/**
 * Papan permintaan bantuan alat.
 *
 * Kalau petani atau penambang kehabisan bahan untuk alat sendiri, mereka
 * memasang permintaan di sini alih-alih diam saja — dan companion Merajin
 * milik pemilik yang sama akan membacanya, menempakan alatnya dari peti
 * sendiri, lalu mengantarnya. Disimpan di dynamic property dunia per-pemilik
 * supaya companion mana pun (dan dunia yang ditutup lalu dibuka lagi) bisa
 * membacanya.
 */

import { system, world } from "@minecraft/server";
import { PROP } from "./config.js";
import { toolRank } from "./crafting.js";
import { displayName } from "./nametag.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "REQUESTS";
const COOLDOWN = 200; // tick (~10 detik) — jangan pasang ulang permintaan yang sama tiap denyut

function key(ownerId) {
  return `${PROP.requests}:${ownerId}`;
}

export function readRequests(ownerId) {
  if (!ownerId) return [];
  try {
    const raw = world.getDynamicProperty(key(ownerId));
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) {
    logWarn(TAG, `Gagal membaca permintaan bantuan milik ${ownerId}`, e);
    return [];
  }
}

function writeRequests(ownerId, list) {
  try {
    world.setDynamicProperty(key(ownerId), JSON.stringify(list));
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal menyimpan permintaan bantuan milik ${ownerId} (kuota limit?)`, e);
    return false;
  }
}

export function postRequest(ownerId, req) {
  if (!ownerId) return;
  const list = readRequests(ownerId).filter((r) => r.from !== req.from || r.kind !== req.kind);
  const entry = { id: `${req.from}-${req.kind}`, postedAt: system.currentTick, ...req };
  list.push(entry);
  logInfo(TAG, `Permintaan baru dari ${req.fromName}: butuh ${req.kind} di atas rank ${req.neededRank - 1}.`);
  writeRequests(ownerId, list);
}

export function clearRequest(ownerId, id) {
  const list = readRequests(ownerId);
  const next = list.filter((r) => r.id !== id);
  if (next.length !== list.length) {
    logDebug(TAG, `Permintaan ${id} dihapus dari papan milik ${ownerId}.`);
    writeRequests(ownerId, next);
  }
}

/**
 * Dipanggil dari farming.js/mining.js saat craftStep melaporkan "no-material":
 * pasang (atau perbarui) permintaan alat, dibatasi cooldown supaya tidak
 * menulis dynamic property tiap denyut kerja.
 */
export function maybeRequestHelp(entity, state, ownerId, kind, held, stationPos) {
  if (!ownerId || !stationPos) return;
  const now = system.currentTick;
  const last = state.lastRequestAt ?? -COOLDOWN * 10;
  if (now - last < COOLDOWN) return;
  state.lastRequestAt = now;
  const neededRank = toolRank(held, kind) + 1;
  logInfo(TAG, `${entStr(entity)} meminta bantuan perajin: butuh ${kind} di atas rank ${neededRank - 1}.`);
  postRequest(ownerId, {
    from: entity.id, fromName: displayName(entity), kind, neededRank, stationPos,
  });
}
