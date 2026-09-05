/**
 * Mode membangun.
 *
 * Pemain memilih RANCANGAN lewat menu, dan companion mengerjakannya blok demi
 * blok dari bahan yang ada di peti stasiun. Rancangannya tidak disimpan sebagai
 * daftar ratusan koordinat di dynamic property — itu akan cepat kepenuhan.
 * Yang disimpan cuma nama rancangan, titik awal, arah, dan sudah sampai langkah
 * ke berapa; daftar bloknya dihitung ulang tiap denyut dari fungsi rancangan.
 * Karena fungsinya murni, langkah ke-57 hari ini sama dengan langkah ke-57
 * besok, walau dunianya sempat ditutup.
 *
 * Bahan dipilih dari apa yang ADA. Rancangan menyebut peran blok — "dinding",
 * "lantai", "atap", "lampu" — dan materialFor() menerjemahkannya jadi blok
 * sungguhan dari isi peti. Jadi gubuk yang sama jadi gubuk kayu kalau petinya
 * berisi papan, dan gubuk batu kalau berisi batu bulat.
 */

import { POSE, PROTECTED } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { workArea } from "./farming.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { writeState } from "./state.js";
import { ensureStation } from "./station.js";
import {
  alive, blockAt, countIn, dist2, face, isAir, isSolid, particle, sound, steer,
  takeFrom,
} from "./util.js";

const REACH = 5.0;
const PLACE_PER_TICK = 2;

const PLANKS = [
  "minecraft:oak_planks", "minecraft:spruce_planks", "minecraft:birch_planks",
  "minecraft:jungle_planks", "minecraft:acacia_planks", "minecraft:dark_oak_planks",
  "minecraft:mangrove_planks", "minecraft:cherry_planks", "minecraft:bamboo_planks",
];
const LOGS = [
  "minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log",
  "minecraft:stripped_oak_log", "minecraft:stripped_spruce_log",
];
const FENCES = [
  "minecraft:oak_fence", "minecraft:spruce_fence", "minecraft:birch_fence",
  "minecraft:jungle_fence", "minecraft:acacia_fence", "minecraft:dark_oak_fence",
  "minecraft:bamboo_fence", "minecraft:nether_brick_fence",
];
const STONE = [
  "minecraft:cobblestone", "minecraft:stone_bricks", "minecraft:stone",
  "minecraft:bricks", "minecraft:deepslate_bricks", "minecraft:cobbled_deepslate",
];
const SLABS = [
  "minecraft:oak_slab", "minecraft:spruce_slab", "minecraft:cobblestone_slab",
  "minecraft:stone_brick_slab",
];
const STAIRS = [
  "minecraft:oak_stairs", "minecraft:spruce_stairs", "minecraft:cobblestone_stairs",
  "minecraft:stone_brick_stairs",
];
const DOORS = [
  "minecraft:oak_door", "minecraft:spruce_door", "minecraft:birch_door",
  "minecraft:iron_door",
];

/** Peran blok -> daftar bahan yang boleh dipakai, dari yang paling disukai. */
const MATERIALS = {
  floor: [...PLANKS, ...STONE, "minecraft:gravel"],
  wall: [...PLANKS, ...STONE, ...LOGS],
  post: [...LOGS, ...FENCES, ...STONE],
  roof: [...STAIRS, ...SLABS, ...PLANKS, ...STONE],
  light: ["minecraft:lantern", "minecraft:torch", "minecraft:glowstone",
          "minecraft:sea_lantern", "minecraft:shroomlight"],
  door: DOORS,
  glass: ["minecraft:glass_pane", "minecraft:glass", "minecraft:white_stained_glass"],
  fence: FENCES,
  path: ["minecraft:gravel", "minecraft:cobblestone", "minecraft:coarse_dirt",
         ...PLANKS, ...STONE],
};

function materialFor(container, role) {
  const list = MATERIALS[role];
  if (!list) return undefined;
  return list.find((id) => countIn(container, id) > 0);
}

// --- rancangan --------------------------------------------------------------
//
// Tiap rancangan mengembalikan daftar { dx, dy, dz, role }. Titik (0,0,0) adalah
// titik awal yang dicatat waktu pemain memilih rancangannya.

function fencePlan(area) {
  const out = [];
  const push = (x, z, i) => {
    out.push({ x, z, dy: 1, role: "fence" });
    if (i % 5 === 0) out.push({ x, z, dy: 2, role: "light" });
  };
  let i = 0;
  for (let x = area.x0; x <= area.x1; x++) push(x, area.z0, i++);
  for (let z = area.z0 + 1; z <= area.z1; z++) push(area.x1, z, i++);
  for (let x = area.x1 - 1; x >= area.x0; x--) push(x, area.z1, i++);
  for (let z = area.z1 - 1; z > area.z0; z--) push(area.x0, z, i++);
  return out;
}

