/**
 * Patok ladang: pemain menandai chunk mana yang boleh digarap companion.
 */

import { system, world } from "@minecraft/server";
import {
  MARKER, STAKE_ITEM, STAKE_NAME, VILLAGE_STAKE_ITEM, VILLAGE_STAKE_NAME,
} from "./config.js";
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
  blockAt, chunkCenter, chunkOf, dist2, give, isFooting, makeItem, particle, sound,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CLAIM";
const BEAM_HEIGHT = 18;
const BEAM_STEP = 2;
const BEAM = {
  free: "minecraft:basic_flame_particle",
  claimed: "minecraft:villager_happy",
};

export function makeStake() {
  logDebug(TAG, "Membuat ItemStack Patok Ladang...");
  const item = makeItem(STAKE_ITEM, 1);
  if (!item) {
    logError(TAG, `Gagal membuat item patok dengan ID: ${STAKE_ITEM}`);
    return undefined;
  }
  item.nameTag = STAKE_NAME;
  try {
    item.setLore([
      "§7Klik tanah untuk mematok chunk itu",
      "§7sebagai ladang. Klik lagi untuk mencabut.",
      "§8Merah = belum digarap, hijau = sudah.",
    ]);
  } catch (e) {
    logWarn(TAG, "setLore tidak didukung pada versi ini, nama item tetap terpasang.", e);
  }
  logDebug(TAG, "Patok ladang berhasil dibuat.");
  return item;
}

export function isStake(itemStack) {
  const result = Boolean(itemStack) && itemStack.typeId === STAKE_ITEM &&
    itemStack.nameTag === STAKE_NAME;
  logDebug(TAG, `isStake dicek: ${itemStack?.typeId} ("${itemStack?.nameTag}") -> ${result}`);
  return result;
}

export function ensureStake(player) {
  logDebug(TAG, `ensureStake dipanggil untuk pemain: ${player?.name}`);
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) {
    logWarn(TAG, `ensureStake gagal: Pemain ${player?.name} tidak memiliki inventory container.`);
    return false;
  }
  for (let i = 0; i < container.size; i++) {
    if (isStake(container.getItem(i))) {
      logDebug(TAG, `Pemain ${player.name} sudah memiliki patok di slot ${i}.`);
      return false;
    }
  }
  give(player, makeStake());
  player.sendMessage(
    "§eKamu diberi §fPatok Ladang§e. §7Klik tanah untuk memilih chunk yang boleh " +
    "digarap. Penanda merah berarti belum digarap, hijau berarti sudah.");
  logInfo(TAG, `Patok ladang diberikan ke pemain ${player.name}.`);
  return true;
}

export function makeVillageStake() {
  logDebug(TAG, "Membuat ItemStack Patok Desa...");
  const item = makeItem(VILLAGE_STAKE_ITEM, 1);
  if (!item) {
    logError(TAG, `Gagal membuat item patok desa dengan ID: ${VILLAGE_STAKE_ITEM}`);
    return undefined;
  }
  item.nameTag = VILLAGE_STAKE_NAME;
  try {
    item.setLore([
      "§7Klik tanah untuk mematok chunk itu",
      "§7sebagai lahan desa. Klik lagi untuk mencabut.",
      "§8Bisa lebih dari satu chunk — Pembangun akan",
      "§8membuatkan satu rumah berisi ranjang di tiap chunk.",
    ]);
  } catch (e) {
    logWarn(TAG, "setLore tidak didukung pada versi ini, nama item tetap terpasang.", e);
  }
  return item;
}

export function isVillageStake(itemStack) {
  const result = Boolean(itemStack) && itemStack.typeId === VILLAGE_STAKE_ITEM &&
    itemStack.nameTag === VILLAGE_STAKE_NAME;
  logDebug(TAG, `isVillageStake dicek: ${itemStack?.typeId} ("${itemStack?.nameTag}") -> ${result}`);
  return result;
}

export function ensureVillageStake(player) {
  logDebug(TAG, `ensureVillageStake dipanggil untuk pemain: ${player?.name}`);
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) {
    logWarn(TAG, `ensureVillageStake gagal: Pemain ${player?.name} tidak memiliki inventory container.`);
    return false;
  }
  for (let i = 0; i < container.size; i++) {
    if (isVillageStake(container.getItem(i))) {
      logDebug(TAG, `Pemain ${player.name} sudah memiliki patok desa di slot ${i}.`);
      return false;
    }
  }
  give(player, makeVillageStake());
  player.sendMessage(
    "§eKamu diberi §fPatok Desa§e. §7Klik tanah untuk memilih chunk yang boleh dibangun " +
    "rumah. Bisa lebih dari satu chunk — suruh Pembangun ke Mode Membangun sesudahnya.");
  logInfo(TAG, `Patok desa diberikan ke pemain ${player.name}.`);
  return true;
}

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

