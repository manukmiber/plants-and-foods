/**
 * Mode membangun.
 */

import { system } from "@minecraft/server";
import { BED_IDS, CHEST_IDS, POSE, PROTECTED } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { dataBlueprints } from "./blueprints.js";
import { claimsNear, ensureVillageStake, markWorked } from "./claim.js";
import { workArea } from "./farming.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { takeOrMake } from "./items.js";
import { requestMaterial } from "./requests.js";
import { addVillageHome, writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, blockAt, chunkCenter, countIn, dist2, face, getOwnerId, isAir,
  isSolid, makeItem, particle, putIn, resolveOwner, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "BUILDER";
const REACH = 5.0;
const PLACE_PER_TICK = 2;

const PLANKS = [
  "minecraft:oak_planks", "minecraft:spruce_planks", "minecraft:birch_planks",
  "minecraft:jungle_planks", "minecraft:acacia_planks", "minecraft:dark_oak_planks",
  "minecraft:mangrove_planks", "minecraft:cherry_planks", "minecraft:bamboo_planks",
];
const LOGS = [
  "minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log",
  "minecraft:stripped_oak_log", "minecraft:stripped_spruce_log",
];
const FENCES = [
  "minecraft:oak_fence", "minecraft:spruce_fence", "minecraft:birch_fence",
  "minecraft:jungle_fence", "minecraft:acacia_fence", "minecraft:dark_oak_fence",
  "minecraft:bamboo_fence", "minecraft:nether_brick_fence",
];
const STONE = [
  "minecraft:cobblestone", "minecraft:stone_bricks", "minecraft:stone",
  "minecraft:bricks", "minecraft:deepslate_bricks", "minecraft:cobbled_deepslate",
];
const SLABS = [
  "minecraft:oak_slab", "minecraft:spruce_slab", "minecraft:cobblestone_slab",
  "minecraft:stone_brick_slab",
];
const STAIRS = [
  "minecraft:oak_stairs", "minecraft:spruce_stairs", "minecraft:cobblestone_stairs",
  "minecraft:stone_brick_stairs",
];
const DOORS = [
  "minecraft:oak_door", "minecraft:spruce_door", "minecraft:birch_door",
  "minecraft:iron_door",
];
const BEDS = BED_IDS;

const MATERIALS = {
  floor: [...PLANKS, ...STONE, "minecraft:gravel"],
  wall: [...PLANKS, ...STONE, ...LOGS],
  post: [...LOGS, ...FENCES, ...STONE],
  roof: [...STAIRS, ...SLABS, ...PLANKS, ...STONE],
  light: ["minecraft:lantern", "minecraft:torch", "minecraft:glowstone",
          "minecraft:sea_lantern", "minecraft:shroomlight"],
  door: DOORS,
  glass: ["minecraft:glass_pane", "minecraft:glass", "minecraft:white_stained_glass"],
  fence: FENCES,
  path: ["minecraft:gravel", "minecraft:cobblestone", "minecraft:coarse_dirt",
         ...PLANKS, ...STONE],
  bed: BEDS,
};

function makeItemSafe(id) {
  try {
    return makeItem(id, 1);
  } catch (e) {
    logWarn(TAG, `Gagal membuat ulang ItemStack ${id}`, e);
    return undefined;
  }
}

function materialFor(container, role) {
  logDebug(TAG, `Mencari bahan untuk peran: "${role}"`);
  const list = MATERIALS[role];
  if (!list) {
    logWarn(TAG, `Peran material "${role}" tidak terdaftar di MATERIALS.`);
    return undefined;
  }
  const found = list.find((id) => countIn(container, id) > 0);
  logDebug(TAG, `Hasil cari peran "${role}": ${found ?? "KOSONG/TIDAK ADA"}`);
  return found;
}

function fencePlan(area) {
  logDebug(TAG, `fencePlan dihitung untuk area: ${JSON.stringify(area)}`);
  const out = [];
  const push = (x, z, i) => {
    out.push({ x, z, dy: 1, role: "fence" });
    if (i % 5 === 0) out.push({ x, z, dy: 2, role: "light" });
  };
  let i = 0;
  for (let x = area.x0; x <= area.x1; x++) push(x, area.z0, i++);
  for (let z = area.z0 + 1; z <= area.z1; z++) push(area.x1, z, i++);
  for (let x = area.x1 - 1; x >= area.x0; x--) push(x, area.z1, i++);
  for (let z = area.z1 - 1; z > area.z0; z--) push(area.x0, z, i++);
  logDebug(TAG, `fencePlan menghasilkan ${out.length} langkah.`);
  return out;
}

function wallPlan(area) {
  logDebug(TAG, `wallPlan dihitung untuk area: ${JSON.stringify(area)}`);
  const out = [];
  const ring = fencePlan(area).filter((s) => s.role === "fence");
  for (const spot of ring) {
    for (let dy = 1; dy <= 3; dy++) {
      out.push({ x: spot.x, z: spot.z, dy, role: dy === 3 ? "roof" : "wall" });
    }
  }
  logDebug(TAG, `wallPlan menghasilkan ${out.length} langkah.`);
  return out;
}

function lampsPlan(area) {
  logDebug(TAG, `lampsPlan dihitung untuk area: ${JSON.stringify(area)}`);
  const out = [];
  for (let x = area.x0 + 3; x <= area.x1; x += 6) {
    for (let z = area.z0 + 3; z <= area.z1; z += 6) {
      out.push({ x, z, dy: 1, role: "post" });
      out.push({ x, z, dy: 2, role: "post" });
      out.push({ x, z, dy: 3, role: "light" });
    }
  }
  logDebug(TAG, `lampsPlan menghasilkan ${out.length} langkah.`);
  return out;
}

function pathPlan(origin, dest) {
  logDebug(TAG, `pathPlan: origin=${posStr(origin)}, dest=${posStr(dest)}`);
  const out = [];
  const dx = dest.x - origin.x;
  const dz = dest.z - origin.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  if (!steps) return out;
  for (let i = 0; i <= steps; i++) {
    const x = origin.x + Math.round((dx * i) / steps);
    const z = origin.z + Math.round((dz * i) / steps);
    out.push({ x, z, dy: 0, role: "path" });
  }
  logDebug(TAG, `pathPlan menghasilkan ${out.length} langkah.`);
  return out;
}

function bridgePlan(origin, dir, length = 24) {
  logDebug(TAG, `bridgePlan: origin=${posStr(origin)}, dir=[${dir}], length=${length}`);
  const [ux, uz] = dir;
  const side = [-uz, ux];
  const out = [];
  for (let i = 1; i <= length; i++) {
    const x = origin.x + ux * i;
    const z = origin.z + uz * i;
    out.push({ x, z, dy: 0, role: "path" });
    out.push({ x: x + side[0], z: z + side[1], dy: 1, role: "fence" });
    out.push({ x: x - side[0], z: z - side[1], dy: 1, role: "fence" });
    if (i % 6 === 0) out.push({ x: x + side[0], z: z + side[1], dy: 2, role: "light" });
  }
  logDebug(TAG, `bridgePlan menghasilkan ${out.length} langkah.`);
  return out;
}

function housePlan(origin, w, d, h, withChest) {
  logDebug(TAG, `housePlan: origin=${posStr(origin)}, size=${w}x${d}x${h}, chest=${withChest}`);
  const out = [];
  const x0 = origin.x - Math.floor(w / 2);
  const z0 = origin.z - Math.floor(d / 2);
  const x1 = x0 + w - 1;
  const z1 = z0 + d - 1;
  const doorX = origin.x;

  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      out.push({ x, z, dy: 0, role: "floor" });
    }
  }
  for (let dy = 1; dy <= h; dy++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) {
          out.push({ x, z, dy, role: "air" });
          continue;
        }
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (corner) {
          out.push({ x, z, dy, role: "post" });
        } else if (dy === 2 && (x + z) % 2 === 0) {
          out.push({ x, z, dy, role: "glass" });
        } else if (x === doorX && z === z0 && dy <= 2) {
          out.push({ x, z, dy, role: dy === 1 ? "door" : "air" });
        } else {
          out.push({ x, z, dy, role: "wall" });
        }
      }
    }
  }
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      out.push({ x, z, dy: h + 1, role: "roof" });
    }
  }
  out.push({ x: origin.x, z: origin.z, dy: h, role: "light" });
  if (withChest) {
    out.push({ x: x1 - 1, z: z1 - 1, dy: 1, role: "chest" });
  }
  logDebug(TAG, `housePlan menghasilkan ${out.length} langkah.`);
  return out;
}