function wallPlan(area) {
  const out = [];
  const ring = fencePlan(area).filter((s) => s.role === "fence");
  for (const spot of ring) {
    for (let dy = 1; dy <= 3; dy++) {
      out.push({ x: spot.x, z: spot.z, dy, role: dy === 3 ? "roof" : "wall" });
    }
  }
  return out;
}

function lampsPlan(area) {
  const out = [];
  for (let x = area.x0 + 3; x <= area.x1; x += 6) {
    for (let z = area.z0 + 3; z <= area.z1; z += 6) {
      out.push({ x, z, dy: 1, role: "post" });
      out.push({ x, z, dy: 2, role: "post" });
      out.push({ x, z, dy: 3, role: "light" });
    }
  }
  return out;
}

function pathPlan(origin, dest) {
  const out = [];
  const dx = dest.x - origin.x;
  const dz = dest.z - origin.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  if (!steps) return out;
  for (let i = 0; i <= steps; i++) {
    const x = origin.x + Math.round((dx * i) / steps);
    const z = origin.z + Math.round((dz * i) / steps);
    out.push({ x, z, dy: 0, role: "path" });
  }
  return out;
}

function bridgePlan(origin, dir, length = 24) {
  const [ux, uz] = dir;
  const side = [-uz, ux];
  const out = [];
  for (let i = 1; i <= length; i++) {
    const x = origin.x + ux * i;
    const z = origin.z + uz * i;
    out.push({ x, z, dy: 0, role: "path" });
    out.push({ x: x + side[0], z: z + side[1], dy: 1, role: "fence" });
    out.push({ x: x - side[0], z: z - side[1], dy: 1, role: "fence" });
    if (i % 6 === 0) out.push({ x: x + side[0], z: z + side[1], dy: 2, role: "light" });
  }
  return out;
}

/** Bangunan berdinding: dipakai gubuk (5x5) dan gudang (7x5). */
function housePlan(origin, w, d, h, withChest) {
  const out = [];
  const x0 = origin.x - Math.floor(w / 2);
  const z0 = origin.z - Math.floor(d / 2);
  const x1 = x0 + w - 1;
  const z1 = z0 + d - 1;
  const doorX = origin.x;

  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      out.push({ x, z, dy: 0, role: "floor" });
    }
  }
  for (let dy = 1; dy <= h; dy++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) {
          out.push({ x, z, dy, role: "air" });
          continue;
        }
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (corner) {
          out.push({ x, z, dy, role: "post" });
        } else if (dy === 2 && (x + z) % 2 === 0) {
          out.push({ x, z, dy, role: "glass" });
        } else if (x === doorX && z === z0 && dy <= 2) {
          out.push({ x, z, dy, role: dy === 1 ? "door" : "air" });
        } else {
          out.push({ x, z, dy, role: "wall" });
        }
      }
    }
  }
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      out.push({ x, z, dy: h + 1, role: "roof" });
    }
  }
  out.push({ x: origin.x, z: origin.z, dy: h, role: "light" });
  if (withChest) {
    out.push({ x: x1 - 1, z: z1 - 1, dy: 1, role: "chest" });
  }
  return out;
}

export const BLUEPRINTS = {
  fence: {
    label: "Pagar keliling ladang",
    hint: "Pagar satu blok keliling petak, lampu tiap lima langkah",
    plan: (ctx) => fencePlan(ctx.area),
  },
  wall: {
    label: "Tembok keliling",
    hint: "Tembok tiga blok mengelilingi petak",
    plan: (ctx) => wallPlan(ctx.area),
  },
  lamps: {
    label: "Tiang lampu",
    hint: "Tiang berlampu tiap enam blok di dalam petak",
    plan: (ctx) => lampsPlan(ctx.area),
  },
  path: {
    label: "Jalan setapak ke pemilik",
    hint: "Jalan lurus dari stasiun ke tempatmu berdiri",
    plan: (ctx) => pathPlan(ctx.origin, ctx.dest ?? ctx.origin),
  },
  bridge: {
    label: "Jembatan",
    hint: "Jembatan berpagar 24 blok ke arah hadap companion",
    plan: (ctx) => bridgePlan(ctx.origin, ctx.dir),
  },
  hut: {
    label: "Gubuk 5x5",
    hint: "Lantai, dinding, jendela, pintu, atap, satu lampu",
    plan: (ctx) => housePlan(ctx.origin, 5, 5, 3, false),
  },
  shed: {
    label: "Gudang 7x5",
    hint: "Seperti gubuk, lebih besar, lengkap dengan peti di dalam",
    plan: (ctx) => housePlan(ctx.origin, 7, 5, 3, true),
  },
};

