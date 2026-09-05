/**
 * Mode Merajin: membuatkan alat untuk companion lain yang kehabisan bahan.
 */

import { report, sayFrom } from "./chat.js";
import { bestTier, craftDeliverStep, labelOf } from "./crafting.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { clearRequest, readRequests } from "./requests.js";
import { writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, containerAt, dist2, face, getOwnerId, makeItem, putIn, sound, steer,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CRAFTER";
const REACH = 3.2;

function continueDelivery(entity, state) {
  const job = state.delivering;
  const target = { x: job.to.x + 0.5, y: job.to.y, z: job.to.z + 0.5 };
  const d2 = dist2(entity.location, target);
  if (d2 > REACH ** 2) {
    logDebug(TAG, `Mengantar ${job.item.id} ke ${job.forName} di ${posStr(job.to)}...`);
    steer(entity, target);
    return `mengantar ${labelOf(job.kind)} ke ${job.forName}`;
  }

  const item = makeItem(job.item.id, job.item.amount);
  const targetContainer = containerAt(entity.dimension, job.to);
  if (item) {
    putIn(targetContainer, item, entity.dimension, target);
    logInfo(TAG, `Mengantar ${job.item.id} ke peti ${job.forName} di ${posStr(job.to)}`);
  } else {
    logWarn(TAG, `Gagal membuat ulang ItemStack ${job.item.id} untuk diantar.`);
  }
  face(entity, target);
  hold(entity, 16, { reason: "deliver" });
  sound(entity.dimension, "random.pop", target);
  report(entity, `${labelOf(job.kind)} sudah kuantar ke ${job.forName}.`);
  state.delivering = null;
  return "selesai mengantar";
}

export function tickCrafter(entity, state, owner) {
  logDebug(TAG, `tickCrafter dimulai untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  if (!station) return "tidak ada tempat untuk stasiun";
  const container = station.container;

  if (state.delivering) {
    const status = continueDelivery(entity, state);
    writeState(entity, state);
    return status;
  }

  if (!ownerId) return "tidak ada pemilik untuk dilayani";

  const requests = readRequests(ownerId);
  if (!requests.length) return "menunggu permintaan alat dari companion lain";

  const req = requests[0];
  const tier = bestTier(container, req.kind, req.neededRank - 1);
  if (!tier) {
    return `belum ada bahan untuk ${labelOf(req.kind)} milik ${req.fromName}`;
  }

  const result = craftDeliverStep(entity, state, req.kind, container, tier);
  if (result.status === "no-material") {
    clearRequest(ownerId, req.id);
    writeState(entity, state);
    return "bahan habis di tengah menempa, permintaan dibatalkan";
  }
  if (result.status === "no-table") {
    return "tidak ada meja kerja dan tidak ada papan di peti";
  }
  if (result.status === "walking" || result.status === "crafting") {
    writeState(entity, state);
    return `menempa ${labelOf(req.kind)} untuk ${req.fromName}`;
  }

  // status === "done": mulai mengantar barangnya.
  state.delivering = {
    item: { id: result.item.typeId, amount: result.item.amount },
    to: req.stationPos, forName: req.fromName, kind: req.kind,
  };
  clearRequest(ownerId, req.id);
  writeState(entity, state);
  sayFrom(entity, "crafter");
  logInfo(TAG, `${entStr(entity)} selesai menempa untuk ${req.fromName}, mulai mengantar.`);
  return `${labelOf(req.kind)} selesai, mengantar ke ${req.fromName}`;
}