// Rumah gubuk biasa ditambah satu ranjang — inilah yang dipakai companion
// mengisi chunk yang dipatok pemain lewat Patok Desa. Tempat tidurnya di
// sudut yang berlawanan dengan peti supaya tidak berebut ubin yang sama.
function villageHousePlan(origin) {
  const steps = housePlan(origin, 5, 5, 3, true);
  const x0 = origin.x - 2;
  const z1 = origin.z + 2;
  steps.push({ x: x0 + 1, z: z1 - 1, dy: 1, role: "bed" });
  return steps;
}

export const BLUEPRINTS = {
  fence: {
    label: "Pagar keliling ladang",
    hint: "Pagar satu blok keliling petak, lampu tiap lima langkah",
    plan: (ctx) => fencePlan(ctx.area),
  },
  wall: {
    label: "Tembok keliling",
    hint: "Tembok tiga blok mengelilingi petak",
    plan: (ctx) => wallPlan(ctx.area),
  },
  lamps: {
    label: "Tiang lampu",
    hint: "Tiang berlampu tiap enam blok di dalam petak",
    plan: (ctx) => lampsPlan(ctx.area),
  },
  path: {
    label: "Jalan setapak ke pemilik",
    hint: "Jalan lurus dari stasiun ke tempatmu berdiri",
    plan: (ctx) => pathPlan(ctx.origin, ctx.dest ?? ctx.origin),
  },
  bridge: {
    label: "Jembatan",
    hint: "Jembatan berpagar 24 blok ke arah hadap companion",
    plan: (ctx) => bridgePlan(ctx.origin, ctx.dir),
  },
  hut: {
    label: "Gubuk 5x5",
    hint: "Lantai, dinding, jendela, pintu, atap, satu lampu",
    plan: (ctx) => housePlan(ctx.origin, 5, 5, 3, false),
  },
  shed: {
    label: "Gudang 7x5",
    hint: "Seperti gubuk, lebih besar, lengkap dengan peti di dalam",
    plan: (ctx) => housePlan(ctx.origin, 7, 5, 3, true),
  },
  // Rancangan dari berkas JSON di addons/vbs_companions/blueprints/ ikut masuk
  // ke sini. Menu, mesin pembangun dan penyimpanan state tidak perlu tahu
  // bedanya — sebuah rancangan JSON adalah rancangan biasa yang plan()-nya
  // dihitung dari denah huruf, bukan dari kode.
  ...dataBlueprints(),
};

