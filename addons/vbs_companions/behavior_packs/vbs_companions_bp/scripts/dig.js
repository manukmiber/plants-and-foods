/**
 * Membongkar blok BUTUH WAKTU.
 *
 * Sebelum ini setiap pembongkaran cuma `block.setType("minecraft:air")` di
 * dalam satu denyut: satu pohon setinggi sepuluh blok lenyap sekaligus, dan
 * penambang menembus batu enam blok tiap setengah detik. Dari luar itu terlihat
 * seperti curang, bukan seperti bekerja.
 *
 * Modul ini memasang jam pada tiap blok, memakai rumus Minecraft sendiri:
 *
 *     detik = kekerasan * (alatnya benar ? 1,5 : 5) / kecepatan alat
 *
 * Jadi batang kayu oak dengan tangan kosong makan tiga detik, dengan kapak kayu
 * satu setengah detik; batu dengan tangan kosong tujuh setengah detik, dengan
 * beliung kayu satu detik lebih sedikit. Angkanya sengaja sama dengan yang
 * dirasakan pemain supaya companion terlihat menambang, bukan menghapus blok.
 *
 * Satu companion mengerjakan SATU blok pada satu waktu. Kemajuannya disimpan di
 * memori (bukan dynamic property): kalau dunia ditutup di tengah ayunan, ayunan
 * itu diulang dari awal, dan itu tidak apa-apa.
 */

import { system } from "@minecraft/server";
import { POSE } from "./config.js";
import { hold } from "./hold.js";
import { blockAt, face, particle, sound } from "./util.js";
import { logDebug } from "./logger.js";

const TAG = "DIG";

/** Kekerasan blok, angka Minecraft. Yang tidak tercatat dianggap 1,5 (batu). */
const HARDNESS = {
  "minecraft:oak_leaves": 0.2, "minecraft:spruce_leaves": 0.2,
  "minecraft:birch_leaves": 0.2, "minecraft:jungle_leaves": 0.2,
  "minecraft:acacia_leaves": 0.2, "minecraft:dark_oak_leaves": 0.2,
  "minecraft:mangrove_leaves": 0.2, "minecraft:cherry_leaves": 0.2,
  "minecraft:azalea_leaves": 0.2, "minecraft:azalea_leaves_flowered": 0.2,
  "minecraft:leaves": 0.2, "minecraft:leaves2": 0.2,
  "minecraft:vine": 0.2, "minecraft:snow_layer": 0.1, "minecraft:snow": 0.2,

  "minecraft:short_grass": 0, "minecraft:tallgrass": 0, "minecraft:tall_grass": 0,
  "minecraft:fern": 0, "minecraft:large_fern": 0, "minecraft:double_plant": 0,
  "minecraft:wheat": 0, "minecraft:carrots": 0, "minecraft:potatoes": 0,
  "minecraft:beetroot": 0, "minecraft:nether_wart": 0,

  "minecraft:dirt": 0.5, "minecraft:coarse_dirt": 0.5, "minecraft:rooted_dirt": 0.5,
  "minecraft:podzol": 0.5, "minecraft:mycelium": 0.6, "minecraft:grass_block": 0.6,
  "minecraft:farmland": 0.6, "minecraft:sand": 0.5, "minecraft:red_sand": 0.5,
  "minecraft:gravel": 0.6, "minecraft:clay": 0.6, "minecraft:mud": 0.5,
  "minecraft:soul_sand": 0.5, "minecraft:soul_soil": 0.5, "minecraft:moss_block": 0.1,

  "minecraft:oak_log": 2, "minecraft:spruce_log": 2, "minecraft:birch_log": 2,
  "minecraft:jungle_log": 2, "minecraft:acacia_log": 2, "minecraft:dark_oak_log": 2,
  "minecraft:mangrove_log": 2, "minecraft:cherry_log": 2,
  "minecraft:crimson_stem": 2, "minecraft:warped_stem": 2, "minecraft:log": 2,
  "minecraft:log2": 2, "minecraft:planks": 2,

  "minecraft:stone": 1.5, "minecraft:andesite": 1.5, "minecraft:diorite": 1.5,
  "minecraft:granite": 1.5, "minecraft:tuff": 1.5, "minecraft:calcite": 0.75,
  "minecraft:cobblestone": 2, "minecraft:mossy_cobblestone": 2,
  "minecraft:stone_bricks": 1.5, "minecraft:sandstone": 0.8,
  "minecraft:netherrack": 0.4, "minecraft:basalt": 1.25,
  "minecraft:smooth_basalt": 1.25, "minecraft:blackstone": 1.5,
  "minecraft:terracotta": 1.25, "minecraft:end_stone": 3,
  "minecraft:deepslate": 3, "minecraft:cobbled_deepslate": 3.5,
  "minecraft:dripstone_block": 1.5, "minecraft:sculk": 0.2,
  "minecraft:packed_ice": 0.5, "minecraft:ice": 0.5, "minecraft:blue_ice": 2.8,

  "minecraft:coal_ore": 3, "minecraft:iron_ore": 3, "minecraft:copper_ore": 3,
  "minecraft:gold_ore": 3, "minecraft:redstone_ore": 3, "minecraft:lit_redstone_ore": 3,
  "minecraft:lapis_ore": 3, "minecraft:diamond_ore": 3, "minecraft:emerald_ore": 3,
  "minecraft:quartz_ore": 3, "minecraft:ancient_debris": 30,
  "minecraft:deepslate_coal_ore": 4.5, "minecraft:deepslate_iron_ore": 4.5,
  "minecraft:deepslate_copper_ore": 4.5, "minecraft:deepslate_gold_ore": 4.5,
  "minecraft:deepslate_redstone_ore": 4.5, "minecraft:deepslate_lapis_ore": 4.5,
  "minecraft:deepslate_diamond_ore": 4.5, "minecraft:deepslate_emerald_ore": 4.5,
  "minecraft:raw_iron_block": 5, "minecraft:raw_copper_block": 5,
};

