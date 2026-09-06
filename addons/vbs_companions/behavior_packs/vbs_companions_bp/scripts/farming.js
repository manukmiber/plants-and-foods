/**
 * Mode bertani.
 *
 * Ladang dikerjakan BERURUTAN, bukan asal cangkul di mana kaki berdiri:
 *
 *   alat   -> pastikan sudah pegang cangkul (kayu dulu, baru naik tingkat)
 *   ratakan-> seluruh petak diratakan ke satu ketinggian (flattenY)
 *   airi   -> parit digali di kolom parit, ember dibuat/diisi di sungai,
 *             lalu dituang jadi sumber air
 *   cangkul-> hanya petak yang BENAR-BENAR kebagian air yang dijadikan farmland
 *   tanam  -> bibit ditanam berjalur
 *   rawat  -> panen yang matang, tanam ulang, hias kalau sudah rapi
 *
 * Versi lama mencampur semuanya dalam satu sapuan: tanah dicangkul lebih dulu
 * di kolom mana pun yang kebetulan disentuh, paritnya baru digali belakangan,
 * dan petak yang keburu jadi farmland tanpa air balik lagi jadi tanah. Itulah
 * keluhan "ladangnya jagged dan tanahnya sering rusak karena tidak dapat
 * supply air".
 */

import { system } from "@minecraft/server";
import {
  BAND_WIDTH, CROPS, POSE, PROTECTED, SEEDS, TILLABLE, WATER,
} from "./config.js";
import { report, sayFrom } from "./chat.js";
import { craftItemStep, craftStep, labelOf } from "./crafting.js";
import { decorateStep } from "./decorate.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { claimAt, chunkBounds, claimsNear, getClaim, markWorked } from "./claim.js";
import { requestItem, requestMaterial, requestTool } from "./requests.js";
import { patchState, writeState } from "./state.js";
import { ensureStation, refreshSign } from "./station.js";
import {
  alive, blockAt, countIn, dist2, face, getGear, getOwnerId, info, isAir,
  isStuck, makeItem, particle, putIn, randomBetween, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "FARMING";
const BUCKET = "minecraft:bucket";
const WATER_BUCKET = "minecraft:water_bucket";
const FILL_BLOCK = "minecraft:dirt";
// Apa yang tersisa di tangan setelah memangkas satu blok saat meratakan.
// Rumput dan tanah berakar sama-sama jadi tanah biasa, batu jadi bulat.
const SPOIL = {
  "minecraft:grass_block": FILL_BLOCK,
  "minecraft:dirt": FILL_BLOCK,
  "minecraft:coarse_dirt": FILL_BLOCK,
  "minecraft:rooted_dirt": FILL_BLOCK,
  "minecraft:podzol": FILL_BLOCK,
  "minecraft:mycelium": FILL_BLOCK,
  "minecraft:moss_block": FILL_BLOCK,
  "minecraft:dirt_with_roots": FILL_BLOCK,
  "minecraft:sand": "minecraft:sand",
  "minecraft:gravel": "minecraft:gravel",
  "minecraft:stone": "minecraft:cobblestone",
  "minecraft:cobblestone": "minecraft:cobblestone",
  "minecraft:andesite": "minecraft:andesite",
  "minecraft:diorite": "minecraft:diorite",
  "minecraft:granite": "minecraft:granite",
};
const SCAN_PER_TICK = 64;
const LEVEL_BUDGET = 6;
const TILL_BUDGET = 4;
const PLANT_BUDGET = 4;
const HARVEST_TICKS = 36;
const REACH = 2.6;
const WALK_REACH = 3.0;
const CHANNEL_PERIOD = 8;      // satu parit tiap delapan kolom
const CHANNEL_OFFSET = 3;      // jaraknya jadi maksimal 4 blok ke petak terjauh
const SOURCE_EVERY = 6;        // sumber air tiap enam blok sepanjang parit
const RIVER_RADIUS = 20;

/* ------------------------------------------------------------------ *
 * Area kerja
 * ------------------------------------------------------------------ */

export function workArea(entity, state, ownerId) {
  const base = state.station ?? entity.location;
  const radius = info(entity)?.farmRadius ?? 6;
  const mine = claimAt(entity.dimension, base, ownerId);
  if (!mine) {
    const area = {
      x0: Math.floor(base.x) - radius, x1: Math.floor(base.x) + radius,
      z0: Math.floor(base.z) - radius, z1: Math.floor(base.z) + radius,
      y: Math.floor(base.y), flattenY: Math.floor(base.y), chunks: [], claimed: false,
    };
    logDebug(TAG, `workArea tanpa patok untuk ${entStr(entity)}: ${JSON.stringify(area)}`);
    return area;
  }
  const chunks = [{ cx: mine.cx, cz: mine.cz }];
  if (state.allowExpand) {
    const extra = claimsNear(entity.dimension, base, ownerId, 4)
      .find((c) => (c.cx !== mine.cx || c.cz !== mine.cz) && !c.entry.worked);
    if (extra) {
      logInfo(TAG, `Ekspansi diizinkan: chunk (${extra.cx}, ${extra.cz}) ikut digarap.`);
      chunks.push({ cx: extra.cx, cz: extra.cz });
    }
  }
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const c of chunks) {
    const b = chunkBounds(c.cx, c.cz);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1);
    z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1);
  }
  const ys = chunks
    .map((c) => getClaim(entity.dimension.id, c.cx, c.cz)?.y)
    .filter((y) => typeof y === "number");
  const flattenY = ys.length
    ? Math.round(ys.reduce((a, b) => a + b, 0) / ys.length)
    : Math.floor(base.y);

  const area = { x0, x1, z0, z1, y: flattenY, flattenY, chunks, claimed: true };
  logInfo(TAG, `workArea berpatok (${chunks.length} chunk), flattenY=${flattenY}: ${JSON.stringify(area)}`);
  return area;
}

