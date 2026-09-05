/**
 * Mode bertani.
 */

import { system } from "@minecraft/server";

import {
  BAND_WIDTH,
  CROPS,
  POSE,
  PROTECTED,
  SEEDS,
  TILLABLE,
  WATER,
} from "./config.js";

import { report, sayFrom } from "./chat.js";
import { craftStep, labelOf } from "./crafting.js";
import { decorateStep } from "./decorate.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";

import {
  claimAt,
  chunkBounds,
  claimsNear,
  getClaim,
  markWorked,
} from "./claim.js";

import { maybeRequestHelp } from "./requests.js";
import { patchState, writeState } from "./state.js";
import { ensureStation, refreshSign } from "./station.js";

import {
  alive,
  blockAt,
  countIn,
  dist2,
  face,
  getGear,
  getOwnerId,
  info,
  isAir,
  isSolid,
  makeItem,
  particle,
  putIn,
  randomBetween,
  sound,
  steer,
  takeFrom,
} from "./util.js";

import {
  entStr,
  logDebug,
  logError,
  logInfo,
  logWarn,
  posStr,
} from "./logger.js";
const TAG = "FARMING";
const BUCKETS = ["minecraft:bucket", "minecraft:water_bucket"];
const IRON = "minecraft:iron_ingot";
const IRON_FOR_BUCKET = 3;
const SCAN_PER_TICK = 90;
const HARVEST_TICKS = 36;
const REACH = 2.6;

export function workArea(entity, state, ownerId) {
  const base = state.station ?? entity.location;
  const radius = info(entity)?.farmRadius ?? 6;
  logDebug(TAG, `workArea dihitung untuk ${entStr(entity)}, base=${posStr(base)}, radius=${radius}`);
  const mine = claimAt(entity.dimension, base, ownerId);
  if (!mine) {
    const area = {
      x0: Math.floor(base.x) - radius, x1: Math.floor(base.x) + radius,
      z0: Math.floor(base.z) - radius, z1: Math.floor(base.z) + radius,
      y: Math.floor(base.y), chunks: [], claimed: false,
    };
    logDebug(TAG, `workArea tanpa patok: ${JSON.stringify(area)}`);
    return area;
  }
  const chunks = [{ cx: mine.cx, cz: mine.cz }];
  if (state.allowExpand) {
    const extra = claimsNear(entity.dimension, base, ownerId, 4)
      .find((c) => (c.cx !== mine.cx || c.cz !== mine.cz) && !c.entry.worked);
    if (extra) {
      logInfo(TAG, `Ekspansi diizinkan: menambahkan chunk (${extra.cx}, ${extra.cz}) ke area garapan.`);
      chunks.push({ cx: extra.cx, cz: extra.cz });
    }
  }
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const c of chunks) {
    const b = chunkBounds(c.cx, c.cz);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1);
    z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1);
  }
  // Level acuan untuk meratakan seluruh area sebelum dicangkul: rata-rata Y
  // tempat pemain mematok tiap chunk. Tanpa ini, ladang jadi berundak-undak
  // mengikuti kontur tanah asli dan sebagian petak farmland tidak kebagian air.
  const ys = chunks
    .map((c) => getClaim(entity.dimension.id, c.cx, c.cz)?.y)
    .filter((y) => typeof y === "number");
  const flattenY = ys.length
    ? Math.round(ys.reduce((a, b) => a + b, 0) / ys.length)
    : Math.floor(base.y);

  const area = { x0, x1, z0, z1, y: Math.floor(base.y), flattenY, chunks, claimed: true };
  logInfo(TAG, `workArea berpatok (${chunks.length} chunks), flattenY=${flattenY}: ${JSON.stringify(area)}`);
  return area;
}

function areaWidth(area) {
  return area.x1 - area.x0 + 1;
}

function columnAt(area, index) {
  const w = areaWidth(area);
  return { x: area.x0 + (index % w), z: area.z0 + Math.floor(index / w) };
}

function areaSize(area) {
  return areaWidth(area) * (area.z1 - area.z0 + 1);
}

