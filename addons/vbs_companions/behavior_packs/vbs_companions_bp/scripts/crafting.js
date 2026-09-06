/**
 * Companion membuat alat dan barangnya sendiri.
 *
 * Aturan tingkatan alat di sini KERAS: satu tingkat sekali naik, tidak boleh
 * melompat. Companion yang tangannya kosong harus menempa alat KAYU dulu,
 * baru boleh naik ke batu, lalu besi, emas, intan. Kalau bahan untuk tingkat
 * berikutnya belum ada, dia TIDAK melirik bahan tingkat yang lebih tinggi —
 * dia memasang permintaan bahan ke pencari barang dan menunggu. Versi lama
 * memilih "tingkat terbaik yang bahannya kebetulan ada", makanya penambang
 * bisa langsung memegang beliung besi tanpa pernah membuat yang kayu.
 */

import { system } from "@minecraft/server";
import { ITEM_RECIPES, LOGS, PLANKS, POSE, TOOL_TIERS } from "./config.js";
import { hold } from "./hold.js";
import { canMake, spendFor, takeOrMake } from "./items.js";
import {
  alive, blockAt, countIn, dist2, isAir, isSolid, makeItem, particle, putIn,
  setGear, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "CRAFTING";
const STICK = "minecraft:stick";
const TABLE = "minecraft:crafting_table";
const WORK_TICKS = 46;
const TABLE_REACH = 3.2;

const RECIPE = {
  hoe: { material: 2, sticks: 2, label: "Cangkul" },
  pickaxe: { material: 3, sticks: 2, label: "Beliung" },
  axe: { material: 3, sticks: 2, label: "Kapak" },
  shovel: { material: 1, sticks: 2, label: "Sekop" },
};

// Bahan mentah apa yang harus diminta ke pencari barang untuk tiap tingkat.
const TIER_ASK = {
  wooden: "wood",
  stone: "stone",
  iron: "iron",
  golden: "iron",
  diamond: "stone",
};

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

export function tierByRank(rank) {
  return TOOL_TIERS.find((t) => t.rank === rank);
}

/** Tingkat yang BOLEH dibuat berikutnya: tepat satu di atas yang dipegang. */
export function nextTierFor(currentRank) {
  const tier = tierByRank(currentRank + 1);
  logDebug(TAG, `nextTierFor(rank=${currentRank}) -> ${tier?.key ?? "sudah tingkat tertinggi"}`);
  return tier;
}

/** Bahan mentah yang perlu diminta supaya tingkat itu bisa ditempa. */
export function askForTier(tier) {
  return tier ? (TIER_ASK[tier.key] ?? "wood") : "wood";
}

function plankEquivalent(container) {
  return countIn(container, PLANKS) + countIn(container, LOGS) * 4;
}

function stickEquivalent(container) {
  const planks = plankEquivalent(container);
  return countIn(container, STICK) + Math.floor(planks / 2) * 4;
}

/**
 * Apakah bahan untuk tingkat ini lengkap? Dipisah dari pemilihan tingkat
 * supaya pemanggil tahu bedanya "belum waktunya naik tingkat" dan "sudah
 * waktunya tapi bahannya kurang".
 */
export function tierReady(container, tier, kind) {
  const recipe = RECIPE[kind];
  if (!container || !recipe || !tier) return false;
  const sticks = stickEquivalent(container);
  if (sticks < recipe.sticks) {
    logDebug(TAG, `tierReady(${tier.key}, ${kind}): stik kurang (${sticks}/${recipe.sticks}).`);
    return false;
  }
  const have = tier.key === "wooden" ? plankEquivalent(container) : countIn(container, tier.accepts);
  const ok = have >= recipe.material;
  logDebug(TAG, `tierReady(${tier.key}, ${kind}): bahan ${have}/${recipe.material} -> ${ok}`);
  return ok;
}

/**
 * Tingkat yang siap ditempa sekarang — TEPAT satu di atas rank yang dipegang,
 * dan hanya kalau bahannya lengkap. Tidak pernah melompati tingkat.
 */
export function bestTier(container, kind, currentRank = 0) {
  const tier = nextTierFor(currentRank);
  if (!tier) {
    logDebug(TAG, `bestTier(${kind}): sudah di tingkat tertinggi (rank ${currentRank}).`);
    return undefined;
  }
  if (!tierReady(container, tier, kind)) return undefined;
  logInfo(TAG, `Tingkat berikutnya untuk ${kind}: ${tier.key} (rank ${tier.rank}), bahan lengkap.`);
  return tier;
}

function consume(container, tier, kind) {
  const recipe = RECIPE[kind];
  logInfo(TAG, `Mengkonsumsi bahan untuk membuat ${tier.key} ${kind}...`);

  let sticks = takeFrom(container, STICK, recipe.sticks);
  logDebug(TAG, `Mengambil stik dari peti: dapat ${sticks}/${recipe.sticks}`);
  while (sticks < recipe.sticks) {
    if (takeFrom(container, PLANKS, 2) === 2) {
      logDebug(TAG, "Konversi 2 papan menjadi 4 stik");
      sticks += 4;
      continue;
    }
    if (takeFrom(container, LOGS, 1) === 1) {
      logDebug(TAG, "Konversi 1 log menjadi 4 papan");
      putIn(container, makeItem(PLANKS[0], 4));
      continue;
    }
    logWarn(TAG, "Gagal memproses bahan stik untuk crafting!");
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
    logInfo(TAG, "Konsumsi bahan kayu selesai.");
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

function freeSpotNear(dimension, near, radius = 4) {
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const spot = blockAt(dimension, near.x + dx, near.y, near.z + dz);
        const above = blockAt(dimension, near.x + dx, near.y + 1, near.z + dz);
        const floor = blockAt(dimension, near.x + dx, near.y - 1, near.z + dz);
        if (isAir(spot) && isAir(above) && isSolid(floor)) return spot;
      }
    }
  }
  return undefined;
}