const DEFAULT_HARDNESS = 1.5;

/** Kecepatan tiap tingkat alat, angka Minecraft. */
const TOOL_SPEED = {
  wooden: 2, stone: 4, iron: 6, diamond: 8, netherite: 9, golden: 12,
};

/** Alat yang BENAR untuk tiap jenis blok. "" berarti tangan kosong pun sah. */
const PICK = "pickaxe";
const AXE = "axe";
const SHOVEL = "shovel";
const HOE = "hoe";

const DIGGABLE_BY_SHOVEL = new Set([
  "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:rooted_dirt",
  "minecraft:podzol", "minecraft:mycelium", "minecraft:grass_block",
  "minecraft:farmland", "minecraft:sand", "minecraft:red_sand",
  "minecraft:gravel", "minecraft:clay", "minecraft:mud", "minecraft:soul_sand",
  "minecraft:soul_soil", "minecraft:snow", "minecraft:snow_layer",
]);

const SOFT_BY_HAND = new Set([
  "minecraft:vine", "minecraft:moss_block", "minecraft:sculk",
  "minecraft:short_grass", "minecraft:tallgrass", "minecraft:tall_grass",
  "minecraft:fern", "minecraft:large_fern", "minecraft:double_plant",
  "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes",
  "minecraft:beetroot", "minecraft:nether_wart",
]);

function toolClassFor(id) {
  if (HARDNESS[id] === 0) return "";
  if (id.endsWith("_log") || id.endsWith("_stem") || id.endsWith("_planks") ||
      id.endsWith("_wood") || id.endsWith("_hyphae") || id === "minecraft:log" ||
      id === "minecraft:log2" || id === "minecraft:planks") return AXE;
  if (id.endsWith("_leaves") || id === "minecraft:leaves" || id === "minecraft:leaves2") return HOE;
  if (id.endsWith("_ore") || id === "minecraft:ancient_debris") return PICK;
  if (DIGGABLE_BY_SHOVEL.has(id)) return SHOVEL;
  if (SOFT_BY_HAND.has(id)) return "";
  return PICK;
}

/** Blok yang tanpa alat yang benar TIDAK menjatuhkan apa-apa di Minecraft asli. */
const NEEDS_TOOL_PREFIXES = [PICK];

function heldClass(toolId) {
  if (!toolId) return { kind: "", speed: 1 };
  const short = toolId.replace("minecraft:", "");
  const cut = short.lastIndexOf("_");
  if (cut < 0) return { kind: "", speed: 1 };
  const tier = short.slice(0, cut);
  const kind = short.slice(cut + 1);
  return { kind, speed: TOOL_SPEED[tier] ?? 1 };
}