function context(entity, state, ownerId, owner) {
  const origin = state.plan?.build?.origin ?? {
    x: Math.floor(entity.location.x),
    y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };
  const dir = state.plan?.build?.dir ?? [1, 0];
  const area = workArea(entity, state, ownerId);
  const dest = owner ? { x: Math.floor(owner.location.x), z: Math.floor(owner.location.z) } : undefined;
  logDebug(TAG, `Build context: origin=${posStr(origin)}, dir=[${dir}], dest=${posStr(dest)}`);
  return { origin, dir, area, dest };
}

function groundY(dimension, x, z, baseY) {
  logDebug(TAG, `Mencari ketinggian tanah: col(${x},${z}) sekitar base Y: ${baseY}`);
  for (let y = baseY + 3; y >= baseY - 4; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    if (here.isAir && isSolid(below)) {
      logDebug(TAG, `Tanah ditemukan di Y=${y - 1} untuk col(${x},${z})`);
      return y - 1;
    }
  }
  logWarn(TAG, `Tanah solid tidak ditemukan di col(${x},${z}) sekitar Y=${baseY}`);
  return undefined;
}

export function startBlueprint(entity, state, name, owner) {
  logInfo(TAG, `Memulai rancangan baru: "${name}" untuk ${entStr(entity)}`);
  if (!BLUEPRINTS[name]) {
    logError(TAG, `Rancangan "${name}" tidak valid / tidak terdaftar!`);
    return false;
  }
  const at = entity.location;
  let dir = [1, 0];
  try {
    const view = entity.getViewDirection();
    dir = Math.abs(view.x) > Math.abs(view.z)
      ? [Math.sign(view.x) || 1, 0]
      : [0, Math.sign(view.z) || 1];
    logDebug(TAG, `Arah hadap pandangan companion dihitung: [${dir}]`);
  } catch (e) {
    logWarn(TAG, `Gagal membaca arah pandang, menggunakan default [1,0]`, e);
  }
  if (!state.plan) state.plan = {};
  state.plan.build = {
    name, index: 0, dir,
    origin: { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) },
    // Rancangan JSON dibangun rata; ketinggian dasarnya dikunci di langkah
    // pertama dan disimpan di sini supaya tetap sama sesudah dunia ditutup.
    flat: Boolean(BLUEPRINTS[name].flat),
    baseY: null,
  };
  state.blueprint = name;
  writeState(entity, state);
  logInfo(TAG, `Rancangan "${name}" berhasil diinisialisasi pada origin: ${posStr(state.plan.build.origin)}`);
  return true;
}

