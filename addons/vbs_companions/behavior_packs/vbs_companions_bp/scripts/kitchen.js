/**
 * Dapur: perajin memasak untuk companion lain DAN untuk pemainnya.
 *
 * Sebelum ini makanan tidak pernah dibuat siapa pun. Petani memanen gandum,
 * pemancing belum ada, penambang membawa pulang batu — dan semuanya menumpuk
 * di peti sebagai bahan mentah sampai pemainnya sendiri yang memasak. Yang
 * hilang adalah mata rantai terakhirnya: sesuatu yang mengubah hasil kerja
 * jadi sesuatu yang bisa dimakan.
 *
 * Dua jalur memasak, karena Minecraft memang punya dua:
 *
 *   MERAKIT   di meja kerja, tanpa api: roti (3 gandum), kue, sup, kukis.
 *   MEMBAKAR  di tungku: daging mentah, ikan mentah, kentang.
 *
 * Yang dimasak dipilih dari apa yang BENAR-BENAR ada di peti, dan urutannya
 * mengikuti siapa yang paling butuh: pesanan companion yang nyawanya tipis
 * lebih dulu, lalu stok dapur, lalu bekal untuk pemain.
 *
 * Bekal untuk pemain sengaja tidak dipaksakan ke kantongnya: makanan ditaruh
 * di PETI DAPUR dan pemain diberi tahu sekali. Companion yang menjejalkan roti
 * ke kantong pemain tiap kali panen adalah companion yang menyebalkan.
 */

import { system } from "@minecraft/server";