function surfaceAt(dimension, x, z, baseY) {
  for (let y = baseY + 3; y >= baseY - 4; y--) {
    const here = blockAt(dimension, x, y, z);
    const above = blockAt(dimension, x, y + 1, z);
    if (!here || !above) continue;
    if (here.isAir) continue;
    if (CROPS[here.typeId]) continue;
    if (!isAir(above) && !CROPS[above.typeId]) return undefined;
    return here;
  }
  return undefined;
}

const FILL_BLOCK = "minecraft:dirt";
const LEVEL_BUDGET = 6;

// Meratakan satu kolom ke flattenY sebelum boleh dicangkul: kalau tanahnya
// lebih tinggi, kelebihannya dibongkar (gratis, seperti menggali); kalau lebih
// rendah, ditimbun pakai tanah dari peti (kalau ada). Kolom yang belum bisa
// diratakan (kehabisan budget tick ini, atau tidak ada tanah timbun)
// dilewati dulu — daripada dicangkul dalam keadaan jomplang.
function levelColumn(dimension, x, z, targetY, container, budget) {
  const surface = surfaceAt(dimension, x, z, targetY);
  if (!surface) return { block: undefined, used: 0, reason: "none" };
  if (surface.y === targetY) return { block: surface, used: 0, reason: "ok" };

  if (surface.y > targetY) {
    if (budget <= 0) return { block: undefined, used: 0, reason: "budget" };
    let used = 0;
    for (let y = surface.y; y > targetY && used < budget; y--) {
      const b = blockAt(dimension, x, y, z);
      if (!b || b.isAir) continue;
      if (PROTECTED.has(b.typeId)) return { block: undefined, used, reason: "blocked" };
      try {
        b.setType("minecraft:air");
        used++;
      } catch (e) {
        logWarn(TAG, `Gagal meratakan (membongkar) blok di (${x}, ${y}, ${z})`, e);
        return { block: undefined, used, reason: "blocked" };
      }
    }
    logInfo(TAG, `Meratakan kolom (${x}, ${z}): membongkar ${used} blok turun ke Y=${targetY}`);
    return { block: blockAt(dimension, x, targetY, z), used, reason: "ok" };
  }

  if (countIn(container, FILL_BLOCK) < 1) return { block: undefined, used: 0, reason: "need-fill" };
  if (budget <= 0) return { block: undefined, used: 0, reason: "budget" };
  let used = 0;
  for (let y = surface.y + 1; y <= targetY && used < budget; y++) {
    if (takeFrom(container, FILL_BLOCK, 1) !== 1) break;
    const b = blockAt(dimension, x, y, z);
    if (!b) break;
    try {
      b.setType(FILL_BLOCK);
      used++;
    } catch (e) {
      logWarn(TAG, `Gagal meratakan (menimbun) blok di (${x}, ${y}, ${z})`, e);
      putIn(container, makeItem(FILL_BLOCK, 1));
      break;
    }
  }
  if (used) logInfo(TAG, `Meratakan kolom (${x}, ${z}): menimbun ${used} blok naik ke Y=${targetY}`);
  const now = blockAt(dimension, x, targetY, z);
  const done = now?.typeId === FILL_BLOCK;
  return { block: done ? now : undefined, used, reason: done ? "ok" : "need-fill" };
}

function seedsIn(container) {
  const available = Object.keys(SEEDS).filter((id) => countIn(container, id) > 0);
  logDebug(TAG, `Bibit tersedia di peti: [${available.join(", ")}]`);
  return available;
}

function seedForColumn(x, area, available) {
  if (!available.length) return undefined;
  const band = Math.floor((x - area.x0) / BAND_WIDTH);
  const chosen = available[((band % available.length) + available.length) % available.length];
  return chosen;
}

function isChannelColumn(x, area) {
  const off = ((x - area.x0) % 8 + 8) % 8;
  return off === 3;
}