function areaWidth(area) {
  return area.x1 - area.x0 + 1;
}

function areaSize(area) {
  return areaWidth(area) * (area.z1 - area.z0 + 1);
}

function columnAt(area, index) {
  const w = areaWidth(area);
  return { x: area.x0 + (index % w), z: area.z0 + Math.floor(index / w) };
}

/* ------------------------------------------------------------------ *
 * Parit dan pengairan
 * ------------------------------------------------------------------ */

function isChannelColumn(x, area) {
  return (((x - area.x0) % CHANNEL_PERIOD) + CHANNEL_PERIOD) % CHANNEL_PERIOD === CHANNEL_OFFSET;
}

/** Kolom parit terdekat untuk satu petak — selalu maksimal 4 blok jauhnya. */
function channelXFor(x, area) {
  const off = (((x - area.x0) % CHANNEL_PERIOD) + CHANNEL_PERIOD) % CHANNEL_PERIOD;
  return x - off + CHANNEL_OFFSET;
}

/**
 * Apakah petak ini benar-benar kebagian air?
 *
 * Di Minecraft, farmland tetap basah kalau ada air dalam radius 4 blok
 * mendatar pada ketinggian yang sama atau satu di atasnya. Karena parit kita
 * letaknya sudah pasti (tiap delapan kolom), cukup satu pembacaan blok: air
 * ada di kolom parit terdekat pada baris z yang sama atau tidak.
 */
function hydrated(dimension, x, z, area) {
  const cx = channelXFor(x, area);
  if (Math.abs(cx - x) > 4) return false;
  for (const dy of [0, 1]) {
    const block = blockAt(dimension, cx, area.flattenY + dy, z);
    if (block && WATER.has(block.typeId)) return true;
  }
  return false;
}

/** Air alami di sekitar, untuk ladang tanpa patok dan untuk mengisi ember. */
function waterNear(dimension, x, y, z, radius) {
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 2; dy++) {
          const block = blockAt(dimension, x + dx, y + dy, z + dz);
          if (block && WATER.has(block.typeId)) {
            return { x: x + dx, y: y + dy, z: z + dz };
          }
        }
      }
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Meratakan tanah
 * ------------------------------------------------------------------ */

function surfaceAt(dimension, x, z, baseY, span = 6) {
  for (let y = baseY + span; y >= baseY - span; y--) {
    const here = blockAt(dimension, x, y, z);
    const above = blockAt(dimension, x, y + 1, z);
    if (!here || !above) continue;
    if (here.isAir || here.isLiquid) continue;
    if (CROPS[here.typeId]) continue;
    if (!isAir(above) && !CROPS[above.typeId] && !above.isLiquid) return undefined;
    return here;
  }
  return undefined;
}

/**
 * Meratakan satu kolom ke flattenY. Lebih tinggi -> dibongkar; lebih rendah ->
 * ditimbun pakai tanah dari peti. Kolom yang belum bisa diratakan sengaja
 * TIDAK dicangkul — lebih baik menunggu daripada meninggalkan petak jomplang
 * yang nanti tidak kebagian air.
 */
