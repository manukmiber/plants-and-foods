/**
 * Barang non-alat yang harus benar-benar ditempa dari bahan.
 *
 * Sebelum ini peti stasiun, papan nama, meja kerja dan parit air muncul dari
 * udara: `block.setType("minecraft:chest")` tanpa ada satu papan pun di peti.
 * Sekarang semuanya lewat sini — bahan dihitung, diambil dari peti, dan kalau
 * kurang, pemanggil diberi tahu bahan apa yang perlu diminta ke perajin atau
 * pencari barang.
 */

import { COBBLE, ITEM_RECIPES, LOGS, MATERIAL_REQUESTS, PLANKS } from "./config.js";
import { countIn, makeItem, putIn, takeFrom } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "ITEMS";
const STICK = "minecraft:stick";

/** Menerjemahkan alias daftar bahan ("planks"/"logs") jadi daftar id asli. */
export function idsOf(any) {
  if (any === "planks") return PLANKS;
  if (any === "logs") return LOGS;
  if (any === "cobble") return COBBLE;
  return Array.isArray(any) ? any : [any];
}

/**
 * Berapa banyak bahan itu yang tersedia, termasuk yang masih berbentuk bahan
 * mentahnya: satu log dihitung empat papan, dua papan dihitung empat stik.
 */
export function availableOf(container, any) {
  if (!container) return 0;
  const ids = idsOf(any);
  let n = countIn(container, ids);
  if (any === "planks") {
    n += countIn(container, LOGS) * 4;
  } else if (ids.length === 1 && ids[0] === STICK) {
    n += (countIn(container, PLANKS) + countIn(container, LOGS) * 4) >= 2
      ? Math.floor((countIn(container, PLANKS) + countIn(container, LOGS) * 4) / 2) * 4
      : 0;
  }
  return n;
}

/** Ubah log jadi papan di dalam peti (satu log -> empat papan). */
function millLogs(container, wantPlanks) {
  let have = countIn(container, PLANKS);
  let milled = 0;
  while (have < wantPlanks) {
    if (takeFrom(container, LOGS, 1) !== 1) break;
    putIn(container, makeItem(PLANKS[0], 4));
    have += 4;
    milled++;
  }
  if (milled) logInfo(TAG, `Membelah ${milled} log jadi papan di peti (target ${wantPlanks} papan).`);
  return have;
}

/** Ubah papan jadi stik di dalam peti (dua papan -> empat stik). */
function whittleSticks(container, wantSticks) {
  let have = countIn(container, STICK);
  let made = 0;
  while (have < wantSticks) {
    millLogs(container, 2);
    if (takeFrom(container, PLANKS, 2) !== 2) break;
    putIn(container, makeItem(STICK, 4));
    have += 4;
    made++;
  }
  if (made) logInfo(TAG, `Meraut ${made * 4} stik dari papan di peti (target ${wantSticks} stik).`);
  return have;
}

/**
 * Cek apakah semua bahan resep tersedia. Balikannya menyebut bahan pertama
 * yang kurang supaya pemanggil bisa langsung memasang permintaan bantuan.
 */
export function canMake(container, key) {
  const recipe = ITEM_RECIPES[key];
  if (!recipe) {
    logWarn(TAG, `canMake: resep "${key}" tidak dikenal.`);
    return { ok: false, missing: undefined };
  }
  if (!container) return { ok: false, missing: recipe.ask };
  for (const need of recipe.needs) {
    const have = availableOf(container, need.any);
    logDebug(TAG, `canMake(${key}): butuh ${need.count} dari ${JSON.stringify(need.any)}, tersedia ${have}`);
    if (have < need.count) return { ok: false, missing: recipe.ask, need };
  }
  return { ok: true };
}

/**
 * Ambil bahan resep dari peti. Hanya dipanggil kalau canMake() sudah bilang
 * ok — tapi tetap dicek ulang di sini, karena antara pengecekan dan pemakaian
 * bisa saja companion lain mengambil isi peti yang sama.
 */
export function spendFor(container, key) {
  const recipe = ITEM_RECIPES[key];
  if (!recipe || !container) return false;
  for (const need of recipe.needs) {
    const ids = idsOf(need.any);
    if (need.any === "planks") millLogs(container, need.count);
    else if (ids.length === 1 && ids[0] === STICK) whittleSticks(container, need.count);
    const taken = takeFrom(container, ids, need.count);
    if (taken !== need.count) {
      logWarn(TAG, `spendFor(${key}) gagal: cuma dapat ${taken}/${need.count} dari ${JSON.stringify(ids)}. Bahan dikembalikan.`);
      if (taken > 0) putIn(container, makeItem(ids[0], taken));
      return false;
    }
    logDebug(TAG, `spendFor(${key}): mengambil ${taken}x ${ids[0]} dari peti.`);
  }
  logInfo(TAG, `Bahan untuk "${recipe.label}" berhasil diambil dari peti.`);
  return true;
}

/**
 * Tempa satu barang non-alat dan taruh hasilnya di peti. Balikannya id barang
 * yang jadi, atau undefined kalau gagal.
 */
export function makeInto(container, key, entity) {
  const recipe = ITEM_RECIPES[key];
  if (!recipe) return undefined;
  const check = canMake(container, key);
  if (!check.ok) {
    logDebug(TAG, `makeInto(${key}) batal untuk ${entStr(entity)}: bahan kurang (${check.missing ?? "?"}).`);
    return undefined;
  }
  if (!spendFor(container, key)) return undefined;
  const item = makeItem(recipe.id, recipe.makes);
  if (!item) {
    logWarn(TAG, `makeInto(${key}): gagal instansiasi ${recipe.id}`);
    return undefined;
  }
  putIn(container, item);
  logInfo(TAG, `${entStr(entity)} membuat ${recipe.makes}x ${recipe.label} dan menaruhnya di peti.`);
  return recipe.id;
}

/**
 * Ambil satu barang jadi dari peti (dipakai sebelum memasang peti, papan
 * nama, meja kerja...). Kalau belum ada, coba tempa dulu dari bahan.
 * Balikan: "taken" (langsung ada), "made" (ditempa dulu), atau
 * { missing } kalau bahannya kurang.
 */
export function takeOrMake(container, key, entity, accept) {
  const recipe = ITEM_RECIPES[key];
  if (!recipe) return { missing: undefined };
  const ids = accept ?? [recipe.id];
  if (countIn(container, ids) > 0) {
    const which = ids.find((id) => countIn(container, id) > 0);
    takeFrom(container, which, 1);
    logInfo(TAG, `${entStr(entity)} mengambil ${which} yang sudah ada di peti untuk dipasang.`);
    return { got: which, how: "taken" };
  }
  const madeId = makeInto(container, key, entity);
  if (!madeId) {
    const check = canMake(container, key);
    return { missing: check.missing ?? recipe.ask };
  }
  takeFrom(container, madeId, 1);
  logInfo(TAG, `${entStr(entity)} menempa ${recipe.label} dulu, baru memasangnya.`);
  return { got: madeId, how: "made" };
}

/** Label ramah untuk bahan yang kurang, dipakai di laporan ke pemain. */
export function materialLabel(kind) {
  return MATERIAL_REQUESTS[kind]?.label ?? kind ?? "bahan";
}
