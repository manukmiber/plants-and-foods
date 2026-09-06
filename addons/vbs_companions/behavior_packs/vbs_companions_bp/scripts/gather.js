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

import { LOGS, PLANKS, POSE, SEED_SOURCES } from "./config.js";
import { hold } from "./hold.js";
import { blockAt, dist2, face, particle, sound, steer } from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "GATHER";
const REACH = 3.2;
const SEARCH_RADIUS = 16;

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

// Menyapu SELURUH OFFSETS tiap denyut berarti membaca lebih dari sepuluh ribu
// blok tiap setengah detik untuk tiap companion — itu membuat dunia tersendat.
// Sapuannya dipotong dan dilanjutkan dari posisi terakhir, jadi beban per
// denyut kecil tapi areanya tetap tersisir habis.
const SCAN_PER_TICK = 700;
const cursors = new Map();

/** Blok terdekat yang cocok, dicari sedikit demi sedikit tiap denyut. */
export function findBlock(entity, wanted, key = "any") {
  if (!wanted?.length) return undefined;
  const want = new Set(wanted);
  const dimension = entity.dimension;
  const at = entity.location;
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  const cursorKey = `${entity.id}:${key}`;
  let cursor = cursors.get(cursorKey) ?? 0;

  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const [dx, dy, dz] = OFFSETS[cursor];
    cursor = (cursor + 1) % OFFSETS.length;
    const block = blockAt(dimension, bx + dx, by + dy, bz + dz);
    if (block && want.has(block.typeId)) {
      cursors.set(cursorKey, cursor);
      logDebug(TAG, `Sasaran ${block.typeId} ditemukan di ${posStr({ x: bx + dx, y: by + dy, z: bz + dz })}`);
      return { x: bx + dx, y: by + dy, z: bz + dz, id: block.typeId };
    }
  }
  cursors.set(cursorKey, cursor);
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
 * Balikan: { walking: true } kalau masih berjalan ke sana, atau { got: n }.
 */
export function harvestBlock(entity, target, deposit) {
  const dimension = entity.dimension;
  const at = { x: target.x + 0.5, y: target.y, z: target.z + 0.5 };
  if (dist2(entity.location, at) > REACH ** 2) {
    steer(entity, at, 0.36);
    return { walking: true };
  }
  face(entity, at);
  hold(entity, 14, { pose: POSE.mine, reason: "gather" });

  // Batang pohon ditebang sampai atas, blok lain satu per satu.
  if (LOGS.includes(target.id)) {
    let felled = 0;
    for (let dy = 0; dy < 10; dy++) {
      const block = blockAt(dimension, target.x, target.y + dy, target.z);
      if (!block || !LOGS.includes(block.typeId)) break;
      try {
        deposit(block.typeId, 1);
        block.setType("minecraft:air");
        felled++;
      } catch (e) {
        logWarn(TAG, `Gagal menebang log di ${posStr({ x: target.x, y: target.y + dy, z: target.z })}`, e);
        break;
      }
    }
    if (felled) {
      logInfo(TAG, `${entStr(entity)} menebang ${felled} log di ${posStr(target)}`);
      sound(dimension, "dig.wood", at);
      particle(dimension, "minecraft:villager_happy", { x: at.x, y: at.y + 1, z: at.z });
    }
    return { got: felled };
  }

  const block = blockAt(dimension, target.x, target.y, target.z);
  if (!block || block.isAir) return { got: 0 };
  const id = block.typeId;
  try {
    block.setType("minecraft:air");
  } catch (e) {
    logWarn(TAG, `Gagal membongkar ${id} di ${posStr(target)}`, e);
    return { got: 0 };
  }

  // Rumput hilang tanpa meninggalkan apa pun kalau sedang tidak beruntung —
  // itu bukan kegagalan, itu memang cara bibit didapat di Minecraft.
  if (SEED_SET.has(id)) {
    if (Math.random() > SEED_CHANCE) {
      logDebug(TAG, `Rumput di ${posStr(target)} dibabat, tidak ada bibit yang jatuh.`);
      return { got: 0 };
    }
    deposit(SEED_DROP, 1);
    logInfo(TAG, `${entStr(entity)} mendapat bibit dari rumput di ${posStr(target)}`);
    sound(dimension, "dig.grass", at, { volume: 0.5 });
    return { got: 1 };
  }

  deposit(YIELD[id] ?? id, 1);
  logInfo(TAG, `${entStr(entity)} menggali ${id} di ${posStr(target)} -> ${YIELD[id] ?? id}`);
  sound(dimension, "dig.stone", at, { volume: 0.5 });
  return { got: 1 };
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

/** Geser area pencarian kalau di sekitar sini tidak ada apa-apa lagi. */
export function roam(entity) {
  const at = entity.location;
  const angle = Math.random() * Math.PI * 2;
  const step = { x: at.x + Math.cos(angle) * 8, y: at.y, z: at.z + Math.sin(angle) * 8 };
  logDebug(TAG, `Tidak ada sasaran di sekitar, bergeser ke ${posStr(step)}`);
  steer(entity, step, 0.35);
}

export function forget(id) {
  for (const key of [...cursors.keys()]) {
    if (key.startsWith(`${id}:`)) cursors.delete(key);
  }
}
