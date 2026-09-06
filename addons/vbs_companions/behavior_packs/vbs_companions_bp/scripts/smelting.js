/**
 * Tungku: bijih mentah jadi batangan, kayu jadi arang, daging jadi masakan.
 *
 * Ini menutup mata rantai yang selama ini putus. Penambang menggali
 * `iron_ore`, gather.js menjatuhkannya sebagai `raw_iron`, pencari barang
 * mengantarnya, permintaan bahan "besi" dianggap TERPENUHI — lalu berhenti di
 * situ selamanya, karena TOOL_TIERS tingkat besi cuma menerima
 * `minecraft:iron_ingot`. Tanpa tungku, tidak ada satu pun companion yang bisa
 * naik dari alat batu ke alat besi, berapa pun banyak bijih yang digali.
 *
 * Arang juga penting, bukan pelengkap: obor penambang butuh arang atau batu
 * bara, dan companion yang menggali di kedalaman tanpa obor bekerja dalam
 * gelap. Kayu dibakar jadi arang hanya kalau memang tidak ada batu bara sama
 * sekali dan kayunya berlebih — jangan sampai kayu untuk alat malah habis
 * terbakar.
 */

import { system } from "@minecraft/server";
import { LOGS, PLANKS, POSE } from "./config.js";
import { hold } from "./hold.js";
import { ensureWorkBlock, workBlockStillThere } from "./workshop.js";
import {
  alive, countIn, dist2, face, makeItem, particle, putIn, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "SMELT";
const REACH = 3.2;
const SMELT_TICKS = 60;

// Kayu baru boleh dibakar jadi arang kalau stoknya memang berlebih. Angkanya
// dipasang di atas kebutuhan meja kerja (4 papan) + peti (8 papan) supaya
// pekerjaan yang lebih penting tidak pernah kekurangan gara-gara arang.
const LOG_SPARE = 8;
const PLANK_SPARE = 12;

/**
 * Apa jadi apa. Urutannya berarti: yang di atas dikerjakan lebih dulu.
 *
 * Kentang dan wortel sengaja TIDAK ada di sini walaupun bisa dibakar — petani
 * memakainya sebagai bibit, dan tungku yang memanggang persediaan bibit
 * membuat ladang berhenti tanpa ada yang tahu sebabnya.
 */
export const SMELT = [
  { from: ["minecraft:raw_iron", "minecraft:iron_ore", "minecraft:deepslate_iron_ore"],
    to: "minecraft:iron_ingot", label: "besi batangan" },
  { from: ["minecraft:raw_gold", "minecraft:gold_ore", "minecraft:deepslate_gold_ore"],
    to: "minecraft:gold_ingot", label: "emas batangan" },
  { from: ["minecraft:raw_copper", "minecraft:copper_ore", "minecraft:deepslate_copper_ore"],
    to: "minecraft:copper_ingot", label: "tembaga batangan" },
  { from: ["minecraft:beef"], to: "minecraft:cooked_beef", label: "daging sapi matang" },
  { from: ["minecraft:porkchop"], to: "minecraft:cooked_porkchop", label: "daging babi matang" },
  { from: ["minecraft:chicken"], to: "minecraft:cooked_chicken", label: "ayam matang" },
  { from: ["minecraft:mutton"], to: "minecraft:cooked_mutton", label: "daging domba matang" },
  { from: ["minecraft:cod"], to: "minecraft:cooked_cod", label: "ikan matang" },
  { from: ["minecraft:salmon"], to: "minecraft:cooked_salmon", label: "salmon matang" },
];

const COAL = ["minecraft:coal", "minecraft:charcoal"];
const CHARCOAL_JOB = { from: LOGS, to: "minecraft:charcoal", label: "arang" };

// Urut dari yang paling boleh dibakar. Batu bara dulu, kayu paling akhir.
const FUEL = [
  { ids: ["minecraft:charcoal"], charges: 8, spare: 1 },
  { ids: ["minecraft:coal"], charges: 8, spare: 1 },
  { ids: ["minecraft:coal_block"], charges: 80, spare: 1 },
  { ids: PLANKS, charges: 1, spare: PLANK_SPARE },
  { ids: LOGS, charges: 6, spare: LOG_SPARE },
];

/** Ada yang bisa dibakar di peti? Balikannya pekerjaan pertama yang cocok. */
export function pickSmelt(container) {
  if (!container) return undefined;
  for (const job of SMELT) {
    if (countIn(container, job.from) > 0) return job;
  }
  // Arang: hanya kalau memang tidak ada batu bara sama sekali DAN kayunya
  // berlebih. Selebihnya kayu lebih berharga sebagai papan dan stik.
  if (countIn(container, COAL) === 0 && countIn(container, LOGS) > LOG_SPARE) {
    return CHARCOAL_JOB;
  }
  return undefined;
}

/** Bahan bakar yang boleh dipakai sekarang, tanpa menghabiskan stok penting. */
function pickFuel(container, job) {
  for (const fuel of FUEL) {
    // Kayu tidak boleh jadi bahan bakar untuk membakar kayu itu sendiri kalau
    // stoknya cuma pas — itu memakan lebih banyak kayu daripada arang yang jadi.
    if (job.to === "minecraft:charcoal" && (fuel.ids === LOGS || fuel.ids === PLANKS)) {
      if (countIn(container, fuel.ids) <= fuel.spare * 2) continue;
    }
    if (countIn(container, fuel.ids) > fuel.spare) return fuel;
  }
  return undefined;
}

/**
 * Satu denyut membakar di tungku.
 *
 * Balikan: { status } dengan status
 *   "nothing"     tidak ada yang perlu dibakar
 *   "no-chest"    tidak ada peti maupun kantong
 *   "no-furnace"  tungkunya belum ada; `missing` menyebut bahan yang kurang
 *   "no-fuel"     tungku ada tapi tidak ada bahan bakar yang boleh dipakai
 *   "walking"     sedang berjalan ke tungku
 *   "smelting"    sedang membakar
 *   "done"        satu barang jadi, `id` dan `label` menyebut apa
 */
export function smeltStep(entity, state, container, near) {
  if (!alive(entity)) return { status: "no-chest" };
  if (!container) return { status: "no-chest" };

  let job = state.smelt;
  if (!job) {
    const next = pickSmelt(container);
    if (!next) return { status: "nothing" };
    job = { from: next.from, to: next.to, label: next.label, at: null, until: 0, charges: 0 };
    state.smelt = job;
    logInfo(TAG, `${entStr(entity)} akan membakar ${next.label}.`);
  }

  // Barangnya keburu diambil companion lain: batalkan, jangan berdiri menunggu.
  if (countIn(container, job.from) === 0) {
    logDebug(TAG, `Bahan untuk ${job.label} sudah habis dari peti; pekerjaan tungku dibatalkan.`);
    state.smelt = null;
    return { status: "nothing" };
  }

  if (!job.at || !workBlockStillThere(entity, "furnace", job.at)) {
    const spot = near ?? state.station ?? entity.location;
    const furnace = ensureWorkBlock(entity, container, {
      x: Math.floor(spot.x), y: Math.floor(spot.y), z: Math.floor(spot.z),
    }, "furnace");
    if (!furnace.at) {
      logDebug(TAG, `${entStr(entity)} belum punya tungku (${furnace.why}); butuh ${furnace.missing ?? "batu"}.`);
      return { status: "no-furnace", missing: furnace.missing ?? "stone" };
    }
    job.at = furnace.at;
    job.until = 0;
    return { status: "walking" };
  }

  const target = { x: job.at.x + 0.5, y: job.at.y, z: job.at.z + 0.5 };
  if (dist2(entity.location, target) > REACH ** 2) {
    steer(entity, target, 0.36);
    return { status: "walking" };
  }
  face(entity, target);

  if (!job.charges) {
    const fuel = pickFuel(container, job);
    if (!fuel) {
      logDebug(TAG, `Tungku di ${posStr(job.at)} tidak punya bahan bakar yang boleh dipakai.`);
      return { status: "no-fuel" };
    }
    const burnt = takeFrom(container, fuel.ids, 1);
    if (burnt !== 1) return { status: "no-fuel" };
    job.charges = fuel.charges;
    sound(entity.dimension, "fire.ignite", target, { volume: 0.4 });
    logInfo(TAG, `Tungku dinyalakan dengan ${fuel.ids[0]} (${fuel.charges} kali bakar).`);
  }

  const now = system.currentTick;
  if (!job.until) {
    job.until = now + SMELT_TICKS;
    hold(entity, SMELT_TICKS + 4, { pose: POSE.build, reason: "smelt" });
    return { status: "smelting" };
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:basic_flame_particle",
             { x: target.x, y: job.at.y + 1.1, z: target.z });
    return { status: "smelting" };
  }

  job.until = 0;
  if (takeFrom(container, job.from, 1) !== 1) {
    logWarn(TAG, `Bahan ${job.label} hilang dari peti tepat saat pembakaran selesai.`);
    state.smelt = null;
    return { status: "nothing" };
  }
  job.charges -= 1;
  putIn(container, makeItem(job.to, 1), entity.dimension, target);
  sound(entity.dimension, "random.fizz", target, { volume: 0.4 });
  particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: job.at.y + 1.3, z: target.z });
  logInfo(TAG, `${entStr(entity)} membakar satu ${job.label} di tungku ${posStr(job.at)}.`);

  // Masih ada lagi? Biarkan pekerjaannya berjalan terus, tungkunya sudah panas.
  if (countIn(container, job.from) === 0) state.smelt = null;
  return { status: "done", id: job.to, label: job.label };
}

/** Bahan yang tinggal dibakar supaya jadi ini — untuk yang menunggu "iron". */
export function smeltableFor(container, kind) {
  if (!container) return undefined;
  const want = kind === "iron" ? "minecraft:iron_ingot"
    : kind === "coal" ? "minecraft:charcoal"
      : undefined;
  if (!want) return undefined;
  if (want === "minecraft:charcoal") {
    return countIn(container, LOGS) > LOG_SPARE ? CHARCOAL_JOB : undefined;
  }
  const job = SMELT.find((r) => r.to === want);
  return job && countIn(container, job.from) > 0 ? job : undefined;
}
