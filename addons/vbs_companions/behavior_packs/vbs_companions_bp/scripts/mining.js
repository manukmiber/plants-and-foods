/**
 * Mode menambang.
 */

import { system } from "@minecraft/server";
import { DIGGABLE, ORES, POSE, PROTECTED } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { craftStep } from "./crafting.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, blockAt, dist2, face, getGear, isAir, isSolid, makeItem, particle,
  putIn, sound, steer,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "MINING";
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TORCH_EVERY = 8;
const BRANCH_EVERY = 3;
const BRANCH_LENGTH = 8;
const BAG_LIMIT = 96;
const REACH = 4.0;
const DIG_PER_TICK = 2;
const LAVA = new Set(["minecraft:lava", "minecraft:flowing_lava"]);

function targetDepth(dimensionId) {
  if (dimensionId === "minecraft:nether") return 14;
  if (dimensionId === "minecraft:the_end") return 20;
  return -54;
}

function bagCount(bag) {
  return Object.values(bag).reduce((a, b) => a + b, 0);
}

function addToBag(state, id, amount = 1) {
  state.bag[id] = (state.bag[id] ?? 0) + amount;
  logDebug(TAG, `Menambah item ke tas mining: +${amount} ${id} (total item tipe ini: ${state.bag[id]})`);
}

function diggable(block) {
  if (!block) return false;
  try {
    if (block.isAir) return true;
    if (PROTECTED.has(block.typeId) || LAVA.has(block.typeId)) return false;
    return DIGGABLE.has(block.typeId);
  } catch {
    return false;
  }
}

function lavaNear(dimension, x, y, z) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
                              [0, 1, 0], [0, -1, 0], [0, 2, 0]]) {
    const block = blockAt(dimension, x + dx, y + dy, z + dz);
    if (block && LAVA.has(block.typeId)) {
      logWarn(TAG, `LAVA terdeteksi di sekitar (${x + dx}, ${y + dy}, ${z + dz})!`);
      return true;
    }
  }
  return false;
}

function dig(entity, state, block) {
  if (!block || block.isAir) return false;
  const id = block.typeId;
  logDebug(TAG, `Menggali blok ${id} di ${posStr(block)}`);
  try {
    block.setType("minecraft:air");
  } catch (e) {
    logWarn(TAG, `Gagal setType air pada blok di ${posStr(block)}`, e);
    return false;
  }
  const ore = ORES[id];
  if (ore) {
    logInfo(TAG, `BIJIH DITEMUKAN: ${id} -> Menghasilkan ${ore}`);
    addToBag(state, ore, 1);
    particle(entity.dimension, "minecraft:villager_happy", { x: block.x + 0.5, y: block.y + 0.6, z: block.z + 0.5 });
    sound(entity.dimension, "random.orb", block.location, { volume: 0.4 });
  } else if ((state.bag["minecraft:cobblestone"] ?? 0) < 32 &&
             (id === "minecraft:stone" || id === "minecraft:cobblestone")) {
    addToBag(state, "minecraft:cobblestone", 1);
  }
  return true;
}

function torchAt(entity, state, x, y, z) {
  if ((state.bag["minecraft:torch"] ?? 0) < 1) return false;
  const spot = blockAt(entity.dimension, x, y, z);
  const floor = blockAt(entity.dimension, x, y - 1, z);
  if (!isAir(spot) || !isSolid(floor)) return false;
  try {
    spot.setType("minecraft:torch");
    logInfo(TAG, `Obor dipasang di (${x}, ${y}, ${z})`);
  } catch {
    return false;
  }
  state.bag["minecraft:torch"] -= 1;
  if (state.bag["minecraft:torch"] <= 0) delete state.bag["minecraft:torch"];
  return true;
}

function freshPlan(entity) {
  const at = entity.location;
  const dir = Math.floor(Math.random() * 4);
  const plan = {
    phase: "descend",
    x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z),
    dir, step: 0, branch: 0, branchSide: 1, branchStep: 0,
  };
  logInfo(TAG, `Rencana mining baru dibuat untuk ${entStr(entity)}: ${JSON.stringify(plan)}`);
  return plan;
}

