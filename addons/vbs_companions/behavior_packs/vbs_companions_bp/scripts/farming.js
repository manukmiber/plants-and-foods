/**
 * Mode bertani.
 *
 * Ditulis ulang dari nol. Versi sebelumnya adalah MESIN FASE: ratakan seluruh
 * petak, lalu gali seluruh parit, lalu cangkul, lalu tanam, lalu rawat — dan
 * fase berikutnya tidak boleh dimulai sebelum fase sekarang benar-benar
 * selesai. Sifat itu yang membuatnya rapuh sampai tidak bisa ditambal lagi:
 * satu kolom yang tidak bisa ditimbun karena petinya kehabisan tanah, satu
 * petak yang tidak bisa diairi karena ada batu induk, satu pohon yang tidak
 * boleh ditebang — apa pun yang tidak pernah bisa "selesai" mengunci seluruh
 * ladang. Dari luar, semuanya terlihat sama: petani berdiri diam.
 *
 * Sekarang ladangnya digambar dulu sebagai peta peran petak (farmplan.js),
 * lalu dikerjakan sebagai ANTREAN TUGAS yang masing-masing berdiri sendiri:
 *
 *     ratakan (3,7)  ->  gali parit (11,4)  ->  tuang air (11,6)
 *     cangkul (5,9)  ->  tanam gandum (5,9) ->  panen (5,9)
 *
 * Tugas yang tiga kali gagal ditandai mustahil dan dilewati; sisanya jalan
 * terus. Ladang yang separuh petaknya batu tetap jadi ladang, cuma lebih
 * kecil. Tidak ada lagi keadaan "menunggu sesuatu yang tidak akan datang".
 *
 * Yang berjalan tiap denyut, berurutan:
 *
 *   0. panen dulu       tanaman matang tidak menunggu apa pun
 *   1. alat             tidak ada mencangkul dengan tangan kosong
 *   2. gudang           balai kerja bersama, peti, papan nama
 *   3. usir penghuni    gudang/bengkel yang berdiri di dalam patok
 *   4. satu tugas       dari antrean di atas
 *   5. melebar          petak inti yang sudah jadi ladang dilebarkan
 */

import { system } from "@minecraft/server";