function groundAt(dimension, x, z, from) {
  logDebug(TAG, `groundAt: mencari permukaan di (${x}, ${z}) mulai Y=${from}`);
  for (let y = Math.min(from + 12, 318); y > from - 40; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    // isFooting, bukan isSolid: daun dihitung "padat" oleh isSolid, dan
    // itulah sebabnya penanda patok bisa melayang di tengah tajuk pohon
    // alih-alih berdiri di tanah yang dipatok.
    if (here.isAir && isFooting(below)) {
      logDebug(TAG, `groundAt: ditemukan Y=${y}`);
      return y;
    }
  }
  logDebug(TAG, `groundAt: fallback ke Y=${from}`);
  return from;
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
    marker.nameTag = entry.worked
      ? `§aPatok Ladang §7(${cx}, ${cz})\n§asudah jadi ladang`
      : `§cPatok Ladang §7(${cx}, ${cz})\n§cbelum digarap`;
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
 * chunk-nya langsung.
 *
 * Ini yang sebenarnya mengerjakan pekerjaannya. Mengklik tanah dengan item
 * patok cuma salah satu jalan masuk; jalan yang satu lagi adalah Peta Patok di
 * Buku Panduan, yang tidak butuh item apa pun dan tidak butuh pemainnya
 * berjalan ke chunk itu dulu.
 *
 * `at` adalah titik acuan ketinggian — blok yang diklik, atau posisi pemain
 * kalau patoknya dipasang dari peta.
 */
export function toggleClaimAt(player, cx, cz, kind = "farm", at) {
  const dimId = player.dimension.id;
  logInfo(TAG, `Pemain ${player.name} toggleClaim (${kind}) di chunk (${cx}, ${cz})`);
  const existing = getClaim(dimId, cx, cz);
  if (existing) {
    // Patok orang lain bukan milikmu. Tanpa penjagaan ini, siapa pun di server
    // bisa mencabut ladang pemain lain hanya dengan sebatang stik.
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
  const center = chunkCenter(cx, cz);
  const base = Math.floor((at ?? player.location).y);
  const entry = {
    by: player.id, name: player.name, worked: false, kind,
    y: at ? base + 1 : groundAt(player.dimension, center.x, center.z, base),
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

/** Jalan masuk lama: mengklik tanah dengan item patok. */
export function toggleClaim(player, block, kind = "farm") {
  const { cx, cz } = chunkOf(block.location);
  return toggleClaimAt(player, cx, cz, kind, block.location);
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

let wired = false;

export function wireStake() {
  if (wired) return;
  wired = true;
  logInfo(TAG, "Mendaftarkan listener interaksi itemUseOn & playerInteractWithBlock untuk Patok Ladang/Desa...");

  const handle = (player, itemStack, block) => {
    if (!player || !block) return false;
    let kind;
    if (isStake(itemStack)) kind = "farm";
    else if (isVillageStake(itemStack)) kind = "village";
    else return false;
    logDebug(TAG, `Event patok (${kind}) dipicu oleh pemain ${player.name} pada ${posStr(block.location)}`);
    system.run(() => {
      try {
        const msg = toggleClaim(player, block, kind);
        player.sendMessage(msg);
      } catch (e) {
        logError(TAG, `Error saat mengeksekusi toggleClaim`, e);
      }
    });
    return true;
  };

  const seen = new Map();
  const once = (player, block) => {
    const key = `${player.id}:${block.x},${block.y},${block.z}`;
    const last = seen.get(key) ?? -99;
    if (system.currentTick - last < 6) return false;
    seen.set(key, system.currentTick);
    return true;
  };

  try {
    world.afterEvents.itemUseOn.subscribe((ev) => {
      if (!once(ev.source, ev.block)) return;
      handle(ev.source, ev.itemStack, ev.block);
    });
    logDebug(TAG, "Berhasil subscribe ke world.afterEvents.itemUseOn");
  } catch (e) {
    logWarn(TAG, "Gagal subscribe ke world.afterEvents.itemUseOn", e);
  }
  try {
    world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
      if (!once(ev.player, ev.block)) return;
      handle(ev.player, ev.itemStack ?? ev.beforeItemStack, ev.block);
    });
    logDebug(TAG, "Berhasil subscribe ke world.afterEvents.playerInteractWithBlock");
  } catch (e) {
    logWarn(TAG, "Gagal subscribe ke world.afterEvents.playerInteractWithBlock", e);
  }
}