import { COOKABLE, FOOD_HEAL, KITCHEN, MEALS, POSE } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { hold } from "./hold.js";
import { ensureFurnace } from "./crafting.js";
import { displayName } from "./nametag.js";
import {
  alive, countIn, dist2, face, getOwnerId, makeItem, prettyItem, putIn,
  resolveOwner, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "KITCHEN";
const REACH = 3.2;

/* ------------------------------------------------------------------ *
 * Apa yang bisa dimasak dari isi peti sekarang
 * ------------------------------------------------------------------ */

function have(container, any) {
  const ids = Array.isArray(any) ? any : [any];
  return countIn(container, ids);
}

/** Resep rakitan pertama yang bahannya lengkap. */
export function nextMeal(container) {
  if (!container) return undefined;
  for (const [key, recipe] of Object.entries(MEALS)) {
    const ok = recipe.needs.every((need) => have(container, need.any) >= need.count);
    if (ok) {
      logDebug(TAG, `Resep siap dimasak: ${recipe.label}`);
      return { key, recipe };
    }
  }
  return undefined;
}

/** Bahan mentah pertama di peti yang memang layak dibakar. */
export function nextRoast(container) {
  if (!container) return undefined;
  for (const [raw, cooked] of Object.entries(COOKABLE)) {
    if (countIn(container, raw) > 0) return { raw, cooked };
  }
  return undefined;
}

/** Berapa porsi makanan siap santap yang ada di peti ini. */
export function mealsReady(container) {
  if (!container) return 0;
  return countIn(container, Object.keys(FOOD_HEAL));
}

/* ------------------------------------------------------------------ *
 * Memasak
 * ------------------------------------------------------------------ */

/**
 * Satu langkah merakit makanan di meja kerja.
 *
 * Bentuknya sengaja sama dengan craftItemStep di crafting.js — berjalan ke
 * mejanya dulu, menahan pose, baru barangnya jadi — supaya memasak terlihat
 * sama sungguhannya dengan menempa alat, bukan barang yang muncul dari udara.
 */
export function cookStep(entity, state, container, table) {
  const pick = nextMeal(container);
  if (!pick) return { status: "no-material" };

  if (table) {
    const at = { x: table.x + 0.5, y: table.y, z: table.z + 0.5 };
    if (dist2(entity.location, at) > REACH ** 2) {
      steer(entity, at);
      return { status: "walking", label: pick.recipe.label };
    }
    face(entity, at);
  }

  if (!state.cook || state.cook.key !== pick.key) {
    state.cook = { key: pick.key, until: system.currentTick + KITCHEN.cookTicks };
    hold(entity, KITCHEN.cookTicks, { pose: POSE.build, reason: "cook" });
    logDebug(TAG, `${entStr(entity)} mulai memasak ${pick.recipe.label}.`);
    return { status: "cooking", label: pick.recipe.label };
  }
  if (system.currentTick < state.cook.until) {
    return { status: "cooking", label: pick.recipe.label };
  }

  // Bahannya baru diambil DI SINI, sesudah waktunya habis. Kalau diambil di
  // awal, companion yang diistirahatkan di tengah masak menelan bahannya.
  for (const need of pick.recipe.needs) {
    const ids = Array.isArray(need.any) ? need.any : [need.any];
    const taken = takeFrom(container, ids, need.count);
    if (taken !== need.count) {
      logWarn(TAG, `Bahan ${pick.recipe.label} berkurang di tengah masak; dibatalkan.`);
      if (taken > 0) putIn(container, makeItem(ids[0], taken));
      state.cook = null;
      return { status: "no-material" };
    }
  }
  putIn(container, makeItem(pick.recipe.id, pick.recipe.makes));
  state.cook = null;
  sound(entity.dimension, "random.eat", entity.location, { volume: 0.4 });
  logInfo(TAG, `${entStr(entity)} memasak ${pick.recipe.makes}x ${pick.recipe.label}.`);
  return { status: "done", id: pick.recipe.id, label: pick.recipe.label, made: pick.recipe.makes };
}

/**
 * Satu langkah membakar bahan mentah di tungku.
 *
 * Tungkunya benda sungguhan di dunia — kalau belum ada, perajin memasangnya
 * sendiri (crafting.js » ensureFurnace). Tanpa tungku, daging mentah dan ikan
 * mentah berhenti sebagai bahan mentah selamanya.
 */
export function roastStep(entity, state, container) {
  const pick = nextRoast(container);
  if (!pick) return { status: "no-material" };

  const near = state.station ?? entity.location;
  const furnace = ensureFurnace(entity, container, near);
  if (!furnace?.at) {
    logDebug(TAG, `Tidak ada tungku untuk ${entStr(entity)}: ${furnace?.why ?? "?"}`);
    return { status: "no-furnace", missing: furnace?.missing };
  }

  const at = furnace.at;
  if (dist2(entity.location, at) > REACH ** 2) {
    steer(entity, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
    return { status: "walking", label: prettyItem(pick.cooked) };
  }
  face(entity, at);

  if (!state.roast || state.roast.raw !== pick.raw) {
    state.roast = { raw: pick.raw, until: system.currentTick + KITCHEN.roastTicks };
    hold(entity, KITCHEN.roastTicks, { pose: POSE.build, reason: "roast" });
    sound(entity.dimension, "fire.ignite", at, { volume: 0.3 });
    return { status: "roasting", label: prettyItem(pick.cooked) };
  }
  if (system.currentTick < state.roast.until) {
    return { status: "roasting", label: prettyItem(pick.cooked) };
  }

  if (takeFrom(container, pick.raw, 1) !== 1) {
    state.roast = null;
    return { status: "no-material" };
  }
  putIn(container, makeItem(pick.cooked, 1));
  state.roast = null;
  logInfo(TAG, `${entStr(entity)} membakar ${pick.raw} jadi ${pick.cooked}.`);
  return { status: "done", id: pick.cooked, label: prettyItem(pick.cooked), made: 1 };
}

/* ------------------------------------------------------------------ *
 * Bekal untuk pemain
 * ------------------------------------------------------------------ */

/**
 * Menyisihkan bekal untuk pemain di peti dapur.
 *
 * Ambangnya dua arah: masak sampai stok dapur mencapai `stock`, lalu berhenti.
 * Perajin yang memasak tanpa batas akan menghabiskan seluruh gandum ladang
 * jadi roti yang tidak ada yang makan, dan peti yang penuh roti tidak muat
 * lagi menampung hasil panen.
 */
export function offerToOwner(entity, state, container) {
  const ownerId = getOwnerId(entity);
  if (!ownerId) return undefined;
  const ready = mealsReady(container);
  if (ready < KITCHEN.offerAt) return undefined;

  const now = system.currentTick;
  if (now - (state.mealOfferAt ?? -KITCHEN.offerEvery) < KITCHEN.offerEvery) return undefined;
  state.mealOfferAt = now;

  const owner = resolveOwner(entity);
  const where = state.station;
  logInfo(TAG, `${entStr(entity)} menawarkan ${ready} porsi makanan ke pemiliknya.`);
  report(entity, where
    ? `Makanan sudah siap, ${ready} porsi. Ambil di petiku di (${where.x}, ${where.z}).`
    : `Makanan sudah siap, ${ready} porsi. Ambil di petiku.`);
  if (owner) {
    owner.sendMessage(
      `§a${displayName(entity)} sudah memasak §f${ready} porsi§a makanan untukmu. ` +
      "§7Ambil di peti dapurnya — atau suruh dia mengantarnya lewat menu.");
  }
  sayFrom(entity, "done");
  return `menawarkan ${ready} porsi makanan ke pemilik`;
}

/**
 * Mengantar sebagian bekal langsung ke tangan pemain.
 *
 * Ini yang dipanggil kalau pemain memang MEMINTA — dari menu companion atau
 * lewat chat. Companion berjalan ke pemiliknya lalu menaruhnya di kantongnya.
 */
export function deliverToOwner(entity, state, container, want = KITCHEN.deliver) {
  const owner = resolveOwner(entity);
  if (!owner) return "pemiliknya tidak ada di dunia ini";
  if (owner.dimension.id !== entity.dimension.id) return "pemiliknya di dimensi lain";

  const ready = mealsReady(container);
  if (!ready) return "belum ada makanan yang siap diantar";

  if (dist2(entity.location, owner.location) > (REACH + 1) ** 2) {
    steer(entity, owner.location, 0.4);
    return "mengantar makanan ke pemilik";
  }
  face(entity, owner.location);

  const bag = owner.getComponent("minecraft:inventory")?.container;
  let given = 0;
  for (const id of Object.keys(FOOD_HEAL)) {
    while (given < want && countIn(container, id) > 0) {
      if (takeFrom(container, id, 1) !== 1) break;
      const item = makeItem(id, 1);
      const rest = bag ? bag.addItem(item) : item;
      if (rest) {
        try {
          entity.dimension.spawnItem(rest, owner.location);
        } catch (e) {
          logWarn(TAG, "Gagal menjatuhkan makanan untuk pemilik", e);
        }
      }
      given++;
    }
  }
  if (!given) return "makanannya sudah habis diambil";
  hold(entity, 16, { pose: POSE.greet, reason: "give" });
  sound(entity.dimension, "random.pop", owner.location);
  owner.sendMessage(`§a${displayName(entity)} memberimu §f${given} porsi§a makanan.`);
  logInfo(TAG, `${entStr(entity)} memberi ${given} porsi makanan ke ${owner.name}.`);
  return `memberi ${given} porsi makanan ke pemilik`;
}

/**
 * Companion mana yang paling butuh makan sekarang?
 *
 * Yang nyawanya paling tipis, dan cuma yang benar-benar di bawah ambang.
 * Dipakai perajin untuk memutuskan porsi berikutnya diantar ke siapa.
 */
export function hungriest(companions, ownerId, healthOf, threshold) {
  let worst;
  let worstRatio = threshold;
  for (const other of companions) {
    if (!alive(other) || getOwnerId(other) !== ownerId) continue;
    const { cur, max } = healthOf(other);
    if (!max) continue;
    const ratio = cur / max;
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = other;
    }
  }
  if (worst) logDebug(TAG, `Yang paling butuh makan: ${entStr(worst)} (${Math.round(worstRatio * 100)}%).`);
  return worst;
}

/** Ringkasan isi dapur untuk menu dan buku. */
export function kitchenLines(container) {
  const ready = mealsReady(container);
  const meal = nextMeal(container);
  const roast = nextRoast(container);
  return [
    ready ? `§aMakanan siap: §f${ready} porsi` : "§8Belum ada makanan siap santap.",
    meal ? `§7Bisa dimasak sekarang: §f${meal.recipe.label}` : "§8Bahan masakan belum lengkap.",
    roast ? `§7Bisa dibakar: §f${prettyItem(roast.raw)} §7-> §f${prettyItem(roast.cooked)}`
          : "§8Tidak ada bahan mentah untuk dibakar.",
  ];
}

/** Titik dapur, untuk laporan. */
export function kitchenAt(state) {
  return state.station ? posStr(state.station) : "belum ada";
}
