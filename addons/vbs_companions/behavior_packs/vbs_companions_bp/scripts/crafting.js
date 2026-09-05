/**
 * Companion membuat alatnya sendiri.
 */

import { system } from "@minecraft/server";
import { LOGS, POSE, TOOL_TIERS } from "./config.js";
import { hold } from "./hold.js";
import {
  alive, blockAt, countIn, dist2, isAir, isSolid, makeItem, particle, putIn,
  setGear, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CRAFTING";
const STICK = "minecraft:stick";
const TABLE = "minecraft:crafting_table";

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

export function toolRank(typeId, kind) {
  if (!typeId || !typeId.endsWith(`_${kind}`)) return 0;
  const prefix = typeId.replace("minecraft:", "").replace(`_${kind}`, "");
  const rank = TOOL_TIERS.find((t) => t.key === prefix)?.rank ?? 0;
  logDebug(TAG, `toolRank("${typeId}", "${kind}") -> rank: ${rank}`);
  return rank;
}

export function tierName(key) {
  return TOOL_TIERS.find((t) => t.key === key)?.name ?? key;
}

export function bestTier(container, kind, currentRank = 0) {
  const recipe = RECIPE[kind];
  if (!container || !recipe) {
    logWarn(TAG, `bestTier batal: container atau recipe tidak ditemukan untuk kind="${kind}"`);
    return undefined;
  }
  const planks = countIn(container, PLANKS) + countIn(container, LOGS) * 4;
  const sticks = countIn(container, STICK) + Math.floor(planks / 2) * 4;
  logDebug(TAG, `Evaluasi bahan di peti untuk "${kind}": total papan setara=${planks}, stik setara=${sticks} (dibutuhkan stik: ${recipe.sticks}), rank alat sekarang=${currentRank}`);

  if (sticks < recipe.sticks) {
    logDebug(TAG, `Stik tidak cukup untuk membuat ${kind}`);
    return undefined;
  }

  // Naik SATU tingkat setiap kali, bukan langsung ke tier terbaik yang bahannya
  // ada — companion harus membuat cangkul/beliung kayu dulu sebelum batu, batu
  // dulu sebelum besi, dst. Diurutkan naik dan berhenti di tier pertama di atas
  // rank yang sedang dipegang supaya tidak melompati tingkatan.
  for (const tier of [...TOOL_TIERS].sort((a, b) => a.rank - b.rank)) {
    if (tier.rank <= currentRank) continue;
    const have = tier.key === "wooden" ? planks : countIn(container, tier.accepts);
    logDebug(TAG, `Cek tier ${tier.key} (butuh: ${recipe.material}): stok = ${have}`);
    if (have >= recipe.material) {
      logInfo(TAG, `Tier berikutnya untuk ${kind} adalah: ${tier.key} (rank ${tier.rank})`);
      return tier;
    }
  }
  logDebug(TAG, `Tidak ada tier di atas rank ${currentRank} yang dapat dibuat untuk ${kind}`);
  return undefined;
}

function consume(container, tier, kind) {
  const recipe = RECIPE[kind];
  logInfo(TAG, `Mengkonsumsi bahan untuk membuat ${tier.key} ${kind}...`);

  let sticks = takeFrom(container, STICK, recipe.sticks);
  logDebug(TAG, `Mengambil stik dari peti: dapat ${sticks}/${recipe.sticks}`);
  while (sticks < recipe.sticks) {
    if (takeFrom(container, PLANKS, 2) === 2) {
      logDebug(TAG, `Konversi 2 papan menjadi 4 stik`);
      sticks += 4;
      continue;
    }
    if (takeFrom(container, LOGS, 1) === 1) {
      logDebug(TAG, `Konversi 1 log menjadi 4 papan`);
      putIn(container, makeItem(PLANKS[0], 4));
      continue;
    }
    logWarn(TAG, `Gagal memproses bahan stik untuk crafting!`);
    return false;
  }
  const spare = sticks - recipe.sticks;
  if (spare > 0) {
    logDebug(TAG, `Mengembalikan ${spare} sisa stik ke peti`);
    putIn(container, makeItem(STICK, spare));
  }

  if (tier.key === "wooden") {
    let planks = takeFrom(container, PLANKS, recipe.material);
    logDebug(TAG, `Mengambil papan kayu: dapat ${planks}/${recipe.material}`);
    while (planks < recipe.material) {
      if (takeFrom(container, LOGS, 1) !== 1) {
        logWarn(TAG, "Gagal mengambil kayu tambahan dari peti.");
        return false;
      }
      putIn(container, makeItem(PLANKS[0], 4));
      planks += takeFrom(container, PLANKS, recipe.material - planks);
    }
    logInfo(TAG, `Konsumsi bahan kayu selesai.`);
    return true;
  }

  const taken = takeFrom(container, tier.accepts, recipe.material);
  logInfo(TAG, `Konsumsi bahan tier ${tier.key}: dapat ${taken}/${recipe.material}`);
  return taken === recipe.material;
}

export function findTable(dimension, near, radius = 12) {
  logDebug(TAG, `Mencari meja kerja di sekitar ${posStr(near)} radius ${radius}...`);
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = -3; dy <= 3; dy++) {
          const block = blockAt(dimension, near.x + dx, near.y + dy, near.z + dz);
          if (block?.typeId === TABLE) {
            logInfo(TAG, `Meja kerja ditemukan di: ${posStr(block)}`);
            return { x: block.x, y: block.y, z: block.z };
          }
        }
      }
    }
  }
  logDebug(TAG, "Tidak ada meja kerja di sekitar.");
  return undefined;
}