import { CROPS, FARM, POSE, SEEDS, WATER } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { craftItemStep, craftStep, labelOf } from "./crafting.js";
import { decorateStep } from "./decorate.js";
import { demandMove } from "./depot.js";
import { chipAway } from "./dig.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { claimAt, claimsNear, ensureClaimHeight, markWorked } from "./claim.js";
import {
  CELL, JOB, drawField, fieldBounds, hydrated, nextJob, plotOf, roleAt,
  seedForColumn,
} from "./farmplan.js";
import { requestItem, requestMaterial, requestTool } from "./requests.js";
import { askOwner } from "./ask.js";
import { ensureMaterial, gatherOwn } from "./selfhelp.js";
import { patchState, writeState } from "./state.js";
import { ensureStation, refreshSign, stationsIn, stationTravel } from "./station.js";
import { workBlocksIn } from "./workshop.js";
import {
  alive, blockAt, countIn, dist2, face, getGear, getOwnerId, info, isAir,
  makeItem, particle, putIn, randomBetween, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "FARMING";
const BUCKET = "minecraft:bucket";
const WATER_BUCKET = "minecraft:water_bucket";

// Bahan timbun yang boleh dipakai meratakan cekungan. Semuanya bisa dicangkul
// jadi farmland, jadi petani tidak mentok cuma karena yang ada di peti
// "rumput" dan bukan "tanah" — dua-duanya sama saja untuk ladang.
const FILLS = [
  "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:grass_block",
  "minecraft:rooted_dirt", "minecraft:podzol",
];
const FILL_BLOCK = "minecraft:dirt";

// Apa yang tersisa di tangan sesudah memangkas satu blok saat meratakan.
const SPOIL = {
  "minecraft:grass_block": FILL_BLOCK,
  "minecraft:dirt": FILL_BLOCK,
  "minecraft:coarse_dirt": FILL_BLOCK,
  "minecraft:rooted_dirt": FILL_BLOCK,
  "minecraft:podzol": FILL_BLOCK,
  "minecraft:mycelium": FILL_BLOCK,
  "minecraft:moss_block": FILL_BLOCK,
  "minecraft:sand": "minecraft:sand",
  "minecraft:gravel": "minecraft:gravel",
  "minecraft:stone": "minecraft:cobblestone",
  "minecraft:cobblestone": "minecraft:cobblestone",
  "minecraft:andesite": "minecraft:andesite",
  "minecraft:diorite": "minecraft:diorite",
  "minecraft:granite": "minecraft:granite",
  "minecraft:deepslate": "minecraft:cobbled_deepslate",
};

// Sejauh apa petani mau berjalan untuk menggarap patoknya.
const FIELD_RANGE = 96;
const GUARD_EVERY = 400;

/* ------------------------------------------------------------------ *
 * Bidang kerja
 * ------------------------------------------------------------------ */

/**
 * Patok yang digarap petani ini: chunk di bawah kakinya dulu, lalu patok
 * TERDEKAT milik pemilik yang sama dalam jarak jalan kaki.
 *
 * Sejak gudang pindah ke balai kerja bersama — yang sengaja berdiri DI LUAR
 * patok — petani yang sedang berdiri di depan petinya tidak lagi berdiri di
 * atas ladangnya sendiri. Tanpa pencarian terdekat, seluruh mode bertani
 * jatuh ke jalur "belum ada patok".
 */
function fieldFor(entity, base, ownerId) {
  const here = claimAt(entity.dimension, base, ownerId);
  if (here) return here;
  const near = claimsNear(entity.dimension, base, ownerId, 4, "farm")
    .filter((c) => c.d <= FIELD_RANGE);
  const pick = near.find((c) => !c.entry.worked) ?? near[0];
  if (!pick) return undefined;
  logDebug(TAG, `Patok terdekat untuk ${entStr(entity)}: chunk (${pick.cx}, ${pick.cz}).`);
  return { cx: pick.cx, cz: pick.cz, entry: pick.entry };
}

export function workArea(entity, state, ownerId) {
  const base = state.station ?? entity.location;
  const radius = info(entity)?.farmRadius ?? 6;
  const mine = fieldFor(entity, base, ownerId);
  if (!mine) {
    const area = {
      x0: Math.floor(base.x) - radius, x1: Math.floor(base.x) + radius,
      z0: Math.floor(base.z) - radius, z1: Math.floor(base.z) + radius,
      y: Math.floor(base.y), flattenY: Math.floor(base.y), chunks: [], claimed: false,
    };
    logDebug(TAG, `workArea tanpa patok untuk ${entStr(entity)}.`);
    return area;
  }

  const chunks = [{ cx: mine.cx, cz: mine.cz }];
  if (state.allowExpand) {
    const extra = claimsNear(entity.dimension, base, ownerId, 4)
      .find((c) => (c.cx !== mine.cx || c.cz !== mine.cz) && !c.entry.worked);
    if (extra) chunks.push({ cx: extra.cx, cz: extra.cz });
  }

  // ensureClaimHeight, bukan getClaim: patok yang dipasang versi lama menyimpan
  // tinggi kaki pemain, dua blok di atas tanahnya. Dibaca apa adanya, seluruh
  // petak terbaca cekung dan petani cuma berdiri meminta tanah timbun.
  const ys = chunks
    .map((c) => ensureClaimHeight(entity.dimension, c.cx, c.cz)?.y)
    .filter((y) => typeof y === "number");
  const flattenY = ys.length
    ? Math.round(ys.reduce((a, b) => a + b, 0) / ys.length)
    : Math.floor(base.y);

  const bounds = fieldBounds(chunks, flattenY);
  const area = { ...bounds, flattenY, chunks, claimed: true };
  logDebug(TAG, `workArea berpatok (${chunks.length} chunk), y=${flattenY}.`);
  return area;
}

/* ------------------------------------------------------------------ *
 * Rencana yang tersimpan
 * ------------------------------------------------------------------ */

function farmPlan(state) {
  if (!state.plan) state.plan = {};
  if (!state.plan.farm) {
    state.plan.farm = {
      plot: FARM.plotStart,   // sisi petak inti sekarang
      job: null,              // tugas yang sedang dipegang
      tries: 0,               // berapa kali tugas itu gagal
      skip: [],               // petak yang sudah dinyatakan mustahil
      drawnAt: 0,             // kapan peta ladang terakhir digambar
      done: false,            // petak ini sudah tuntas
    };
    logInfo(TAG, "Rencana bertani baru dibuat.");
  }
  const plan = state.plan.farm;
  if (!Array.isArray(plan.skip)) plan.skip = [];
  return plan;
}

// Peta ladang tidak ikut disimpan ke dynamic property: isinya ratusan huruf,
// dan menggambarnya ulang jauh lebih murah daripada menyimpan lalu memuatnya
// tiap denyut. Yang disimpan cuma rencananya.
const maps = new Map();

export function forget(id) {
  if (maps.delete(id)) logDebug(TAG, `forget peta ladang untuk ID: ${id}`);
}

function mapFor(entity, plan, area) {
  const now = system.currentTick;
  const cached = maps.get(entity.id);
  const plot = plotOf(area, plan.plot);
  const same = cached && cached.plot.x0 === plot.x0 && cached.plot.x1 === plot.x1 &&
    cached.plot.z0 === plot.z0 && cached.plot.z1 === plot.z1 &&
    cached.map.y === plot.y && now - cached.at < FARM.scanPerTick * 20;
  if (same) return cached.map;
  const map = drawField(entity.dimension, plot);
  maps.set(entity.id, { map, plot, at: now });
  plan.drawnAt = now;
  return map;
}

function skipSet(plan) {
  return new Set(plan.skip);
}

function giveUp(entity, plan, job, why) {
  const key = `${job.x},${job.z}`;
  if (!plan.skip.includes(key)) plan.skip.push(key);
  // Daftar mustahil dibatasi: ladang yang seluruhnya mustahil harus berakhir
  // sebagai ladang kecil, bukan sebagai daftar yang tumbuh tanpa batas di
  // dalam dynamic property.
  while (plan.skip.length > 96) plan.skip.shift();
  plan.job = null;
  plan.tries = 0;
  logInfo(TAG, `${entStr(entity)} melewati petak (${job.x}, ${job.z}): ${why}.`);
}

/* ------------------------------------------------------------------ *
 * Mengerjakan satu tugas
 * ------------------------------------------------------------------ */

function reach(entity, x, y, z) {
  const target = { x: x + 0.5, y, z: z + 0.5 };
  if (dist2(entity.location, target) > FARM.reach ** 2) {
    steer(entity, target);
    return false;
  }
  face(entity, target);
  return true;
}

/** Meratakan: pangkas yang menonjol, timbun yang cekung. */
function doLevel(entity, plan, job, container, tool) {
  const dimension = entity.dimension;
  if (!reach(entity, job.x, job.y, job.z)) return "berjalan ke petak yang belum rata";

  if (job.fill) {
    const ground = blockAt(dimension, job.x, job.y, job.z);
    if (!ground || (!ground.isAir && !ground.isLiquid)) {
      plan.job = null;
      return undefined;
    }
    const fill = FILLS.find((id) => countIn(container, id) > 0);
    if (!fill) {
      // Bahan timbunnya tidak ada. Petak ini DILEWATI, bukan ditunggui:
      // menunggu kiriman yang mungkin tidak pernah datang adalah persis
      // cara ladang lama mengunci dirinya sendiri.
      giveUp(entity, plan, job, "tidak ada bahan timbun");
      return "petak cekung dilewati, bahan timbun habis";
    }
    if (takeFrom(container, fill, 1) !== 1) {
      giveUp(entity, plan, job, "bahan timbun hilang dari peti");
      return undefined;
    }
    try {
      ground.setType(fill === "minecraft:grass_block" ? FILL_BLOCK : fill);
    } catch (e) {
      logWarn(TAG, `Gagal menimbun ${posStr(job)}`, e);
      putIn(container, makeItem(fill, 1));
      plan.tries++;
      return undefined;
    }
    // Lubang di bawahnya ikut ditambal supaya timbunannya tidak melayang.
    const under = blockAt(dimension, job.x, job.y - 1, job.z);
    if (under && (under.isAir || under.isLiquid) && takeFrom(container, fill, 1) === 1) {
      try {
        under.setType(FILL_BLOCK);
      } catch {
        putIn(container, makeItem(fill, 1));
      }
    }
    plan.job = null;
    plan.tries = 0;
    hold(entity, 10, { pose: POSE.build, reason: "level" });
    sound(dimension, "step.gravel", job);
    return "menimbun petak yang cekung";
  }

  const top = blockAt(dimension, job.x, job.y, job.z);
  if (!top || isAir(top)) {
    plan.job = null;
    return undefined;
  }
  const swing = chipAway(entity, top, tool, { pose: POSE.build, reason: "dig" });
  if (swing.status === "breaking") {
    return `meratakan lahan (${Math.round(swing.progress * 100)}%)`;
  }
  if (swing.status === "broke") {
    const keep = SPOIL[swing.id] ?? (swing.id?.endsWith("_log") ? swing.id : undefined);
    if (keep) putIn(container, makeItem(keep, 1));
    plan.job = null;
    plan.tries = 0;
    return "meratakan lahan";
  }
  plan.tries++;
  return undefined;
}

/** Menggali lubang parit. */
function doDig(entity, plan, job, container, tool) {
  const dimension = entity.dimension;
  if (!reach(entity, job.x, job.y, job.z)) return "berjalan ke parit";

  // Lantai parit dirapatkan dulu, kalau tidak airnya bocor ke bawah dan
  // seluruh baris petak di sebelahnya tidak pernah kebagian air.
  const floor = blockAt(dimension, job.x, job.y - 1, job.z);
  if (floor && (floor.isAir || floor.isLiquid)) {
    const fill = FILLS.find((id) => countIn(container, id) > 0);
    if (fill && takeFrom(container, fill, 1) === 1) {
      try {
        floor.setType(FILL_BLOCK);
      } catch {
        putIn(container, makeItem(fill, 1));
      }
    }
  }

  const cell = blockAt(dimension, job.x, job.y, job.z);
  if (!cell || cell.isAir || WATER.has(cell.typeId)) {
    plan.job = null;
    return undefined;
  }
  const swing = chipAway(entity, cell, tool, { pose: POSE.harvest, reason: "dig" });
  if (swing.status === "breaking") {
    return `menggali parit (${Math.round(swing.progress * 100)}%)`;
  }
  if (swing.status === "broke") {
    const keep = SPOIL[swing.id];
    if (keep) putIn(container, makeItem(keep, 1));
    plan.job = null;
    plan.tries = 0;
    return "menggali parit";
  }
  plan.tries++;
  return undefined;
}

/** Air alami terdekat, untuk mengisi ember. */
function waterNear(dimension, at, radius) {
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 2; dy++) {
          const b = blockAt(dimension, bx + dx, by + dy, bz + dz);
          if (b && WATER.has(b.typeId)) {
            return { x: bx + dx, y: by + dy, z: bz + dz };
          }
        }
      }
    }
  }
  return undefined;
}

