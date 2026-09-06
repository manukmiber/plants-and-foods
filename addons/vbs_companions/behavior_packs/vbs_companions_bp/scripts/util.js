/**
 * Pembantu kecil yang dipakai UI, otak companion, dan semua mode kerja.
 */

import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";
import {
  ARMOR_POINTS, COMPANIONS, DEFAULT_MODE, FACE, LEAVES, MODES, POSE, PROP,
  SOFT_PATH,
} from "./config.js";
import { entStr, logDebug, logError, logInfo, logTrace, logWarn, posStr } from "./logger.js";

const TAG = "UTIL";
export const SLOT_KEYS = ["head", "chest", "legs", "feet", "mainhand"];

const SLOT_ENUM = {
  head: EquipmentSlot.Head,
  chest: EquipmentSlot.Chest,
  legs: EquipmentSlot.Legs,
  feet: EquipmentSlot.Feet,
  mainhand: EquipmentSlot.Mainhand,
};

const SLOT_COMMAND = {
  head: "slot.armor.head",
  chest: "slot.armor.chest",
  legs: "slot.armor.legs",
  feet: "slot.armor.feet",
  mainhand: "slot.weapon.mainhand",
};

export const SLOT_LABEL = {
  head: "Helm",
  chest: "Baju zirah",
  legs: "Celana zirah",
  feet: "Sepatu zirah",
  mainhand: "Senjata",
};

export const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

export function info(entity) {
  return COMPANIONS[entity?.typeId];
}

export function isCompanion(entity) {
  return Boolean(info(entity));
}

export function alive(entity) {
  try {
    return Boolean(entity) && entity.isValid;
  } catch {
    return false;
  }
}

