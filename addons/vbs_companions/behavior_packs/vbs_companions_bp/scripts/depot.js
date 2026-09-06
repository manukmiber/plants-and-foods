/**
 * Balai kerja bersama: satu titik yang DISEPAKATI semua companion satu pemilik.
 *
 * Keluhan yang melahirkan berkas ini: "Builder butuh kayu, Miner tangan
 * kosong." Rantai bahannya sebenarnya sudah ada (requests.js), tapi tiap
 * companion memasang petinya di tempat kakinya kebetulan berhenti. Pembangun
 * menaruh peti di tepi hutan, pencari barang menaruh peti di seberang sungai,
 * dan permintaan "butuh kayu" diantar ke peti yang tidak pernah dilihat
 * siapa-siapa. Yang terlihat pemain: semua orang sibuk, tidak ada yang jadi.
 *
 * Sekarang ada satu titik. Companion pertama yang butuh tempat kerja yang
 * MEMILIHNYA, lalu titik itu ditulis ke tingkat dunia dan seluruh companion
 * milik pemilik yang sama memakainya: peti gudang, meja kerja, tungku, dan
 * tempat semua kiriman bertemu.
 *
 * Satu aturan keras: balai TIDAK BOLEH berdiri di dalam chunk berpatok.
 * Ladang milik petani, dan desa milik pembangun. Kalau pemain mematok chunk
 * yang ternyata sudah ada balainya, petani berhak menyuruh pindah — titiknya
 * dipilih ulang di luar patok dan semua bangunan kerja ikut dibongkar-pasang
 * (station.js dan workshop.js yang mengerjakannya).
 */