function waterNear(dimension, x, y, z, radius = 8) {
  for (let dx = -radius; dx <= radius; dx += 2) {
    for (let dz = -radius; dz <= radius; dz += 2) {
      for (let dy = -2; dy <= 1; dy++) {
        const block = blockAt(dimension, x + dx, y + dy, z + dz);
        if (block && WATER.has(block.typeId)) return { x: x + dx, y: y + dy, z: z + dz };
      }
    }
  }
  return undefined;
}

function irrigation(entity, state, container, area) {
  logDebug(TAG, "Mengecek fasilitas irigasi...");
  if (!container) return { ok: false, why: "no-chest" };
  const river = waterNear(entity.dimension,
                          Math.floor((area.x0 + area.x1) / 2), area.y,
                          Math.floor((area.z0 + area.z1) / 2), 12);
  if (!river) {
    logDebug(TAG, "Irigasi gagal: tidak ada sumber air alami di sekitar ladang.");
    return { ok: false, why: "no-river" };
  }
  if (countIn(container, BUCKETS) > 0) {
    logDebug(TAG, "Irigasi siap: ember tersedia di peti.");
    return { ok: true, river };
  }
  if (countIn(container, IRON) >= IRON_FOR_BUCKET) {
    logInfo(TAG, "Membuat ember baru dari 3 batang besi di peti...");
    takeFrom(container, IRON, IRON_FOR_BUCKET);
    putIn(container, makeItem("minecraft:bucket", 1));
    sound(entity.dimension, "random.anvil_use", entity.location);
    return { ok: true, river, forged: true };
  }
  logDebug(TAG, "Irigasi gagal: tidak ada ember maupun besi di peti.");
  return { ok: false, why: "no-bucket" };
}

function ripe(block) {
  const crop = CROPS[block?.typeId];
  if (!crop) return false;
  try {
    const age = block.permutation.getState(crop.state);
    const isRipe = age === crop.ripe;
    logDebug(TAG, `Cek kematangan tanaman ${block.typeId}: umur ${age}/${crop.ripe} -> Matang? ${isRipe}`);
    return isRipe;
  } catch (e) {
    logWarn(TAG, `Gagal membaca state kematangan untuk ${block?.typeId}`, e);
    return false;
  }
}

function deliver(entity, container, item) {
  if (!item) return;
  logInfo(TAG, `Mengirimkan hasil panen: ${item.amount}x ${item.typeId}`);
  // Selalu masuk peti stasiun, tidak pernah langsung ke kantong pemain — supaya
  // panen bisa dipakai companion lain (perajin, misalnya) dan pemain tetap bisa
  // melihat hasil kerjanya numpuk di peti alih-alih menghilang ke kantongnya.
  if (container) {
    logDebug(TAG, `Hasil panen disetor ke peti stasiun.`);
    putIn(container, item, entity.dimension, entity.location);
    return;
  }
  logWarn(TAG, "Tidak ada peti stasiun; menjatuhkan hasil panen di tanah.");
  entity.dimension.spawnItem(item, entity.location);
}

function finishHarvest(entity, block, container) {
  const crop = CROPS[block.typeId];
  if (!crop) return undefined;
  logInfo(TAG, `Menyelesaikan panen pada tanaman ${block.typeId} di ${posStr(block)}`);
  let main;
  for (const [id, min, max] of crop.drops) {
    const count = randomBetween(min, max);
    if (count <= 0) continue;
    if (!main) main = id;
    deliver(entity, container, makeItem(id, count));
  }
  try {
    block.setPermutation(block.permutation.withState(crop.state, 0));
    logInfo(TAG, `Tanaman di ${posStr(block)} ditanam ulang ke umur 0.`);
  } catch (e) {
    logWarn(TAG, `Gagal menanam ulang tanaman di ${posStr(block)}`, e);
    return main;
  }
  return main;
}