export function prettyItem(id) {
  if (!id) return "kosong";
  return id.replace("minecraft:", "").replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getOwnerId(entity) {
  const v = entity.getDynamicProperty(PROP.owner);
  return typeof v === "string" ? v : undefined;
}

export function getOwnerName(entity) {
  const v = entity.getDynamicProperty(PROP.ownerName);
  return typeof v === "string" ? v : "belum ada";
}

export function setOwner(entity, player) {
  logInfo(TAG, `setOwner: ${entStr(entity)} dimiliki oleh ${player.name} (${player.id})`);
  entity.setDynamicProperty(PROP.owner, player.id);
  entity.setDynamicProperty(PROP.ownerName, player.name);
}

export function resolveOwner(entity) {
  const id = getOwnerId(entity);
  if (!id) return undefined;
  return world.getAllPlayers().find((p) => p.id === id);
}

export function getMode(entity) {
  const v = entity.getDynamicProperty(PROP.mode);
  return typeof v === "string" && MODES[v] ? v : DEFAULT_MODE;
}

export function setMode(entity, mode) {
  if (!MODES[mode]) {
    logWarn(TAG, `setMode gagal: mode "${mode}" tidak valid.`);
    return false;
  }
  logInfo(TAG, `setMode ${entStr(entity)}: ${mode}`);
  entity.setDynamicProperty(PROP.mode, mode);
  return applyMode(entity, mode);
}

export function applyMode(entity, mode) {
  const meta = MODES[mode];
  if (!meta) return false;
  try {
    entity.triggerEvent(meta.event);
    logDebug(TAG, `applyMode: event "${meta.event}" dipicu untuk ${entStr(entity)}`);
  } catch (e) {
    logWarn(TAG, `Gagal trigger event ${meta.event} pada ${entStr(entity)}`, e);
    return false;
  }
  setHat(entity, meta.hat);
  return true;
}

function setProp(entity, id, value) {
  try {
    entity.setProperty(id, value);
    return true;
  } catch {
    return false;
  }
}

function getProp(entity, id, fallback = 0) {
  try {
    const v = entity.getProperty(id);
    return typeof v === "number" ? v : fallback;
  } catch {
    return fallback;
  }
}

export function setPose(entity, pose) {
  return setProp(entity, "vbs:pose", pose ?? POSE.normal);
}

export function getPose(entity) {
  return getProp(entity, "vbs:pose", POSE.normal);
}

export function setFace(entity, face) {
  return setProp(entity, "vbs:face", face ?? FACE.auto);
}

export function setHat(entity, hat) {
  return setProp(entity, "vbs:hat", hat ?? 0);
}

export function healthOf(entity) {
  const hp = entity.getComponent("minecraft:health");
  if (!hp) return { cur: 0, max: 0 };
  return {
    cur: Math.max(0, Math.round(hp.currentValue)),
    max: Math.round(hp.effectiveMax ?? hp.defaultValue ?? hp.currentValue),
  };
}

export function bar(cur, max, width = 20, color = "§c") {
  const filled = max > 0 ? Math.max(0, Math.min(width, Math.round((cur / max) * width))) : 0;
  return `${color}${"|".repeat(filled)}§8${"|".repeat(width - filled)}`;
}

function equippable(entity) {
  try {
    return entity.getComponent("minecraft:equippable");
  } catch {
    return undefined;
  }
}

function rememberedGear(entity) {
  try {
    const raw = entity.getDynamicProperty(PROP.gear);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch (e) {
    logWarn(TAG, `Gagal membaca catatan perlengkapan ${entStr(entity)}`, e);
    return {};
  }
}

/**
 * Perlengkapan yang sedang dipakai companion.
 *
 * Entity companion memakai `minecraft:equippable` dengan daftar slot kosong,
 * jadi `getEquipment()` selalu balik undefined walaupun itemnya benar-benar
 * terpasang lewat perintah `replaceitem`. Versi lama langsung mengembalikan
 * hasil kosong itu dan tidak pernah melirik catatan di dynamic property —
 * akibatnya toolRank() selalu 0, companion mengira dirinya belum punya alat,
 * dan menempa ulang alat tingkat terendah tanpa henti alih-alih naik tingkat.
 * Sekarang catatan dipakai sebagai dasar dan hasil bacaan slot yang benar-benar
 * terbaca menimpanya.
 */
export function getGear(entity) {
  const out = rememberedGear(entity);
  const eq = equippable(entity);
  if (eq) {
    for (const key of SLOT_KEYS) {
      try {
        const id = eq.getEquipment(SLOT_ENUM[key])?.typeId;
        if (id) out[key] = id;
      } catch {
        /* slot tidak dideklarasikan di entity JSON, pakai catatan saja */
      }
    }
  }
  logTrace(TAG, `getGear ${entStr(entity)} -> ${JSON.stringify(out)}`);
  return out;
}

function rememberGear(entity, key, typeId) {
  const gear = rememberedGear(entity);
  if (typeId) gear[key] = typeId;
  else delete gear[key];
  try {
    entity.setDynamicProperty(PROP.gear, JSON.stringify(gear));
    logDebug(TAG, `Catatan perlengkapan ${entStr(entity)} diperbarui: ${key}=${typeId ?? "kosong"}`);
  } catch (e) {
    logError(TAG, `Gagal menyimpan catatan perlengkapan ${entStr(entity)}`, e);
  }
}

export function setGear(entity, key, item) {
  logInfo(TAG, `setGear ${entStr(entity)}: slot=${key}, item=${item?.typeId ?? "empty"}`);
  const eq = equippable(entity);
  let done = false;
  if (eq) {
    try {
      done = eq.setEquipment(SLOT_ENUM[key], item) !== false;
    } catch {
      done = false;
    }
  }
  if (!done) {
    try {
      const what = item ? `${item.typeId} 1` : "air 1";
      entity.runCommand(`replaceitem entity @s ${SLOT_COMMAND[key]} 0 ${what}`);
      done = true;
    } catch (e) {
      logWarn(TAG, `replaceitem command gagal untuk slot ${key}`, e);
      done = false;
    }
  }
  if (done) rememberGear(entity, key, item?.typeId);
  return done;
}

export function slotFor(typeId) {
  const short = typeId.replace("minecraft:", "");
  if (short === "turtle_helmet") return "head";
  if (short.endsWith("_helmet")) return "head";
  if (short.endsWith("_chestplate")) return "chest";
  if (short.endsWith("_leggings")) return "legs";
  if (short.endsWith("_boots")) return "feet";
  if (short.endsWith("_sword") || short.endsWith("_axe") || short === "trident") return "mainhand";
  if (short === "bow" || short === "crossbow") return "mainhand";
  if (short.endsWith("_hoe") || short.endsWith("_pickaxe") || short.endsWith("_shovel")) {
    return "mainhand";
  }
  return undefined;
}

export function armorSummary(gear) {
  const order = ["head", "chest", "legs", "feet"];
  let points = 0;
  const worn = new Set();
  order.forEach((key, i) => {
    const id = gear[key];
    if (!id) return;
    const short = id.replace("minecraft:", "");
    if (short === "turtle_helmet") {
      points += 2;
      worn.add("Turtle");
      return;
    }
    const material = short.split("_")[0];
    const row = ARMOR_POINTS[material];
    if (row) {
      points += row[i];
      worn.add(material.charAt(0).toUpperCase() + material.slice(1));
    }
  });
  return { points, label: worn.size ? [...worn].join(" + ") : "tanpa zirah" };
}

export function floorPos(loc) {
  return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

export function dist2(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

export function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function chunkOf(loc) {
  return { cx: Math.floor(loc.x / 16), cz: Math.floor(loc.z / 16) };
}

export function chunkCenter(cx, cz) {
  return { x: cx * 16 + 8, z: cz * 16 + 8 };
}

export function blockAt(dimension, x, y, z) {
  try {
    return dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
  } catch {
    return undefined;
  }
}

export function isAir(block) {
  try {
    return Boolean(block) && block.isAir;
  } catch {
    return false;
  }
}

const WALKTHROUGH = new Set([
  "minecraft:air", "minecraft:cave_air", "minecraft:void_air",
  "minecraft:torch", "minecraft:soul_torch", "minecraft:redstone_torch",
  "minecraft:unlit_redstone_torch", "minecraft:lantern", "minecraft:soul_lantern",
  "minecraft:ladder", "minecraft:rail", "minecraft:golden_rail",
  "minecraft:detector_rail", "minecraft:activator_rail", "minecraft:tripwire",
  "minecraft:lever", "minecraft:redstone_wire",
  "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern",
  "minecraft:large_fern", "minecraft:dead_bush", "minecraft:vine",
  "minecraft:snow_layer", "minecraft:seagrass", "minecraft:kelp",
  "minecraft:sugar_cane", "minecraft:bamboo_sapling", "minecraft:crimson_roots",
  "minecraft:warped_roots", "minecraft:nether_sprouts", "minecraft:sweet_berry_bush",
  "minecraft:cobweb", "minecraft:web", "minecraft:red_mushroom",
  "minecraft:brown_mushroom", "minecraft:poppy", "minecraft:dandelion",
  "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet",
  "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
  "minecraft:wither_rose", "minecraft:sunflower", "minecraft:lilac",
  "minecraft:rose_bush", "minecraft:peony", "minecraft:torchflower",
  "minecraft:pitcher_plant", "minecraft:pink_petals",
  "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes",
  "minecraft:beetroot", "minecraft:nether_wart", "minecraft:melon_stem",
  "minecraft:pumpkin_stem", "minecraft:torchflower_crop",
]);

const PASSABLE_SUFFIX = [
  "_torch", "_tulip", "_sapling", "_button", "_pressure_plate", "_carpet",
  "_banner", "_sign", "_rail",
];

export function isPassable(block) {
  if (!block) return false;
  try {
    if (block.isAir) return true;
    const id = block.typeId;
    if (WALKTHROUGH.has(id)) return true;
    return PASSABLE_SUFFIX.some((suffix) => id.endsWith(suffix));
  } catch {
    return false;
  }
}

// Air dangkal boleh diarungi. Tanpa ini companion terkurung di balik parit
// irigasi yang baru saja DIA SENDIRI gali: lantai parit berisi air, air tidak
// dihitung padat, jadi tidak ada satu pun langkah yang sah untuk menyeberang.
const WADEABLE = new Set(["minecraft:water", "minecraft:flowing_water"]);

/** Blok yang boleh ditempati badan companion (udara, tanaman, atau air). */
export function canOccupy(block) {
  if (!block) return false;
  try {
    return isPassable(block) || WADEABLE.has(block.typeId);
  } catch {
    return false;
  }
}

/**
 * Blok yang cukup kuat untuk dipijak — termasuk air yang bisa diarungi.
 *
 * Daun sengaja TIDAK dihitung. Dulu dihitung, dan itulah sebabnya companion
 * bisa memanjat ke dalam tajuk pohon lalu terlihat melayang di antara daun:
 * tiap langkah naik satu blok menemukan daun, menganggapnya lantai, dan naik
 * lagi. Sekarang daun bukan lantai; kalau daun yang menghalangi, daun itu yang
 * dibabat (clearWay), bukan dipanjat.
 */
export function isStandable(block) {
  if (!block) return false;
  try {
    const id = block.typeId;
    if (WADEABLE.has(id)) return true;
    if (LEAVES.has(id) || SOFT_PATH.has(id)) return false;
    return isSolid(block);
  } catch {
    return false;
  }
}

// Blok yang bentuknya BUKAN kubus penuh. Peti, meja kerja, tungku dan papan
// nama tidak boleh berdiri di atasnya — di dunia nyata pemain pun tidak bisa,
// dan di sinilah asal "peti melayang di atas pohon".
const PARTIAL_SUFFIX = [
  "_slab", "_stairs", "_fence", "_fence_gate", "_wall", "_carpet", "_pane",
  "_bars", "_door", "_trapdoor", "_sign", "_button", "_pressure_plate",
  "_candle", "_head", "_pot", "_rail",
];

const NOT_FOOTING = new Set([
  "minecraft:snow_layer", "minecraft:scaffolding", "minecraft:hopper",
  "minecraft:cactus", "minecraft:composter", "minecraft:cauldron",
  "minecraft:lantern", "minecraft:soul_lantern", "minecraft:chain",
  "minecraft:end_rod", "minecraft:conduit", "minecraft:turtle_egg",
  "minecraft:farmland", "minecraft:soul_sand", "minecraft:mud",
  "minecraft:ice", "minecraft:blue_ice", "minecraft:packed_ice",
  "minecraft:magma", "minecraft:tnt", "minecraft:sand", "minecraft:red_sand",
  "minecraft:gravel", "minecraft:powder_snow",
]);

/**
 * Lantai yang benar-benar sanggup menopang peti, meja kerja, tungku atau papan
 * nama: kubus padat, bukan daun, bukan setengah blok, bukan blok yang jatuh.
 */
export function isFooting(block) {
  if (!block) return false;
  try {
    if (!isSolid(block)) return false;
    const id = block.typeId;
    if (LEAVES.has(id) || SOFT_PATH.has(id) || NOT_FOOTING.has(id)) return false;
    if (PARTIAL_SUFFIX.some((suffix) => id.endsWith(suffix))) return false;
    return true;
  } catch {
    return false;
  }
}

// Membabat daun/sulur yang menghalangi jalan. Sengaja dijeda: kalau boleh tiap
// tick, satu companion bisa mengosongkan sepetak hutan hanya dengan berjalan
// melewatinya, dan itu terlihat sama curangnya dengan menebang pohon seketika.
const cleared = new Map();
const CLEAR_EVERY = 8;

/**
 * Kalau yang menghalangi cuma daun (atau sebangsanya), sibakkan satu blok.
 * Balikan true kalau memang ada yang dibabat tick ini.
 */
export function clearWay(entity, block) {
  if (!block) return false;
  let id;
  try {
    if (block.isAir) return false;
    id = block.typeId;
  } catch {
    return false;
  }
  if (!SOFT_PATH.has(id) && !LEAVES.has(id)) return false;
  const last = cleared.get(entity.id) ?? -CLEAR_EVERY;
  if (system.currentTick - last < CLEAR_EVERY) return false;
  cleared.set(entity.id, system.currentTick);
  try {
    block.setType("minecraft:air");
  } catch {
    return false;
  }
  logDebug(TAG, `${entStr(entity)} menyibakkan ${id} yang menghalangi jalan.`);
  try {
    entity.dimension.playSound("dig.grass", block.location, { volume: 0.4 });
  } catch {
    /* versi lama */
  }
  return true;
}

export function isSolid(block) {
  if (!block) return false;
  try {
    return !block.isAir && !block.isLiquid && !isPassable(block);
  } catch {
    return false;
  }
}

export function yawTo(a, b) {
  return (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI - 90;
}

export function face(entity, target) {
  try {
    entity.teleport(entity.location, {
      dimension: entity.dimension,
      rotation: { x: 0, y: yawTo(entity.location, target) },
    });
    return true;
  } catch {
    return false;
  }
}

const walking = new Map();
const STUCK_TICKS = 60;      // ~3 detik tanpa maju sedikit pun
const STUCK_EPSILON = 0.08;

/**
 * Mencatat kemajuan langkah. Medan Minecraft kadang punya tebing yang tidak
 * bisa dipanjat companion (beda tinggi lebih dari tiga blok, tepi jurang,
 * dinding batu). Tanpa deteksi ini, companion yang mentok akan berdiri
 * mendorong dinding selamanya dan pekerjaannya berhenti total.
 */
function noteProgress(entity, row) {
  const at = entity.location;
  const moved = row.lastPos
    ? Math.hypot(at.x - row.lastPos.x, at.y - row.lastPos.y, at.z - row.lastPos.z)
    : Infinity;
  row.lastPos = { x: at.x, y: at.y, z: at.z };
  if (moved > STUCK_EPSILON) {
    row.stillSince = system.currentTick;
    return;
  }
  if (row.stillSince === undefined) row.stillSince = system.currentTick;
  if (!row.warned && system.currentTick - row.stillSince > STUCK_TICKS) {
    row.warned = true;
    logWarn(TAG, `${entStr(entity)} tidak maju ${STUCK_TICKS} tick menuju ${posStr(row.target)}; dianggap mentok.`);
  }
}

export function steer(entity, target, step = 0.32) {
  const prev = walking.get(entity.id);
  const same = prev && prev.target.x === target.x && prev.target.z === target.z;
  const row = same ? prev : { target: { ...target }, step };
  row.target = { ...target };
  row.step = step;
  row.at = system.currentTick;
  walking.set(entity.id, row);
  const done = stepToward(entity, target, step);
  noteProgress(entity, row);
  return done;
}

export function tickSteer(entity) {
  const row = walking.get(entity?.id);
  if (!row) return false;
  if (system.currentTick - row.at > 20) {
    walking.delete(entity.id);
    return false;
  }
  const done = stepToward(entity, row.target, row.step);
  noteProgress(entity, row);
  return done;
}

/**
 * Companion sedang mentok menuju tujuan sekarang? Pemanggil wajib memakai ini
 * untuk berpindah tujuan alih-alih menunggu selamanya.
 */
export function isStuck(entity) {
  const row = walking.get(entity?.id);
  if (!row || row.stillSince === undefined) return false;
  return system.currentTick - row.stillSince > STUCK_TICKS;
}

export function stopWalking(id) {
  walking.delete(id);
  cleared.delete(id);
}

/**
 * Menarik companion keluar kalau kakinya terkubur.
 *
 * Ini bisa terjadi wajar saat bekerja: petani menimbun petak tempat dia
 * berdiri, penambang menambal lantai di bawahnya, pembangun memasang lantai
 * rumah. Kalau dibiarkan, blok padat di posisi kaki membuat SEMUA percobaan
 * melangkah gagal dan companion mematung selamanya di satu titik — persis
 * gejala "dia berhenti kerja di tengah jalan".
 */
export function unstick(entity) {
  const dim = entity.dimension;
  const a = entity.location;
  const feet = blockAt(dim, a.x, a.y, a.z);
  const head = blockAt(dim, a.x, a.y + 1, a.z);
  if (canOccupy(feet) && canOccupy(head)) return false;
  // Terjebak di dalam tajuk pohon adalah kasus yang paling sering: daun yang
  // mengurung badan dibabat dulu, dan biasanya sesudah itu tidak perlu
  // diangkat ke mana-mana.
  if (clearWay(entity, feet) || clearWay(entity, head)) {
    if (canOccupy(blockAt(dim, a.x, a.y, a.z)) &&
        canOccupy(blockAt(dim, a.x, a.y + 1, a.z))) return false;
  }
  for (let dy = 1; dy <= 8; dy++) {
    const f = blockAt(dim, a.x, a.y + dy, a.z);
    const h = blockAt(dim, a.x, a.y + dy + 1, a.z);
    const floor = blockAt(dim, a.x, a.y + dy - 1, a.z);
    if (!f || !h || !floor) continue;
    if (!canOccupy(f) || !canOccupy(h) || !isStandable(floor)) continue;
    try {
      entity.teleport({ x: a.x, y: Math.floor(a.y + dy) + 0.02, z: a.z }, { dimension: dim });
      logWarn(TAG, `${entStr(entity)} terkubur di ${posStr(a)}; diangkat ${dy} blok ke atas.`);
      return true;
    } catch (e) {
      logWarn(TAG, `Gagal mengangkat ${entStr(entity)} yang terkubur`, e);
      return false;
    }
  }
  logWarn(TAG, `${entStr(entity)} terkubur di ${posStr(a)} dan tidak ada ruang kosong di atasnya.`);
  return false;
}

function tryStep(entity, nx, nz, a, target) {
  const dim = entity.dimension;
  // Urutannya sengaja dari perubahan tinggi TERKECIL dulu: datar, lalu turun
  // satu, lalu naik satu. Kalau naik didahulukan, penambang memanjat keluar
  // dari tangganya sendiri tiap langkah dan tidak pernah sampai ke dasar.
  // Naik dua blok tetap tersedia (tepi ladang yang baru ditimbun), tapi
  // paling belakang.
  for (const dy of [0, -1, 1, -2, 2, -3]) {
    const feet = blockAt(dim, nx, a.y + dy, nz);
    const head = blockAt(dim, nx, a.y + dy + 1, nz);
    const floor = blockAt(dim, nx, a.y + dy - 1, nz);
    if (!feet || !head || !floor) continue;
    // Daun yang berdiri persis di jalur langkah dibabat, bukan dihindari.
    // Tanpa ini companion yang tumbuh pohonnya di atas ladang berhenti di
    // tepi tajuk dan tidak pernah sampai ke petak berikutnya.
    if (!canOccupy(feet)) clearWay(entity, feet);
    if (!canOccupy(head)) clearWay(entity, head);
    if (!canOccupy(feet) || !canOccupy(head) || !isStandable(floor)) continue;
    try {
      entity.teleport({ x: nx, y: Math.floor(a.y + dy) + 0.02, z: nz }, {
        dimension: dim,
        rotation: { x: 0, y: yawTo(a, target) },
      });
    } catch {
      return false;
    }
    return true;
  }
  return false;
}

function stepToward(entity, target, step) {
  unstick(entity);
  const a = entity.location;
  const dx = target.x - a.x;
  const dz = target.z - a.z;
  const flat = Math.hypot(dx, dz);
  if (flat < 0.8 && Math.abs(target.y - a.y) < 2) return true;
  if (flat < 0.001) return false;

  const move = Math.min(step, flat);
  const nx = a.x + (dx / flat) * move;
  const nz = a.z + (dz / flat) * move;

  if (tryStep(entity, nx, nz, a, target)) return false;
  const zFirst = Math.abs(dz) > Math.abs(dx);
  const first = zFirst ? [a.x, nz] : [nx, a.z];
  const second = zFirst ? [nx, a.z] : [a.x, nz];
  if (tryStep(entity, first[0], first[1], a, target)) return false;
  if (tryStep(entity, second[0], second[1], a, target)) return false;
  return false;
}

export function containerAt(dimension, pos) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  if (!block) return undefined;
  try {
    return block.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}

export function countIn(container, ids) {
  if (!container) return 0;
  const want = new Set(Array.isArray(ids) ? ids : [ids]);
  let n = 0;
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (stack && want.has(stack.typeId)) n += stack.amount;
  }
  return n;
}

export function takeFrom(container, ids, amount) {
  if (!container) return 0;
  const want = new Set(Array.isArray(ids) ? ids : [ids]);
  let left = amount;
  for (let i = 0; i < container.size && left > 0; i++) {
    const stack = container.getItem(i);
    if (!stack || !want.has(stack.typeId)) continue;
    const take = Math.min(left, stack.amount);
    left -= take;
    if (stack.amount > take) {
      stack.amount -= take;
      container.setItem(i, stack);
    } else {
      container.setItem(i, undefined);
    }
  }
  return amount - left;
}

export function putIn(container, item, dimension, where) {
  if (!container) {
    if (dimension && where) dimension.spawnItem(item, where);
    return false;
  }
  const left = container.addItem(item);
  if (left && dimension && where) dimension.spawnItem(left, where);
  return !left;
}

export function summarize(container) {
  const out = {};
  if (!container) return out;
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (!stack) continue;
    out[stack.typeId] = (out[stack.typeId] ?? 0) + stack.amount;
  }
  return out;
}

export function waitTicks(ticks) {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

export async function forceShow(player, form, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await waitTicks(2);
  }
  return undefined;
}

export function give(player, itemStack) {
  if (!itemStack) return;
  const inv = player.getComponent("minecraft:inventory");
  const left = inv?.container?.addItem(itemStack);
  if (left) {
    player.dimension.spawnItem(left, player.location);
  }
}

export function makeItem(id, amount = 1) {
  try {
    return new ItemStack(id, amount);
  } catch (e) {
    logError(TAG, `Gagal instansiasi new ItemStack("${id}", ${amount})`, e);
    return undefined;
  }
}

export function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function sound(dimension, id, where, options = {}) {
  try {
    dimension.playSound(id, where, options);
  } catch {
    /* fallback versi lama */
  }
}

export function particle(dimension, id, where) {
  try {
    dimension.spawnParticle(id, where);
  } catch {
    /* fallback versi lama */
  }
}

export function allCompanions(family) {
  const out = [];
  for (const id of DIMENSIONS) {
    try {
      out.push(...world.getDimension(id).getEntities({ families: [family] }));
    } catch {
      /* dimensi belum siap */
    }
  }
  return out;
}