/**
 * Companion membuat alatnya sendiri.
 *
 * Aturannya: bahan datang dari PETI STASIUN, dan pembuatannya harus terjadi di
 * MEJA KERJA sungguhan. Kalau petinya kosong, companion tidak bertani; kalau
 * tidak ada meja kerja di dekat stasiun tapi ada papan di peti, dia memasang
 * meja kerjanya sendiri lalu berjalan ke sana.
 *
 * Bahan yang dikenali: kayu gelondongan, papan, batu bulat, besi, emas, intan —
 * dan yang dipilih selalu TINGKAT TERTINGGI yang bahannya ada. Jadi menaruh satu
 * intan di peti cukup untuk membuat companion berhenti memakai cangkul kayu.
 */

import { system } from "@minecraft/server";

import { LOGS, POSE, TOOL_TIERS } from "./config.js";
import { hold } from "./hold.js";
import {
  alive, blockAt, countIn, dist2, isAir, isSolid, makeItem, particle, putIn,
  setGear, sound, steer, takeFrom,
} from "./util.js";

const STICK = "minecraft:stick";
const TABLE = "minecraft:crafting_table";

/** Berapa bahan dan berapa stik untuk tiap alat. Sama dengan resep aslinya. */
const RECIPE = {
  hoe: { material: 2, sticks: 2, label: "Cangkul" },
  pickaxe: { material: 3, sticks: 2, label: "Beliung" },
  axe: { material: 3, sticks: 2, label: "Kapak" },
  shovel: { material: 1, sticks: 2, label: "Sekop" },
};

const PLANKS = TOOL_TIERS[0].accepts;

export function toolId(tierKey, kind) {
  return `minecraft:${tierKey}_${kind}`;
}

/** Peringkat alat yang sedang dipegang, 0 kalau bukan alat jenis ini. */
export function toolRank(typeId, kind) {
  if (!typeId || !typeId.endsWith(`_${kind}`)) return 0;
  const prefix = typeId.replace("minecraft:", "").replace(`_${kind}`, "");
  return TOOL_TIERS.find((t) => t.key === prefix)?.rank ?? 0;
}

export function tierName(key) {
  return TOOL_TIERS.find((t) => t.key === key)?.name ?? key;
}

/**
 * Tingkat terbaik yang bisa dibuat dari isi peti.
 *
 * Kayu gelondongan ikut dihitung sebagai papan (satu gelondong = empat papan),
 * karena pemain lebih sering menaruh kayu mentah di peti daripada papan.
 */
export function bestTier(container, kind) {
  const recipe = RECIPE[kind];
  if (!container || !recipe) return undefined;
  const planks = countIn(container, PLANKS) + countIn(container, LOGS) * 4;
  const sticks = countIn(container, STICK) + Math.floor(planks / 2) * 4;
  if (sticks < recipe.sticks) return undefined;

  for (const tier of [...TOOL_TIERS].sort((a, b) => b.rank - a.rank)) {
    const have = tier.key === "wooden" ? planks : countIn(container, tier.accepts);
    if (have >= recipe.material) return tier;
  }
  return undefined;
}

/** Ambil bahan dari peti. Mengembalikan false kalau ternyata kurang. */
function consume(container, tier, kind) {
  const recipe = RECIPE[kind];
  // stik dulu: kalau kurang, dua papan digergaji jadi empat stik seperti aslinya
  let sticks = takeFrom(container, STICK, recipe.sticks);
  while (sticks < recipe.sticks) {
    if (takeFrom(container, PLANKS, 2) === 2) {
      sticks += 4;
      continue;
    }
    if (takeFrom(container, LOGS, 1) === 1) {
      putIn(container, makeItem(PLANKS[0], 4));
      continue;
    }
    return false;
  }
  const spare = sticks - recipe.sticks;
  if (spare > 0) putIn(container, makeItem(STICK, spare));

  if (tier.key === "wooden") {
    let planks = takeFrom(container, PLANKS, recipe.material);
    while (planks < recipe.material) {
      if (takeFrom(container, LOGS, 1) !== 1) return false;
      putIn(container, makeItem(PLANKS[0], 4));
      planks += takeFrom(container, PLANKS, recipe.material - planks);
    }
    return true;
  }
  return takeFrom(container, tier.accepts, recipe.material) === recipe.material;
}