/**
 * Memasang meja kerja. Sekarang benar-benar butuh barangnya dulu: kalau di
 * peti sudah ada meja kerja jadi, itu yang dipakai; kalau belum, dia dirakit
 * dari empat papan (log ikut dibelah otomatis). Kalau kayunya juga tidak ada,
 * balikannya menyebut bahan yang kurang supaya pemanggil bisa minta tolong.
 */
export function placeTable(dimension, near, container, entity) {
  logInfo(TAG, `Mencoba memasang meja kerja baru di dekat ${posStr(near)}...`);
  const spot = freeSpotNear(dimension, near);
  if (!spot) {
    logWarn(TAG, "Tidak ada lokasi kosong yang cocok untuk menaruh meja kerja.");
    return { missing: undefined, why: "no-space" };
  }
  const got = takeOrMake(container, "crafting_table", entity, [TABLE]);
  if (!got.got) {
    logWarn(TAG, `Bahan meja kerja kurang: butuh ${got.missing ?? "kayu"}.`);
    return { missing: got.missing ?? "wood", why: "no-material" };
  }
  try {
    spot.setType(TABLE);
    logInfo(TAG, `Meja kerja berhasil dipasang di: ${posStr(spot)} (${got.how})`);
    return { at: { x: spot.x, y: spot.y, z: spot.z } };
  } catch (e) {
    logError(TAG, `Gagal setType meja kerja di ${posStr(spot)}`, e);
    putIn(container, makeItem(TABLE, 1));
    return { missing: undefined, why: "place-failed" };
  }
}

/**
 * Pastikan ada meja kerja yang bisa dipakai — cari dulu, baru pasang kalau
 * tidak ketemu. Dipakai perajin, petani, penambang dan pembangun; siapa pun
 * yang pertama butuh, dia yang membuatkannya.
 */
export function ensureTable(entity, container, near) {
  const found = findTable(entity.dimension, near);
  if (found) return { at: found };
  logInfo(TAG, `${entStr(entity)} tidak menemukan meja kerja, mencoba membuat satu.`);
  return placeTable(entity.dimension, near, container, entity);
}

/**
 * Alat jadi yang boleh diambil dari peti: TEPAT satu tingkat di atas yang
 * dipegang. Alat tingkat tinggi yang kebetulan nyasar ke peti sengaja tidak
 * diambil supaya urutan kayu -> batu -> besi tetap dilalui.
 */
function findDelivered(container, kind, rank) {
  const tier = nextTierFor(rank);
  if (!tier) return undefined;
  const id = toolId(tier.key, kind);
  if (countIn(container, id) > 0) return { id, tier };
  const higher = TOOL_TIERS.filter((t) => t.rank > tier.rank)
    .find((t) => countIn(container, toolId(t.key, kind)) > 0);
  if (higher) {
    logInfo(TAG, `Ada ${toolId(higher.key, kind)} di peti tapi dilewati: urutan tingkat harus dilalui, sekarang giliran ${tier.key}.`);
  }
  return undefined;
}

