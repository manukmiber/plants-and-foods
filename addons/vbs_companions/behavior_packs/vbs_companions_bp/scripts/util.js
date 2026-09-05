/** Pembantu kecil yang dipakai UI, otak companion, dan semua mode kerja. */

import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";

import {
  ARMOR_POINTS, COMPANIONS, DEFAULT_MODE, FACE, MODES, POSE, PROP,
} from "./config.js";

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

// --- kepemilikan -----------------------------------------------------------

export function getOwnerId(entity) {
  const v = entity.getDynamicProperty(PROP.owner);
  return typeof v === "string" ? v : undefined;
}

export function getOwnerName(entity) {
  const v = entity.getDynamicProperty(PROP.ownerName);
  return typeof v === "string" ? v : "belum ada";
}

export function setOwner(entity, player) {
  entity.setDynamicProperty(PROP.owner, player.id);
  entity.setDynamicProperty(PROP.ownerName, player.name);
}

export function resolveOwner(entity) {
  const id = getOwnerId(entity);
  if (!id) return undefined;
  return world.getAllPlayers().find((p) => p.id === id);
}

// --- mode ------------------------------------------------------------------

export function getMode(entity) {
  const v = entity.getDynamicProperty(PROP.mode);
  return typeof v === "string" && MODES[v] ? v : DEFAULT_MODE;
}

export function setMode(entity, mode) {
  if (!MODES[mode]) return false;
  entity.setDynamicProperty(PROP.mode, mode);
  return applyMode(entity, mode);
}

/** Nyalakan component group mode ini di mesin gim, tanpa menyentuh catatan. */
export function applyMode(entity, mode) {
  const meta = MODES[mode];
  if (!meta) return false;
  try {
    entity.triggerEvent(meta.event);
  } catch {
    return false;                    // entity keburu hilang; mode tetap tersimpan
  }
  setHat(entity, meta.hat);
  return true;
}

// --- entity property: pose, wajah, perlengkapan ----------------------------
//
// Ketiganya dibungkus try/catch dan MENGABAIKAN kegagalan dengan sengaja.
// Nilai 0 tiap properti berarti "biarkan bawaan", jadi kalau versi gim tidak
// menyediakan entity property, semuanya tetap 0 dan add-on jalan persis seperti
// sebelum fitur ini ada — bukan rusak, cuma tanpa pose dan topi.

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

// --- nyawa dan armor -------------------------------------------------------

export function healthOf(entity) {
  const hp = entity.getComponent("minecraft:health");
  if (!hp) return { cur: 0, max: 0 };
  return {
    cur: Math.max(0, Math.round(hp.currentValue)),
    max: Math.round(hp.effectiveMax ?? hp.defaultValue ?? hp.currentValue),
  };
}

export function bar(cur, max, width = 20) {
  const filled = max > 0 ? Math.max(0, Math.min(width, Math.round((cur / max) * width))) : 0;
  return `§c${"|".repeat(filled)}§8${"|".repeat(width - filled)}`;
}

function equippable(entity) {
  try {
    return entity.getComponent("minecraft:equippable");
  } catch {
    return undefined;
  }
}

/** Isi tiap slot, sebagai typeId. Pakai komponen kalau ada, catatan sendiri kalau tidak. */
export function getGear(entity) {
  const eq = equippable(entity);
  if (eq) {
    const out = {};
    for (const key of SLOT_KEYS) {
      try {
        out[key] = eq.getEquipment(SLOT_ENUM[key])?.typeId;
      } catch {
        /* slot tidak tersedia di versi ini */
      }
    }
    return out;
  }
  try {
    return JSON.parse(entity.getDynamicProperty(PROP.gear) ?? "{}");
  } catch {
    return {};
  }
}

function rememberGear(entity, key, typeId) {
  const gear = (() => {
    try {
      return JSON.parse(entity.getDynamicProperty(PROP.gear) ?? "{}");
    } catch {
      return {};
    }
  })();
  if (typeId) gear[key] = typeId;
  else delete gear[key];
  entity.setDynamicProperty(PROP.gear, JSON.stringify(gear));
}