// --- meja kerja ------------------------------------------------------------

export function findTable(dimension, near, radius = 12) {
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 3; dy++) {
          const block = blockAt(dimension, near.x + dx, near.y + dy, near.z + dz);
          if (block?.typeId === TABLE) {
            return { x: block.x, y: block.y, z: block.z };
          }
        }
      }
    }
  }
  return undefined;
}

/** Pasang meja kerja di petak kosong dekat stasiun, dari papan di peti. */
export function placeTable(dimension, near, container) {
  const planks = countIn(container, PLANKS);
  if (planks < 4 && countIn(container, LOGS) < 1) return undefined;
  for (let r = 1; r <= 4; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const spot = blockAt(dimension, near.x + dx, near.y, near.z + dz);
        const above = blockAt(dimension, near.x + dx, near.y + 1, near.z + dz);
        const floor = blockAt(dimension, near.x + dx, near.y - 1, near.z + dz);
        if (!isAir(spot) || !isAir(above) || !isSolid(floor)) continue;
        if (planks < 4) {
          if (takeFrom(container, LOGS, 1) !== 1) return undefined;
          putIn(container, makeItem(PLANKS[0], 4));
        }
        if (takeFrom(container, PLANKS, 4) !== 4) return undefined;
        try {
          spot.setType(TABLE);
        } catch {
          return undefined;
        }
        return { x: spot.x, y: spot.y, z: spot.z };
      }
    }
  }
  return undefined;
}

// --- alur pembuatan --------------------------------------------------------

/**
 * Satu denyut usaha membuat alat. Mengembalikan salah satu:
 *   "ready"    alat yang dipegang sudah cukup baik
 *   "walking"  sedang berjalan ke meja kerja
 *   "crafting" sedang membuat
 *   "done"     alat baru baru saja jadi dan dipasang
 *   "no-material" / "no-table" / "no-chest"
 *
 * Statusnya dikembalikan apa adanya supaya pemanggilnya bisa memberi tahu pemain
 * alasan companion berhenti bekerja, bukan diam saja tanpa penjelasan.
 */
export function craftStep(entity, state, kind, container, held) {
  if (!alive(entity)) return "no-chest";
  const recipe = RECIPE[kind];
  if (!recipe) return "ready";
  if (!container) return "no-chest";

  const tier = bestTier(container, kind);
  const rank = toolRank(held, kind);
  if (!tier || tier.rank <= rank) return rank > 0 ? "ready" : "no-material";

  const job = state.craft;
  const now = system.currentTick;

  if (!job || job.kind !== kind) {
    let table = findTable(entity.dimension, state.station ?? entity.location);
    if (!table) table = placeTable(entity.dimension, state.station ?? entity.location, container);
    if (!table) return "no-table";
    state.craft = { kind, tier: tier.key, table, until: 0 };
    return "walking";
  }

  const table = job.table;
  const still = blockAt(entity.dimension, table.x, table.y, table.z);
  if (still?.typeId !== TABLE) {
    state.craft = null;                      // mejanya dibongkar; cari lagi nanti
    return "no-table";
  }

  const target = { x: table.x + 0.5, y: table.y, z: table.z + 0.5 };
  if (dist2(entity.location, target) > 3.2 ** 2) {
    steer(entity, target);
    return "walking";
  }

  if (!job.until) {
    job.until = now + 46;
    hold(entity, 50, { pose: POSE.build, reason: "craft" });
    sound(entity.dimension, "random.wood_click", target);
    return "crafting";
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:villager_happy",
             { x: target.x, y: table.y + 1.2, z: target.z });
    return "crafting";
  }

  // waktunya habis: ambil bahannya sekarang, baru alatnya jadi
  state.craft = null;
  if (!consume(container, tier, kind)) return "no-material";
  const item = makeItem(toolId(tier.key, kind), 1);
  if (!item) return "no-material";
  setGear(entity, "mainhand", item);
  sound(entity.dimension, "random.anvil_use", target);
  particle(entity.dimension, "minecraft:villager_happy",
           { x: target.x, y: table.y + 1.4, z: target.z });
  return "done";
}

export function labelOf(kind) {
  return RECIPE[kind]?.label ?? kind;
}