export function tickFarm(entity, state, owner) {
  logDebug(TAG, `tickFarm dimulai untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  const dimension = entity.dimension;
  // Diambil dari dynamic property entity langsung (bukan owner?.id) supaya
  // patok, permintaan bantuan, dsb. tetap bekerja walau pemiliknya lagi
  // offline — owner cuma object Player yang online, ownerId adalah identitas
  // permanennya.
  const ownerId = getOwnerId(entity);

  const station = ensureStation(entity, state);
  if (!station) {
    logWarn(TAG, "tickFarm: Tidak ada tempat untuk membuat stasiun!");
    return "tidak ada tempat untuk stasiun";
  }
  const container = station.container;

  const held = getGear(entity).mainhand;
  const craft = craftStep(entity, state, "hoe", container, held);
  if (craft === "no-material") {
    maybeRequestHelp(entity, state, ownerId, "hoe", held, station.chest);
    return "peti kosong: butuh kayu, batu, besi, emas atau intan (sudah minta tolong perajin)";
  }
  if (craft === "no-table") return "tidak ada meja kerja dan tidak ada papan di peti";
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

  if (state.job?.kind === "harvest") {
    logDebug(TAG, "Melanjutkan pekerjaan panen yang sedang berlangsung...");
    const status = continueHarvest(entity, state, container);
    writeState(entity, state);
    if (status) return status;
  }

  logDebug(TAG, "Memulai scan ladang untuk pekerjaan baru...");
  const found = scan(entity, state, area, container, ownerId);
  writeState(entity, state);
  return found;
}

function continueHarvest(entity, state, container) {
  const job = state.job;
  const at = job.at;
  const block = blockAt(entity.dimension, at.x, at.y, at.z);
  if (!block || !ripe(block)) {
    logInfo(TAG, `Tanaman di ${posStr(at)} sudah tidak ada/tidak matang lagi. Membatalkan job.`);
    state.job = null;
    return undefined;
  }
  const target = { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };
  const d2 = dist2(entity.location, target);

  if (d2 > REACH ** 2) {
    logDebug(TAG, `Menuju tanaman matang di ${posStr(at)} (${Math.sqrt(d2).toFixed(1)}m > ${REACH}m)`);
    steer(entity, target);
    return "menuju tanaman";
  }

  if (isGreeting(entity)) {
    logDebug(TAG, "Panen dijeda karena companion disapa pemain.");
    job.until = system.currentTick + HARVEST_TICKS;
    return "berhenti karena disapa";
  }

  const now = system.currentTick;
  if (!job.until) {
    face(entity, target);
    job.until = now + HARVEST_TICKS;
    logInfo(TAG, `Mulai animasi panen jongkok sampai tick ${job.until}`);
    hold(entity, HARVEST_TICKS + 8, { pose: POSE.harvest, reason: "harvest" });
    sound(entity.dimension, "dig.grass", target);
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
  return main ? `memanen ${main.replace("minecraft:", "")}` : undefined;
}

function scan(entity, state, area, container, ownerId) {
  const dimension = entity.dimension;
  const total = areaSize(area);
  const plan = state.plan ?? {};
  let cursor = typeof plan.cursor === "number" ? plan.cursor : 0;
  const seeds = seedsIn(container);
  const water = area.claimed ? irrigation(entity, state, container, area) : { ok: false };
  let tilled = 0;
  let planted = 0;
  let leveled = 0;
  let needFill = false;
  let nearest;
  let nearestD = Infinity;

  logDebug(TAG, `Scanning ${SCAN_PER_TICK} kolom mulai index ${cursor} dari total ${total}...`);

  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const { x, z } = columnAt(area, cursor);
    cursor = (cursor + 1) % total;

    let surface;
    if (area.claimed) {
      const result = levelColumn(dimension, x, z, area.flattenY, container, LEVEL_BUDGET - leveled);
      leveled += result.used;
      surface = result.block;
      if (result.reason === "need-fill") needFill = true;
    } else {
      surface = surfaceAt(dimension, x, z, area.y);
    }
    if (!surface) continue;
    if (PROTECTED.has(surface.typeId)) continue;
    const above = blockAt(dimension, x, surface.y + 1, z);

    if (above && ripe(above)) {
      const d = dist2(entity.location, { x: x + 0.5, y: above.y, z: z + 0.5 });
      if (d < nearestD) {
        nearestD = d;
        nearest = { x, y: above.y, z };
      }
      continue;
    }

    if (surface.typeId === "minecraft:farmland") {
      if (!isAir(above) || planted >= 3) continue;
      const seed = seedForColumn(x, area, seeds);
      if (!seed) continue;
      if (takeFrom(container, seed, 1) !== 1) continue;
      try {
        logInfo(TAG, `Menanam ${seed} di (${x}, ${above.y}, ${z})`);
        above.setType(SEEDS[seed]);
        planted++;
        particle(dimension, "minecraft:crop_growth_emitter", { x: x + 0.5, y: above.y + 0.3, z: z + 0.5 });
      } catch (e) {
        logWarn(TAG, `Gagal menanam ${seed}, mengembalikan item ke peti`, e);
        putIn(container, makeItem(seed, 1));
      }
      continue;
    }

    if (!area.claimed || tilled >= 3) continue;
    if (!TILLABLE.has(surface.typeId)) continue;
    if (!isAir(above)) continue;
    const wet = water.ok || waterNear(dimension, x, surface.y, z, 4);
    if (!wet) continue;

    if (water.ok && isChannelColumn(x, area)) {
      try {
        logInfo(TAG, `Menggali parit air di (${x}, ${surface.y}, ${z})`);
        surface.setType("minecraft:water");
        tilled++;
        sound(dimension, "bucket.empty_water", { x, y: surface.y, z });
      } catch (e) {
        logWarn(TAG, "Gagal menaruh air di parit", e);
      }
      continue;
    }
    try {
      logInfo(TAG, `Mencangkul tanah di (${x}, ${surface.y}, ${z}) menjadi farmland.`);
      surface.setType("minecraft:farmland");
      tilled++;
      if (tilled === 1) {
        hold(entity, 16, { pose: POSE.build, reason: "till" });
        sound(dimension, "step.gravel", { x, y: surface.y, z });
      }
    } catch (e) {
      logWarn(TAG, "Gagal mencangkul tanah", e);
    }
  }

  plan.cursor = cursor;
  state.plan = plan;

  if (nearest) {
    logInfo(TAG, `Menemukan tanaman matang terdekat di: ${posStr(nearest)}`);
    plan.idle = 0;
    state.job = { kind: "harvest", at: nearest, until: 0 };
    return "menuju tanaman matang";
  }

  if (tilled || planted || leveled) {
    plan.idle = 0;
    state.plan = plan;
    logDebug(TAG, `Hasil scan: tilled=${tilled}, planted=${planted}, leveled=${leveled}`);
    if (tilled) return "mencangkul dan menggali parit";
    if (planted) return "menanam berpola";
    return "meratakan tanah";
  }

  plan.idle = (plan.idle ?? 0) + 1;
  state.plan = plan;
  logDebug(TAG, `Tidak ada tindakan panen/tanam/cangkul. idle counter = ${plan.idle}`);

  if (area.claimed && needFill) return "butuh tanah di peti untuk meratakan petak rendah";
  if (!seeds.length && area.claimed) return "peti kehabisan bibit";
  if (area.claimed && !water.ok && water.why === "no-bucket") {
    return "butuh ember atau besi di peti untuk mengairi";
  }
  if (area.claimed && !water.ok && water.why === "no-river") {
    return "tidak ada sungai di dekat ladang, tidak bisa melebar";
  }

  if (plan.idle < 3) return "memeriksa ladang";

  const decorated = decorateStep(entity, state, area, container);
  if (decorated) return decorated;

  for (const c of area.chunks) {
    if (markWorked(dimension, c.cx, c.cz)) {
      report(entity, `Chunk (${c.cx}, ${c.cz}) sudah jadi ladang.`);
    }
  }
  return "ladang sudah rapi";
}

export function setExpand(entity, allow) {
  logInfo(TAG, `setExpand dipanggil untuk ${entStr(entity)}: allow=${allow}`);
  patchState(entity, { allowExpand: Boolean(allow) });
}