/**
 * Mencari dan membongkar blok dengan TANGAN KOSONG.
 *
 * Dulu semua ini terkubur di dalam looter.js, jadi satu-satunya companion yang
 * bisa menebang pohon adalah yang bermode Mencari Barang. Akibatnya companion
 * yang bekerja sendirian mentok selamanya: petani tanpa cangkul memasang
 * permintaan kayu, tidak ada yang membacanya, dan dia berdiri diam.
 *
 * Sekarang kemampuannya dipisah ke sini dan dipakai dua pihak:
 *
 *   looter.js    seperti biasa — mencari bahan yang DIPESAN companion lain
 *   selfhelp.js  companion mana pun, kalau di sekitar belum ada perajin
 *                maupun pencari barang, mencari bahannya sendiri
 *
 * Semua yang di sini tidak butuh alat: batang pohon, batu, tanah, dan rumput
 * memang bisa dipatahkan tangan kosong di Minecraft — cuma lebih lama.
 */

import { system } from "@minecraft/server";

import { LOGS, PLANKS, POSE, SEED_SOURCES } from "./config.js";
import { chipAway } from "./dig.js";
import { blockAt, dist2, face, isStuck, particle, sound, steer } from "./util.js";
import { entStr, logDebug, logInfo, posStr } from "./logger.js";

const TAG = "GATHER";
const REACH = 3.2;
const SEARCH_RADIUS = 16;

// Lingkaran "depan muka" yang disapu HABIS tiap kali mencari. Apa pun yang
// berdiri di dalamnya selalu menang dari yang belasan blok jauhnya.
const NEAR_RADIUS = 5;

export const STONE_LIKE = [
  "minecraft:stone", "minecraft:cobblestone", "minecraft:andesite",
  "minecraft:diorite", "minecraft:granite", "minecraft:cobbled_deepslate",
  "minecraft:deepslate", "minecraft:tuff",
];
export const DIRT_LIKE = [
  "minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt",
  "minecraft:rooted_dirt", "minecraft:podzol",
];
export const IRON_LIKE = [
  "minecraft:iron_ore", "minecraft:deepslate_iron_ore", "minecraft:raw_iron_block",
];
export const COAL_LIKE = ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"];

/** Blok apa yang dicari untuk tiap jenis permintaan bahan. */
export const HUNT = {
  wood: LOGS,
  planks: LOGS,
  stone: STONE_LIKE,
  dirt: DIRT_LIKE,
  iron: IRON_LIKE,
  coal: COAL_LIKE,
  // Bibit tidak digali dari batu: rumput yang dibabat yang menjatuhkannya.
  seed: SEED_SOURCES,
};

/** Apa yang dihasilkan blok itu kalau dibongkar tangan kosong. */
export const YIELD = {
  "minecraft:grass_block": "minecraft:dirt",
  "minecraft:stone": "minecraft:cobblestone",
  "minecraft:iron_ore": "minecraft:raw_iron",
  "minecraft:deepslate_iron_ore": "minecraft:raw_iron",
  "minecraft:coal_ore": "minecraft:coal",
  "minecraft:deepslate_coal_ore": "minecraft:coal",
};

// Rumput cuma kadang-kadang menjatuhkan bibit, sama seperti di Minecraft.
const SEED_DROP = "minecraft:wheat_seeds";
const SEED_CHANCE = 0.4;
const SEED_SET = new Set(SEED_SOURCES);

const OFFSETS = (() => {
  const out = [];
  for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
    for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz++) {
      for (let dy = -4; dy <= 5; dy++) out.push([dx, dy, dz]);
    }
  }
  out.sort((a, b) => (a[0] ** 2 + a[2] ** 2) - (b[0] ** 2 + b[2] ** 2));
  return out;
})();

// OFFSETS urut dari yang paling dekat, jadi lingkaran dekat itu persis potongan
// paling depan dari daftarnya.
const NEAR_END = (() => {
  let n = 0;
  while (n < OFFSETS.length && OFFSETS[n][0] ** 2 + OFFSETS[n][2] ** 2 <= NEAR_RADIUS ** 2) n++;
  return n;
})();

