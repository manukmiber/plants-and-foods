/**
 * Mode Berdagang.
 *
 * Companion yang membawa kelebihan hasil kerja ke villager terdekat, menukarnya
 * dengan emerald, lalu memakai emerald itu untuk membeli apa yang sedang
 * DIMINTA companion lain di papan permintaan.
 *
 * Kenapa perannya ada: rantai kerja add-on ini berhenti di peti. Petani panen
 * tiga ratus gandum, penambang membawa pulang enam tumpuk batu bulat, dan
 * semuanya menumpuk sampai peti penuh dan hasil kerja berikutnya jatuh ke
 * tanah. Sementara di sisi lain, pembangun kehabisan kaca dan perajin
 * kehabisan besi — barang yang tidak tumbuh di ladang dan tidak selalu ada di
 * tambang. Pedagang yang menyambungkan dua ujung itu.
 *
 * Bagaimana dagangnya bekerja
 * ---------------------------
 * Script API Bedrock yang stabil TIDAK bisa membuka layar dagang villager atau
 * membaca daftar tawarannya. Jadi yang dipakai bukan tawaran villager
 * sungguhan, melainkan DAFTAR HARGA add-on ini sendiri (config » PRICES):
 * companion berjalan ke villager, menawar beberapa detik, lalu barangnya
 * benar-benar berpindah — keluar dari peti, emerald masuk. Villager-nya nyata,
 * jaraknya nyata, waktunya nyata; yang ditiru cuma daftar harganya.
 *
 * Itu disebutkan terang-terangan di sini supaya tidak ada yang mengira add-on
 * ini menyetir UI dagang vanilla. Kalau suatu hari API-nya ada, yang perlu
 * diganti cuma satu fungsi di berkas ini.
 */

import { system } from "@minecraft/server";

