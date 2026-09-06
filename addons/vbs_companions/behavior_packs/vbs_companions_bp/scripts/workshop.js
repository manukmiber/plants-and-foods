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
import { depotFor, insideOwnStake, insideStake } from "./depot.js";
import { takeOrMake } from "./items.js";
import {
  blockAt, getOwnerId, isAir, isFooting, makeItem, putIn, sound,
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

// Alasan cache-nya sama persis dengan daftar stasiun: dibaca tiap denyut,
// ditulis sesekali.
let shopCache;

function readShops() {
  if (shopCache) return shopCache;
  try {
    const raw = world.getDynamicProperty(PROP.workshops);
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    shopCache = Array.isArray(list) ? list : [];
  } catch (e) {
    logWarn(TAG, "Gagal membaca daftar meja kerja & tungku dunia", e);
    shopCache = [];
  }
  return shopCache;
}

function writeShops(list) {
  const kept = list.slice(-64);
  shopCache = kept;
  try {
    world.setDynamicProperty(PROP.workshops, JSON.stringify(kept));
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

/** Meja kerja / tungku milik pemilik ini yang berdiri di dalam satu petak. */
export function workBlocksIn(ownerId, dimensionId, bounds) {
  return readShops().filter((s) =>
    s.dim === dimensionId &&
    (!ownerId || !s.owner || s.owner === ownerId) &&
    s.x >= bounds.x0 && s.x <= bounds.x1 &&
    s.z >= bounds.z0 && s.z <= bounds.z1);
}

/** Ada balai di dimensi ini yang BUKAN di dalam patok untuk pindah ke sana? */
function canRebuildElsewhere(entity) {
  const depot = depotFor(entity);
  return Boolean(depot) && depot.dim === entity.dimension.id &&
    !insideOwnStake(depot.dim, depot, getOwnerId(entity));
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
    if (!stillThere(dimension, pos, spec.id)) {
      unregisterWorkBlock(dimension.id, pos);
      continue;
    }
    // Bengkel yang sekarang berdiri di dalam chunk berpatok harus pindah.
    // Dibongkar di sini juga, supaya batu/kayunya kembali ke peti alih-alih
    // hangus di tengah ladang orang.
    // Dibongkar HANYA kalau ada tempat lain untuk berdiri: bengkel yang
    // dibongkar tanpa pengganti sama saja dengan menghentikan seluruh kru.
    if (insideOwnStake(dimension.id, pos, ownerId) && canRebuildElsewhere(entity)) {
      logInfo(TAG, `${spec.label} di ${posStr(pos)} kena patok; dibongkar dan dipindahkan.`);
      evictWorkBlock(entity, kind, pos);
      continue;
    }
    logDebug(TAG, `${entStr(entity)} memakai ${spec.label} bersama di ${posStr(pos)} (${shop.d.toFixed(1)}m).`);
    return pos;
  }

  const found = scanFor(dimension, near, spec.id);
  if (found && !insideStake(dimension.id, found)) {
    logInfo(TAG, `${spec.label} tak terdaftar ditemukan di ${posStr(found)}; ikut didaftarkan.`);
    registerWorkBlock(kind, dimension.id, found, "");
    return found;
  }
  return undefined;
}

/**
 * Membongkar satu blok kerja dan mengembalikan barangnya ke peti pembongkar.
 * Dipakai kalau meja kerja atau tungku ternyata berdiri di dalam ladang.
 */
export function evictWorkBlock(entity, kind, pos, container) {
  const spec = WORK_BLOCKS[kind];
  const dimension = entity.dimension;
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  try {
    if (block && spec && block.typeId === spec.id) {
      block.setType("minecraft:air");
      if (container) putIn(container, makeItem(spec.id, 1));
      else dimension.spawnItem(makeItem(spec.id, 1), { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 });
    }
  } catch (e) {
    logWarn(TAG, `Gagal membongkar ${spec?.label ?? kind} di ${posStr(pos)}`, e);
  }
  unregisterWorkBlock(dimension.id, pos);
  return true;
}

function freeSpotNear(dimension, near, radius = 4) {
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const spot = blockAt(dimension, near.x + dx, near.y, near.z + dz);
        const above = blockAt(dimension, near.x + dx, near.y + 1, near.z + dz);
        const floor = blockAt(dimension, near.x + dx, near.y - 1, near.z + dz);
        // isFooting: meja kerja di atas daun itu meja kerja melayang.
        if (isAir(spot) && isAir(above) && isFooting(floor)) return spot;
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
  // Patok PEMILIKNYA SENDIRI yang dihormati di sini, dan cuma kalau memang
  // ada alternatifnya. Patok pemain lain cukup dihindari saat memilih titik
  // balai; menolak memasang meja kerja di samping peti sendiri karena
  // tetangga memasang patok cuma membuat companion berhenti bekerja.
  if (insideOwnStake(dimension.id, spot, getOwnerId(entity)) && canRebuildElsewhere(entity)) {
    logWarn(TAG, `${spec.label} tidak dipasang di ${posStr(spot)}: itu di dalam chunk berpatok.`);
    return { missing: undefined, why: "staked" };
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
  // Titik acuannya PETI yang benar-benar dipakai companion ini, bukan balai.
  //
  // Kelihatannya berlawanan dengan gagasan balai bersama, padahal justru itu
  // yang membuatnya bekerja: peti sendiri sudah diarahkan ke balai
  // (station.js), jadi dalam permainan biasa semua peti — dan karena itu semua
  // meja kerja — memang berkumpul di satu halaman. Sementara companion yang
  // petinya memang di tempat lain (peti buatan pemain, peti tambang di
  // kedalaman) tetap punya meja kerjanya sendiri alih-alih berjalan tujuh
  // puluh blok pulang-pergi tiap kali menempa satu cangkul.
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