function walkToTable(entity, table) {
  const target = { x: table.x + 0.5, y: table.y, z: table.z + 0.5 };
  const d2 = dist2(entity.location, target);
  if (d2 > TABLE_REACH ** 2) {
    logDebug(TAG, `Berjalan ke meja kerja (${Math.sqrt(d2).toFixed(1)}m > ${TABLE_REACH}m)...`);
    steer(entity, target);
    return { target, arrived: false };
  }
  return { target, arrived: true };
}

function tableStillThere(entity, table) {
  const still = blockAt(entity.dimension, table.x, table.y, table.z);
  return still?.typeId === TABLE;
}

/**
 * Satu langkah menempa alat untuk dipakai sendiri.
 * Balikan: "ready" | "no-chest" | "no-table" | "no-material" | "walking" |
 * "crafting" | "done"
 */
export function craftStep(entity, state, kind, container, held) {
  logDebug(TAG, `craftStep: entity=${entStr(entity)}, kind=${kind}, held=${held ?? "none"}`);
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

  const delivered = findDelivered(container, kind, rank);
  if (delivered && takeFrom(container, delivered.id, 1) === 1) {
    logInfo(TAG, `Alat kiriman perajin dipakai langsung: ${delivered.id}`);
    setGear(entity, "mainhand", makeItem(delivered.id, 1));
    return "done";
  }

  const tier = bestTier(container, kind, rank);
  if (!tier) {
    // Sudah punya alat: cukup, kerja jalan terus sambil menunggu bahan naik
    // tingkat. Belum punya alat sama sekali: ini yang harus dilaporkan supaya
    // permintaan bahan dipasang.
    const res = rank > 0 ? "ready" : "no-material";
    logDebug(TAG, `craftStep: ${res} (rank dipegang=${rank}, tingkat berikutnya belum bisa ditempa)`);
    return res;
  }

  const job = state.craft;
  const now = system.currentTick;

  if (!job || job.kind !== kind || job.tier !== tier.key) {
    const near = state.station ?? entity.location;
    const table = ensureTable(entity, container, near);
    if (!table.at) {
      logWarn(TAG, `Gagal menyiapkan meja kerja untuk ${entStr(entity)} (${table.why}).`);
      return "no-table";
    }
    logInfo(TAG, `Job menempa baru: ${tier.key} ${kind} di meja ${posStr(table.at)}`);
    state.craft = { kind, tier: tier.key, table: table.at, until: 0 };
    return "walking";
  }

  if (!tableStillThere(entity, job.table)) {
    logWarn(TAG, `Meja kerja di ${posStr(job.table)} hilang/dibongkar! Reset job.`);
    state.craft = null;
    return "no-table";
  }

  const { target, arrived } = walkToTable(entity, job.table);
  if (!arrived) return "walking";

  if (!job.until) {
    job.until = now + WORK_TICKS;
    logInfo(TAG, `${entStr(entity)} mulai menempa sampai tick ${job.until}`);
    hold(entity, WORK_TICKS + 4, { pose: POSE.build, reason: "craft" });
    sound(entity.dimension, "random.wood_click", target);
    return "crafting";
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: job.table.y + 1.2, z: target.z });
    return "crafting";
  }

  state.craft = null;
  logInfo(TAG, "Waktu menempa selesai, mengambil bahan dan membuat alat...");
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
  particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: job.table.y + 1.4, z: target.z });
  logInfo(TAG, `${entStr(entity)} sekarang memegang ${itemId} (naik ke tingkat ${tier.key}).`);
  return "done";
}

/**
 * Sama seperti craftStep tapi hasilnya TIDAK dipasang ke tangan si penempa —
 * dikembalikan ke pemanggil (crafter.js) untuk diantar ke peti pemesan.
 */