// Menjalankan sebagian langkah dari satu rancangan (blueprint biasa maupun
// rumah desa) — dipakai bersama supaya logika jalan/pasang/ambil-bahan tidak
// perlu ditulis dua kali.
function runBuildSteps(entity, dimension, container, job, originY, steps) {
  if (job.index >= steps.length) return { done: true };

  let placed = 0;
  let missing;
  while (job.index < steps.length && placed < PLACE_PER_TICK) {
    const step = steps[job.index];
    logDebug(TAG, `Menjalankan langkah build [${job.index + 1}/${steps.length}]: Role=${step.role}, RelPos=(${step.x},${step.dy},${step.z})`);
    // Rancangan JSON dibangun RATA: satu ketinggian dasar untuk seluruh denah,
    // dihitung sekali di kolom origin lalu dipakai ulang. Rancangan bawaan tetap
    // mengikuti kontur tiap kolom seperti sebelumnya — pagar keliling ladang
    // memang harus naik-turun mengikuti tanah, menara tidak.
    let base;
    if (job.flat) {
      if (job.baseY === undefined || job.baseY === null) {
        const at = job.origin ?? step;
        job.baseY = groundY(dimension, at.x, at.z, originY) ?? originY;
        logInfo(TAG, `Ketinggian dasar rancangan rata dikunci di Y=${job.baseY}.`);
      }
      base = job.baseY;
    } else {
      base = groundY(dimension, step.x, step.z, originY);
    }
    if (base === undefined) {
      logDebug(TAG, `Langkah ${job.index} dilewati: Ketinggian tanah tidak valid.`);
      job.index++;
      continue;
    }
    // yOff (rancangan JSON) dihitung dari blok tanah itu sendiri: 0 = menimpa
    // tanahnya, 1 = satu blok di atasnya. dy (rancangan bawaan) memakai
    // pergeseran +1 khusus untuk lantai dan jalan, dan itu dipertahankan.
    const y = step.yOff !== undefined
      ? base + step.yOff
      : base + (step.dy ?? 0) + (step.role === "path" || step.role === "floor" ? 0 : 1);
    const block = blockAt(dimension, step.x, y, step.z);
    if (!block) {
      logWarn(TAG, `Langkah ${job.index} dilewati: Blok null di (${step.x}, ${y}, ${step.z}). Chunk belum dimuat?`);
      job.index++;
      continue;
    }
    if (PROTECTED.has(block.typeId)) {
      logWarn(TAG, `Blok terproteksi terdeteksi di (${step.x}, ${y}, ${step.z}): ${block.typeId}. Melewati langkah.`);
      job.index++;
      continue;
    }

    const target = { x: step.x + 0.5, y, z: step.z + 0.5 };
    const d2 = dist2(entity.location, target);
    if (d2 > REACH ** 2) {
      logDebug(TAG, `Target di luar jangkauan (${Math.sqrt(d2).toFixed(2)}m > ${REACH}m). Mengarahkan companion ke target.`);
      steer(entity, target);
      return { waiting: true, index: job.index, total: steps.length };
    }

    if (step.role === "air") {
      if (!block.isAir) {
        try {
          logDebug(TAG, `Mengosongkan blok ke air di ${posStr(target)} (Tipe lama: ${block.typeId})`);
          block.setType("minecraft:air");
        } catch (e) {
          logWarn(TAG, `Gagal membongkar blok di ${posStr(target)}`, e);
        }
      }
      job.index++;
      continue;
    }

    // Peti di dalam rumah TIDAK lagi muncul dari udara: entah petinya sudah
    // ada di peti stasiun, entah dirakit dulu dari delapan papan.
    let wanted;
    if (step.role === "chest") {
      const got = takeOrMake(container, "chest", entity, CHEST_IDS);
      if (!got.got) {
        logWarn(TAG, `Peti rumah belum bisa dipasang: butuh ${got.missing ?? "kayu"}.`);
        missing = "peti (butuh papan)";
        job.index++;
        continue;
      }
      wanted = got.got;
    } else {
      // Rancangan JSON boleh menyebut blok tertentu. Yang tidak ada di peti
      // jatuh ke peran bahannya, jadi rumah bata tetap berdiri sebagai rumah
      // kayu kalau batanya belum ada — bukan berhenti sama sekali.
      wanted = step.block && countIn(container, step.block) > 0
        ? step.block
        : materialFor(container, step.role);
      if (!wanted) {
        logWarn(TAG, `Bahan untuk peran "${step.role}" tidak tersedia di peti!`);
        missing = step.role;
        job.index++;
        continue;
      }
      if (takeFrom(container, wanted, 1) !== 1) {
        logWarn(TAG, `Gagal mengambil bahan "${wanted}" dari peti untuk peran "${step.role}".`);
        missing = step.role;
        job.index++;
        continue;
      }
    }
    try {
      logInfo(TAG, `Memasang blok "${wanted}" di (${step.x}, ${y}, ${step.z})`);
      block.setType(wanted);
      placed++;
    } catch (e) {
      logError(TAG, `Gagal eksekusi block.setType("${wanted}") di (${step.x}, ${y}, ${step.z})`, e);
      putIn(container, makeItemSafe(wanted));
      job.index++;
      continue;
    }
    face(entity, target);
    hold(entity, 14, { pose: POSE.build, reason: "build" });
    sound(dimension, "random.wood_click", target, { volume: 0.6 });
    particle(dimension, "minecraft:villager_happy", { x: target.x, y: y + 0.6, z: target.z });
    job.index++;
  }

  return { placed, missing, index: job.index, total: steps.length };
}