export function tickMine(entity, state, owner) {
  logDebug(TAG, `tickMine dimulai untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const dimension = entity.dimension;
  const station = ensureStation(entity, state);
  const container = station?.container;

  const held = getGear(entity).mainhand;
  const craft = craftStep(entity, state, "pickaxe", container, held);
  if (craft === "no-material") return "peti kosong: butuh bahan untuk beliung";
  if (craft === "no-table") return "tidak ada meja kerja dan tidak ada papan di peti";
  if (craft === "walking" || craft === "crafting") {
    writeState(entity, state);
    return "membuat beliung";
  }
  if (craft === "done") {
    writeState(entity, state);
    sayFrom(entity, "done");
    return "beliung baru selesai";
  }

  if (container && (state.bag["minecraft:torch"] ?? 0) === 0) {
    const taken = takeTorches(container);
    if (taken) {
      logInfo(TAG, `Mengambil ${taken} obor dari peti stasiun.`);
      addToBag(state, "minecraft:torch", taken);
    }
  }

  const plan = state.plan?.mine ?? freshPlan(entity);
  if (!state.plan) state.plan = {};
  state.plan.mine = plan;

  const currentBag = bagCount(state.bag);
  logDebug(TAG, `Kapasitas tas mining: ${currentBag}/${BAG_LIMIT} item.`);
  if (currentBag >= BAG_LIMIT || plan.phase === "haul") {
    logInfo(TAG, `Tas penuh (${currentBag}/${BAG_LIMIT}) atau mode haul. Pulang menyetor...`);
    const status = haul(entity, state, station);
    writeState(entity, state);
    return status;
  }

  const status = plan.phase === "descend"
    ? descend(entity, state, plan)
    : tunnel(entity, state, plan);
  writeState(entity, state);
  return status;
}

function takeTorches(container) {
  let n = 0;
  for (let i = 0; i < container.size && n < 16; i++) {
    const stack = container.getItem(i);
    if (stack?.typeId !== "minecraft:torch") continue;
    const take = Math.min(16 - n, stack.amount);
    n += take;
    if (stack.amount > take) {
      stack.amount -= take;
      container.setItem(i, stack);
    } else {
      container.setItem(i, undefined);
    }
  }
  return n;
}

function atFace(entity, target) {
  const d2 = dist2(entity.location, target);
  if (d2 <= REACH ** 2) return true;
  logDebug(TAG, `Menuju titik galian ${posStr(target)} (${Math.sqrt(d2).toFixed(1)}m > ${REACH}m)`);
  steer(entity, target);
  return false;
}

function swing(entity, target) {
  face(entity, target);
  hold(entity, 14, { pose: POSE.mine, reason: "mine" });
  if (system.currentTick % 6 === 0) {
    sound(entity.dimension, "dig.stone", target, { volume: 0.5 });
  }
}

function descend(entity, state, plan) {
  const dimension = entity.dimension;
  const [dx, dz] = DIRS[plan.dir];
  const floor = targetDepth(dimension.id);

  if (plan.y <= floor) {
    plan.phase = "tunnel";
    plan.step = 0;
    logInfo(TAG, `Mencapai kedalaman target (${plan.y} <= ${floor}). Beralih ke fase terowongan utama!`);
    report(entity, `Sampai kedalaman ${plan.y}. Mulai terowongan.`);
    return "mulai terowongan utama";
  }

  const target = { x: plan.x + 0.5, y: plan.y, z: plan.z + 0.5 };
  if (!atFace(entity, target)) return "menuruni tangga";
  swing(entity, target);

  let done = 0;
  for (let n = 0; n < DIG_PER_TICK && done < DIG_PER_TICK; n++) {
    const nx = plan.x + dx;
    const nz = plan.z + dz;
    const ny = plan.y - 1;
    if (lavaNear(dimension, nx, ny, nz)) {
      plan.dir = (plan.dir + 1) % 4;
      logWarn(TAG, `Lava menghalangi tangga! Membelokkan arah ke ${plan.dir}`);
      report(entity, "Ada lava di depan. Aku belok.");
      return "menghindari lava";
    }
    const cells = [
      blockAt(dimension, nx, ny, nz),
      blockAt(dimension, nx, ny + 1, nz),
    ];
    if (cells.some((b) => b && !diggable(b))) {
      plan.dir = (plan.dir + 1) % 4;
      logWarn(TAG, `Blok tidak bisa digali di tangga. Membelokkan arah tangga ke ${plan.dir}`);
      return "membelokkan tangga";
    }
    for (const cell of cells) {
      if (dig(entity, state, cell)) done++;
    }
    plan.x = nx;
    plan.z = nz;
    plan.y = ny;
    plan.step++;
    if (plan.step % TORCH_EVERY === 0) torchAt(entity, state, plan.x, plan.y, plan.z);
  }
  return "menggali tangga turun";
}

function tunnel(entity, state, plan) {
  const dimension = entity.dimension;
  const main = DIRS[plan.dir];
  const side = DIRS[(plan.dir + (plan.branchSide > 0 ? 1 : 3)) % 4];
  const digging = plan.branchStep > 0;
  const [dx, dz] = digging ? side : main;

  const target = { x: plan.x + 0.5, y: plan.y, z: plan.z + 0.5 };
  if (!atFace(entity, target)) return digging ? "menuju cabang" : "menuju ujung terowongan";
  swing(entity, target);

  for (let n = 0; n < DIG_PER_TICK; n++) {
    const nx = plan.x + dx;
    const nz = plan.z + dz;
    if (lavaNear(dimension, nx, plan.y, nz)) {
      if (digging) plan.branchStep = 0;
      else plan.dir = (plan.dir + 1) % 4;
      report(entity, "Lava. Aku tidak menembus situ.");
      return "menghindari lava";
    }
    const lower = blockAt(dimension, nx, plan.y, nz);
    const upper = blockAt(dimension, nx, plan.y + 1, nz);
    if ((lower && !diggable(lower)) || (upper && !diggable(upper))) {
      if (digging) plan.branchStep = 0;
      else plan.dir = (plan.dir + 1) % 4;
      return "membelokkan terowongan";
    }
    dig(entity, state, lower);
    dig(entity, state, upper);

    for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 2, 0], [0, -1, 0]]) {
      const near = blockAt(dimension, nx + ox, plan.y + oy, nz + oz);
      if (near && ORES[near.typeId]) dig(entity, state, near);
    }

    plan.x = nx;
    plan.z = nz;
    if (digging) {
      plan.branchStep--;
      if (plan.branchStep <= 0) {
        plan.x -= side[0] * BRANCH_LENGTH;
        plan.z -= side[1] * BRANCH_LENGTH;
        plan.branchSide = -plan.branchSide;
        logInfo(TAG, `Cabang selesai. Kembali ke sumbu terowongan utama.`);
      }
    } else {
      plan.step++;
      if (plan.step % TORCH_EVERY === 0) torchAt(entity, state, plan.x, plan.y, plan.z);
      if (plan.step % BRANCH_EVERY === 0) {
        plan.branchStep = BRANCH_LENGTH;
        logInfo(TAG, `Mulai menggali cabang baru sepanjang ${BRANCH_LENGTH} blok.`);
        return "menggali cabang";
      }
    }
  }
  return digging ? "menggali cabang" : "menggali terowongan utama";
}

function haul(entity, state, station) {
  const plan = state.plan.mine;
  plan.phase = "haul";
  if (!station) return "tidak ada peti untuk menyetor";
  const chest = station.chest;
  const target = { x: chest.x + 0.5, y: chest.y, z: chest.z + 0.5 };
  const d2 = dist2(entity.location, target);

  if (d2 > 3.2 ** 2) {
    logDebug(TAG, `Berjalan pulang menyetor ke peti (${Math.sqrt(d2).toFixed(1)}m > 3.2m)...`);
    steer(entity, target, 0.42);
    return "pulang membawa hasil tambang";
  }

  let moved = 0;
  for (const [id, amount] of Object.entries(state.bag)) {
    let left = amount;
    while (left > 0) {
      const take = Math.min(64, left);
      const item = makeItem(id, take);
      if (!item) break;
      putIn(station.container, item, entity.dimension, target);
      left -= take;
      moved += take;
    }
    delete state.bag[id];
  }
  face(entity, target);
  sound(entity.dimension, "random.chestopen", target);
  plan.phase = plan.y <= targetDepth(entity.dimension.id) ? "tunnel" : "descend";
  logInfo(TAG, `Menyetor ${moved} barang ke peti stasiun. Kembali ke fase: ${plan.phase}`);
  if (moved) report(entity, `${moved} barang kusetor ke peti.`);
  return "menyetor hasil tambang";
}