/** Pasang atau lepas satu slot. `item` undefined artinya dikosongkan. */
export function setGear(entity, key, item) {
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
    } catch {
      done = false;
    }
  }
  if (done) rememberGear(entity, key, item?.typeId);
  return done;
}

/** Slot yang cocok untuk sebuah item, atau undefined kalau tidak bisa dipakai. */
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

/** Total titik armor + nama bahannya, untuk baris "Armor" di UI. */
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

// --- ruang -----------------------------------------------------------------

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
    return undefined;              // di luar chunk yang dimuat, atau di luar dunia
  }
}

export function isAir(block) {
  try {
    return Boolean(block) && block.isAir;
  } catch {
    return false;
  }
}

/**
 * Blok yang bisa dilewati badan.
 *
 * Daftarnya panjang bukan karena rewel: yang tidak ada di sini dianggap tembok,
 * dan companion akan berhenti di depannya. Obor pernah tidak ada di daftar ini,
 * dan akibatnya penambang terkurung oleh obor yang dipasangnya sendiri di lorong
 * yang baru saja digalinya — macet total, tanpa pesan galat apa pun.
 */
const WALKTHROUGH = new Set([
  "minecraft:air", "minecraft:cave_air", "minecraft:void_air",
  // penerangan dan barang tempel
  "minecraft:torch", "minecraft:soul_torch", "minecraft:redstone_torch",
  "minecraft:unlit_redstone_torch", "minecraft:lantern", "minecraft:soul_lantern",
  "minecraft:ladder", "minecraft:rail", "minecraft:golden_rail",
  "minecraft:detector_rail", "minecraft:activator_rail", "minecraft:tripwire",
  "minecraft:lever", "minecraft:redstone_wire",
  // tumbuhan kecil
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
  // tanaman pangan — companion harus bisa menyeberangi ladangnya sendiri
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

export function isSolid(block) {
  if (!block) return false;
  try {
    return !block.isAir && !block.isLiquid && !isPassable(block);
  } catch {
    return false;
  }
}

/** Sudut hadap (yaw Bedrock) dari a ke b. */
export function yawTo(a, b) {
  return (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI - 90;
}

/** Hadapkan companion ke satu titik tanpa memindahkannya. */
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

/**
 * Satu langkah kecil ke arah tujuan.
 *
 * Pathfinding bawaan gim hanya bisa disuruh menuju BLOK BERTIPE TERTENTU
 * (behavior.move_to_block), bukan menuju koordinat. Untuk pekerjaan yang
 * tujuannya sebuah titik — meja kerja, ujung terowongan, blok berikutnya yang
 * mau dipasang — tidak ada goal bawaan yang bisa dipakai. Jadi langkahnya
 * digerakkan dari sini: 0,32 blok tiap denyut cepat, kira-kira secepat berjalan,
 * dan hanya kalau petak tujuannya benar-benar bisa dipijak. Karena posisinya
 * memang berpindah, animasi jalan di klien tetap ikut jalan.
 *
 * Mengembalikan true kalau sudah sampai.
 */
const walking = new Map();     // entityId -> { target, step, at }

export function steer(entity, target, step = 0.32) {
  walking.set(entity.id, { target: { ...target }, step, at: system.currentTick });
  return stepToward(entity, target, step);
}

/**
 * Lanjutkan langkah terakhir yang diminta.
 *
 * Modul kerja berdenyut tiap 10 tick; kalau langkahnya hanya diambil di situ,
 * companion bergerak 0,3 blok tiap setengah detik — separuh kecepatan jalan, dan
 * hasilnya sebagian besar waktunya habis di perjalanan, bukan bekerja. Denyut
 * cepat mengulang langkah yang sama supaya kecepatannya wajar tanpa modul kerja
 * perlu tahu apa pun soal ini.
 */
export function tickSteer(entity) {
  const row = walking.get(entity?.id);
  if (!row) return false;
  if (system.currentTick - row.at > 20) {
    walking.delete(entity.id);
    return false;
  }
  return stepToward(entity, row.target, row.step);
}

export function stopWalking(id) {
  walking.delete(id);
}

/**
 * Coba pindah ke satu titik (nx, nz), mencari ketinggian yang bisa dipijak.
 * Boleh naik satu blok, boleh turun tiga; lebih dari itu bukan langkah, itu
 * jatuh. Mengembalikan true kalau benar-benar berpindah.
 */
function tryStep(entity, nx, nz, a, target) {
  const dim = entity.dimension;
  for (const dy of [1, 0, -1, -2, -3]) {
    const feet = blockAt(dim, nx, a.y + dy, nz);
    const head = blockAt(dim, nx, a.y + dy + 1, nz);
    const floor = blockAt(dim, nx, a.y + dy - 1, nz);
    if (!feet || !head || !floor) continue;
    if (!isPassable(feet) || !isPassable(head) || !isSolid(floor)) continue;
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
  const a = entity.location;
  const dx = target.x - a.x;
  const dz = target.z - a.z;
  const flat = Math.hypot(dx, dz);
  if (flat < 0.8 && Math.abs(target.y - a.y) < 2) return true;
  if (flat < 0.001) return false;

  const move = Math.min(step, flat);
  const nx = a.x + (dx / flat) * move;
  const nz = a.z + (dz / flat) * move;

  // Lurus dulu. Kalau tertutup, coba satu sumbu saja — itu yang membuat
  // companion bisa membelok di tikungan lorong. Tanpa ini, penambang yang
  // hendak masuk ke cabang menabrak dinding di mulut cabang dan berhenti di
  // situ selamanya, karena garis lurus ke ujung galian menembus batu.
  if (tryStep(entity, nx, nz, a, target)) return false;
  const zFirst = Math.abs(dz) > Math.abs(dx);
  const first = zFirst ? [a.x, nz] : [nx, a.z];
  const second = zFirst ? [nx, a.z] : [a.x, nz];
  if (tryStep(entity, first[0], first[1], a, target)) return false;
  if (tryStep(entity, second[0], second[1], a, target)) return false;
  return false;
}

// --- peti ------------------------------------------------------------------

export function containerAt(dimension, pos) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  if (!block) return undefined;
  try {
    return block.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}

/** Berapa banyak item bertipe ini ada di peti. */
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

/** Ambil sejumlah item dari peti. Mengembalikan berapa yang benar-benar terambil. */
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

/** Taruh item ke peti; sisanya dijatuhkan di tempat kalau peti penuh. */
export function putIn(container, item, dimension, where) {
  if (!container) {
    if (dimension && where) dimension.spawnItem(item, where);
    return false;
  }
  const left = container.addItem(item);
  if (left && dimension && where) dimension.spawnItem(left, where);
  return !left;
}

/** Daftar (typeId -> jumlah) isi peti, untuk ditampilkan di UI. */
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

// --- pembantu lain ---------------------------------------------------------

export function waitTicks(ticks) {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

/**
 * Tampilkan form, tunggu sebentar kalau layar pemain sedang dipakai.
 * Tanpa ini, membuka menu tepat saat pemain menutup layar lain akan gagal diam-diam.
 */
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
  } catch {
    return undefined;
  }
}

export function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Bunyi di satu titik, diam-diam gagal kalau versi gim tidak menyediakannya. */
export function sound(dimension, id, where, options = {}) {
  try {
    dimension.playSound(id, where, options);
  } catch {
    /* versi lama: tidak ada dimension.playSound */
  }
}

export function particle(dimension, id, where) {
  try {
    dimension.spawnParticle(id, where);
  } catch {
    /* partikel tidak dikenal di versi ini, atau chunk belum dimuat */
  }
}

/** Semua companion di semua dimensi yang sedang dimuat. */
export function allCompanions(family) {
  const out = [];
  for (const id of DIMENSIONS) {
    try {
      out.push(...world.getDimension(id).getEntities({ families: [family] }));
    } catch {
      /* dimensi belum dimuat */
    }
  }
  return out;
}