// --- pelaksanaan ------------------------------------------------------------

function context(entity, state, ownerId, owner) {
  const origin = state.plan?.build?.origin ?? {
    x: Math.floor(entity.location.x),
    y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };
  const dir = state.plan?.build?.dir ?? [1, 0];
  return {
    origin,
    dir,
    area: workArea(entity, state, ownerId),
    dest: owner ? { x: Math.floor(owner.location.x), z: Math.floor(owner.location.z) } : undefined,
  };
}

/** Ketinggian tanah untuk satu kolom, dipatok ±3 dari titik awal. */
function groundY(dimension, x, z, baseY) {
  for (let y = baseY + 3; y >= baseY - 4; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    if (here.isAir && isSolid(below)) return y - 1;
  }
  return undefined;
}

/** Mulai rancangan baru dari posisi companion sekarang. */
export function startBlueprint(entity, state, name, owner) {
  if (!BLUEPRINTS[name]) return false;
  const at = entity.location;
  let dir = [1, 0];
  try {
    const view = entity.getViewDirection();
    dir = Math.abs(view.x) > Math.abs(view.z)
      ? [Math.sign(view.x) || 1, 0]
      : [0, Math.sign(view.z) || 1];
  } catch {
    /* pakai arah bawaan */
  }
  if (!state.plan) state.plan = {};
  state.plan.build = {
    name, index: 0, dir,
    origin: { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) },
  };
  state.blueprint = name;
  writeState(entity, state);
  return true;
}

/** Satu denyut mode membangun. */
export function tickBuild(entity, state, owner) {
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const dimension = entity.dimension;
  const station = ensureStation(entity, state);
  const container = station?.container;
  if (!container) return "belum ada peti stasiun";

  if (!state.plan?.build) {
    startBlueprint(entity, state, state.blueprint ?? "fence", owner);
  }
  const job = state.plan.build;
  const blueprint = BLUEPRINTS[job.name];
  if (!blueprint) return "rancangan tidak dikenal";

  const ctx = context(entity, state, owner?.id, owner);
  const steps = blueprint.plan(ctx);
  if (!steps.length) return "rancangan kosong";

  if (job.index >= steps.length) {
    state.plan.build = null;
    writeState(entity, state);
    sayFrom(entity, "done");
    report(entity, `${blueprint.label} selesai.`);
    return `${blueprint.label} selesai`;
  }

  let placed = 0;
  let missing;
  while (job.index < steps.length && placed < PLACE_PER_TICK) {
    const step = steps[job.index];
    const base = groundY(dimension, step.x, step.z, ctx.origin.y);
    if (base === undefined) {
      job.index++;
      continue;
    }
    const y = base + (step.dy ?? 0) + (step.role === "path" || step.role === "floor" ? 0 : 1);
    const block = blockAt(dimension, step.x, y, step.z);
    if (!block) {
      job.index++;
      continue;
    }
    if (PROTECTED.has(block.typeId)) {
      job.index++;                              // jangan sentuh bangunan pemain
      continue;
    }

    const target = { x: step.x + 0.5, y, z: step.z + 0.5 };
    if (dist2(entity.location, target) > REACH ** 2) {
      writeState(entity, state);
      steer(entity, target);
      return `menuju titik ${job.index + 1} dari ${steps.length}`;
    }

    if (step.role === "air") {
      if (!block.isAir) {
        try {
          block.setType("minecraft:air");
        } catch {
          /* tidak bisa dibongkar */
        }
      }
      job.index++;
      continue;
    }

    const wanted = step.role === "chest" ? "minecraft:chest" : materialFor(container, step.role);
    if (!wanted) {
      missing = step.role;
      job.index++;
      continue;
    }
    if (step.role !== "chest" && takeFrom(container, wanted, 1) !== 1) {
      missing = step.role;
      job.index++;
      continue;
    }
    try {
      block.setType(wanted);
      placed++;
    } catch {
      job.index++;
      continue;
    }
    face(entity, target);
    hold(entity, 14, { pose: POSE.build, reason: "build" });
    sound(dimension, "random.wood_click", target, { volume: 0.6 });
    particle(dimension, "minecraft:villager_happy",
             { x: target.x, y: y + 0.6, z: target.z });
    job.index++;
  }

  writeState(entity, state);
  if (!placed && missing) return `peti kehabisan bahan untuk ${missing}`;
  return `${blueprint.label}: ${job.index}/${steps.length}`;
}