function levelColumn(dimension, x, z, targetY, container, budget) {
  const surface = surfaceAt(dimension, x, z, targetY);
  if (!surface) return { used: 0, reason: "none" };
  if (surface.y === targetY) return { used: 0, reason: "ok" };
  if (budget <= 0) return { used: 0, reason: "budget" };

  if (surface.y > targetY) {
    let used = 0;
    for (let y = surface.y; y > targetY && used < budget; y--) {
      const b = blockAt(dimension, x, y, z);
      if (!b || b.isAir) continue;
      if (PROTECTED.has(b.typeId)) {
        logDebug(TAG, `Kolom (${x}, ${z}) tidak diratakan: ada blok terlindungi ${b.typeId}.`);
        return { used, reason: "blocked" };
      }
      const spoil = SPOIL[b.typeId];
      try {
        b.setType("minecraft:air");
        used++;
      } catch (e) {
        logWarn(TAG, `Gagal membongkar blok di (${x}, ${y}, ${z}) saat meratakan`, e);
        return { used, reason: "blocked" };
      }
      // Tanah galian DISIMPAN, bukan dibuang. Gundukan yang dipangkas jadi
      // bahan untuk menimbun cekungan di petak sebelah — tanpa ini petani
      // mentok minta tanah timbun padahal dia sendiri baru saja membuang
      // berkubik-kubik tanah.
      if (spoil) {
        putIn(container, makeItem(spoil, 1));
        logDebug(TAG, `Hasil pangkasan (${b.typeId} -> ${spoil}) disimpan untuk menimbun petak lain.`);
      }
    }
    if (used) logInfo(TAG, `Meratakan (${x}, ${z}): membongkar ${used} blok turun ke Y=${targetY}`);
    return { used, reason: used ? "ok" : "budget" };
  }

  if (countIn(container, FILL_BLOCK) < 1) {
    logDebug(TAG, `Kolom (${x}, ${z}) terlalu rendah tapi tidak ada tanah timbun di peti.`);
    return { used: 0, reason: "need-fill" };
  }
  let used = 0;
  for (let y = surface.y + 1; y <= targetY && used < budget; y++) {
    if (takeFrom(container, FILL_BLOCK, 1) !== 1) break;
    const b = blockAt(dimension, x, y, z);
    if (!b) break;
    try {
      b.setType(FILL_BLOCK);
      used++;
    } catch (e) {
      logWarn(TAG, `Gagal menimbun blok di (${x}, ${y}, ${z})`, e);
      putIn(container, makeItem(FILL_BLOCK, 1));
      break;
    }
  }
  if (used) logInfo(TAG, `Meratakan (${x}, ${z}): menimbun ${used} blok naik ke Y=${targetY}`);
  const now = blockAt(dimension, x, targetY, z);
  return { used, reason: now && !now.isAir ? "ok" : "need-fill" };
}

/* ------------------------------------------------------------------ *
 * Bibit dan panen
 * ------------------------------------------------------------------ */

function seedsIn(container) {
  return Object.keys(SEEDS).filter((id) => countIn(container, id) > 0);
}

function seedForColumn(x, area, available) {
  if (!available.length) return undefined;
  const band = Math.floor((x - area.x0) / BAND_WIDTH);
  return available[((band % available.length) + available.length) % available.length];
}

function ripe(block) {
  const crop = CROPS[block?.typeId];
  if (!crop) return false;
  try {
    return block.permutation.getState(crop.state) === crop.ripe;
  } catch (e) {
    logWarn(TAG, `Gagal membaca kematangan ${block?.typeId}`, e);
    return false;
  }
}

/**
 * Hasil panen SELALU masuk peti stasiun companion sendiri — tidak pernah
 * langsung ke kantong pemain. Kalau petinya belum berdiri, hasilnya masuk
 * kantong pribadi companion (yang nanti dipindahkan begitu peti jadi).
 */
function deliver(entity, container, item) {
  if (!item) return;
  if (container) {
    logInfo(TAG, `${entStr(entity)} menyetor panen ke petinya sendiri: ${item.amount}x ${item.typeId}`);
    putIn(container, item, entity.dimension, entity.location);
    return;
  }
  logWarn(TAG, "Tidak ada peti maupun kantong; hasil panen dijatuhkan di tanah.");
  try {
    entity.dimension.spawnItem(item, entity.location);
  } catch (e) {
    logError(TAG, "Gagal menjatuhkan hasil panen", e);
  }
}

function finishHarvest(entity, block, container) {
  const crop = CROPS[block.typeId];
  if (!crop) return undefined;
  logInfo(TAG, `Menyelesaikan panen ${block.typeId} di ${posStr(block)}`);
  let main;
  for (const [id, min, max] of crop.drops) {
    const count = randomBetween(min, max);
    if (count <= 0) continue;
    if (!main) main = id;
    deliver(entity, container, makeItem(id, count));
  }
  try {
    block.setPermutation(block.permutation.withState(crop.state, 0));
    logDebug(TAG, `Tanaman di ${posStr(block)} ditanam ulang ke umur 0.`);
  } catch (e) {
    logWarn(TAG, `Gagal menanam ulang di ${posStr(block)}`, e);
  }
  return main;
}

/* ------------------------------------------------------------------ *
 * Otak: mesin fase
 * ------------------------------------------------------------------ */

function farmPlan(state) {
  if (!state.plan) state.plan = {};
  if (!state.plan.farm) {
    state.plan.farm = { phase: "level", cursor: 0, swept: 0, acted: 0 };
    logInfo(TAG, "Rencana bertani baru dibuat, mulai dari fase meratakan tanah.");
  }
  return state.plan.farm;
}

function toPhase(entity, farm, phase, why) {
  if (farm.phase === phase) return;
  logInfo(TAG, `${entStr(entity)} pindah fase bertani: ${farm.phase} -> ${phase} (${why})`);
  farm.phase = phase;
  farm.cursor = 0;
  farm.swept = 0;
  farm.acted = 0;
}