/** Menuang air ke sumber parit — termasuk membuat dan mengisi embernya. */
function doPour(entity, state, plan, job, container, ownerId, station) {
  const dimension = entity.dimension;

  if (countIn(container, WATER_BUCKET) > 0) {
    if (!reach(entity, job.x, job.y, job.z)) return "membawa ember ke parit";
    const cell = blockAt(dimension, job.x, job.y, job.z);
    if (!cell || WATER.has(cell.typeId)) {
      plan.job = null;
      return undefined;
    }
    if (takeFrom(container, WATER_BUCKET, 1) !== 1) return undefined;
    try {
      cell.setType("minecraft:water");
    } catch (e) {
      logWarn(TAG, `Gagal menuang air di ${posStr(job)}`, e);
      putIn(container, makeItem(WATER_BUCKET, 1));
      plan.tries++;
      return undefined;
    }
    putIn(container, makeItem(BUCKET, 1));
    plan.job = null;
    plan.tries = 0;
    hold(entity, 14, { pose: POSE.build, reason: "pour" });
    sound(dimension, "bucket.empty_water", job);
    particle(dimension, "minecraft:water_splash_particle",
             { x: job.x + 0.5, y: job.y + 1, z: job.z + 0.5 });
    logInfo(TAG, `Air dituang di ${posStr(job)}.`);
    return "menuang air ke parit";
  }

  // Belum punya ember: buat dulu dari tiga besi.
  if (countIn(container, BUCKET) < 1) {
    const made = craftItemStep(entity, state, "bucket", container);
    if (made.status === "walking" || made.status === "crafting") return "membuat ember";
    if (made.status === "done") {
      sayFrom(entity, "bucket");
      return "ember selesai dibuat";
    }
    if (made.status === "no-table") {
      const own = ensureMaterial(entity, state, ownerId, "wood",
                                 station.chest ?? state.station, container);
      return own ?? "butuh meja kerja untuk membuat ember";
    }
    requestItem(entity, state, ownerId, "bucket", station.chest ?? state.station);
    const own = ensureMaterial(entity, state, ownerId, made.missing ?? "iron",
                               station.chest ?? state.station, container, { search: true });
    return own ?? "menunggu besi untuk ember";
  }

  // Ember kosong: isi di air alami terdekat.
  const river = waterNear(dimension, entity.location, FARM.riverRadius) ??
    waterNear(dimension, { x: job.x, y: job.y, z: job.z }, FARM.riverRadius);
  if (!river) {
    giveUp(entity, plan, job, "tidak ada sumber air dalam jangkauan");
    report(entity, "Tidak ada air di sekitar sini. Paritnya tidak bisa kuisi.");
    return "tidak ada sumber air, sumber parit dilewati";
  }
  if (!reach(entity, river.x, river.y, river.z)) return "berjalan ke sungai membawa ember";
  const source = blockAt(dimension, river.x, river.y, river.z);
  if (!source || !WATER.has(source.typeId)) return undefined;
  if (takeFrom(container, BUCKET, 1) !== 1) return undefined;
  try {
    source.setType("minecraft:air");
  } catch (e) {
    logWarn(TAG, "Gagal mengambil air dari sungai", e);
    putIn(container, makeItem(BUCKET, 1));
    return undefined;
  }
  putIn(container, makeItem(WATER_BUCKET, 1));
  hold(entity, 12, { pose: POSE.build, reason: "fill" });
  sound(dimension, "bucket.fill_water", river);
  return "mengisi ember di sungai";
}