// Membangun satu rumah (dengan ranjang) di chunk yang dipatok pemain lewat
// Patok Desa. Dicek DULU sebelum rancangan blueprint biasa — kalau ada chunk
// desa yang belum dibangun, itu yang dikerjakan lebih dulu.
function villageStep(entity, state, dimension, container, claim, ownerId) {
  if (!state.plan) state.plan = {};
  let job = state.plan.village;
  if (!job || job.cx !== claim.cx || job.cz !== claim.cz) {
    const center = chunkCenter(claim.cx, claim.cz);
    const y = claim.entry.y ?? Math.floor(entity.location.y);
    job = { cx: claim.cx, cz: claim.cz, index: 0, origin: { x: center.x, y, z: center.z } };
    state.plan.village = job;
    logInfo(TAG, `Mulai membangun rumah desa di chunk (${claim.cx}, ${claim.cz}), origin=${posStr(job.origin)}`);
  }

  const steps = villageHousePlan(job.origin);
  const result = runBuildSteps(entity, dimension, container, job, job.origin.y, steps);

  if (result.done) {
    state.plan.village = null;
    writeState(entity, state);
    markWorked(dimension, claim.cx, claim.cz);
    const bed = { x: job.origin.x - 1, y: job.origin.y + 1, z: job.origin.z + 1, dim: dimension.id };
    addVillageHome(ownerId, bed);
    logInfo(TAG, `Rumah desa selesai di chunk (${claim.cx}, ${claim.cz}). Ranjang dicatat di ${posStr(bed)}`);
    sayFrom(entity, "village");
    report(entity,
      `Rumah baru selesai di chunk (${claim.cx}, ${claim.cz}), ranjangnya di ${bed.x}, ${bed.y}, ${bed.z}. ` +
      "Kalian semua tidur di sana ya kalau sudah mengantuk.");
    return "rumah desa selesai";
  }

  writeState(entity, state);
  if (result.waiting) return `menuju rumah desa (${result.index + 1}/${result.total})`;
  if (!result.placed && result.missing) {
    const ask = result.missing === "peti (butuh papan)" ? "wood" : "wood";
    requestMaterial(entity, state, ownerId, ask, state.station);
    return `peti kehabisan bahan rumah desa untuk ${result.missing} (sudah minta bahan)`;
  }
  return `membangun rumah desa: ${result.index}/${result.total}`;
}

const OFFER_EVERY = 6000;   // ~5 menit antar tawaran, jangan mengganggu terus

/**
 * Pembangun MENGAJUKAN pembuatan kampung ke pemiliknya sendiri.
 *
 * Kalau pemilik sedang online, belum punya satu pun chunk berpatok desa, dan
 * belum lama ditawari, Pembangun menyapa lewat chat lalu langsung menaruh
 * Patok Desa di kantong pemain — itulah "stick penanda chunk" yang diminta.
 * Pemain tinggal mematok chunk mana saja, dan rumah akan dibangun di situ.
 */
