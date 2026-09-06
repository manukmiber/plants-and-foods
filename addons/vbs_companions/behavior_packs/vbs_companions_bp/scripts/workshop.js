/**
 * Meja kerja dan tungku yang DIPAKAI BERSAMA.
 *
 * Dulu tiap companion mencari meja kerja sendiri dengan menyapu blok di
 * sekitar stasiunnya, radius dua belas blok. Peti sudah dipakai bersama sejak
 * v1.4.0 (station.js) tapi meja kerja tidak, jadi dua companion yang stasiunnya
 * berjauhan sedikit saja masing-masing membelah empat papan untuk meja kerja
 * baru — dan pemain melihat halamannya penuh meja kerja sementara tidak ada
 * satu pun alat yang jadi.
 *
 * Sekarang setiap meja kerja dan tungku yang dipasang companion DIDAFTARKAN ke
 * tingkat dunia, persis seperti peti stasiun. Yang mencari cukup membaca
 * daftarnya: kalau sudah ada milik pemilik yang sama di sekitar situ, itu yang
 * dipakai — kayunya lebih baik jadi alat untuk companion lain.
 *
 * Yang tidak didaftarkan tetap ketemu: sapuan blok lama masih ada sebagai
 * cadangan (meja kerja buatan PEMAIN juga ikut terpakai), dan begitu ketemu,
 * tempatnya ikut didaftarkan supaya companion berikutnya tidak perlu menyapu
 * lagi.
 */

import { world } from "@minecraft/server";
import { PROP } from "./config.js";
import { takeOrMake } from "./items.js";
import {
  blockAt, getOwnerId, isAir, isSolid, makeItem, putIn, sound,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "WORKSHOP";

// Sengaja jauh lebih lebar dari SHARE_RADIUS peti (20 blok): sekali berjalan
// ke meja kerja bersama masih jauh lebih murah daripada menghabiskan kayu
// untuk meja kedua. Dua puluh empat blok ternyata masih terlalu sempit —
// stasiun yang berjauhan dua puluh blok saja sudah cukup membuat masing-masing
// membangun sendiri, karena mejanya berdiri beberapa blok dari stasiunnya.
const SHARE_RADIUS = 32;

// Cadangan kalau daftarnya kosong — mis. meja kerja buatan pemain, atau dunia
// lama yang isinya belum pernah didaftarkan.
const SCAN_RADIUS = 12;

/** Blok kerja yang boleh dipasang dan dipakai bersama. */
export const WORK_BLOCKS = {
  table: {
    id: "minecraft:crafting_table", recipe: "crafting_table",
    label: "meja kerja", ask: "wood",
  },
  furnace: {
    id: "minecraft:furnace", recipe: "furnace",
    label: "tungku", ask: "stone",
  },
};

/* ------------------------------------------------------------------ *
 * Daftar tingkat dunia
 * ------------------------------------------------------------------ */

function readShops() {
  try {
    const raw = world.getDynamicProperty(PROP.workshops);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    logWarn(TAG, "Gagal membaca daftar meja kerja & tungku dunia", e);
    return [];
  }
}

function writeShops(list) {
  try {
    world.setDynamicProperty(PROP.workshops, JSON.stringify(list.slice(-64)));
    return true;
  } catch (e) {
    logError(TAG, "Gagal menyimpan daftar meja kerja & tungku (kuota limit?)", e);
    return false;
  }
}

function samePlace(a, b) {
  return a.dim === b.dim && a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Mencatat satu blok kerja. `owner` boleh kosong — itu penanda blok yang bukan
 * buatan companion (meja kerja pemain yang kebetulan ketemu), dan blok tanpa
 * pemilik boleh dipakai siapa saja.
 */
export function registerWorkBlock(kind, dimensionId, pos, ownerId = "") {
  const entry = {
    kind, dim: dimensionId,
    x: pos.x, y: pos.y, z: pos.z,
    owner: ownerId ?? "",
  };
  const list = readShops().filter((s) => !samePlace(s, entry));
  list.push(entry);
  logInfo(TAG, `${WORK_BLOCKS[kind]?.label ?? kind} di ${posStr(pos)} didaftarkan (pemilik ${ownerId || "-"}).`);
  writeShops(list);
  return entry;
}

export function unregisterWorkBlock(dimensionId, pos) {
  const gone = { dim: dimensionId, x: pos.x, y: pos.y, z: pos.z };
  const list = readShops();
  const next = list.filter((s) => !samePlace(s, gone));
  if (next.length !== list.length) {
    logInfo(TAG, `Blok kerja di ${posStr(pos)} dicabut dari daftar (sudah tidak ada).`);
    writeShops(next);
  }
}

/** Blok kerja sejenis milik pemilik yang sama (atau tanpa pemilik), dekat dulu. */
export function workBlocksOf(kind, ownerId, dimensionId, near, radius = SHARE_RADIUS) {
  const out = [];
  for (const s of readShops()) {
    if (s.kind !== kind) continue;
    if (s.dim !== dimensionId) continue;
    if (s.owner && ownerId && s.owner !== ownerId) continue;
    const d = Math.hypot(s.x - near.x, s.z - near.z);
    if (d > radius) continue;
    out.push({ ...s, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

function stillThere(dimension, pos, id) {
  return blockAt(dimension, pos.x, pos.y, pos.z)?.typeId === id;
}

/* ------------------------------------------------------------------ *
 * Mencari dan memasang
 * ------------------------------------------------------------------ */

function scanFor(dimension, near, id, radius = SCAN_RADIUS) {
  logDebug(TAG, `Menyapu ${id} di sekitar ${posStr(near)} radius ${radius}...`);
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 3; dy++) {
          const block = blockAt(dimension, near.x + dx, near.y + dy, near.z + dz);
          if (block?.typeId === id) return { x: block.x, y: block.y, z: block.z };
        }
      }
    }
  }
  return undefined;
}

/**
 * Blok kerja yang sudah ada dan boleh dipakai, atau undefined.
 *
 * Daftar dulu (murah, dan menjangkau seluruh halaman), baru sapuan blok
 * (mahal, tapi menemukan yang belum tercatat). Yang ketemu lewat sapuan
 * langsung didaftarkan supaya tidak ada yang menyapu dua kali.
 */
export function findWorkBlock(entity, kind, near) {
  const spec = WORK_BLOCKS[kind];
  if (!spec) return undefined;
  const dimension = entity.dimension;
  const ownerId = getOwnerId(entity);

  for (const shop of workBlocksOf(kind, ownerId, dimension.id, near)) {
    const pos = { x: shop.x, y: shop.y, z: shop.z };
    if (stillThere(dimension, pos, spec.id)) {
      logDebug(TAG, `${entStr(entity)} memakai ${spec.label} bersama di ${posStr(pos)} (${shop.d.toFixed(1)}m).`);
      return pos;
    }
    unregisterWorkBlock(dimension.id, pos);
  }

  const found = scanFor(dimension, near, spec.id);
  if (found) {
    logInfo(TAG, `${spec.label} tak terdaftar ditemukan di ${posStr(found)}; ikut didaftarkan.`);
    registerWorkBlock(kind, dimension.id, found, "");
    return found;
  }
  return undefined;
}

function freeSpotNear(dimension, near, radius = 4) {
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const spot = blockAt(dimension, near.x + dx, near.y, near.z + dz);
        const above = blockAt(dimension, near.x + dx, near.y + 1, near.z + dz);
        const floor = blockAt(dimension, near.x + dx, near.y - 1, near.z + dz);
        if (isAir(spot) && isAir(above) && isSolid(floor)) return spot;
      }
    }
  }
  return undefined;
}