/**
 * Berapa tick satu blok itu bertahan di tangan companion ini.
 * Selalu paling sedikit 3 tick supaya tidak ada yang benar-benar seketika.
 */
export function breakTicks(blockId, toolId) {
  const hardness = HARDNESS[blockId] ?? DEFAULT_HARDNESS;
  if (hardness <= 0) return 3;
  const want = toolClassFor(blockId);
  const held = heldClass(toolId);
  const right = !want || held.kind === want;
  // Alat yang salah jenis tetap sedikit membantu kalau memang alat berat.
  const speed = held.kind === want ? held.speed : 1;
  const penalty = right ? 1.5 : (NEEDS_TOOL_PREFIXES.includes(want) ? 5 : 3);
  const ticks = Math.round((20 * hardness * penalty) / speed);
  return Math.max(3, Math.min(600, ticks));
}

/** Suara pukulan yang cocok, supaya menebang tidak terdengar seperti menggali. */
export function digSound(blockId) {
  const want = toolClassFor(blockId);
  if (want === AXE) return "dig.wood";
  if (want === HOE) return "dig.grass";
  if (want === SHOVEL) return "dig.gravel";
  if (!want) return "dig.grass";
  return "dig.stone";
}

const jobs = new Map();     // entity.id -> { key, need, spent, at }
const MAX_GAP = 24;         // denyut yang terlalu jauh jaraknya tidak dihitung penuh
const STALE = 60;           // sasaran yang ditinggal satu detik lebih dianggap batal

/**
 * Satu ayunan ke arah satu blok.
 *
 * Balikan:
 *   { status: "breaking", progress }  masih dipukul, belum patah
 *   { status: "broke", id }           blok patah tick ini
 *   { status: "gone" }                bloknya memang sudah tidak ada
 *   { status: "failed", id }          gim menolak membongkarnya
 */
export function chipAway(entity, pos, toolId, options = {}) {
  const { pose = POSE.mine, reason = "dig", quiet = false } = options;
  const dimension = entity.dimension;
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  if (!block) return { status: "gone" };
  let id;
  try {
    if (block.isAir) {
      jobs.delete(entity.id);
      return { status: "gone" };
    }
    id = block.typeId;
  } catch {
    return { status: "gone" };
  }

  const x = Math.floor(pos.x);
  const y = Math.floor(pos.y);
  const z = Math.floor(pos.z);
  const key = `${x},${y},${z}:${id}`;
  const now = system.currentTick;
  let job = jobs.get(entity.id);
  if (!job || job.key !== key || now - job.at > STALE) {
    job = { key, need: breakTicks(id, toolId), spent: 0, at: now };
    jobs.set(entity.id, job);
    logDebug(TAG, `Mulai membongkar ${id} di (${x}, ${y}, ${z}): butuh ${job.need} tick.`);
  } else {
    job.spent += Math.min(now - job.at, MAX_GAP);
    job.at = now;
  }

  const at = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
  face(entity, at);
  // Alasannya "dig": main.js sengaja MEMBIARKAN denyut kerja tetap jalan untuk
  // hold jenis ini, karena kemajuan pukulan justru dihitung di denyut kerja.
  hold(entity, 12, { pose, reason });

  if (job.spent < job.need) {
    if (!quiet && now % 6 === 0) {
      sound(dimension, digSound(id), at, { volume: 0.35 });
      particle(dimension, "minecraft:basic_crit_particle", at);
    }
    return { status: "breaking", progress: job.spent / job.need, id, need: job.need };
  }

  jobs.delete(entity.id);
  try {
    block.setType("minecraft:air");
  } catch (e) {
    logDebug(TAG, `Gagal membongkar ${id} di (${x}, ${y}, ${z})`, e);
    return { status: "failed", id };
  }
  if (!quiet) {
    sound(dimension, digSound(id), at, { volume: 0.6 });
    particle(dimension, "minecraft:basic_crit_particle", at);
  }
  return { status: "broke", id };
}

/** Sedang mengayun ke blok itu? Dipakai pemanggil yang ingin tetap diam. */
export function busyOn(entity) {
  return jobs.get(entity?.id)?.key;
}

export function forget(id) {
  jobs.delete(id);
}