function offerVillage(entity, state, owner, ownerId, dimension) {
  if (!owner || !ownerId) return false;
  const now = system.currentTick;
  const last = state.villageOfferAt ?? -OFFER_EVERY * 2;
  if (now - last < OFFER_EVERY) return false;
  const staked = claimsNear(dimension, entity.location, ownerId, 32, "village");
  if (staked.length) {
    logDebug(TAG, "Sudah ada chunk desa yang dipatok; tidak perlu menawarkan lagi.");
    return false;
  }
  state.villageOfferAt = now;
  logInfo(TAG, `${entStr(entity)} mengajukan pembuatan kampung ke ${owner.name}.`);
  sayFrom(entity, "village");
  report(entity, "Boleh aku bangun kampung kecil? Patok saja chunk yang kamu mau.");
  const gave = ensureVillageStake(owner);
  owner.sendMessage(gave
    ? "§2Pembangun menyerahkan §fPatok Desa§2 ke kantongmu. §7Klik tanah untuk memilih " +
      "chunk; tiap chunk berpatok akan dibangun satu rumah lengkap dengan ranjang, " +
      "dan companion akan tidur di sana."
    : "§7Patok Desa sudah ada di kantongmu — patok saja chunk yang kamu mau dibangun.");
  return true;
}

export function tickBuild(entity, state, owner) {
  logDebug(TAG, `tickBuild dijalankan untuk ${entStr(entity)}`);
  if (!alive(entity)) {
    logWarn(TAG, `tickBuild batal: Entity tidak hidup.`);
    return "hilang";
  }
  if (isGreeting(entity)) {
    logDebug(TAG, `tickBuild jeda: Companion sedang menyapa pemain.`);
    return "berhenti karena disapa";
  }

  const dimension = entity.dimension;
  const station = ensureStation(entity, state);
  const container = station?.container;
  if (!container) {
    logWarn(TAG, `${entStr(entity)} tidak menemukan peti stasiun.`);
    return "belum ada peti stasiun";
  }

  const ownerId = getOwnerId(entity);
  if (station.missing) {
    requestMaterial(entity, state, ownerId, station.missing, station.chest ?? state.station);
  }

  const villages = ownerId
    ? claimsNear(dimension, entity.location, ownerId, 32, "village").filter((c) => !c.entry.worked)
    : [];
  if (villages.length) {
    const status = villageStep(entity, state, dimension, container, villages[0], ownerId);
    writeState(entity, state);
    return status;
  }

  // Belum ada chunk desa: tawarkan ke pemiliknya, jangan menunggu diperintah.
  if (offerVillage(entity, state, resolveOwner(entity) ?? owner, ownerId, dimension)) {
    writeState(entity, state);
    return "mengajukan pembuatan kampung ke pemilik";
  }

  if (!state.plan?.build) {
    logInfo(TAG, `state.plan.build kosong, mencoba auto-start blueprint "${state.blueprint ?? "fence"}"`);
    startBlueprint(entity, state, state.blueprint ?? "fence", owner);
  }
  const job = state.plan.build;
  const blueprint = BLUEPRINTS[job.name];
  if (!blueprint) {
    logError(TAG, `Rancangan pekerjaan "${job.name}" tidak ditemukan di BLUEPRINTS!`);
    return "rancangan tidak dikenal";
  }

  const ctx = context(entity, state, ownerId, owner);
  const steps = blueprint.plan(ctx);
  if (!steps.length) {
    logWarn(TAG, `Blueprint "${job.name}" menghasilkan 0 langkah.`);
    return "rancangan kosong";
  }

  if (job.index >= steps.length) {
    logInfo(TAG, `Blueprint "${blueprint.label}" selesai (${job.index}/${steps.length}).`);
    state.plan.build = null;
    writeState(entity, state);
    sayFrom(entity, "done");
    report(entity, `${blueprint.label} selesai.`);
    return `${blueprint.label} selesai`;
  }

  const result = runBuildSteps(entity, dimension, container, job, ctx.origin.y, steps);
  writeState(entity, state);
  if (result.waiting) return `menuju titik ${result.index + 1} dari ${result.total}`;
  if (!result.placed && result.missing) {
    logWarn(TAG, `Pembangun kekurangan bahan: "${result.missing}".`);
    const ask = result.missing === "wall" || result.missing === "floor" ||
      result.missing === "roof" || result.missing === "post" ? "wood" : "stone";
    requestMaterial(entity, state, ownerId, ask, station.chest ?? state.station);
    return `peti kehabisan bahan untuk ${result.missing} (sudah minta ke pencari barang)`;
  }
  const statusStr = `${blueprint.label}: ${result.index}/${result.total}`;
  logDebug(TAG, `tickBuild progress: ${statusStr}`);
  return statusStr;
}