import { system, world } from "@minecraft/server";
import { DEPOT, PROP } from "./config.js";
import { getClaim } from "./state.js";
import {
  blockAt, chunkOf, isAir, isFooting, getOwnerId,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "DEPOT";

// Mencari titik balai itu menyapu puluhan kolom. Kalau gagal (hutan rapat,
// seluruh sekitarnya berpatok), percobaan berikutnya ditahan — mengulanginya
// tiap denyut untuk tiap companion adalah cara tercepat membuat dunia patah.
const RETRY = 200;
const retryAt = new Map();

function cooled(ownerId) {
  const last = retryAt.get(ownerId) ?? -RETRY;
  if (system.currentTick - last < RETRY) return false;
  retryAt.set(ownerId, system.currentTick);
  return true;
}

function key(ownerId) {
  return `${PROP.stations}:depot:${ownerId}`;
}

export function readDepot(ownerId) {
  if (!ownerId) return undefined;
  try {
    const raw = world.getDynamicProperty(key(ownerId));
    const row = typeof raw === "string" ? JSON.parse(raw) : undefined;
    return row && typeof row.x === "number" ? row : undefined;
  } catch (e) {
    logWarn(TAG, `Gagal membaca balai kerja milik ${ownerId}`, e);
    return undefined;
  }
}

function writeDepot(ownerId, row) {
  try {
    world.setDynamicProperty(key(ownerId), JSON.stringify(row));
    return true;
  } catch (e) {
    logError(TAG, `Gagal menyimpan balai kerja milik ${ownerId} (kuota limit?)`, e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Patok: apa yang tidak boleh ditimpa balai
 * ------------------------------------------------------------------ */

/** Chunk ini dipatok (ladang ATAU desa), siapa pun yang mematoknya? */
export function chunkStaked(dimensionId, cx, cz) {
  return Boolean(getClaim(dimensionId, cx, cz));
}

/**
 * Titik ini aman untuk balai?
 *
 * `relax` menurunkan tuntutan bertahap, dan itu disengaja: aturan yang terlalu
 * keras bisa membuat SELURUH kru terlantar. Kalau pemain mematok chunk tempat
 * gudangnya berdiri dan seluruh sekitarnya juga sudah dipatok, lebih baik
 * balainya berdiri agak mepet daripada tidak ada balai sama sekali dan tidak
 * ada satu pun companion yang bisa bekerja.
 *
 *   0  tepinya pun harus bersih (jarak aman penuh) — ini yang normal
 *   1  cukup chunk-nya sendiri yang tidak berpatok
 *   2  di mana saja, asal ada tanahnya
 */
export function siteFree(dimensionId, pos, relax = 0) {
  if (relax >= 2) return true;
  const pad = relax >= 1 ? 0 : DEPOT.clearOfClaim;
  const ring = pad === 0
    ? [[0, 0]]
    : [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad],
       [pad, pad], [pad, -pad], [-pad, pad], [-pad, -pad]];
  for (const [dx, dz] of ring) {
    const { cx, cz } = chunkOf({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
    if (chunkStaked(dimensionId, cx, cz)) return false;
  }
  return true;
}

/** Blok apa pun (peti, meja kerja, tungku) yang berdiri di dalam chunk berpatok. */
export function insideStake(dimensionId, pos) {
  if (!pos) return false;
  const { cx, cz } = chunkOf(pos);
  return chunkStaked(dimensionId, cx, cz);
}

/**
 * Sama, tapi hanya patok milik PEMILIK COMPANION ITU SENDIRI.
 *
 * Dipakai sebelum membongkar sesuatu. Patok pemain lain cukup dihindari saat
 * memasang yang baru; membongkar gudang orang karena tetangga sebelah memasang
 * patok bukan "menertibkan ladang", itu menghancurkan barang orang.
 */
export function insideOwnStake(dimensionId, pos, ownerId) {
  if (!pos || !ownerId) return false;
  const { cx, cz } = chunkOf(pos);
  const entry = getClaim(dimensionId, cx, cz);
  return Boolean(entry) && entry.by === ownerId;
}

/* ------------------------------------------------------------------ *
 * Memilih titik
 * ------------------------------------------------------------------ */

/** Tanah rata dengan dua blok kosong di atasnya, di sekitar kolom (x, z). */
function groundSpot(dimension, x, z, baseY) {
  for (let y = baseY + 6; y >= baseY - 8; y--) {
    const floor = blockAt(dimension, x, y - 1, z);
    const at = blockAt(dimension, x, y, z);
    const above = blockAt(dimension, x, y + 1, z);
    if (!floor || !at || !above) continue;
    if (!isFooting(floor) || !isAir(at) || !isAir(above)) continue;
    return { x, y, z };
  }
  return undefined;
}

/** Sekelilingnya cukup lapang untuk peti + meja kerja + tungku + papan nama. */
function roomy(dimension, spot) {
  let free = 0;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const floor = blockAt(dimension, spot.x + dx, spot.y - 1, spot.z + dz);
      const at = blockAt(dimension, spot.x + dx, spot.y, spot.z + dz);
      if (isFooting(floor) && isAir(at)) free++;
    }
  }
  return free >= 12;
}

/**
 * Titik balai baru, dicari melingkar dari usulan pertama. Yang pertama
 * memenuhi syarat menang — tidak ada penilaian rumit, karena yang penting
 * bukan titik terbaik melainkan titik yang SAMA untuk semua orang.
 */
function sweepFor(dimension, base, relax, avoid) {
  for (let r = 0; r <= DEPOT.search; r += 4) {
    const ring = r === 0 ? [[0, 0]] : [];
    if (r > 0) {
      for (let d = -r; d <= r; d += 4) {
        ring.push([d, -r], [d, r], [-r, d], [r, d]);
      }
    }
    for (const [dx, dz] of ring) {
      const x = base.x + dx;
      const z = base.z + dz;
      if (!siteFree(dimension.id, { x, y: base.y, z }, relax)) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 12) continue;
      const spot = groundSpot(dimension, x, z, base.y);
      if (!spot) continue;
      if (relax < 2 && !roomy(dimension, spot)) continue;
      logInfo(TAG, `Titik balai kerja terpilih di ${posStr(spot)} (jarak ${r}, kelonggaran ${relax}).`);
      return spot;
    }
  }
  return undefined;
}

/**
 * Titik balai baru, dicari melingkar dari usulan pertama. Yang pertama
 * memenuhi syarat menang — tidak ada penilaian rumit, karena yang penting
 * bukan titik terbaik melainkan titik yang SAMA untuk semua orang.
 *
 * Tuntutannya dilonggarkan bertahap kalau tidak ada yang lolos, supaya
 * "tidak boleh di dalam patok" tidak pernah berubah jadi "tidak ada tempat
 * kerja sama sekali".
 */
export function pickSite(dimension, origin, { avoid } = {}) {
  const base = {
    x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z),
  };
  for (const relax of [0, 1, 2]) {
    const spot = sweepFor(dimension, base, relax, avoid);
    // Tingkat kelonggaran ikut disimpan: balai yang memang terpaksa berdiri
    // mepet patok tidak boleh dinilai ulang dengan tuntutan penuh nanti,
    // karena itu akan membuatnya pindah-pindah tanpa henti.
    if (spot) return { ...spot, relax };
  }
  logWarn(TAG, `Tidak ada titik balai yang layak di sekitar ${posStr(base)}.`);
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Kesepakatan
 * ------------------------------------------------------------------ */

/**
 * Balai kerja milik pemilik companion ini, dibuatkan kalau memang belum ada.
 *
 * Balikan `{ x, y, z, dim, moves }`, atau undefined kalau companion belum
 * punya pemilik dan karena itu belum punya siapa-siapa untuk bersepakat.
 */
export function depotFor(entity, ownerId = getOwnerId(entity)) {
  if (!ownerId) return undefined;
  const dimensionId = entity.dimension.id;
  const row = readDepot(ownerId);

  if (row && row.dim === dimensionId) {
    if (siteFree(dimensionId, row, row.relax ?? 0)) return row;
    if (!cooled(ownerId)) return row;
    logInfo(TAG, `Balai lama di ${posStr(row)} sekarang berada di dalam patok; dipindahkan.`);
    return relocate(entity, ownerId, row, "kena patok") ?? row;
  }

  // Companion di dimensi lain (penambang di Nether, misalnya) tidak memaksa
  // balai pindah — dia bekerja dengan petinya sendiri di sana.
  if (row && row.dim !== dimensionId) return undefined;

  if (!cooled(ownerId)) return undefined;
  const spot = pickSite(entity.dimension, entity.location);
  if (!spot) return undefined;
  const fresh = {
    dim: dimensionId, x: spot.x, y: spot.y, z: spot.z, relax: spot.relax ?? 0,
    by: entity.id, at: system.currentTick, moves: 0,
  };
  writeDepot(ownerId, fresh);
  logInfo(TAG, `${entStr(entity)} menetapkan balai kerja bersama di ${posStr(fresh)}.`);
  return fresh;
}

/** Memilih ulang titik balai — dipakai kalau yang lama tergilas patok. */
export function relocate(entity, ownerId, old, why = "") {
  const spot = pickSite(entity.dimension, old ?? entity.location, { avoid: old });
  if (!spot) {
    logWarn(TAG, `Balai perlu pindah (${why}) tapi belum ada titik pengganti.`);
    return undefined;
  }
  const fresh = {
    dim: entity.dimension.id, x: spot.x, y: spot.y, z: spot.z,
    relax: spot.relax ?? 0,
    by: entity.id, at: system.currentTick, moves: (old?.moves ?? 0) + 1, why,
  };
  writeDepot(ownerId, fresh);
  logInfo(TAG, `Balai kerja pindah ke ${posStr(fresh)} (${why}).`);
  return fresh;
}

/**
 * Menyuruh balai pindah dari luar — dipakai petani yang mendapati gudang dan
 * bengkel berdiri di tengah ladangnya. Balikan titik barunya, atau undefined
 * kalau memang tidak perlu pindah.
 */
export function demandMove(entity, ownerId, why) {
  const row = readDepot(ownerId);
  if (!row) return undefined;
  if (row.dim !== entity.dimension.id) return undefined;
  if (siteFree(row.dim, row, row.relax ?? 0)) return undefined;
  if (!cooled(ownerId)) return undefined;
  return relocate(entity, ownerId, row, why);
}

/** Sejauh apa companion dari balai kerjanya (mendatar). */
export function depotDistance(entity, depot) {
  if (!depot) return Infinity;
  if (depot.dim !== entity.dimension.id) return Infinity;
  return Math.hypot(entity.location.x - depot.x, entity.location.z - depot.z);
}

export function depotLabel(depot) {
  return depot ? `balai kerja (${depot.x}, ${depot.y}, ${depot.z})` : "balai kerja";
}

export function logDepot(ownerId) {
  const row = readDepot(ownerId);
  logDebug(TAG, `Balai milik ${ownerId}: ${row ? posStr(row) : "belum ada"}`);
  return row;
}
