/**
 * Patok ladang dan patok desa: pemain menandai chunk mana yang boleh digarap
 * atau dibangun companion.
 *
 * Patoknya BUKAN item. Dulu berupa stik bernama yang harus dibawa dan
 * diklikkan ke tanah chunk yang dituju, dan itu gagal dua arah: stik bernama
 * tenggelam di antara stik biasa yang memang berkarung-karung dibuat perajin,
 * dan chunk di seberang lembah tetap harus didatangi dulu. Satu-satunya jalan
 * sekarang adalah Peta Patok di Buku Panduan, yang memanggil toggleClaimAt di
 * bawah dengan koordinat chunk-nya langsung.
 */

import { system, world } from "@minecraft/server";
import { MARKER } from "./config.js";
import {
  claimKey, clearClaim, getClaim, readClaims, setClaim,
} from "./state.js";

// farming.js dan builder.js membaca ketinggian patok lewat getClaim, dan
// mengambilnya dari sini. Tanpa re-export ini, Minecraft gagal MENAUTKAN
// modulnya — seluruh mesin skrip add-on mati diam-diam begitu dunia dibuka,
// jadi semua fitur "tidak jalan" sekaligus. Ini akar dari sebagian besar
// keluhan itu.
export { getClaim };
import {
  chunkCenter, chunkOf, dist2, particle, sound, surfaceScan,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CLAIM";
const BEAM_HEIGHT = 18;
const BEAM_STEP = 2;
const BEAM = {
  free: "minecraft:basic_flame_particle",
  claimed: "minecraft:villager_happy",
};

function markersIn(dimension) {
  try {
    const list = dimension.getEntities({ type: MARKER });
    logDebug(TAG, `Ditemukan ${list.length} marker di dimensi ${dimension.id}`);
    return list;
  } catch (e) {
    logWarn(TAG, `Gagal mencari marker di dimensi ${dimension.id}`, e);
    return [];
  }
}

function findMarker(dimension, cx, cz) {
  logDebug(TAG, `Mencari marker di chunk (${cx}, ${cz})...`);
  for (const m of markersIn(dimension)) {
    const c = chunkOf(m.location);
    if (c.cx === cx && c.cz === cz) {
      logDebug(TAG, `Marker ditemukan: ${entStr(m)} di (${cx}, ${cz})`);
      return m;
    }
  }
  logDebug(TAG, `Marker tidak ditemukan untuk chunk (${cx}, ${cz})`);
  return undefined;
}

/**
 * Ketinggian tempat BERDIRI di satu kolom: satu blok di atas tanahnya. Dipakai
 * untuk menaruh penanda patok, yang memang berdiri DI ATAS tanah.
 */
function groundAt(dimension, x, z, from) {
  const found = surfaceScan(dimension, x, z, from);
  if (typeof found.y === "number") {
    logDebug(TAG, `groundAt: ditemukan Y=${found.y + 1}`);
    return found.y + 1;
  }
  logDebug(TAG, `groundAt: fallback ke Y=${from}`);
  return from;
}

/**
 * Ketinggian TANAHNYA sendiri — blok padat teratas, satu di bawah tempat
 * berdiri. `undefined` kalau kolomnya tidak terbaca.
 *
 * Bedanya dengan groundAt cuma satu blok, dan satu blok itulah yang selama ini
 * membuat ladang tidak pernah jalan. `entry.y` dibaca farming.js sebagai
 * `flattenY`, yaitu tinggi PERMUKAAN yang dicangkul jadi farmland — bukan
 * tinggi kaki yang berdiri di atasnya. Versi lama menyimpan
 * `floor(player.y) + 1`, dan karena kaki pemain sudah satu angka di atas
 * rumput, hasilnya DUA blok terlalu tinggi: setiap kolom petak terbaca
 * "cekung", petani menghabiskan seluruh waktunya meminta tanah timbun yang
 * tidak pernah cukup, dan dari luar dia terlihat cuma berdiri diam di samping
 * petinya. Itulah "patoknya tidak jalan" dan "petaninya diam saja".
 *
 * Pembacaannya sendiri sekarang di util.js » surfaceScan, dan itu perbaikan
 * kedua: aturan lama menuntut UDARA tepat di atas blok padat, jadi kolom yang
 * tertutup air tidak pernah terbaca sama sekali — di dasar danau yang ada di
 * atas tanah bukan udara, tapi air. Chunk tepi danau lalu dilaporkan "belum
 * dimuat", dan patoknya menyimpan tinggi kaki pemain.
 */
function solidTopAt(dimension, x, z, from) {
  return surfaceScan(dimension, x, z, from).y;
}

export function surfaceY(dimension, x, z, from) {
  return solidTopAt(dimension, x, z, from) ?? from - 1;
}

// Titik contoh untuk menaksir ketinggian satu chunk: kisi 5x5 yang menjangkau
// hampir seluruh petak 16x16. Kisi yang lebih jarang pernah dicoba dan salah:
// tiga titik per sumbu bisa kebetulan jatuh di gelombang bukit yang sama dan
// melaporkan seluruh chunk dua blok lebih rendah daripada yang sebenarnya.
const SAMPLES = [-6, -3, 0, 3, 6];

/**
 * Tinggi permukaan yang mewakili satu chunk: median dari dua puluh lima kolom
 * contoh, bukan cuma titik tengahnya.
 *
 * Satu lubang atau satu gundukan tepat di tengah chunk tidak boleh menentukan
 * ketinggian seluruh ladang. Median tahan terhadap keduanya dan tetap murah —
 * dua puluh lima kolom, sekali seumur patok.
 *
 * `undefined` kalau chunk-nya belum benar-benar dimuat: menebak dari kolom
 * yang tidak terbaca berarti menuliskan ketinggian ngawur ke patok, dan itu
 * persis kesalahan yang fungsi ini ada untuk mencegahnya.
 */
export function chunkSurfaceY(dimension, cx, cz, from) {
  const { x, z } = chunkCenter(cx, cz);
  const ys = [];
  let loaded = 0;
  let columns = 0;
  for (const dx of SAMPLES) {
    for (const dz of SAMPLES) {
      columns++;
      const found = surfaceScan(dimension, x + dx, z + dz, from);
      if (found.loaded) loaded++;
      if (typeof found.y === "number") ys.push(found.y);
    }
  }
  if (loaded < columns) {
    logWarn(TAG, `chunkSurfaceY (${cx}, ${cz}): cuma ${loaded}/${columns} kolom terbaca; chunk belum dimuat.`);
    return undefined;
  }
  if (!ys.length) {
    // Terbaca seluruhnya, dan memang tidak ada tanahnya: langit di atas jurang,
    // atau laut yang lebih dalam dari jangkauan sapuan. Itu bukan "belum
    // dimuat", dan menyebutnya begitu membuat pemain menunggu sesuatu yang
    // tidak akan terjadi.
    logWarn(TAG, `chunkSurfaceY (${cx}, ${cz}): tidak ada tanah dalam jangkauan dari y=${from}.`);
    return undefined;
  }
  ys.sort((a, b) => a - b);
  const median = ys[Math.floor(ys.length / 2)];
  logDebug(TAG, `chunkSurfaceY (${cx}, ${cz}): ${ys.length}/${columns} kolom bertanah -> median ${median}`);
  return median;
}

// Versi skema entri patok. Patok yang dipasang sebelum ini menyimpan `y` dua
// blok terlalu tinggi (lihat solidTopAt), dan dunia yang sudah terlanjur punya
// patok begitu tidak boleh dibiarkan rusak selamanya: ensureClaimHeight
// membetulkannya sekali, di tempat, begitu companion pertama menggarapnya.
const CLAIM_VERSION = 2;

/**
 * Membetulkan ketinggian satu patok lama, sekali saja.
 *
 * Dipanggil petani dan pembangun sebelum memakai `entry.y`. Patok yang sudah
 * SELESAI digarap tidak diutak-atik: permukaannya memang sudah dibentuk ke
 * ketinggian itu, jadi angka apa pun yang tercatat di situ sekarang benar.
 */
export function ensureClaimHeight(dimension, cx, cz) {
  const entry = getClaim(dimension.id, cx, cz);
  if (!entry || entry.v === CLAIM_VERSION) return entry;
  const before = Math.floor(entry.y ?? 64);
  if (entry.worked) {
    entry.v = CLAIM_VERSION;
    setClaim(dimension.id, cx, cz, entry);
    return entry;
  }
  const truth = chunkSurfaceY(dimension, cx, cz, before);
  if (typeof truth !== "number") return entry;   // chunk belum dimuat; nanti lagi
  entry.v = CLAIM_VERSION;
  if (Math.abs(truth - before) >= 2) {
    logWarn(TAG, `Ketinggian patok (${cx}, ${cz}) dibetulkan: ${before} -> ${truth}. ` +
      "Patok lama menyimpan tinggi kaki pemain, bukan tinggi tanahnya.");
    entry.y = truth;
  }
  setClaim(dimension.id, cx, cz, entry);
  refreshMarker(dimension, cx, cz, entry);
  return entry;
}

export function refreshMarker(dimension, cx, cz, entry) {
  const { x, z } = chunkCenter(cx, cz);
  logInfo(TAG, `refreshMarker di chunk (${cx}, ${cz}) center=(${x}, ${z}), entry=${JSON.stringify(entry)}`);
  let marker = findMarker(dimension, cx, cz);
  if (!entry) {
    if (marker) {
      try {
        logInfo(TAG, `Menghapus marker lama ${entStr(marker)} di chunk (${cx}, ${cz})`);
        marker.remove();
      } catch (e) {
        logWarn(TAG, `Gagal menghapus marker di (${cx}, ${cz})`, e);
      }
    }
    return undefined;
  }
  if (!marker) {
    const y = groundAt(dimension, x, z, Math.floor(entry.y ?? 64));
    try {
      marker = dimension.spawnEntity(MARKER, { x: x + 0.5, y, z: z + 0.5 });
      logInfo(TAG, `Marker baru berhasil di-spawn: ${entStr(marker)} di (${x + 0.5}, ${y}, ${z + 0.5})`);
    } catch (e) {
      logWarn(TAG, `Gagal spawn marker di (${x}, ${z}). Chunk belum dimuat?`, e);
      return undefined;
    }
  }
  try {
    const eventName = entry.worked ? "vbs:set_claimed" : "vbs:set_free";
    marker.triggerEvent(eventName);
    // Patok desa dan patok ladang memakai penanda yang sama, jadi tulisannya
    // yang harus membedakan. Sebelum ini keduanya sama-sama bertuliskan
    // "Patok Ladang", dan chunk desa yang sudah ditandai terbaca seperti ladang
    // yang tidak pernah digarap siapa pun.
    const village = (entry.kind ?? "farm") === "village";
    const label = village ? "Patok Desa" : "Patok Ladang";
    const doneText = village ? "rumahnya sudah berdiri" : "sudah jadi ladang";
    const todoText = village ? "belum dibangun" : "belum digarap";
    marker.nameTag = entry.worked
      ? `§a${label} §7(${cx}, ${cz})\n§a${doneText}`
      : `§c${label} §7(${cx}, ${cz})\n§c${todoText}`;
    logDebug(TAG, `Marker ${entStr(marker)} di-update dengan event: ${eventName}`);
  } catch (e) {
    logWarn(TAG, `Gagal memperbarui status/nameTag marker di (${cx}, ${cz})`, e);
  }
  return marker;
}

// Penanda patok adalah entity, dan entity hilang bersama chunk yang tidak
// dimuat — jadi sesudah dunia ditutup dan dibuka lagi, patok yang kemarin
// terlihat jelas bisa tidak ada penandanya sama sekali. Selama pemain berdiri
// cukup dekat, penandanya dipasang ulang. Percobaannya dijeda karena chunk
// yang belum dimuat akan gagal terus dan tidak ada gunanya dicoba tiap denyut.
const markerTry = new Map();
const MARKER_RETRY = 200;

export function tickBeams() {
  const players = world.getAllPlayers();
  if (!players.length) return;
  const claims = readClaims();
  const claimKeys = Object.keys(claims);
  if (!claimKeys.length) return;

  logDebug(TAG, `tickBeams: Memproses ${claimKeys.length} patok aktif.`);
  for (const [key, entry] of Object.entries(claims)) {
    const [dimId, coords] = key.split("|");
    const [cx, cz] = coords.split(",").map(Number);
    let dimension;
    try {
      dimension = world.getDimension(dimId);
    } catch {
      continue;
    }
    const { x, z } = chunkCenter(cx, cz);
    const watcher = players.find((p) => p.dimension.id === dimId &&
      dist2(p.location, { x, y: p.location.y, z }) < 64 * 64);
    if (!watcher) continue;

    let marker = findMarker(dimension, cx, cz);
    if (!marker && system.currentTick - (markerTry.get(key) ?? -MARKER_RETRY) >= MARKER_RETRY) {
      markerTry.set(key, system.currentTick);
      logDebug(TAG, `Penanda chunk (${cx}, ${cz}) hilang padahal patoknya masih ada; dipasang ulang.`);
      marker = refreshMarker(dimension, cx, cz, entry);
    }
    const base = marker ? marker.location.y : groundAt(dimension, x, z, 64);
    const id = entry.worked ? BEAM.claimed : BEAM.free;
    for (let dy = 1; dy <= BEAM_HEIGHT; dy += BEAM_STEP) {
      particle(dimension, id, { x: x + 0.5, y: base + dy, z: z + 0.5 });
    }
  }
}

/**
 * Memasang atau mencabut patok pada satu chunk, ditunjuk dengan koordinat
 * chunk-nya langsung. Satu-satunya jalan masuk: Peta Patok di Buku Panduan.
 *
 * `at` cuma titik acuan PENCARIAN ketinggian — biasanya posisi pemain. Yang
 * disimpan tetap tinggi tanah chunk itu sendiri (chunkSurfaceY), bukan tinggi
 * kaki pemain, karena chunk yang dipatok bisa saja ada di seberang lembah.
 */
export function toggleClaimAt(player, cx, cz, kind = "farm", at) {
  const dimId = player.dimension.id;
  logInfo(TAG, `Pemain ${player.name} toggleClaim (${kind}) di chunk (${cx}, ${cz})`);
  const existing = getClaim(dimId, cx, cz);
  if (existing) {
    // Patok orang lain bukan milikmu. Tanpa penjagaan ini, siapa pun di server
    // bisa mencabut ladang pemain lain dari petanya sendiri.
    if (existing.by && existing.by !== player.id) {
      logInfo(TAG, `toggleClaim ditolak: chunk (${cx}, ${cz}) milik ${existing.name ?? existing.by}.`);
      return `§cChunk itu dipatok §f${existing.name ?? "pemain lain"}§c, bukan kamu.`;
    }
    if ((existing.kind ?? "farm") !== kind) {
      logInfo(TAG, `toggleClaim ditolak: chunk (${cx}, ${cz}) sudah dipatok untuk "${existing.kind ?? "farm"}", bukan "${kind}".`);
      const already = existing.kind === "village" ? "desa" : "ladang";
      return `§cChunk itu sudah dipatok untuk ${already}. Cabut dulu dengan patok yang sesuai.`;
    }
    logInfo(TAG, `Mencabut patok di chunk (${cx}, ${cz})`);
    clearClaim(dimId, cx, cz);
    refreshMarker(player.dimension, cx, cz, undefined);
    sound(player.dimension, "random.break", at ?? player.location);
    return `§7Patok chunk §f(${cx}, ${cz})§7 dicabut.`;
  }
  const base = Math.floor((at ?? player.location).y);
  const entry = {
    by: player.id, name: player.name, worked: false, kind, v: CLAIM_VERSION,
    y: chunkSurfaceY(player.dimension, cx, cz, base) ?? base - 1,
  };
  logInfo(TAG, `Memasang patok baru (${kind}) di chunk (${cx}, ${cz}) oleh ${player.name}`);
  setClaim(dimId, cx, cz, entry);
  refreshMarker(player.dimension, cx, cz, entry);
  sound(player.dimension, "random.orb", at ?? player.location);
  if (kind === "village") {
    return `§2Chunk (${cx}, ${cz}) dipatok untuk desa§7 — belum dibangun. ` +
      "§7Suruh Pembangun ke Mode Membangun, dia yang akan membuatkan rumah di sana.";
  }
  return `§cChunk (${cx}, ${cz}) dipatok§7 — belum digarap. ` +
    "§7Suruh companionmu ke mode bertani, dia yang akan menggarapnya.";
}

/**
 * Peta chunk di sekitar pemain, untuk halaman Peta Patok di Buku Panduan.
 *
 * Alasan halaman itu ada: patok berbentuk ITEM yang harus dibawa dan diklikkan
 * ke tanah chunk yang dituju. Kalau itemnya terselip di antara isi kantong,
 * atau kalau chunk yang mau dipatok ada di seberang lembah, memasang satu
 * patok jadi pekerjaan tersendiri. Peta ini menggantikan keduanya: seluruh
 * petak di sekitar tergambar sekaligus, dan tinggal ditunjuk.
 *
 * Seluruh papan klaim dibaca SEKALI di sini — versi per-petak berarti
 * enam puluh empat kali membaca dan mem-parse dynamic property yang sama.
 */
export function chunkMap(player, size = 8) {
  const here = chunkOf(player.location);
  const half = Math.floor(size / 2);
  const cx0 = here.cx - half;
  const cz0 = here.cz - half;
  const dimId = player.dimension.id;
  const claims = readClaims();
  const rows = [];
  for (let rz = 0; rz < size; rz++) {
    const row = [];
    for (let rx = 0; rx < size; rx++) {
      const cx = cx0 + rx;
      const cz = cz0 + rz;
      const entry = claims[claimKey(dimId, cx, cz)];
      const center = chunkCenter(cx, cz);
      row.push({
        cx, cz,
        kind: entry ? (entry.kind ?? "farm") : undefined,
        worked: Boolean(entry?.worked),
        mine: Boolean(entry) && entry.by === player.id,
        byName: entry?.name,
        here: cx === here.cx && cz === here.cz,
        dist: Math.round(Math.hypot(center.x - player.location.x, center.z - player.location.z)),
      });
    }
    rows.push(row);
  }
  logDebug(TAG, `chunkMap untuk ${player.name}: ${size}x${size} mulai (${cx0}, ${cz0}), berdiri di (${here.cx}, ${here.cz}).`);
  return { size, cx0, cz0, here, rows };
}

const COMPASS = ["utara", "timur laut", "timur", "tenggara",
                 "selatan", "barat daya", "barat", "barat laut"];

/**
 * Patok terdekat milik pemain: arah dan jaraknya, atau undefined kalau memang
 * belum punya satu pun. Inilah jawaban untuk "patokku yang kemarin di mana".
 */
export function nearestClaimHint(player, kind = "farm") {
  const near = claimsNear(player.dimension, player.location, player.id, 1, kind);
  if (!near.length) return undefined;
  const { cx, cz, entry, d } = near[0];
  const center = chunkCenter(cx, cz);
  // Di Minecraft utara itu -Z dan timur +X; sudut dihitung dari utara searah
  // jarum jam supaya cocok dengan kompas yang dilihat pemain.
  const angle = Math.atan2(center.x - player.location.x, player.location.z - center.z);
  const idx = (Math.round((angle * 4) / Math.PI) + 8) % 8;
  return {
    cx, cz, entry, dist: Math.round(d), dir: COMPASS[idx],
    worked: Boolean(entry?.worked),
  };
}

export function markWorked(dimension, cx, cz) {
  logInfo(TAG, `markWorked: Menandai chunk (${cx}, ${cz}) sebagai selesai digarap.`);
  const entry = getClaim(dimension.id, cx, cz);
  if (!entry) {
    logWarn(TAG, `markWorked gagal: Chunk (${cx}, ${cz}) tidak ditemukan di klaim.`);
    return false;
  }
  if (entry.worked) {
    logDebug(TAG, `Chunk (${cx}, ${cz}) sudah bertatus worked sebelumnya.`);
    return false;
  }
  entry.worked = true;
  setClaim(dimension.id, cx, cz, entry);
  refreshMarker(dimension, cx, cz, entry);
  logInfo(TAG, `Chunk (${cx}, ${cz}) berhasil ditandai sebagai ladang hijau.`);
  return true;
}

export function claimsNear(dimension, origin, ownerId, limit = 8, kind = "farm") {
  logDebug(TAG, `Mencari claimsNear: origin=${posStr(origin)}, ownerId=${ownerId}, limit=${limit}, kind=${kind}`);
  const out = [];
  const claims = readClaims();
  for (const [key, entry] of Object.entries(claims)) {
    const [dimId, coords] = key.split("|");
    if (dimId !== dimension.id) continue;
    if ((entry.kind ?? "farm") !== kind) continue;
    if (ownerId && entry.by !== ownerId) continue;
    const [cx, cz] = coords.split(",").map(Number);
    const c = chunkCenter(cx, cz);
    out.push({ cx, cz, entry, d: Math.hypot(c.x - origin.x, c.z - origin.z) });
  }
  out.sort((a, b) => a.d - b.d);
  const result = out.slice(0, limit);
  logDebug(TAG, `claimsNear menemukan ${result.length} patok terdekat.`);
  return result;
}

export function claimAt(dimension, loc, ownerId, kind = "farm") {
  const { cx, cz } = chunkOf(loc);
  logDebug(TAG, `claimAt dicek di ${posStr(loc)} -> chunk (${cx}, ${cz}), kind=${kind}`);
  const entry = getClaim(dimension.id, cx, cz);
  if (!entry) return undefined;
  if ((entry.kind ?? "farm") !== kind) {
    logDebug(TAG, `claimAt: Chunk (${cx}, ${cz}) berjenis "${entry.kind ?? "farm"}", bukan "${kind}".`);
    return undefined;
  }
  if (ownerId && entry.by !== ownerId) {
    logDebug(TAG, `claimAt: Chunk dimilik oleh orang lain (${entry.by} !== ${ownerId})`);
    return undefined;
  }
  return { cx, cz, entry, key: claimKey(dimension.id, cx, cz) };
}

export function chunkBounds(cx, cz) {
  const bounds = { x0: cx * 16, z0: cz * 16, x1: cx * 16 + 15, z1: cz * 16 + 15 };
  logDebug(TAG, `chunkBounds (${cx}, ${cz}) = ${JSON.stringify(bounds)}`);
  return bounds;
}
