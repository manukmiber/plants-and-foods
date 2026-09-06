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

import { ITEM_RECIPES } from "./config.js";
import { report, sayFrom } from "./chat.js";
import {
  askForTier, bestTier, craftDeliverStep, craftItemStep, ensureTable, labelOf,
  nextTierFor, tierName,
} from "./crafting.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { clearRequest, craftRequests } from "./requests.js";
import { ensureMaterial } from "./selfhelp.js";
import { writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, containerAt, countIn, dist2, face, getOwnerId, makeItem, putIn, sound,
  steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CRAFTER";
const REACH = 3.2;

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