// Menyapu SELURUH OFFSETS tiap denyut berarti membaca lebih dari sepuluh ribu
// blok tiap setengah detik untuk tiap companion — itu membuat dunia tersendat.
// Sisa daerah di luar lingkaran dekat dipotong dan dilanjutkan lintas denyut,
// jadi beban per denyut kecil tapi areanya tetap tersisir habis. Sapuan jauh
// ini jarang jalan: selama sasarannya masih ada, pencarian berhenti di kunci
// dan tidak membaca satu blok pun.
const SCAN_PER_TICK = 500;
const sweeps = new Map();

// Sapuan jauh memakai titik awal TETAP. Kalau ikut bergeser bersama companion,
// potongan yang sudah disapu ikut bergeser juga dan ada blok yang tidak pernah
// terbaca sama sekali. Sapuannya baru diulang dari awal kalau companion sudah
// benar-benar pindah tempat.
const SWEEP_DRIFT = 4;

// Sasaran yang sedang dikerjakan, supaya pilihannya tidak berubah tiap denyut.
const locks = new Map();
const LOCK_TICKS = 400;   // ~20 detik di jalan; sesudah itu timbang ulang
const LOCK_GRACE = 40;    // beri waktu berjalan dulu sebelum dianggap mentok

// Titik yang sudah terbukti tidak bisa dicapai, dilewati untuk sementara.
const avoided = new Map();
const AVOID_TICKS = 600;
const AVOID_MAX = 256;    // catatan yang kedaluwarsa dibuang sebelum menumpuk

function avoiding(entity, x, y, z) {
  const key = `${entity.id}:${x},${y},${z}`;
  const until = avoided.get(key);
  if (until === undefined) return false;
  if (system.currentTick <= until) return true;
  avoided.delete(key);
  return false;
}

function avoid(entity, pos) {
  if (avoided.size >= AVOID_MAX) {
    for (const [key, until] of avoided) {
      if (system.currentTick > until) avoided.delete(key);
    }
  }
  avoided.set(`${entity.id}:${pos.x},${pos.y},${pos.z}`, system.currentTick + AVOID_TICKS);
}

/** Baca satu titik: cocok, belum dihindari, dan memang ada bloknya? */
function probe(entity, dimension, want, origin, offset) {
  const x = origin.x + offset[0];
  const y = origin.y + offset[1];
  const z = origin.z + offset[2];
  if (avoiding(entity, x, y, z)) return undefined;
  const block = blockAt(dimension, x, y, z);
  if (!block || !want.has(block.typeId)) return undefined;
  return { x, y, z, id: block.typeId };
}

/**
 * Sasaran yang sedang dikunci, kalau masih layak dikerjakan.
 *
 * Ini inti perbaikannya. Tanpa kunci, sasarannya dipilih ULANG tiap denyut dan
 * pilihannya berbeda-beda: companion melangkah setengah langkah ke satu pohon,
 * denyut berikutnya berbelok ke pohon lain, begitu terus. Dari luar dia
 * kelihatan kebingungan mencari kayu padahal pohonnya persis di depan muka.
 */
function lockedTarget(entity, dimension, want, id) {
  const lock = locks.get(id);
  if (!lock) return undefined;

  const block = blockAt(dimension, lock.x, lock.y, lock.z);
  if (!block || !want.has(block.typeId)) {
    locks.delete(id);          // sudah ditebang atau digali: cari yang berikutnya
    return undefined;
  }

  // Terhalang tebing atau dinding, atau sudah kelamaan di jalan: lepaskan, dan
  // jangan pilih titik yang sama lagi untuk sementara supaya tidak berputar-putar
  // ke sasaran yang memang tidak bisa dicapai.
  //
  // `isStuck` menimbang langkah companion secara keseluruhan, bukan langkah ke
  // sasaran ini saja, jadi dua syarat dipasang supaya sasaran yang sebenarnya
  // baik-baik saja tidak ikut dibuang: sasarannya memang masih di luar jangkauan
  // (artinya dia sedang di jalan ke sana, bukan sedang menebang), dan kuncinya
  // sudah cukup umur untuk sempat berjalan.
  const age = system.currentTick - lock.since;
  const walkingThere = dist2(entity.location, { x: lock.x + 0.5, y: lock.y, z: lock.z + 0.5 }) > REACH ** 2;
  if (age > LOCK_TICKS || (walkingThere && age > LOCK_GRACE && isStuck(entity))) {
    locks.delete(id);
    avoid(entity, lock);
    logDebug(TAG, `${entStr(entity)} melepas sasaran ${posStr(lock)}: tidak tercapai, mencari yang lain.`);
    return undefined;
  }

  return { x: lock.x, y: lock.y, z: lock.z, id: block.typeId };
}