/** Mencangkul satu petak jadi farmland. */
function doTill(entity, plan, job, map) {
  const dimension = entity.dimension;
  if (!reach(entity, job.x, job.y, job.z)) return "berjalan ke petak yang mau dicangkul";
  let tilled = 0;

  // Petak tetangga yang sudah siap ikut dicangkul selagi berdiri di sini —
  // berjalan bolak-balik untuk satu petak itu yang membuat ladang terasa
  // lambat, bukan pekerjaannya sendiri.
  for (let dx = -1; dx <= 1 && tilled < FARM.tillPerTick; dx++) {
    for (let dz = -1; dz <= 1 && tilled < FARM.tillPerTick; dz++) {
      const x = job.x + dx;
      const z = job.z + dz;
      if (roleAt(map, x, z) !== CELL.crop) continue;
      if (!hydrated(dimension, map, x, z)) continue;
      const ground = blockAt(dimension, x, map.y, z);
      if (!ground || ground.typeId === "minecraft:farmland") continue;
      const above = blockAt(dimension, x, map.y + 1, z);
      if (!isAir(above)) continue;
      try {
        ground.setType("minecraft:farmland");
        tilled++;
      } catch (e) {
        logDebug(TAG, `Gagal mencangkul (${x}, ${z})`, e);
      }
    }
  }

  if (!tilled) {
    plan.tries++;
    return undefined;
  }
  plan.job = null;
  plan.tries = 0;
  hold(entity, 12, { pose: POSE.harvest, reason: "till" });
  sound(dimension, "step.gravel", job);
  return `mencangkul petak yang sudah berair (${tilled})`;
}