export function placeTable(dimension, near, container) {
  logInfo(TAG, `Mencoba memasang meja kerja baru di dekat ${posStr(near)}...`);
  const planks = countIn(container, PLANKS);
  if (planks < 4 && countIn(container, LOGS) < 1) {
    logWarn(TAG, "Bahan kayu di peti tidak cukup untuk membuat meja kerja (butuh 4 papan atau 1 log).");
    return undefined;
  }
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
          logInfo(TAG, `Meja kerja berhasil dipasang di: ${posStr(spot)}`);
          return { x: spot.x, y: spot.y, z: spot.z };
        } catch (e) {
          logError(TAG, `Gagal setType meja kerja di ${posStr(spot)}`, e);
          return undefined;
        }
      }
    }
  }
  logWarn(TAG, "Tidak ada lokasi kosong yang cocok untuk menaruh meja kerja.");
  return undefined;
}

function findDelivered(container, kind, minRank) {
  for (const tier of [...TOOL_TIERS].sort((a, b) => b.rank - a.rank)) {
    if (tier.rank <= minRank) break;
    const id = toolId(tier.key, kind);
    if (countIn(container, id) > 0) return { id, tier };
  }
  return undefined;
}

export function craftStep(entity, state, kind, container, held) {
  logDebug(TAG, `craftStep dijalankan: entity=${entStr(entity)}, kind=${kind}, held=${held ?? "none"}`);
  if (!alive(entity)) return "no-chest";
  const recipe = RECIPE[kind];
  if (!recipe) {
    logWarn(TAG, `Resep untuk alat "${kind}" tidak valid!`);
    return "ready";
  }
  if (!container) {
    logWarn(TAG, "Peti tidak tersedia untuk proses crafting.");
    return "no-chest";
  }

  const rank = toolRank(held, kind);

  // Kalau ada alat jadi (dititip perajin, misalnya) di peti dan tingkatnya
  // lebih tinggi dari yang sedang dipegang, pakai langsung — tidak perlu
  // menempa ulang dari bahan mentah.
  const delivered = findDelivered(container, kind, rank);
  if (delivered && takeFrom(container, delivered.id, 1) === 1) {
    logInfo(TAG, `Alat jadi ditemukan di peti: ${delivered.id}. Dipakai langsung tanpa menempa.`);
    setGear(entity, "mainhand", makeItem(delivered.id, 1));
    return "done";
  }

  const tier = bestTier(container, kind, rank);
  if (!tier) {
    const res = rank > 0 ? "ready" : "no-material";
    logDebug(TAG, `craftStep status: ${res} (Tier berikutnya tidak tersedia, Rank pegang=${rank})`);
    return res;
  }

  const job = state.craft;
  const now = system.currentTick;

  if (!job || job.kind !== kind) {
    logInfo(TAG, `Inisialisasi job crafting baru untuk ${entStr(entity)}: membuat ${tier.key} ${kind}`);
    let table = findTable(entity.dimension, state.station ?? entity.location);
    if (!table) table = placeTable(entity.dimension, state.station ?? entity.location, container);
    if (!table) {
      logWarn(TAG, `Gagal menemukan atau menaruh meja kerja!`);
      return "no-table";
    }
    state.craft = { kind, tier: tier.key, table, until: 0 };
    return "walking";
  }

  const table = job.table;
  const still = blockAt(entity.dimension, table.x, table.y, table.z);
  if (still?.typeId !== TABLE) {
    logWarn(TAG, `Meja kerja di ${posStr(table)} hilang/dibongkar! Reset job.`);
    state.craft = null;
    return "no-table";
  }

  const target = { x: table.x + 0.5, y: table.y, z: table.z + 0.5 };
  const d2 = dist2(entity.location, target);
  if (d2 > 3.2 ** 2) {
    logDebug(TAG, `Berjalan ke meja kerja (${Math.sqrt(d2).toFixed(1)}m > 3.2m)...`);
    steer(entity, target);
    return "walking";
  }

  if (!job.until) {
    job.until = now + 46;
    logInfo(TAG, `${entStr(entity)} mulai menempa di meja kerja sampai tick ${job.until}`);
    hold(entity, 50, { pose: POSE.build, reason: "craft" });
    sound(entity.dimension, "random.wood_click", target);
    return "crafting";
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: table.y + 1.2, z: target.z });
    return "crafting";
  }

  state.craft = null;
  logInfo(TAG, `Waktu crafting selesai, mengambil bahan dan membuat item...`);
  if (!consume(container, tier, kind)) {
    logWarn(TAG, "Bahan tidak cukup saat crafting diselesaikan!");
    return "no-material";
  }
  const itemId = toolId(tier.key, kind);
  const item = makeItem(itemId, 1);
  if (!item) {
    logError(TAG, `Gagal membuat ItemStack untuk ${itemId}!`);
    return "no-material";
  }
  setGear(entity, "mainhand", item);
  sound(entity.dimension, "random.anvil_use", target);
  particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: table.y + 1.4, z: target.z });
  logInfo(TAG, `Alat baru berhasil dibuat dan dipasangkan ke ${entStr(entity)}: ${itemId}`);
  return "done";
}