function lockOn(id, hit, how) {
  locks.set(id, { x: hit.x, y: hit.y, z: hit.z, since: system.currentTick });
  logDebug(TAG, `Sasaran ${hit.id} ditemukan di ${posStr(hit)} (${how}); dikunci sampai selesai.`);
  return hit;
}

function sweepFor(id, here) {
  const prev = sweeps.get(id);
  if (prev &&
      Math.abs(prev.origin.x - here.x) <= SWEEP_DRIFT &&
      Math.abs(prev.origin.y - here.y) <= SWEEP_DRIFT &&
      Math.abs(prev.origin.z - here.z) <= SWEEP_DRIFT) {
    return prev;
  }
  const fresh = { cursor: 0, origin: { ...here } };
  sweeps.set(id, fresh);
  return fresh;
}

/** Blok terdekat yang cocok; sasaran yang sudah dipilih dipegang sampai habis. */
export function findBlock(entity, wanted, key = "any") {
  if (!wanted?.length) return undefined;
  const want = new Set(wanted);
  const dimension = entity.dimension;
  const id = `${entity.id}:${key}`;

  const held = lockedTarget(entity, dimension, want, id);
  if (held) return held;

  // 1. Lingkaran dekat: disapu habis, selalu dari titik terdekat. Karena
  //    OFFSETS urut dari yang paling dekat, yang pertama ketemu memang yang
  //    paling dekat — pohon di depan muka tidak mungkin terlewat lagi.
  const at = entity.location;
  const here = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
  for (let n = 0; n < NEAR_END; n++) {
    const hit = probe(entity, dimension, want, here, OFFSETS[n]);
    if (hit) return lockOn(id, hit, "dekat");
  }

  // 2. Baru sesudah sekitarnya benar-benar kosong, lanjutkan sapuan jauh.
  const sweep = sweepFor(id, here);
  const span = OFFSETS.length - NEAR_END;
  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const hit = probe(entity, dimension, want, sweep.origin, OFFSETS[NEAR_END + sweep.cursor]);
    sweep.cursor = (sweep.cursor + 1) % span;
    if (hit) {
      sweep.cursor = 0;   // ketemu: pencarian berikutnya mulai dari dekat lagi
      return lockOn(id, hit, "sapuan jauh");
    }
  }
  return undefined;
}

/** Blok yang dicari untuk satu jenis bahan. */
export function findMaterial(entity, kind) {
  return findBlock(entity, HUNT[kind] ?? [], kind);
}

/**
 * Membongkar satu sasaran. `deposit(id, amount)` yang memutuskan hasilnya mau
 * ditaruh di mana — kantong pencari barang, atau langsung ke peti stasiun.
 *
 * SATU blok sekali pukul, dan pukulannya butuh waktu (dig.js). Versi lama
 * menghabiskan sepuluh batang pohon dalam satu denyut — pohonnya lenyap
 * seketika di depan mata pemain, dan itu yang bikin add-on ini terasa curang
 * alih-alih terasa hidup. Sekarang batang kedua baru dipilih sesudah batang
 * pertama benar-benar patah: kuncinya (findBlock) melihat bloknya sudah jadi
 * udara, melepas sasaran, dan menemukan batang di atasnya sebagai yang
 * terdekat berikutnya.
 *
 * Balikan: { walking: true } kalau masih berjalan ke sana, { breaking, progress }
 * kalau sedang mengayun, atau { got: n } begitu ada yang jatuh.
 */