function seedsIn(container) {
  return Object.keys(SEEDS).filter((id) => countIn(container, id) > 0);
}

/** Menanam bibit berjalur. */
function doPlant(entity, state, plan, job, map, container, ownerId, station) {
  const dimension = entity.dimension;
  const available = seedsIn(container);
  if (!available.length) return seedHunt(entity, state, ownerId, container, station);
  if (!reach(entity, job.x, job.y - 1, job.z)) return "berjalan ke petak yang mau ditanami";

  let planted = 0;
  for (let dx = -1; dx <= 1 && planted < FARM.plantPerTick; dx++) {
    for (let dz = -1; dz <= 1 && planted < FARM.plantPerTick; dz++) {
      const x = job.x + dx;
      const z = job.z + dz;
      if (roleAt(map, x, z) !== CELL.crop) continue;
      const ground = blockAt(dimension, x, map.y, z);
      if (!ground || ground.typeId !== "minecraft:farmland") continue;
      const above = blockAt(dimension, x, map.y + 1, z);
      if (!isAir(above)) continue;
      const seed = seedForColumn(x, map, available);
      if (!seed || countIn(container, seed) < 1) continue;
      if (takeFrom(container, seed, 1) !== 1) continue;
      try {
        above.setType(SEEDS[seed]);
        planted++;
      } catch (e) {
        logDebug(TAG, `Gagal menanam ${seed} di (${x}, ${z})`, e);
        putIn(container, makeItem(seed, 1));
      }
    }
  }

  if (!planted) {
    plan.tries++;
    return undefined;
  }
  plan.job = null;
  plan.tries = 0;
  hold(entity, 12, { pose: POSE.harvest, reason: "plant" });
  sound(dimension, "item.crop.plant", job);
  return `menanam bibit (${planted})`;
}

/**
 * Petinya kehabisan bibit. Siapa yang mencarinya?
 *
 * Keputusan yang tidak enak ditebak sendiri oleh kode: mencari bibit berarti
 * meninggalkan ladang dan membabati rumput di sekitar, dan sebagian pemain
 * lebih suka menyetok bibit sendiri. Jadi petani BERTANYA sekali, lalu
 * menuruti jawabannya.
 */
