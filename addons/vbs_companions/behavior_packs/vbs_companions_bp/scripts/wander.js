/**
 * Mode mengembara.
 */

import { system } from "@minecraft/server";
import { POSE } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { FINDS, REPORTS } from "./lines.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { addWaypoint, readWaypoints, writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, blockAt, dist2, distXZ, face, isAir, isFooting, makeItem, pick, putIn,
  sound, steer,
} from "./util.js";
import { entStr, logDebug, logInfo, posStr } from "./logger.js";

const TAG = "WANDER";
const START_RADIUS = 40;
const RADIUS_STEP = 30;
const MAX_RADIUS = 190;
const TURN = 1.05;
const BAG_LIMIT = 64;
const ARRIVE = 6;
const SCAN_PER_TICK = 140;

const VILLAGE = new Set([
  "minecraft:bell", "minecraft:composter", "minecraft:cartography_table",
  "minecraft:lectern", "minecraft:fletching_table", "minecraft:smithing_table",
  "minecraft:loom", "minecraft:grindstone", "minecraft:barrel",
]);
const RUIN = new Set([
  "minecraft:mossy_cobblestone", "minecraft:cobweb", "minecraft:mob_spawner",
  "minecraft:infested_stone", "minecraft:cracked_stone_bricks",
  "minecraft:mossy_stone_bricks", "minecraft:chiseled_stone_bricks",
]);
const CHESTS = new Set(["minecraft:chest", "minecraft:trapped_chest"]);

const OFFSETS = (() => {
  const out = [];
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      for (let dy = -4; dy <= 3; dy += 1) out.push([dx, dy, dz]);
    }
  }
  out.sort((a, b) => (a[0] ** 2 + a[2] ** 2) - (b[0] ** 2 + b[2] ** 2));
  return out;
})();

function freshPlan(home) {
  const plan = {
    angle: Math.random() * Math.PI * 2, radius: START_RADIUS,
    target: null, cursor: 0, home,
  };
  logInfo(TAG, `Membuat rencana jelajah spiral baru: home=${posStr(home)}, startRadius=${START_RADIUS}`);
  return plan;
}

function nextTarget(plan) {
  plan.angle += TURN;
  if (plan.angle > Math.PI * 2) {
    plan.angle -= Math.PI * 2;
    plan.radius = Math.min(MAX_RADIUS, plan.radius + RADIUS_STEP);
    logInfo(TAG, `Satu putaran jelajah selesai. Memperlebar radius ke: ${plan.radius} blok`);
  }
  plan.target = {
    x: Math.round(plan.home.x + Math.cos(plan.angle) * plan.radius),
    z: Math.round(plan.home.z + Math.sin(plan.angle) * plan.radius),
  };
  logInfo(TAG, `Titik jelajah berikutnya ditentukan: (${plan.target.x}, ${plan.target.z}) (Radius: ${plan.radius})`);
  return plan.target;
}

function surfaceY(dimension, x, z, from) {
  for (let y = Math.min(from + 24, 318); y > from - 40; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    // Tajuk pohon bukan permukaan tanah: tanpa isFooting, penjelajah
    // menuju titik di atas daun dan berdiri mendorong dahan sepanjang jalan.
    if (here.isAir && isFooting(below)) return y;
  }
  return undefined;
}

function look(entity, plan) {
  const dimension = entity.dimension;
  const at = entity.location;
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  let cursor = plan.cursor ?? 0;

  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const [dx, dy, dz] = OFFSETS[cursor];
    cursor = (cursor + 1) % OFFSETS.length;
    const block = blockAt(dimension, bx + dx, by + dy, bz + dz);
    if (!block) continue;
    const id = block.typeId;
    let kind;
    if (VILLAGE.has(id)) kind = "village";
    else if (CHESTS.has(id)) kind = "chest";
    else if (RUIN.has(id)) kind = "ruin";
    else if (id === "minecraft:lava" || id === "minecraft:flowing_lava") kind = "lava";
    if (!kind) continue;
    plan.cursor = cursor;
    logInfo(TAG, `POIN PENTING DITEMUKAN: ${kind} (${id}) di (${block.x}, ${block.y}, ${block.z})`);
    return { kind, x: block.x, y: block.y, z: block.z };
  }

  let hollow = 0;
  for (let y = by - 2; y > by - 14; y--) {
    const block = blockAt(dimension, bx, y, bz);
    if (!block) break;
    if (block.isAir) hollow++;
    else if (hollow < 4) hollow = 0;
    else break;
  }
  plan.cursor = cursor;
  if (hollow >= 5) {
    logInfo(TAG, `GUA TERDETEKSI di bawah kaki: kedalaman lubang udara ${hollow} blok.`);
    return { kind: "cave", x: bx, y: by - 4, z: bz };
  }
  return undefined;
}