export function harvestBlock(entity, target, deposit, toolId) {
  const dimension = entity.dimension;
  const at = { x: target.x + 0.5, y: target.y, z: target.z + 0.5 };
  if (dist2(entity.location, at) > REACH ** 2) {
    steer(entity, at, 0.36);
    return { walking: true };
  }
  face(entity, at);

  const wood = LOGS.includes(target.id);
  const swing = chipAway(entity, target, toolId, {
    pose: wood ? POSE.harvest : POSE.mine,
    reason: "dig",
  });

  if (swing.status === "breaking") {
    return { breaking: true, progress: swing.progress, id: target.id };
  }
  if (swing.status !== "broke") return { got: 0 };

  const id = swing.id;

  // Rumput hilang tanpa meninggalkan apa pun kalau sedang tidak beruntung —
  // itu bukan kegagalan, itu memang cara bibit didapat di Minecraft.
  if (SEED_SET.has(id)) {
    if (Math.random() > SEED_CHANCE) {
      logDebug(TAG, `Rumput di ${posStr(target)} dibabat, tidak ada bibit yang jatuh.`);
      return { got: 0 };
    }
    deposit(SEED_DROP, 1);
    logInfo(TAG, `${entStr(entity)} mendapat bibit dari rumput di ${posStr(target)}`);
    return { got: 1 };
  }

  const drop = YIELD[id] ?? id;
  deposit(drop, 1);
  logInfo(TAG, `${entStr(entity)} membongkar ${id} di ${posStr(target)} -> ${drop}`);
  particle(dimension, "minecraft:villager_happy", { x: at.x, y: at.y + 1, z: at.z });
  if (wood) sound(dimension, "dig.wood", at, { volume: 0.6 });
  return { got: 1, id: drop };
}

/** Berapa banyak bahan jenis ini yang sudah ada, log dihitung setara papan. */
export function countKind(counts, kind, ids) {
  const want = new Set(ids);
  let n = 0;
  for (const [id, amount] of Object.entries(counts ?? {})) {
    if (want.has(id)) n += amount;
    if (kind === "planks" && LOGS.includes(id)) n += amount * 4;
    if (kind === "wood" && PLANKS.includes(id)) n += Math.floor(amount / 4);
  }
  return n;
}

const roams = new Map();
const ROAM_TICKS = 100;   // ~5 detik ke satu arah sebelum arahnya ditimbang ulang

/**
 * Geser area pencarian kalau di sekitar sini tidak ada apa-apa lagi.
 *
 * Arahnya dipegang beberapa detik. Versi lama mengundi arah baru TIAP denyut,
 * jadi companion cuma bergetar di tempat: langkahnya 0,35 blok ke arah yang
 * selalu berubah, dan dia tidak pernah benar-benar sampai ke daerah baru.
 */
// Sejauh mana companion boleh menjauh dari rumahnya saat berkeliling. Tanpa
// batas ini dia benar-benar bisa berjalan ratusan blok: tiap denyut yang tidak
// menemukan sasaran menggeser arahnya sedikit lagi, dan yang terlihat pemain
// adalah companion yang "kabur" dan tidak pernah kembali.
const ROAM_LEASH = 64;

export function roam(entity, home) {
  const at = entity.location;
  let trip = roams.get(entity.id);
  const away = home ? Math.hypot(at.x - home.x, at.z - home.z) : 0;

  if (home && away > ROAM_LEASH) {
    // Sudah terlalu jauh: pulang dulu, cari lagi di jalan.
    logDebug(TAG, `${entStr(entity)} sudah ${away.toFixed(0)}m dari rumahnya; berbalik pulang.`);
    roams.delete(entity.id);
    steer(entity, { x: home.x + 0.5, y: home.y ?? at.y, z: home.z + 0.5 }, 0.38);
    return;
  }

  if (!trip || system.currentTick - trip.since > ROAM_TICKS ||
      isStuck(entity) || dist2(at, trip.to) < 4) {
    const angle = Math.random() * Math.PI * 2;
    trip = {
      to: { x: at.x + Math.cos(angle) * 8, y: at.y, z: at.z + Math.sin(angle) * 8 },
      since: system.currentTick,
    };
    roams.set(entity.id, trip);
    logDebug(TAG, `Tidak ada sasaran di sekitar, bergeser ke ${posStr(trip.to)}`);
  }
  steer(entity, trip.to, 0.35);
}

export function forget(id) {
  const prefix = `${id}:`;
  for (const key of [...sweeps.keys()]) if (key.startsWith(prefix)) sweeps.delete(key);
  for (const key of [...locks.keys()]) if (key.startsWith(prefix)) locks.delete(key);
  for (const key of [...avoided.keys()]) if (key.startsWith(prefix)) avoided.delete(key);
  roams.delete(id);
}