/**
 * Memasang blok kerja baru. Barangnya benar-benar harus ada dulu: kalau di
 * peti sudah ada yang jadi, itu yang dipakai; kalau belum, dirakit dari
 * bahannya. Kalau bahannya juga tidak ada, balikannya menyebut bahan yang
 * kurang supaya pemanggil bisa memasang permintaan bantuan.
 */
export function placeWorkBlock(entity, container, near, kind) {
  const spec = WORK_BLOCKS[kind];
  if (!spec) return { why: "unknown-kind" };
  const dimension = entity.dimension;
  logInfo(TAG, `Mencoba memasang ${spec.label} baru di dekat ${posStr(near)}...`);

  const spot = freeSpotNear(dimension, near);
  if (!spot) {
    logWarn(TAG, `Tidak ada lokasi kosong untuk ${spec.label} di dekat ${posStr(near)}.`);
    return { missing: undefined, why: "no-space" };
  }
  const got = takeOrMake(container, spec.recipe, entity, [spec.id]);
  if (!got.got) {
    logDebug(TAG, `Bahan ${spec.label} kurang: butuh ${got.missing ?? spec.ask}.`);
    return { missing: got.missing ?? spec.ask, why: "no-material" };
  }
  try {
    spot.setType(spec.id);
  } catch (e) {
    logError(TAG, `Gagal memasang ${spec.label} di ${posStr(spot)}`, e);
    putIn(container, makeItem(spec.id, 1));
    return { missing: undefined, why: "place-failed" };
  }
  const at = { x: spot.x, y: spot.y, z: spot.z };
  sound(dimension, "random.wood_click", at);
  logInfo(TAG, `${spec.label} berdiri di ${posStr(at)} (${got.how}) untuk ${entStr(entity)}.`);
  registerWorkBlock(kind, dimension.id, at, getOwnerId(entity) ?? "");
  return { at };
}

/**
 * Pastikan ada blok kerja yang bisa dipakai: cari yang sudah ada dulu, baru
 * pasang kalau memang belum ada satu pun.
 */
export function ensureWorkBlock(entity, container, near, kind) {
  const found = findWorkBlock(entity, kind, near);
  if (found) return { at: found, shared: true };
  logInfo(TAG, `${entStr(entity)} tidak menemukan ${WORK_BLOCKS[kind]?.label ?? kind}, mencoba membuat satu.`);
  return placeWorkBlock(entity, container, near, kind);
}

/** Bloknya masih berdiri di situ? Dipakai sebelum melanjutkan pekerjaan. */
export function workBlockStillThere(entity, kind, pos) {
  const spec = WORK_BLOCKS[kind];
  if (!spec || !pos) return false;
  return stillThere(entity.dimension, pos, spec.id);
}