function pickUp(entity, state) {
  let items;
  try {
    items = entity.dimension.getEntities({
      type: "minecraft:item", location: entity.location, maxDistance: 4,
    });
  } catch {
    return 0;
  }
  let taken = 0;
  for (const drop of items) {
    let stack;
    try {
      stack = drop.getComponent("minecraft:item")?.itemStack;
    } catch {
      continue;
    }
    if (!stack) continue;
    state.bag[stack.typeId] = (state.bag[stack.typeId] ?? 0) + stack.amount;
    taken += stack.amount;
    logInfo(TAG, `${entStr(entity)} memungut barang: ${stack.amount}x ${stack.typeId}`);
    try {
      drop.remove();
    } catch {
      /* sudah hilang */
    }
  }
  if (taken) sound(entity.dimension, "random.pop", entity.location, { volume: 0.4 });
  return taken;
}

function bagCount(bag) {
  return Object.values(bag).reduce((a, b) => a + b, 0);
}

export function tickWander(entity, state, owner) {
  logDebug(TAG, `tickWander dimulai untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const dimension = entity.dimension;
  const station = ensureStation(entity, state);
  const home = station?.chest ?? state.home ?? {
    x: Math.floor(entity.location.x), y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };
  if (!state.home) state.home = home;

  if (!state.plan) state.plan = {};
  const plan = state.plan.wander ?? freshPlan(home);
  plan.home = home;
  state.plan.wander = plan;

  pickUp(entity, state);

  const full = bagCount(state.bag) >= BAG_LIMIT;
  if (full || plan.going === "home") {
    plan.going = "home";
    const target = { x: home.x + 0.5, y: home.y, z: home.z + 0.5 };
    const d2 = dist2(entity.location, target);
    if (d2 > 3.2 ** 2) {
      logDebug(TAG, `Mengembara: pulang ke stasiun (${Math.sqrt(d2).toFixed(1)}m > 3.2m)...`);
      steer(entity, target, 0.42);
      writeState(entity, state);
      return "pulang membawa temuan";
    }

    let moved = 0;
    for (const [id, amount] of Object.entries(state.bag)) {
      let left = amount;
      while (left > 0) {
        const take = Math.min(64, left);
        const item = makeItem(id, take);
        if (!item) break;
        putIn(station?.container, item, dimension, target);
        left -= take;
        moved += take;
      }
      delete state.bag[id];
    }
    face(entity, target);
    hold(entity, 20, { pose: POSE.build, reason: "deposit" });
    sound(dimension, "random.chestopen", target);
    plan.going = "out";
    plan.target = null;
    writeState(entity, state);
    logInfo(TAG, `Mengembara: ${moved} barang berhasil disetor ke peti stasiun.`);
    if (moved) report(entity, `${moved} barang kubawa pulang.`);
    return "menyetor temuan";
  }

  const found = look(entity, plan);
  if (found) {
    const saved = addWaypoint({
      kind: found.kind, dim: dimension.id,
      x: found.x, y: found.y, z: found.z,
      by: entity.id, tick: system.currentTick,
    });
    if (saved) {
      const where = `§e${found.x}, ${found.y}, ${found.z}§f`;
      report(entity, pick(REPORTS)
        .replace("{apa}", FINDS[found.kind] ?? found.kind)
        .replace("{di}", where));
    }
  }

  if (!plan.target) nextTarget(plan);
  const t = plan.target;
  const y = surfaceY(dimension, t.x, t.z, Math.floor(entity.location.y))
    ?? Math.floor(entity.location.y);
  const target = { x: t.x + 0.5, y, z: t.z + 0.5 };

  const distArrival = distXZ(entity.location, target);
  logDebug(TAG, `Jarak ke waypoint target (${t.x}, ${t.z}): ${distArrival.toFixed(1)}m (Batas tiba: ${ARRIVE}m)`);

  if (distArrival < ARRIVE) {
    if (plan.radius >= MAX_RADIUS) {
      logInfo(TAG, `Jelajah telah mencapai batas maksimum (${MAX_RADIUS} blok). Berbalik pulang!`);
      plan.going = "home";
      sayFrom(entity, "done");
    } else {
      nextTarget(plan);
    }
    writeState(entity, state);
    return "sampai di tujuan, lanjut";
  }

  steer(entity, target, 0.42);
  writeState(entity, state);
  return `menuju ${t.x}, ${t.z}`;
}

export function waypointLines(limit = 12) {
  const list = readWaypoints().slice(-limit).reverse();
  if (!list.length) return ["§8Belum ada yang dicatat."];
  return list.map((w) => {
    const name = FINDS[w.kind] ?? w.kind;
    const dim = w.dim.replace("minecraft:", "");
    return `§7• §f${name} §7di §e${w.x}, ${w.y}, ${w.z} §8(${dim})`;
  });
}