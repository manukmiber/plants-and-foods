/**
 * Mode Merajin.
 *
 * Perajin membaca papan permintaan (requests.js) milik pemilik yang sama dan
 * mengerjakan dua jenis pesanan:
 *
 *   "tool"  alat untuk companion lain — ditempa TEPAT satu tingkat di atas
 *           alat yang sedang dipegang pemesannya, jadi urutan kayu -> batu ->
 *           besi tetap dilalui dan tidak ada yang tiba-tiba dapat beliung besi
 *   "item"  barang jadi: ember, peti, papan nama, meja kerja, obor
 *
 * Kalau bahannya kurang, perajin sendiri yang memasang permintaan bahan ke
 * pencari barang — jadi rantainya lengkap: pencari barang -> perajin ->
 * petani/penambang/pembangun.
 */

import { system } from "@minecraft/server";

import { FAMILY, ITEM_RECIPES, TOOL_TIERS } from "./config.js";
import { report, sayFrom } from "./chat.js";
import {
  askForTier, bestTier, craftDeliverStep, craftItemStep, ensureFurnace,
  ensureTable, labelOf, nextTierFor, tierName, toolId, toolRank,
} from "./crafting.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { displayName } from "./nametag.js";
import { clearRequest, craftRequests } from "./requests.js";
import { ensureMaterial } from "./selfhelp.js";
import { pickSmelt, smeltStep } from "./smelting.js";
import { readState, writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, allCompanions, containerAt, countIn, dist2, face, getGear, getMode,
  getOwnerId, makeItem, putIn, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CRAFTER";
const REACH = 3.2;

// Mode yang benar-benar MEMAKAI alat lewat craftStep. Cuma dua ini yang boleh
// dibuatkan alat tanpa diminta: menempa kapak untuk companion yang tidak
// pernah memakainya sama saja dengan membuang besi.
const TOOL_FOR_MODE = { farm: "hoe", mine: "pickaxe" };

// Menyapu blok mencari tungku itu mahal. Selama belum ada satu pun, percobaan
// berikutnya ditahan sebentar supaya perajin yang menganggur tidak menyapu
// halaman tiap denyut.
const FURNACE_RETRY = 200;

function continueDelivery(entity, state) {
  const job = state.delivering;
  const target = { x: job.to.x + 0.5, y: job.to.y, z: job.to.z + 0.5 };
  const d2 = dist2(entity.location, target);
  if (d2 > REACH ** 2) {
    logDebug(TAG, `Mengantar ${job.item.id} ke ${job.forName} di ${posStr(job.to)} (${Math.sqrt(d2).toFixed(1)}m)`);
    steer(entity, target, 0.4);
    return `mengantar ${job.label ?? labelOf(job.kind)} ke ${job.forName}`;
  }

  const item = makeItem(job.item.id, job.item.amount);
  const targetContainer = containerAt(entity.dimension, job.to);
  if (!targetContainer) {
    logWarn(TAG, `Peti tujuan di ${posStr(job.to)} tidak ada lagi; barang dijatuhkan di situ.`);
  }
  if (item) {
    putIn(targetContainer, item, entity.dimension, target);
    logInfo(TAG, `${entStr(entity)} mengantar ${job.item.amount}x ${job.item.id} ke peti ${job.forName}.`);
  } else {
    logWarn(TAG, `Gagal membuat ulang ItemStack ${job.item.id} untuk diantar.`);
  }
  face(entity, target);
  hold(entity, 16, { reason: "deliver" });
  sound(entity.dimension, "random.pop", target);
  report(entity, `${job.label ?? labelOf(job.kind)} sudah kuantar ke ${job.forName}.`);
  state.delivering = null;
  return "selesai mengantar";
}

/** Pesanan alat. */
function serveTool(entity, state, container, req, ownerId, station) {
  const wanted = nextTierFor(req.neededRank - 1);
  if (!wanted) {
    logInfo(TAG, `${req.fromName} sudah di tingkat tertinggi untuk ${req.kind}; permintaan dibuang.`);
    clearRequest(ownerId, req.id);
    return `${req.fromName} sudah pegang alat tingkat tertinggi`;
  }
  const tier = bestTier(container, req.kind, req.neededRank - 1);
  if (!tier) {
    const ask = askForTier(wanted);
    const own = ensureMaterial(entity, state, ownerId, ask,
                               station.chest ?? state.station, container, { search: true });
    logDebug(TAG, `Bahan ${wanted.key} untuk ${req.kind} belum ada; minta "${ask}" ke pencari barang.`);
    return own ?? `menunggu bahan ${tierName(wanted.key)} untuk ${labelOf(req.kind)} milik ${req.fromName}`;
  }

  const result = craftDeliverStep(entity, state, req.kind, container, tier);
  if (result.status === "no-material") {
    clearRequest(ownerId, req.id);
    writeState(entity, state);
    return "bahan habis di tengah menempa, pesanan dibatalkan";
  }
  if (result.status === "no-table") {
    const own = ensureMaterial(entity, state, ownerId, "wood",
                               station.chest ?? state.station, container);
    return own ?? "butuh meja kerja untuk menempa";
  }
  if (result.status === "walking" || result.status === "crafting") {
    writeState(entity, state);
    return `menempa ${tierName(tier.key)} ${labelOf(req.kind)} untuk ${req.fromName}`;
  }

  state.delivering = {
    item: { id: result.item.typeId, amount: result.item.amount },
    to: req.stationPos, forName: req.fromName, kind: req.kind,
    label: `${tierName(tier.key)} ${labelOf(req.kind)}`,
  };
  clearRequest(ownerId, req.id);
  writeState(entity, state);
  sayFrom(entity, "crafter");
  report(entity, `${tierName(tier.key)} ${labelOf(req.kind)} untuk ${req.fromName} sudah jadi, kuantar sekarang.`);
  return `${labelOf(req.kind)} selesai, mengantar ke ${req.fromName}`;
}

/** Pesanan barang jadi (ember, peti, papan nama, meja kerja, obor). */
function serveItem(entity, state, container, req, ownerId, station) {
  const recipe = ITEM_RECIPES[req.kind];
  if (!recipe) {
    logWarn(TAG, `Pesanan barang "${req.kind}" tidak dikenal; dibuang dari papan.`);
    clearRequest(ownerId, req.id);
    return "pesanan tidak dikenal, dibuang";
  }

  // Kalau barangnya sudah ada di peti perajin, tidak perlu menempa lagi.
  if (countIn(container, recipe.id) > 0 && takeFrom(container, recipe.id, 1) === 1) {
    state.delivering = {
      item: { id: recipe.id, amount: 1 },
      to: req.stationPos, forName: req.fromName, kind: req.kind, label: recipe.label,
    };
    clearRequest(ownerId, req.id);
    writeState(entity, state);
    logInfo(TAG, `${recipe.label} sudah ada di peti, langsung diantar ke ${req.fromName}.`);
    return `mengantar ${recipe.label} ke ${req.fromName}`;
  }

  const made = craftItemStep(entity, state, req.kind, container);
  if (made.status === "walking" || made.status === "crafting") {
    writeState(entity, state);
    return `merakit ${recipe.label} untuk ${req.fromName}`;
  }
  if (made.status === "no-table") {
    const own = ensureMaterial(entity, state, ownerId, "wood",
                               station.chest ?? state.station, container);
    return own ?? "butuh meja kerja untuk merakit pesanan";
  }
  if (made.status !== "done") {
    const ask = made.missing ?? recipe.ask;
    const own = ensureMaterial(entity, state, ownerId, ask,
                               station.chest ?? state.station, container);
    logDebug(TAG, `Bahan ${recipe.label} kurang (${ask}); permintaan bahan dipasang.`);
    return own ?? `menunggu bahan ${ask} untuk ${recipe.label} milik ${req.fromName}`;
  }

  takeFrom(container, recipe.id, 1);
  state.delivering = {
    item: { id: recipe.id, amount: 1 },
    to: req.stationPos, forName: req.fromName, kind: req.kind, label: recipe.label,
  };
  clearRequest(ownerId, req.id);
  writeState(entity, state);
  sayFrom(entity, "crafter");
  report(entity, `${recipe.label} pesanan ${req.fromName} sudah jadi.`);
  return `${recipe.label} selesai, mengantar ke ${req.fromName}`;
}

/**
 * Companion lain milik pemilik yang sama yang alatnya masih bisa dinaikkan
 * satu tingkat — dipakai perajin yang sedang tidak punya pesanan.
 *
 * Papan permintaan tetap jalan seperti biasa; ini cuma menutup celahnya.
 * Permintaan alat baru dipasang kalau petani/penambang KEBETULAN sedang
 * memeriksa alatnya, punya jeda sepuluh detik, dan hangus sesudah dua puluh
 * menit — jadi perajin sering berdiri menganggur di samping meja kerjanya
 * sementara petani di seberang halaman masih menggaruk tanah dengan tangan.
 */
function nextToolOrder(entity, ownerId) {
  for (const other of allCompanions(FAMILY)) {
    if (!alive(other) || other.id === entity.id) continue;
    if (getOwnerId(other) !== ownerId) continue;
    const kind = TOOL_FOR_MODE[getMode(other)];
    if (!kind) continue;
    const rank = toolRank(getGear(other).mainhand, kind);
    if (!nextTierFor(rank)) continue;          // sudah tingkat tertinggi
    const station = readState(other).station;
    if (!station) continue;                    // petinya belum ada, nanti saja

    // Sudah ada alat yang menunggu diambil di petinya? Jangan menempa lagi.
    // Tanpa penjagaan ini perajin menumpuk cangkul demi cangkul di peti yang
    // sama selama pemiliknya belum sempat mengambil satu pun.
    const box = containerAt(other.dimension, station);
    if (box && TOOL_TIERS.some((t) => t.rank > rank && countIn(box, toolId(t.key, kind)) > 0)) {
      logDebug(TAG, `${displayName(other)} sudah punya ${kind} menunggu di petinya; tidak ditempa lagi.`);
      continue;
    }
    logDebug(TAG, `${displayName(other)} masih di tingkat ${rank} untuk ${kind}; dibuatkan tanpa diminta.`);
    return {
      id: `auto-${other.id}-${kind}`, type: "tool", kind,
      neededRank: rank + 1, stationPos: station, fromName: displayName(other),
    };
  }
  return undefined;
}

/**
 * Yang dikerjakan perajin saat papan pesanan kosong.
 *
 * Urutannya sengaja begini: membakar dulu apa yang menumpuk (tanpa tungku,
 * bijih besi berhenti jadi raw_iron dan tidak ada satu pun companion yang
 * pernah naik ke alat besi), lalu menempa alat untuk companion lain, dan
 * TERAKHIR menyiapkan tungku untuk nanti.
 *
 * Tungku sengaja paling belakang: kalau dipasang paling depan, perajin yang
 * kebetulan tidak punya batu akan berdiri menunggu batu selamanya sambil
 * membiarkan petani di seberang halaman menggaruk tanah dengan tangan.
 */
function idleWork(entity, state, container, ownerId, station) {
  const near = state.station ?? entity.location;
  const drop = station.chest ?? state.station;

  // 1. Membakar. Tungkunya ikut dipasang di dalam smeltStep kalau belum ada.
  const oven = pickSmelt(container);
  if (oven) {
    const burn = smeltStep(entity, state, container, near);
    if (burn.status === "walking") return `menuju tungku untuk melebur ${oven.label}`;
    if (burn.status === "smelting") return `melebur ${oven.label} di tungku`;
    if (burn.status === "done") {
      report(entity, `Satu ${oven.label} sudah jadi di tungku.`);
      return `${oven.label} selesai dilebur`;
    }
    if (burn.status === "no-furnace" || burn.status === "no-fuel") {
      const need = burn.status === "no-fuel" ? "coal" : (burn.missing ?? "stone");
      const own = ensureMaterial(entity, state, ownerId, need, drop, container, { search: true });
      if (own) return own;
      // Ada pencari barang yang akan mengantarnya: jangan berdiri menunggu,
      // masih ada alat yang bisa ditempa sementara menunggu kirimannya.
    }
  }

  // 2. Menempa alat untuk companion lain, tanpa menunggu diminta.
  const order = nextToolOrder(entity, ownerId);
  if (order) return serveTool(entity, state, container, order, ownerId, station);

  // 3. Benar-benar tidak ada pekerjaan: siapkan tungku untuk nanti.
  const now = system.currentTick;
  if (now - (state.furnaceTry ?? -FURNACE_RETRY) < FURNACE_RETRY) return undefined;
  state.furnaceTry = now;
  const furnace = ensureFurnace(entity, container, {
    x: Math.floor(near.x), y: Math.floor(near.y), z: Math.floor(near.z),
  });
  if (furnace.at) return undefined;
  if (furnace.why === "no-material") {
    const own = ensureMaterial(entity, state, ownerId, furnace.missing ?? "stone",
                               drop, container, { search: true });
    return own ?? `menunggu ${furnace.missing ?? "batu"} untuk tungku`;
  }
  logDebug(TAG, `Tungku belum bisa dipasang (${furnace.why}); dicoba lagi nanti.`);
  return undefined;
}

export function tickCrafter(entity, state, owner) {
  logDebug(TAG, `tickCrafter untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station.container;
  if (!container) return "tidak ada peti maupun kantong";
  if (station.missing) {
    const own = ensureMaterial(entity, state, ownerId, station.missing,
                               station.chest ?? state.station, container);
    if (own) {
      writeState(entity, state);
      return own;
    }
  }

  if (state.delivering) {
    const status = continueDelivery(entity, state);
    writeState(entity, state);
    return status;
  }

  if (!ownerId) return "belum dijinakkan, tidak ada yang dilayani";

  // Meja kerja adalah alat kerja utama perajin: kalau di sekitar tidak ada
  // satu pun, dialah yang membuatnya — asal punya kayunya.
  const table = ensureTable(entity, container, state.station ?? entity.location);
  if (!table.at) {
    const need = table.missing ?? "wood";
    const own = ensureMaterial(entity, state, ownerId, need,
                               station.chest ?? state.station, container, { search: true });
    logInfo(TAG, `${entStr(entity)} belum bisa menyiapkan meja kerja (${table.why}).`);
    writeState(entity, state);
    return own ?? "belum ada meja kerja: minta kayu ke pencari barang";
  }

  const pending = craftRequests(ownerId);
  if (!pending.length) {
    const spare = idleWork(entity, state, container, ownerId, station);
    // Ditulis walau tidak ada yang dikerjakan: idleWork mencatat kapan tungku
    // terakhir dicoba, dan catatan itulah yang menahan sapuan blok berikutnya.
    writeState(entity, state);
    if (spare) return spare;
    logDebug(TAG, "Tidak ada pesanan; perajin berjaga di dekat meja kerjanya.");
    const spot = { x: table.at.x + 1.5, y: table.at.y, z: table.at.z + 0.5 };
    if (dist2(entity.location, spot) > 9) steer(entity, spot, 0.28);
    return "menunggu pesanan di dekat meja kerja";
  }

  const req = pending[0];
  logInfo(TAG, `Mengerjakan pesanan ${req.type}/${req.kind} dari ${req.fromName}.`);
  return req.type === "item"
    ? serveItem(entity, state, container, req, ownerId, station)
    : serveTool(entity, state, container, req, ownerId, station);
}