function seedHunt(entity, state, ownerId, container, station) {
  const answer = state.seedSelf;
  if (answer === "ya") {
    const own = gatherOwn(entity, state, ownerId, "seed", container, { search: true });
    return own ?? "mencari bibit sendiri di rerumputan";
  }
  if (answer === "tidak") {
    requestMaterial(entity, state, ownerId, "seed", station.chest ?? state.station);
    return "peti kehabisan bibit, menunggu kiriman pemilik";
  }
  askOwner(entity, ownerId, {
    id: "seed",
    field: "seedSelf",
    text: "Petinya kehabisan bibit. Apakah aku mencari bibit sendiri, atau kamu yang mencarikan?",
    options: [
      { key: "ya", label: "Aku yang mencari bibit sendiri" },
      { key: "tidak", label: "Pemilik yang mencarikan bibit" },
    ],
  });
  requestMaterial(entity, state, ownerId, "seed", station.chest ?? state.station);
  return "menunggu jawaban pemilik soal bibit";
}

/* ------------------------------------------------------------------ *
 * Panen
 * ------------------------------------------------------------------ */

function ripe(block) {
  if (!block) return false;
  const meta = CROPS[block.typeId];
  if (!meta) return false;
  try {
    return block.permutation.getState(meta.state) >= meta.ripe;
  } catch {
    return false;
  }
}

/** Tanaman matang terdekat di dalam petak. */
function findRipe(dimension, map, from) {
  let best;
  let bestD = Infinity;
  for (let iz = 0; iz < map.h; iz++) {
    for (let ix = 0; ix < map.w; ix++) {
      if (map.cells[iz * map.w + ix] !== CELL.crop) continue;
      const x = map.x0 + ix;
      const z = map.z0 + iz;
      const crop = blockAt(dimension, x, map.y + 1, z);
      if (!ripe(crop)) continue;
      const d = (x - from.x) ** 2 + (z - from.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y: map.y + 1, z };
      }
    }
  }
  return best;
}

function deliver(entity, container, item) {
  const rest = putIn(container, item, entity.dimension, entity.location);
  if (rest) logDebug(TAG, `Sebagian hasil panen tidak muat dan dijatuhkan.`);
}

/** Satu ayunan panen; tanam ulang seketika supaya ladang tidak pernah kosong. */
function doHarvest(entity, state, container) {
  const job = state.job;
  const at = job.at;
  const dimension = entity.dimension;
  const block = blockAt(dimension, at.x, at.y, at.z);
  if (!ripe(block)) {
    state.job = null;
    return undefined;
  }
  if (!reach(entity, at.x, at.y, at.z)) return "menuju tanaman matang";

  if (!job.until) {
    job.until = system.currentTick + FARM.harvestTicks;
    hold(entity, FARM.harvestTicks, { pose: POSE.harvest, reason: "harvest" });
    return "memanen";
  }
  if (system.currentTick < job.until) return "memanen";

  const meta = CROPS[block.typeId];
  const seed = meta?.seed;
  for (const [id, min, max] of meta?.drops ?? []) {
    const n = Math.round(randomBetween(min, max));
    if (n > 0) deliver(entity, container, makeItem(id, n));
  }
  try {
    // Tanam ulang seketika: ladang yang menunggu satu putaran penuh sebelum
    // ditanami lagi menghabiskan separuh umurnya sebagai tanah kosong.
    if (seed && countIn(container, seed) > 0 && takeFrom(container, seed, 1) === 1) {
      block.setType(SEEDS[seed] ?? "minecraft:air");
    } else {
      block.setType("minecraft:air");
    }
  } catch (e) {
    logWarn(TAG, `Gagal memanen di ${posStr(at)}`, e);
  }
  sound(dimension, "block.crop.break", at);
  particle(dimension, "minecraft:crop_growth_emitter", at);
  state.job = null;
  logInfo(TAG, `${entStr(entity)} memanen di ${posStr(at)}.`);
  return "panen selesai, ditanam ulang";
}

/* ------------------------------------------------------------------ *
 * Menjaga ladang
 * ------------------------------------------------------------------ */

/**
 * "Kalau gudang dan bengkel berdiri di ladangku, pindahkan."
 *
 * Petani tidak membongkar milik orang lain — dia cuma yang menyuruh, dan yang
 * disuruh yang mengerjakan (station.js » evictStation).
 */