import { PRICES, POSE, TRADE, VILLAGERS } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { clearRequest, materialRequests } from "./requests.js";
import { writeState } from "./state.js";
import { ensureStation, stationTravel } from "./station.js";
import {
  alive, containerAt, countIn, dist2, face, getOwnerId, makeItem, prettyItem,
  putIn, sound, steer, summarize, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "TRADER";
const EMERALD = "minecraft:emerald";
const REACH = 3.2;

/* ------------------------------------------------------------------ *
 * Mencari lawan dagang
 * ------------------------------------------------------------------ */

/** Villager terdekat yang masih hidup, dalam jarak jalan kaki. */
function nearestVillager(entity, radius) {
  let best;
  let bestD = Infinity;
  for (const type of VILLAGERS) {
    let found;
    try {
      found = entity.dimension.getEntities({
        type, location: entity.location, maxDistance: radius,
      });
    } catch (e) {
      logDebug(TAG, `getEntities("${type}") gagal di versi ini`, e);
      continue;
    }
    for (const v of found) {
      if (!alive(v)) continue;
      const d = dist2(entity.location, v.location);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Apa yang layak dijual
 * ------------------------------------------------------------------ */

/**
 * Barang di peti yang jumlahnya sudah lewat batas simpan.
 *
 * Batas simpan itu yang membuat pedagang tidak pernah menjual bahan yang
 * masih dibutuhkan sendiri: gandum disimpan cukup untuk bibit dan roti,
 * batu bulat cukup untuk alat dan tungku, dan cuma KELEBIHANNYA yang dibawa
 * ke pasar.
 */
export function surplusIn(container) {
  if (!container) return undefined;
  const have = summarize(container);
  let best;
  for (const [id, price] of Object.entries(PRICES.sell)) {
    const n = have[id] ?? 0;
    const keep = PRICES.keep[id] ?? TRADE.keepDefault;
    const spare = n - keep;
    if (spare < price.lot) continue;
    const lots = Math.min(TRADE.maxLots, Math.floor(spare / price.lot));
    const value = lots * price.emeralds;
    if (!best || value > best.value) {
      best = { id, lots, count: lots * price.lot, value, label: prettyItem(id) };
    }
  }
  if (best) logDebug(TAG, `Kelebihan yang layak dijual: ${best.count}x ${best.id} -> ${best.value} emerald.`);
  return best;
}

/**
 * Pesanan bahan yang bisa DIBELI, bukan dicari di alam.
 *
 * Pencari barang menebang pohon dan menggali batu; ada bahan yang tidak bisa
 * didapat begitu — besi dalam jumlah besar, kaca, bibit yang tidak tumbuh di
 * bioma ini. Itulah yang jadi urusan pedagang.
 */
export function buyableRequest(ownerId, container) {
  const emeralds = countIn(container, EMERALD);
  for (const req of materialRequests(ownerId)) {
    const price = PRICES.buy[req.kind];
    if (!price) continue;
    if (emeralds < price.emeralds) continue;
    return { req, price };
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Satu transaksi
 * ------------------------------------------------------------------ */

/**
 * Menawar: companion berdiri di depan villager beberapa detik sebelum
 * barangnya berpindah.
 *
 * Jedanya bukan hiasan. Tanpa itu, seluruh isi peti berubah jadi emerald dalam
 * satu denyut dan pemain tidak pernah melihat dagangnya terjadi — persis
 * keluhan "semuanya muncul begitu saja" yang membuat versi lama add-on ini
 * terasa curang.
 */
function haggle(entity, state, villager, kind) {
  const at = villager.location;
  if (dist2(entity.location, at) > REACH ** 2) {
    steer(entity, at, 0.4);
    return false;
  }
  face(entity, at);
  if (!state.trade || state.trade.kind !== kind) {
    state.trade = { kind, until: system.currentTick + TRADE.haggleTicks };
    hold(entity, TRADE.haggleTicks, { pose: POSE.talk, reason: "trade" });
    sound(entity.dimension, "mob.villager.haggle", at, { volume: 0.6 });
    return false;
  }
  if (system.currentTick < state.trade.until) return false;
  state.trade = null;
  return true;
}

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

export function tickTrader(entity, state, owner) {
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station.container;
  if (!container) return "tidak ada tempat menyimpan apa pun";

  // Barang yang sudah dibeli diantar dulu ke peti pemesannya.
  if (state.delivering) {
    const status = deliverBought(entity, state);
    if (status) {
      writeState(entity, state);
      return status;
    }
  }

  const trip = stationTravel(entity, station);
  if (trip) {
    writeState(entity, state);
    return trip;
  }

  const villager = nearestVillager(entity, TRADE.searchRadius);
  if (!villager) {
    const now = system.currentTick;
    if (now - (state.noVillagerAt ?? -TRADE.complainEvery) > TRADE.complainEvery) {
      state.noVillagerAt = now;
      logInfo(TAG, `${entStr(entity)} tidak menemukan villager dalam ${TRADE.searchRadius} blok.`);
      report(entity, "Tidak ada villager di sekitar sini. Aku butuh desa untuk berdagang.");
    }
    writeState(entity, state);
    return "tidak ada villager di sekitar — dagang berhenti";
  }

  // 1. MEMBELI didahulukan: ada companion yang sedang menunggu bahannya.
  const order = buyableRequest(ownerId, container);
  if (order) {
    const status = doBuy(entity, state, container, villager, order, ownerId);
    writeState(entity, state);
    return status;
  }

  // 2. MENJUAL kelebihan.
  const spare = surplusIn(container);
  if (spare) {
    const status = doSell(entity, state, container, villager, spare);
    writeState(entity, state);
    return status;
  }

  writeState(entity, state);
  const purse = countIn(container, EMERALD);
  return purse
    ? `tidak ada yang perlu dijual atau dibeli (${purse} emerald di peti)`
    : "tidak ada kelebihan untuk dijual";
}

function doSell(entity, state, container, villager, spare) {
  if (!haggle(entity, state, villager, `sell:${spare.id}`)) {
    return `menawarkan ${spare.count}x ${spare.label} ke villager`;
  }
  const taken = takeFrom(container, spare.id, spare.count);
  if (taken !== spare.count) {
    if (taken > 0) putIn(container, makeItem(spare.id, taken));
    logWarn(TAG, `Barang jualan berkurang di tengah tawar-menawar; batal.`);
    return "barang jualannya keburu diambil, dagang dibatalkan";
  }
  putIn(container, makeItem(EMERALD, spare.value));
  sound(entity.dimension, "mob.villager.yes", villager.location);
  logInfo(TAG, `${entStr(entity)} menjual ${spare.count}x ${spare.id} seharga ${spare.value} emerald.`);
  report(entity, `${spare.count} ${spare.label} laku ${spare.value} emerald.`);
  sayFrom(entity, "trader");
  return `menjual ${spare.count}x ${spare.label} (${spare.value} emerald)`;
}

function doBuy(entity, state, container, villager, order, ownerId) {
  const { req, price } = order;
  if (!haggle(entity, state, villager, `buy:${req.kind}`)) {
    return `menawar ${price.label} untuk ${req.fromName}`;
  }
  if (takeFrom(container, EMERALD, price.emeralds) !== price.emeralds) {
    return "emeraldnya keburu diambil, pembelian dibatalkan";
  }
  sound(entity.dimension, "mob.villager.yes", villager.location);
  logInfo(TAG, `${entStr(entity)} membeli ${price.count}x ${price.id} untuk ${req.fromName}.`);

  // Barangnya diantar ke peti si pemesan, bukan ditinggal di peti sendiri —
  // pemesannya sedang menunggu di tempat kerjanya.
  state.delivering = {
    item: { id: price.id, amount: price.count },
    to: req.stationPos, forName: req.fromName, kind: req.kind,
    label: prettyItem(price.id),
  };
  clearRequest(ownerId, req.id);
  report(entity, `${price.label} untuk ${req.fromName} sudah kubeli, kuantar sekarang.`);
  return `membeli ${price.count}x ${price.label} untuk ${req.fromName}`;
}

function deliverBought(entity, state) {
  const job = state.delivering;
  const target = { x: job.to.x + 0.5, y: job.to.y, z: job.to.z + 0.5 };
  if (dist2(entity.location, target) > REACH ** 2) {
    steer(entity, target, 0.4);
    return `mengantar ${job.label} ke ${job.forName}`;
  }
  const box = containerAt(entity.dimension, job.to);
  const item = makeItem(job.item.id, job.item.amount);
  if (item) putIn(box, item, entity.dimension, target);
  else logWarn(TAG, `Gagal membuat ulang ${job.item.id} untuk diantar.`);
  face(entity, target);
  hold(entity, 16, { reason: "deliver" });
  sound(entity.dimension, "random.pop", target);
  logInfo(TAG, `${entStr(entity)} mengantar ${job.item.amount}x ${job.item.id} ke ${posStr(job.to)}.`);
  state.delivering = null;
  return `${job.label} sudah diantar ke ${job.forName}`;
}

/** Ringkasan untuk menu dan buku. */
export function traderLines(container) {
  const purse = countIn(container, EMERALD);
  const spare = surplusIn(container);
  return [
    `§7Emerald di peti: §a${purse}`,
    spare
      ? `§7Siap dijual: §f${spare.count}x ${spare.label} §7(§a${spare.value} emerald§7)`
      : "§8Belum ada kelebihan yang layak dijual.",
  ];
}

export { EMERALD };