/**
 * Sama seperti craftStep, tapi untuk companion Merajin yang menempa alat
 * BUKAN untuk dirinya sendiri — hasilnya tidak dipasang ke tangan si perajin,
 * melainkan dikembalikan ke pemanggil (crafter.js) supaya diantar ke peti
 * companion yang memintanya. Dipisah dari craftStep supaya alur "pakai
 * sendiri" yang sudah teruji tidak perlu diutak-atik.
 */
export function craftDeliverStep(entity, state, kind, container, targetTier) {
  logDebug(TAG, `craftDeliverStep: entity=${entStr(entity)}, kind=${kind}, target=${targetTier?.key ?? "none"}`);
  if (!alive(entity)) return { status: "no-chest" };
  const recipe = RECIPE[kind];
  if (!recipe || !container || !targetTier) {
    return { status: "no-material" };
  }

  const job = state.craftDeliver;
  const now = system.currentTick;

  if (!job || job.kind !== kind || job.tierKey !== targetTier.key) {
    logInfo(TAG, `Inisialisasi job tempa-antar baru untuk ${entStr(entity)}: ${targetTier.key} ${kind}`);
    let table = findTable(entity.dimension, state.station ?? entity.location);
    if (!table) table = placeTable(entity.dimension, state.station ?? entity.location, container);
    if (!table) {
      logWarn(TAG, "Gagal menemukan atau menaruh meja kerja untuk tempa-antar!");
      return { status: "no-table" };
    }
    state.craftDeliver = { kind, tierKey: targetTier.key, table, until: 0 };
    return { status: "walking" };
  }

  const table = job.table;
  const still = blockAt(entity.dimension, table.x, table.y, table.z);
  if (still?.typeId !== TABLE) {
    logWarn(TAG, `Meja kerja tempa-antar di ${posStr(table)} hilang/dibongkar! Reset job.`);
    state.craftDeliver = null;
    return { status: "no-table" };
  }

  const target = { x: table.x + 0.5, y: table.y, z: table.z + 0.5 };
  const d2 = dist2(entity.location, target);
  if (d2 > 3.2 ** 2) {
    steer(entity, target);
    return { status: "walking" };
  }

  if (!job.until) {
    job.until = now + 46;
    logInfo(TAG, `${entStr(entity)} mulai menempa (tempa-antar) sampai tick ${job.until}`);
    hold(entity, 50, { pose: POSE.build, reason: "craft" });
    sound(entity.dimension, "random.wood_click", target);
    return { status: "crafting" };
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: table.y + 1.2, z: target.z });
    return { status: "crafting" };
  }

  state.craftDeliver = null;
  if (!consume(container, targetTier, kind)) {
    logWarn(TAG, "Bahan tidak cukup saat tempa-antar diselesaikan!");
    return { status: "no-material" };
  }
  const itemId = toolId(targetTier.key, kind);
  const item = makeItem(itemId, 1);
  if (!item) {
    logError(TAG, `Gagal membuat ItemStack untuk ${itemId} (tempa-antar)!`);
    return { status: "no-material" };
  }
  sound(entity.dimension, "random.anvil_use", target);
  particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: table.y + 1.4, z: target.z });
  logInfo(TAG, `${entStr(entity)} selesai menempa ${itemId} untuk diantar.`);
  return { status: "done", item };
}

export function labelOf(kind) {
  return RECIPE[kind]?.label ?? kind;
}