function guardField(entity, state, area, ownerId) {
  if (!area.claimed || !ownerId) return undefined;
  const now = system.currentTick;
  if (now - (state.guardAt ?? -GUARD_EVERY) < GUARD_EVERY) return undefined;
  state.guardAt = now;

  const bounds = { x0: area.x0, x1: area.x1, z0: area.z0, z1: area.z1 };
  const chests = stationsIn(ownerId, entity.dimension.id, bounds);
  const shops = workBlocksIn(ownerId, entity.dimension.id, bounds);
  if (!chests.length && !shops.length) return undefined;

  const moved = demandMove(entity, ownerId, "gudang berdiri di ladang");
  const what = [];
  if (chests.length) what.push(`${chests.length} peti`);
  if (shops.length) what.push(`${shops.length} bengkel`);
  logInfo(TAG, `${entStr(entity)} menyuruh ${what.join(" dan ")} pindah dari ladangnya.`);
  report(entity, `${what.join(" dan ")} berdiri di ladangku. Tolong pindahkan ke balai` +
    (moved ? ` yang baru di (${moved.x}, ${moved.z}).` : "."));
  return `menyuruh ${what.join(" dan ")} pindah dari ladang`;
}

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

export function tickFarm(entity, state, owner) {
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station.container;
  if (!container) {
    logError(TAG, `${entStr(entity)} tidak punya peti maupun kantong!`);
    return "tidak ada tempat menyimpan apa pun";
  }

  // 0. Panen selalu didahulukan, apa pun yang sedang dikerjakan.
  if (state.job?.kind === "harvest") {
    const status = doHarvest(entity, state, container);
    writeState(entity, state);
    if (status) return status;
  }

  // 1. Gudang dan balai kerja bersama.
  const trip = stationTravel(entity, station);
  if (trip) {
    writeState(entity, state);
    return trip;
  }
  if (station.missing) {
    const own = ensureMaterial(entity, state, ownerId, station.missing,
                               station.chest ?? state.station, container);
    if (own) {
      writeState(entity, state);
      return own;
    }
  }

  // 2. Alat dulu — tidak ada mencangkul dengan tangan kosong.
  const held = getGear(entity).mainhand;
  const craft = craftStep(entity, state, "hoe", container, held);
  if (craft === "no-material") {
    requestTool(entity, state, ownerId, "hoe", held, station.chest ?? state.station);
    const own = ensureMaterial(entity, state, ownerId, "wood",
                               station.chest ?? state.station, container, { search: true });
    writeState(entity, state);
    return own ?? "belum ada cangkul: minta bahan ke perajin & pencari barang";
  }
  if (craft === "no-table") {
    const own = ensureMaterial(entity, state, ownerId, "wood",
                               station.chest ?? state.station, container, { search: true });
    writeState(entity, state);
    return own ?? "butuh meja kerja (dan kayu untuk membuatnya)";
  }
  if (craft === "walking" || craft === "crafting") {
    writeState(entity, state);
    return "membuat cangkul";
  }
  if (craft === "done") {
    writeState(entity, state);
    sayFrom(entity, "done");
    return `${labelOf("hoe")} baru selesai`;
  }

  const area = workArea(entity, state, ownerId);
  refreshSign(entity, state);
  const plan = farmPlan(state);

  // 3. Ladang ini milik petani.
  const evicted = guardField(entity, state, area, ownerId);
  if (evicted) {
    writeState(entity, state);
    return evicted;
  }

  if (!area.claimed) {
    const status = tendLoose(entity, state, area, container);
    writeState(entity, state);
    return status;
  }

  const map = mapFor(entity, plan, area);

  // 4. Tanaman matang di petak ini didahulukan.
  const target = findRipe(entity.dimension, map, entity.location);
  if (target) {
    state.job = { kind: "harvest", at: target, until: 0 };
    writeState(entity, state);
    return "menuju tanaman matang";
  }

  // 5. Satu tugas dari antrean.
  let status;
  try {
    status = runJob(entity, state, plan, map, container, ownerId, station);
  } catch (err) {
    logError(TAG, "Error saat mengerjakan tugas ladang", err);
    plan.job = null;
    status = "gagal mengerjakan petak, lihat catatan kejadian";
  }
  writeState(entity, state);
  return status;
}