export function tickFarm(entity, state, owner) {
  logDebug(TAG, `tickFarm untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station.container;
  if (!container) {
    logError(TAG, `${entStr(entity)} tidak punya peti maupun kantong!`);
    return "tidak ada tempat menyimpan apa pun";
  }
  if (station.missing) {
    requestMaterial(entity, state, ownerId, station.missing, station.chest ?? state.station);
    logDebug(TAG, `Peti stasiun belum bisa dibuat, butuh ${station.missing}. Sementara pakai kantong.`);
  }

  // 1. Alat dulu — tidak ada mencangkul dengan tangan kosong.
  const held = getGear(entity).mainhand;
  const craft = craftStep(entity, state, "hoe", container, held);
  if (craft === "no-material") {
    requestTool(entity, state, ownerId, "hoe", held, station.chest ?? state.station);
    requestMaterial(entity, state, ownerId, "wood", station.chest ?? state.station);
    return "belum ada cangkul: minta bahan ke perajin & pencari barang";
  }
  if (craft === "no-table") {
    requestMaterial(entity, state, ownerId, "wood", station.chest ?? state.station);
    return "butuh meja kerja (dan kayu untuk membuatnya)";
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
  const farm = farmPlan(state);

  // 2. Panen selalu didahulukan, apa pun fasenya — tanaman matang tidak
  //    boleh menunggu ladang selesai diratakan.
  if (state.job?.kind === "harvest") {
    const status = continueHarvest(entity, state, container);
    writeState(entity, state);
    if (status) return status;
  }

  let status;
  try {
    switch (farm.phase) {
      case "level": status = phaseLevel(entity, state, area, container, farm, ownerId, station); break;
      case "water": status = phaseWater(entity, state, area, container, farm, ownerId, station); break;
      case "till": status = phaseTill(entity, state, area, container, farm, ownerId, station); break;
      case "plant": status = phasePlant(entity, state, area, container, farm, ownerId, station); break;
      default: status = phaseTend(entity, state, area, container, farm, ownerId, station); break;
    }
  } catch (err) {
    logError(TAG, `Error di fase bertani "${farm.phase}"`, err);
    status = `gagal di fase ${farm.phase}, lihat log`;
  }
  writeState(entity, state);
  return status;
}

/** Berjalan ke satu petak supaya kerjanya terlihat, bukan sihir dari jauh. */
function reachFor(entity, x, y, z) {
  const target = { x: x + 0.5, y, z: z + 0.5 };
  if (dist2(entity.location, target) > WALK_REACH ** 2) {
    steer(entity, target);
    return false;
  }
  face(entity, target);
  return true;
}

/**
 * Kalau satu petak masih jauh, petak itu DIKUNCI dan kursor dimundurkan.
 *
 * Tanpa ini, tiap denyut kursor sudah terlanjur maju ke petak berikutnya
 * sebelum companion sempat tiba, jadi tujuan jalannya berganti-ganti tiap
 * setengah detik dan dia cuma bergoyang di tempat tanpa pernah sampai.
 */
function lockTarget(entity, farm, total, x, y, z) {
  farm.walkTo = { x, y, z };
  farm.cursor = (farm.cursor - 1 + total) % total;
  farm.swept = Math.max(0, farm.swept - 1);
  logDebug(TAG, `Petak (${x}, ${z}) dikunci sebagai tujuan jalan; kursor dimundurkan.`);
  return reachFor(entity, x, y, z);
}

/** Balikan true kalau masih dalam perjalanan ke petak yang dikunci. */
function stillWalking(entity, farm) {
  if (!farm.walkTo) return false;
  const w = farm.walkTo;
  if (reachFor(entity, w.x, w.y, w.z)) {
    logDebug(TAG, `Sampai di petak terkunci (${w.x}, ${w.z}).`);
    farm.walkTo = null;
    return false;
  }
  // Tebing yang tidak bisa dipanjat tidak boleh menghentikan seluruh ladang:
  // kalau langkahnya mentok, petak itu tetap dikerjakan dari jarak jangkauan
  // dan companion lanjut ke petak berikutnya.
  if (isStuck(entity)) {
    logWarn(TAG, `Tidak bisa mencapai petak (${w.x}, ${w.z}); dikerjakan dari kejauhan lalu dilanjut.`);
    farm.walkTo = null;
    farm.stuckAt = { x: w.x, z: w.z };
    return false;
  }
  return true;
}

/* --- fase 1: meratakan --- */

function phaseLevel(entity, state, area, container, farm, ownerId, station) {
  if (!area.claimed) {
    toPhase(entity, farm, "tend", "ladang tanpa patok tidak diratakan");
    return "belum ada patok ladang, cuma merawat tanaman yang ada";
  }
  const dimension = entity.dimension;
  const total = areaSize(area);
  if (stillWalking(entity, farm)) return "menuju petak yang belum rata";
  let leveled = 0;
  let needFill = false;

  for (let n = 0; n < SCAN_PER_TICK && leveled < LEVEL_BUDGET; n++) {
    const { x, z } = columnAt(area, farm.cursor);
    farm.cursor = (farm.cursor + 1) % total;
    farm.swept++;
    // Cek jarak DULU, baru bongkar/timbun — supaya companion benar-benar
    // berdiri di petak yang dia kerjakan.
    const peek = levelColumn(dimension, x, z, area.flattenY, container, 0);
    if (peek.reason === "need-fill") needFill = true;
    if (peek.reason === "ok" || peek.reason === "none" || peek.reason === "blocked") continue;
    const forced = farm.stuckAt && farm.stuckAt.x === x && farm.stuckAt.z === z;
    if (!forced && !reachFor(entity, x, area.flattenY, z)) {
      lockTarget(entity, farm, total, x, area.flattenY, z);
      return "menuju petak yang belum rata";
    }
    farm.stuckAt = null;
    const result = levelColumn(dimension, x, z, area.flattenY, container, LEVEL_BUDGET - leveled);
    if (result.reason === "need-fill") needFill = true;
    if (!result.used) continue;
    leveled += result.used;
    hold(entity, 14, { pose: POSE.build, reason: "level" });
    sound(dimension, "step.gravel", { x, y: area.flattenY, z });
    particle(dimension, "minecraft:basic_crit_particle", { x: x + 0.5, y: area.flattenY + 1, z: z + 0.5 });
  }

  if (leveled) {
    farm.acted += leveled;
    logDebug(TAG, `Fase ratakan: ${leveled} blok dikerjakan tick ini.`);
    return `meratakan lahan (${leveled} blok)`;
  }
  if (needFill) {
    requestMaterial(entity, state, ownerId, "dirt", station.chest ?? state.station);
    return "butuh tanah timbun di peti untuk meratakan petak yang cekung";
  }
  if (farm.swept >= total) {
    toPhase(entity, farm, "water", "seluruh petak sudah rata");
    report(entity, "Lahannya sudah rata semua. Sekarang aku gali paritnya.");
    return "lahan sudah rata, lanjut menggali parit";
  }
  logDebug(TAG, `Fase ratakan: ${farm.swept}/${total} kolom diperiksa, tidak ada yang perlu diratakan.`);
  return `memeriksa kerataan lahan (${farm.swept}/${total})`;
}

/* --- fase 2: parit dan air --- */

/**
 * Sel parit yang masih tertutup tanah.
 *
 * Paritnya harus digali UTUH sepanjang kolomnya dulu, bukan cuma dilubangi di
 * titik sumber airnya. Kalau cuma titiknya yang dilubangi, air yang dituang
 * terkurung di satu lubang dan tidak mengalir ke mana-mana — barisan petak di
 * antara dua sumber tetap kering dan tidak pernah bisa dicangkul.
 */
function findChannelCellToDig(dimension, area) {
  for (let x = area.x0; x <= area.x1; x++) {
    if (!isChannelColumn(x, area)) continue;
    for (let z = area.z0; z <= area.z1; z++) {
      const cell = blockAt(dimension, x, area.flattenY, z);
      if (!cell) continue;
      if (cell.isAir || WATER.has(cell.typeId) || PROTECTED.has(cell.typeId)) continue;
      return { x, y: area.flattenY, z };
    }
  }
  return undefined;
}

function findChannelCellNeedingWater(dimension, area) {
  for (let x = area.x0; x <= area.x1; x++) {
    if (!isChannelColumn(x, area)) continue;
    for (let z = area.z0; z <= area.z1; z += 1) {
      const offset = z - area.z0;
      const isSource = offset % SOURCE_EVERY === 0 || z === area.z1;
      if (!isSource) continue;
      const cell = blockAt(dimension, x, area.flattenY, z);
      if (!cell) continue;
      if (WATER.has(cell.typeId)) continue;
      if (PROTECTED.has(cell.typeId)) continue;
      return { x, y: area.flattenY, z };
    }
  }
  return undefined;
}

/** Menggali paritnya dulu: blok parit dikosongkan, lantainya dipastikan rapat. */
function digChannel(dimension, area, x, z, container) {
  const floor = blockAt(dimension, x, area.flattenY - 1, z);
  if (floor && (floor.isAir || floor.isLiquid)) {
    try {
      floor.setType(FILL_BLOCK);
      logDebug(TAG, `Lantai parit di (${x}, ${area.flattenY - 1}, ${z}) ditambal supaya air tidak bocor.`);
    } catch (e) {
      logWarn(TAG, "Gagal menambal lantai parit", e);
    }
  }
  const cell = blockAt(dimension, x, area.flattenY, z);
  if (!cell || cell.isAir || WATER.has(cell.typeId)) return false;
  if (PROTECTED.has(cell.typeId)) {
    logDebug(TAG, `Lubang parit di (${x}, ${z}) dilewati: ada ${cell.typeId}.`);
    return false;
  }
  const spoil = SPOIL[cell.typeId];
  try {
    cell.setType("minecraft:air");
  } catch (e) {
    logWarn(TAG, `Gagal menggali lubang parit di (${x}, ${area.flattenY}, ${z})`, e);
    return false;
  }
  if (spoil && container) putIn(container, makeItem(spoil, 1));
  logDebug(TAG, `Lubang parit digali di (${x}, ${area.flattenY}, ${z}).`);
  return true;
}

function phaseWater(entity, state, area, container, farm, ownerId, station) {
  const dimension = entity.dimension;
  if (!area.claimed) {
    toPhase(entity, farm, "till", "ladang tanpa patok tidak digali parit");
    return "ladang tanpa patok, parit dilewati";
  }

  // Tahap 2a: gali paritnya sampai tuntas sepanjang kolom parit.
  const toDig = findChannelCellToDig(dimension, area);
  if (toDig) {
    if (!reachFor(entity, toDig.x, toDig.y, toDig.z)) {
      if (isStuck(entity)) {
        logWarn(TAG, `Tidak bisa mencapai lubang parit ${posStr(toDig)}; digali dari kejauhan.`);
      } else {
        return "menuju parit yang mau digali";
      }
    }
    // Sekalian gali beberapa sel di sekitarnya supaya tidak satu per satu.
    let dug = 0;
    for (let dz = -2; dz <= 2 && dug < 4; dz++) {
      const z = toDig.z + dz;
      if (z < area.z0 || z > area.z1) continue;
      if (digChannel(dimension, area, toDig.x, z, container)) dug++;
    }
    farm.acted += dug;
    hold(entity, 14, { pose: POSE.harvest, reason: "dig" });
    sound(dimension, "dig.gravel", { x: toDig.x, y: toDig.y, z: toDig.z });
    logInfo(TAG, `Menggali ${dug} lubang parit di kolom x=${toDig.x}.`);
    return `menggali parit air (${dug} lubang)`;
  }

  // Tahap 2b: isi paritnya dengan air dari sungai, pakai ember.
  const cell = farm.cell ?? findChannelCellNeedingWater(dimension, area);
  if (!cell) {
    farm.cell = null;
    if (farm.carrying) {
      putIn(container, makeItem(farm.carrying === "full" ? WATER_BUCKET : BUCKET, 1));
      logDebug(TAG, "Ember dikembalikan ke peti, pengairan selesai.");
      farm.carrying = null;
    }
    toPhase(entity, farm, "till", "semua parit sudah berair");
    report(entity, "Paritnya sudah penuh air. Ladang siap dicangkul.");
    return "parit sudah berair, mulai mencangkul";
  }
  farm.cell = cell;

  // Ember dulu. Tidak ada air yang bisa dipindahkan tanpa ember, dan ember
  // itu sendiri harus benar-benar ditempa dari tiga batang besi.
  if (!farm.carrying) {
    if (countIn(container, WATER_BUCKET) > 0 && takeFrom(container, WATER_BUCKET, 1) === 1) {
      farm.carrying = "full";
      logInfo(TAG, `${entStr(entity)} mengambil ember berisi air dari peti.`);
    } else if (countIn(container, BUCKET) > 0 && takeFrom(container, BUCKET, 1) === 1) {
      farm.carrying = "empty";
      logInfo(TAG, `${entStr(entity)} mengambil ember kosong dari peti.`);
    } else {
      const made = craftItemStep(entity, state, "bucket", container);
      if (made.status === "done") {
        sayFrom(entity, "bucket");
        return "ember baru selesai dibuat";
      }
      if (made.status === "walking" || made.status === "crafting") return "membuat ember di meja kerja";
      if (made.status === "no-table") {
        requestMaterial(entity, state, ownerId, "wood", station.chest ?? state.station);
        return "butuh meja kerja untuk membuat ember";
      }
      requestItem(entity, state, ownerId, "bucket", station.chest ?? state.station);
      requestMaterial(entity, state, ownerId, "iron", station.chest ?? state.station);
      return "belum ada ember: minta 3 besi ke perajin/pencari barang";
    }
  }

  if (farm.carrying === "empty") {
    const river = farm.river && blockIsWater(dimension, farm.river)
      ? farm.river
      : waterNear(dimension, cell.x, area.flattenY, cell.z, RIVER_RADIUS);
    if (!river) {
      logWarn(TAG, "Tidak ada sumber air alami dalam jangkauan untuk mengisi ember.");
      putIn(container, makeItem(BUCKET, 1));
      farm.carrying = null;
      farm.cell = null;
      toPhase(entity, farm, "till", "tidak ada sungai, ladang dikerjakan seadanya");
      report(entity, "Tidak ada sungai di dekat sini. Ladangnya cuma bisa sebagian.");
      return "tidak ada sumber air di sekitar ladang";
    }
    farm.river = river;
    if (!reachFor(entity, river.x, river.y, river.z)) return "berjalan ke sungai membawa ember";
    farm.carrying = "full";
    hold(entity, 16, { pose: POSE.harvest, reason: "fill" });
    sound(dimension, "bucket.fill_water", river);
    particle(dimension, "minecraft:water_splash_particle", { x: river.x + 0.5, y: river.y + 1, z: river.z + 0.5 });
    logInfo(TAG, `${entStr(entity)} mengisi ember di sungai ${posStr(river)}.`);
    return "mengisi ember di sungai";
  }

  // Ember penuh: gali lubangnya, lalu tuang.
  if (!reachFor(entity, cell.x, cell.y, cell.z) && !isStuck(entity)) {
    return "membawa air ke parit";
  }
  digChannel(dimension, area, cell.x, cell.z, container);
  const block = blockAt(dimension, cell.x, cell.y, cell.z);
  if (!block) {
    farm.cell = null;
    return "lubang parit tidak terbaca";
  }
  try {
    block.setType("minecraft:water");
    logInfo(TAG, `Sumber air dituang di parit ${posStr(cell)}.`);
  } catch (e) {
    logError(TAG, `Gagal menuang air di ${posStr(cell)}`, e);
    farm.cell = null;
    return "gagal menuang air, lihat log";
  }
  farm.carrying = "empty";
  farm.cell = null;
  farm.acted++;
  hold(entity, 16, { pose: POSE.build, reason: "water" });
  sound(dimension, "bucket.empty_water", cell);
  return "menuang air ke parit";
}

function blockIsWater(dimension, pos) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  return Boolean(block) && WATER.has(block.typeId);
}

/* --- fase 3: mencangkul --- */

function phaseTill(entity, state, area, container, farm, ownerId, station) {
  const dimension = entity.dimension;
  const total = areaSize(area);
  if (stillWalking(entity, farm)) return "menuju petak yang mau dicangkul";
  let tilled = 0;
  let dry = 0;

  for (let n = 0; n < SCAN_PER_TICK && tilled < TILL_BUDGET; n++) {
    const { x, z } = columnAt(area, farm.cursor);
    farm.cursor = (farm.cursor + 1) % total;
    farm.swept++;
    if (area.claimed && isChannelColumn(x, area)) continue;

    const surface = surfaceAt(dimension, x, z, area.flattenY, area.claimed ? 1 : 4);
    if (!surface || PROTECTED.has(surface.typeId)) continue;
    if (surface.typeId === "minecraft:farmland") continue;
    if (!TILLABLE.has(surface.typeId)) continue;
    const above = blockAt(dimension, x, surface.y + 1, z);
    if (!isAir(above)) continue;

    // Inti perbaikannya: tidak ada satu petak pun dicangkul sebelum benar-benar
    // ada air yang menjangkaunya.
    const wet = area.claimed
      ? hydrated(dimension, x, z, area)
      : Boolean(waterNear(dimension, x, surface.y, z, 4));
    if (!wet) {
      dry++;
      continue;
    }

    const forced = farm.stuckAt && farm.stuckAt.x === x && farm.stuckAt.z === z;
    if (!forced && !reachFor(entity, x, surface.y, z)) {
      lockTarget(entity, farm, total, x, surface.y, z);
      return "menuju petak yang mau dicangkul";
    }
    farm.stuckAt = null;
    try {
      surface.setType("minecraft:farmland");
      tilled++;
      logInfo(TAG, `Mencangkul (${x}, ${surface.y}, ${z}) jadi farmland (sudah kebagian air).`);
      hold(entity, 14, { pose: POSE.harvest, reason: "till" });
      sound(dimension, "step.gravel", { x, y: surface.y, z });
    } catch (e) {
      logWarn(TAG, `Gagal mencangkul di (${x}, ${surface.y}, ${z})`, e);
    }
  }

  if (tilled) {
    farm.acted += tilled;
    return `mencangkul petak yang sudah berair (${tilled})`;
  }
  if (farm.swept >= total) {
    if (dry && area.claimed) {
      toPhase(entity, farm, "water", "masih ada petak kering, parit ditambah");
      return `${dry} petak belum kebagian air, menggali parit lagi`;
    }
    toPhase(entity, farm, "plant", "semua petak yang bisa dicangkul sudah jadi farmland");
    return "selesai mencangkul, mulai menanam";
  }
  return `memeriksa petak untuk dicangkul (${farm.swept}/${total})`;
}

/* --- fase 4: menanam --- */

function phasePlant(entity, state, area, container, farm, ownerId, station) {
  const dimension = entity.dimension;
  const total = areaSize(area);
  const seeds = seedsIn(container);
  if (!seeds.length) {
    requestMaterial(entity, state, ownerId, "seed", station.chest ?? state.station);
    if (farm.swept >= total) toPhase(entity, farm, "tend", "tidak ada bibit, lanjut merawat");
    farm.swept++;
    return "peti kehabisan bibit, sudah minta dicarikan";
  }

  if (stillWalking(entity, farm)) return "menuju petak yang mau ditanami";
  let planted = 0;
  for (let n = 0; n < SCAN_PER_TICK && planted < PLANT_BUDGET; n++) {
    const { x, z } = columnAt(area, farm.cursor);
    farm.cursor = (farm.cursor + 1) % total;
    farm.swept++;
    const ground = blockAt(dimension, x, area.flattenY, z);
    if (ground?.typeId !== "minecraft:farmland") continue;
    const above = blockAt(dimension, x, area.flattenY + 1, z);
    if (!isAir(above)) continue;
    const seed = seedForColumn(x, area, seeds);
    if (!seed || countIn(container, seed) < 1) continue;
    const forced = farm.stuckAt && farm.stuckAt.x === x && farm.stuckAt.z === z;
    if (!forced && !reachFor(entity, x, area.flattenY, z)) {
      lockTarget(entity, farm, total, x, area.flattenY, z);
      return "menuju petak yang mau ditanami";
    }
    farm.stuckAt = null;
    if (takeFrom(container, seed, 1) !== 1) continue;
    try {
      above.setType(SEEDS[seed]);
      planted++;
      logInfo(TAG, `Menanam ${seed} di (${x}, ${area.flattenY + 1}, ${z}).`);
      particle(dimension, "minecraft:crop_growth_emitter", { x: x + 0.5, y: area.flattenY + 1.3, z: z + 0.5 });
      hold(entity, 12, { pose: POSE.harvest, reason: "plant" });
    } catch (e) {
      logWarn(TAG, `Gagal menanam ${seed}, bibit dikembalikan ke peti`, e);
      putIn(container, makeItem(seed, 1));
    }
  }

  if (planted) {
    farm.acted += planted;
    return `menanam berjalur (${planted} bibit)`;
  }
  if (farm.swept >= total) {
    toPhase(entity, farm, "tend", "semua farmland sudah ditanami");
    report(entity, "Bibitnya sudah kutanam semua. Tinggal menunggu panen.");
    return "selesai menanam, tinggal merawat";
  }
  return `memeriksa petak untuk ditanami (${farm.swept}/${total})`;
}

/* --- fase 5: merawat, panen, hias --- */

function phaseTend(entity, state, area, container, farm, ownerId, station) {
  const dimension = entity.dimension;
  const total = areaSize(area);
  let nearest;
  let nearestD = Infinity;
  let broken = 0;

  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const { x, z } = columnAt(area, farm.cursor);
    farm.cursor = (farm.cursor + 1) % total;
    farm.swept++;
    const ground = blockAt(dimension, x, area.flattenY, z);
    if (!ground) continue;

    const above = blockAt(dimension, x, area.flattenY + 1, z);
    if (above && ripe(above)) {
      const d = dist2(entity.location, { x: x + 0.5, y: above.y, z: z + 0.5 });
      if (d < nearestD) {
        nearestD = d;
        nearest = { x, y: above.y, z };
      }
      continue;
    }
    // Petak yang balik jadi tanah karena airnya putus dihitung, supaya ladang
    // diperbaiki lagi alih-alih dibiarkan rusak.
    if (area.claimed && !isChannelColumn(x, area) &&
        TILLABLE.has(ground.typeId) && isAir(above)) {
      broken++;
    }
  }

  if (nearest) {
    logInfo(TAG, `Tanaman matang terdekat: ${posStr(nearest)}`);
    state.job = { kind: "harvest", at: nearest, until: 0 };
    return "menuju tanaman matang";
  }

  if (farm.swept >= total) {
    farm.swept = 0;
    if (broken > 2) {
      logWarn(TAG, `${broken} petak rusak/kering ditemukan, ladang diperbaiki dari awal.`);
      toPhase(entity, farm, "water", `${broken} petak kering, pengairan diperiksa lagi`);
      report(entity, `Ada ${broken} petak yang kering lagi. Aku perbaiki paritnya.`);
      return "memperbaiki petak yang kering";
    }
    const decorated = decorateStep(entity, state, area, container);
    if (decorated) return decorated;
    for (const c of area.chunks) {
      if (markWorked(dimension, c.cx, c.cz)) {
        report(entity, `Chunk (${c.cx}, ${c.cz}) sudah jadi ladang penuh.`);
      }
    }
    return "ladang sudah rapi, tinggal menunggu";
  }
  return "berkeliling memeriksa tanaman";
}

/* --- panen --- */

function continueHarvest(entity, state, container) {
  const job = state.job;
  const at = job.at;
  const block = blockAt(entity.dimension, at.x, at.y, at.z);
  if (!block || !ripe(block)) {
    logDebug(TAG, `Tanaman di ${posStr(at)} sudah tidak matang. Job panen dibatalkan.`);
    state.job = null;
    return undefined;
  }
  const target = { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };
  const d2 = dist2(entity.location, target);

  if (d2 > REACH ** 2) {
    steer(entity, target);
    return "menuju tanaman matang";
  }

  const now = system.currentTick;
  if (!job.until) {
    face(entity, target);
    job.until = now + HARVEST_TICKS;
    hold(entity, HARVEST_TICKS + 8, { pose: POSE.harvest, reason: "harvest" });
    sound(entity.dimension, "dig.grass", target);
    logDebug(TAG, `Mulai memanen di ${posStr(at)} sampai tick ${job.until}`);
    return "jongkok di depan tanaman";
  }
  if (now < job.until) {
    hold(entity, 12, { pose: POSE.harvest, reason: "harvest" });
    if (now % 8 === 0) {
      particle(entity.dimension, "minecraft:crop_growth_emitter", { x: target.x, y: at.y + 0.4, z: target.z });
      sound(entity.dimension, "dig.grass", target, { volume: 0.5 });
    }
    return "menarik tanaman";
  }

  const main = finishHarvest(entity, block, container);
  state.job = null;
  sound(entity.dimension, "random.pop", target);
  particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: at.y + 0.6, z: target.z });
  return main ? `memanen ${main.replace("minecraft:", "")} ke petiku` : undefined;
}

export function setExpand(entity, allow) {
  logInfo(TAG, `setExpand ${entStr(entity)}: ${allow}`);
  patchState(entity, { allowExpand: Boolean(allow) });
}

/** Dipakai UI dan pembangun untuk melaporkan fase kerja sekarang. */
export function farmPhaseLabel(state) {
  const phase = state.plan?.farm?.phase ?? "level";
  return {
    level: "meratakan lahan", water: "menggali & mengairi parit",
    till: "mencangkul", plant: "menanam", tend: "merawat & memanen",
  }[phase] ?? phase;
}