export function craftDeliverStep(entity, state, kind, container, targetTier) {
  logDebug(TAG, `craftDeliverStep: ${entStr(entity)}, kind=${kind}, tier=${targetTier?.key ?? "none"}`);
  if (!alive(entity)) return { status: "no-chest" };
  if (!RECIPE[kind] || !container || !targetTier) return { status: "no-material" };

  const job = state.craftDeliver;
  const now = system.currentTick;

  if (!job || job.kind !== kind || job.tierKey !== targetTier.key) {
    const table = ensureTable(entity, container, state.station ?? entity.location);
    if (!table.at) {
      logWarn(TAG, `Gagal menyiapkan meja kerja untuk tempa-antar (${table.why}).`);
      return { status: "no-table", missing: table.missing };
    }
    logInfo(TAG, `Job tempa-antar baru: ${targetTier.key} ${kind}`);
    state.craftDeliver = { kind, tierKey: targetTier.key, table: table.at, until: 0 };
    return { status: "walking" };
  }

  if (!tableStillThere(entity, job.table)) {
    logWarn(TAG, `Meja kerja tempa-antar di ${posStr(job.table)} hilang! Reset job.`);
    state.craftDeliver = null;
    return { status: "no-table" };
  }

  const { target, arrived } = walkToTable(entity, job.table);
  if (!arrived) return { status: "walking" };

  if (!job.until) {
    job.until = now + WORK_TICKS;
    logInfo(TAG, `${entStr(entity)} mulai tempa-antar sampai tick ${job.until}`);
    hold(entity, WORK_TICKS + 4, { pose: POSE.build, reason: "craft" });
    sound(entity.dimension, "random.wood_click", target);
    return { status: "crafting" };
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: job.table.y + 1.2, z: target.z });
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
  particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: job.table.y + 1.4, z: target.z });
  logInfo(TAG, `${entStr(entity)} selesai menempa ${itemId} untuk diantar.`);
  return { status: "done", item };
}

/**
 * Menempa satu BARANG (ember, peti, papan nama, obor) di meja kerja, lalu
 * menaruhnya di peti. Dipakai petani yang butuh ember, perajin yang melayani
 * permintaan barang, dan siapa pun yang butuh peti/papan baru.
 * Balikan: "no-chest" | "no-table" | "no-material" | "walking" | "crafting" |
 * "done"
 */
export function craftItemStep(entity, state, key, container) {
  const recipe = ITEM_RECIPES[key];
  if (!recipe) {
    logWarn(TAG, `craftItemStep: resep barang "${key}" tidak dikenal.`);
    return { status: "no-material" };
  }
  if (!container) return { status: "no-chest" };

  const check = canMake(container, key);
  if (!check.ok) {
    logDebug(TAG, `craftItemStep(${key}): bahan kurang, perlu ${check.missing}.`);
    return { status: "no-material", missing: check.missing };
  }

  if (!recipe.needsTable) {
    if (!spendFor(container, key)) return { status: "no-material", missing: recipe.ask };
    putIn(container, makeItem(recipe.id, recipe.makes));
    logInfo(TAG, `${entStr(entity)} merakit ${recipe.makes}x ${recipe.label} tanpa meja kerja.`);
    return { status: "done", id: recipe.id, amount: recipe.makes };
  }

  const job = state.craftItem;
  const now = system.currentTick;

  if (!job || job.key !== key) {
    const table = ensureTable(entity, container, state.station ?? entity.location);
    if (!table.at) return { status: "no-table", missing: table.missing };
    logInfo(TAG, `Job merakit barang baru: ${recipe.label} di meja ${posStr(table.at)}`);
    state.craftItem = { key, table: table.at, until: 0 };
    return { status: "walking" };
  }

  if (!tableStillThere(entity, job.table)) {
    logWarn(TAG, `Meja kerja barang di ${posStr(job.table)} hilang! Reset job.`);
    state.craftItem = null;
    return { status: "no-table" };
  }

  const { target, arrived } = walkToTable(entity, job.table);
  if (!arrived) return { status: "walking" };

  if (!job.until) {
    job.until = now + WORK_TICKS;
    hold(entity, WORK_TICKS + 4, { pose: POSE.build, reason: "craft" });
    sound(entity.dimension, "random.wood_click", target);
    logInfo(TAG, `${entStr(entity)} mulai merakit ${recipe.label} sampai tick ${job.until}`);
    return { status: "crafting" };
  }
  if (now < job.until) {
    particle(entity.dimension, "minecraft:villager_happy", { x: target.x, y: job.table.y + 1.2, z: target.z });
    return { status: "crafting" };
  }

  state.craftItem = null;
  if (!spendFor(container, key)) return { status: "no-material", missing: recipe.ask };
  putIn(container, makeItem(recipe.id, recipe.makes));
  sound(entity.dimension, "random.anvil_use", target);
  logInfo(TAG, `${entStr(entity)} selesai merakit ${recipe.makes}x ${recipe.label}.`);
  return { status: "done", id: recipe.id, amount: recipe.makes };
}

export function labelOf(kind) {
  return RECIPE[kind]?.label ?? ITEM_RECIPES[kind]?.label ?? kind;
}

export function isToolKind(kind) {
  return Boolean(RECIPE[kind]);
}