function runJob(entity, state, plan, map, container, ownerId, station) {
  const dimension = entity.dimension;
  const skip = skipSet(plan);

  if (!plan.job) {
    plan.job = nextJob(dimension, map, entity.location, container, skip) ?? null;
    plan.tries = 0;
  }
  if (!plan.job) return finishPlot(entity, state, plan, map, container);

  // Tugas yang berkali-kali tidak membuahkan apa pun ditandai mustahil.
  // Tanpa ini, satu petak yang aneh mengunci seluruh ladang — persis penyakit
  // mesin fase yang lama.
  if (plan.tries >= FARM.giveUpAfter) {
    giveUp(entity, plan, plan.job, `gagal ${plan.tries} kali`);
    return "petak yang tidak bisa dikerjakan dilewati";
  }

  const job = plan.job;
  const tool = getGear(entity).mainhand;
  let status;
  switch (job.kind) {
    case JOB.level: status = doLevel(entity, plan, job, container, tool); break;
    case JOB.dig: status = doDig(entity, plan, job, container, tool); break;
    case JOB.pour:
      status = doPour(entity, state, plan, job, container, ownerId, station);
      break;
    case JOB.till: status = doTill(entity, plan, job, map); break;
    case JOB.plant:
      status = doPlant(entity, state, plan, job, map, container, ownerId, station);
      break;
    default:
      plan.job = null;
      status = undefined;
      break;
  }
  if (status) return status;
  return `menggarap petak (${job.x}, ${job.z})`;
}

/**
 * Petak inti tuntas: hias, lebarkan, dan kalau seluruh chunk sudah jadi ladang,
 * tandai patoknya hijau.
 */
function finishPlot(entity, state, plan, map, container) {
  const area = workArea(entity, state, getOwnerId(entity));
  const plot = plotOf(area, plan.plot);

  if (!plot.whole) {
    const before = plan.plot;
    plan.plot = before + FARM.plotGrow;
    plan.job = null;
    plan.skip = [];
    maps.delete(entity.id);
    logInfo(TAG, `Petak ladang dilebarkan dari ${before} ke ${plan.plot}.`);
    report(entity, `Petak ${before}x${before} sudah jadi ladang. Aku lebarkan sedikit.`);
    return "melebarkan ladang";
  }

  const decorated = decorateStep(entity, state, { ...area, flattenY: area.y }, container);
  if (decorated) return decorated;

  for (const c of area.chunks ?? []) {
    if (markWorked(entity.dimension, c.cx, c.cz)) {
      report(entity, `Chunk (${c.cx}, ${c.cz}) sudah jadi ladang penuh.`);
      sayFrom(entity, "done");
    }
  }
  if (!plan.done) {
    plan.done = true;
    logInfo(TAG, `${entStr(entity)} menuntaskan ladangnya.`);
  }
  return "ladang sudah rapi, tinggal menunggu";
}

/**
 * Tanpa patok: petani cuma merawat tanaman yang kebetulan ada di sekitar
 * stasiunnya. Dia TIDAK pernah mencangkul tanah baru tanpa patok — supaya
 * kebun pemain tidak pernah dibongkar tanpa diminta.
 */
function tendLoose(entity, state, area, container) {
  const dimension = entity.dimension;
  for (let x = area.x0; x <= area.x1; x++) {
    for (let z = area.z0; z <= area.z1; z++) {
      for (const dy of [0, 1, -1]) {
        const crop = blockAt(dimension, x, area.y + dy, z);
        if (!ripe(crop)) continue;
        state.job = { kind: "harvest", at: { x, y: area.y + dy, z }, until: 0 };
        return "merawat tanaman yang ada (belum ada patok)";
      }
    }
  }
  return "belum ada patok ladang — buka Buku Panduan » Peta Patok";
}

/* ------------------------------------------------------------------ *
 * Untuk menu dan buku
 * ------------------------------------------------------------------ */

/**
 * Izin melebar ke chunk berpatok kedua. Rencana ladangnya ikut dibuang: petak
 * inti harus digambar ulang untuk bidang kerja yang baru.
 */
export function setExpand(entity, allow) {
  logInfo(TAG, `setExpand ${entStr(entity)} -> ${allow}`);
  maps.delete(entity.id);
  const state = patchState(entity, { allowExpand: Boolean(allow) });
  if (state.plan?.farm) {
    state.plan.farm.job = null;
    state.plan.farm.skip = [];
    state.plan.farm.done = false;
    writeState(entity, state);
  }
  return Boolean(allow);
}

/** Baris "Tahap" di menu: apa yang sedang dikerjakan petani sekarang. */
export function farmPhaseLabel(state) {
  const plan = state.plan?.farm;
  if (!plan) return "belum mulai";
  if (plan.done) return "ladang selesai";
  const job = plan.job;
  if (!job) return `petak inti ${plan.plot}x${plan.plot}`;
  return `${job.kind} di (${job.x}, ${job.z})`;
}

export { plotOf };
