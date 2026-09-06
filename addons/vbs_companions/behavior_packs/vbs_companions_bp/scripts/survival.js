/**
 * Keselamatan companion: api, air, tenggelam, dan makan.
 *
 * Tiga hal yang sebelumnya tidak ada sama sekali, dan akibatnya terlihat jelas
 * di dunia: companion berjalan lurus ke tengah danau lalu mengambang di sana
 * sampai pemainnya menariknya pulang, badan yang tersulut api terus berjalan
 * sambil terbakar walau ada sungai tiga blok di sebelahnya, dan nyawa yang
 * tinggal separuh tidak pernah pulih karena tidak ada satu pun jalan bagi
 * companion untuk makan sendiri.
 *
 * Yang dikerjakan berkas ini, berurutan — yang di atas selalu menang:
 *
 *   1. TERBAKAR    air terdekat dicari dan dituju. Air memadamkan api, dan
 *                  itu satu-satunya pemadam yang selalu ada di dunia terbuka.
 *   2. TENGGELAM   companion yang badannya terbenam di air dalam berenang naik
 *                  ke permukaan, lalu menuju daratan terdekat. Kalau terlalu
 *                  lama terbenam, dia benar-benar tersedak — dan sesudah
 *                  selamat, itulah yang membuatnya minta makan.
 *   3. MAKAN       nyawa di bawah ambang batas: makanan di peti/kantong
 *                  dimakan sendiri. Kalau tidak ada, satu pesanan roti
 *                  dipasang ke perajin (ITEM_RECIPES.bread) dan pemiliknya
 *                  diberi tahu.
 *
 * Menghindari air SEBELUM tercebur dikerjakan di tempat lain, di langkah kaki
 * itu sendiri (util.js » tryStep): langkah yang harus berpijak di atas air
 * selalu kalah dari langkah yang berpijak di tanah, dan baru dipakai kalau
 * memang tidak ada jalan kering sama sekali. Berkas ini yang menangani sisanya
 * — yaitu saat companion SUDAH terlanjur basah.
 */

import { system } from "@minecraft/server";

import { FACE, FOOD_HEAL, POSE, SWIM } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { bagContainer } from "./bag.js";
import { hold } from "./hold.js";
import { requestItem } from "./requests.js";
import {
  alive, blockAt, canOccupy, containerAt, countIn, healthOf, isFooting,
  isWaterBlock, particle, setFace, sound, steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "SURVIVAL";
const FOOD_IDS = Object.keys(FOOD_HEAL);

// Catatan sesaat per companion. Sengaja TIDAK disimpan di dynamic property:
// semuanya soal detik-detik ini, dan companion yang dimuat ulang dari dunia
// yang baru dibuka memang harus menilai keadaannya lagi dari nol.
const marks = new Map();

function markOf(entity) {
  let row = marks.get(entity.id);
  if (!row) {
    row = {};
    marks.set(entity.id, row);
  }
  return row;
}

export function forget(id) {
  if (marks.delete(id)) logDebug(TAG, `forget catatan keselamatan untuk ID: ${id}`);
}

/* ------------------------------------------------------------------ *
 * Membaca keadaan
 * ------------------------------------------------------------------ */

function waterAt(dimension, x, y, z) {
  return isWaterBlock(blockAt(dimension, x, y, z));
}

/**
 * Badan companion sedang di air yang DALAM?
 *
 * Bukan "kaki basah": parit irigasi selebar satu blok memang harus boleh
 * diseberangi, dan companion yang panik tiap kali menyeberangi paritnya
 * sendiri tidak akan pernah menyelesaikan satu ladang pun. Dalam artinya
 * salah satu dari dua: kepalanya ikut terbenam, atau tidak ada lantai padat
 * di bawah kakinya.
 */
function deepWater(entity) {
  const at = entity.location;
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  const z = Math.floor(at.z);
  const dimension = entity.dimension;
  if (!waterAt(dimension, x, y, z)) return false;
  if (waterAt(dimension, x, y + 1, z)) return true;
  const floor = blockAt(dimension, x, y - 1, z);
  return !isFooting(floor);
}

function submerged(entity) {
  const at = entity.location;
  return waterAt(entity.dimension, Math.floor(at.x), Math.floor(at.y) + 1, Math.floor(at.z));
}

/** Badan companion sedang terbakar? */
function onFire(entity) {
  try {
    const comp = entity.getComponent("minecraft:onfire");
    if (comp) return (comp.onFireTicksRemaining ?? 0) > 0;
  } catch {
    /* versi API lama tidak punya komponennya */
  }
  try {
    return Boolean(entity.isOnFire);
  } catch {
    return false;
  }
}

function extinguish(entity) {
  try {
    entity.extinguishFire?.(true);
  } catch (e) {
    logDebug(TAG, `extinguishFire tidak didukung untuk ${entStr(entity)}`, e);
  }
}

/* ------------------------------------------------------------------ *
 * Mencari air dan mencari darat
 * ------------------------------------------------------------------ */

/** Sapuan cincin melebar: yang terdekat selalu ketemu duluan. */
function ringScan(dimension, at, radius, dys, accept) {
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const dy of dys) {
          const x = bx + dx;
          const y = by + dy;
          const z = bz + dz;
          if (accept(dimension, x, y, z)) return { x: x + 0.5, y, z: z + 0.5 };
        }
      }
    }
  }
  return undefined;
}

function nearestWater(dimension, at, radius) {
  return ringScan(dimension, at, radius, [0, -1, 1, -2, 2, -3], waterAt);
}

/**
 * Petak daratan terdekat: lantai padat yang kering, dengan dua blok ruang
 * kosong di atasnya supaya badan companion benar-benar muat berdiri di situ.
 */
function nearestShore(dimension, at, radius) {
  return ringScan(dimension, at, radius, [0, 1, 2, -1, 3, -2], (dim, x, y, z) => {
    const floor = blockAt(dim, x, y - 1, z);
    if (!isFooting(floor) || isWaterBlock(floor)) return false;
    return canOccupy(blockAt(dim, x, y, z)) && canOccupy(blockAt(dim, x, y + 1, z)) &&
      !waterAt(dim, x, y, z) && !waterAt(dim, x, y + 1, z);
  });
}

/**
 * Naik satu blok ke arah permukaan air.
 *
 * Langkah companion di add-on ini berupa teleportasi kecil (util.js), jadi
 * "berenang" pun begitu: satu blok tiap denyut kerja, sampai kakinya berada di
 * blok air paling atas dan kepalanya keluar ke udara. Naik sekaligus ke
 * permukaan sengaja tidak dilakukan — dari luar itu terlihat seperti companion
 * yang meloncat keluar dari dasar danau, bukan yang berenang.
 */
function riseTowardSurface(entity) {
  const at = entity.location;
  const x = Math.floor(at.x);
  const z = Math.floor(at.z);
  const from = Math.floor(at.y);
  let top;
  for (let y = from; y < from + 40; y++) {
    if (waterAt(entity.dimension, x, y, z)) continue;
    top = y - 1;
    break;
  }
  if (top === undefined || top <= from) return false;
  const next = Math.min(top, from + SWIM.riseStep);
  try {
    entity.teleport({ x: at.x, y: next + 0.02, z: at.z }, { dimension: entity.dimension });
    logDebug(TAG, `${entStr(entity)} berenang naik ${next - from} blok (permukaan di Y=${top}).`);
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal menaikkan ${entStr(entity)} ke permukaan air`, e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Makan
 * ------------------------------------------------------------------ */

function pantry(entity, state) {
  const chest = state.station ? containerAt(entity.dimension, state.station) : undefined;
  if (chest && countIn(chest, FOOD_IDS) > 0) return chest;
  const bag = bagContainer(entity, state);
  return countIn(bag, FOOD_IDS) > 0 ? bag : chest;
}

/**
 * Makan satu porsi dari peti atau kantong sendiri. Balikan nama barangnya
 * kalau memang ada yang dimakan.
 */
function eatOnce(entity, state) {
  const box = pantry(entity, state);
  if (!box) return undefined;
  const id = FOOD_IDS.find((food) => countIn(box, food) > 0);
  if (!id) return undefined;
  if (takeFrom(box, id, 1) !== 1) return undefined;

  const hp = entity.getComponent("minecraft:health");
  const { cur, max } = healthOf(entity);
  try {
    hp?.setCurrentValue(Math.min(max, cur + (FOOD_HEAL[id] ?? 4)));
  } catch (e) {
    logWarn(TAG, `Gagal memulihkan nyawa ${entStr(entity)} sesudah makan`, e);
  }
  const at = entity.location;
  hold(entity, 20, { pose: POSE.normal, face: FACE.happy, reason: "eat" });
  particle(entity.dimension, "minecraft:heart_particle", { x: at.x, y: at.y + 2.1, z: at.z });
  sound(entity.dimension, "random.eat", at, { volume: 0.6 });
  logInfo(TAG, `${entStr(entity)} makan ${id} (nyawa ${cur} -> ${Math.min(max, cur + (FOOD_HEAL[id] ?? 4))}).`);
  return id;
}

/**
 * Nyawa tinggal sedikit: makan sendiri, atau pesan makanan ke perajin.
 *
 * SENGAJA tidak menghentikan pekerjaan — companion yang terluka tetap boleh
 * bekerja, dia cuma makan sambil jalan. Yang berhak menghentikan pekerjaan
 * cuma api dan air.
 */
function recover(entity, state, ownerId) {
  const { cur, max } = healthOf(entity);
  if (!max || cur >= max * SWIM.eatBelow) return undefined;

  const ate = eatOnce(entity, state);
  if (ate) {
    sayFrom(entity, "eat");
    return `makan ${ate} untuk memulihkan nyawa`;
  }

  const mark = markOf(entity);
  const now = system.currentTick;
  if (!ownerId || !state.station) return undefined;
  if (now - (mark.askedFoodAt ?? -SWIM.askEvery) < SWIM.askEvery) return undefined;
  mark.askedFoodAt = now;
  requestItem(entity, state, ownerId, "bread", state.station);
  logInfo(TAG, `${entStr(entity)} memesan makanan ke perajin (nyawa ${cur}/${max}).`);
  report(entity, mark.drowned
    ? "Aku tadi hampir tenggelam. Tolong ada yang buatkan makanan."
    : "Nyawaku tinggal sedikit. Tolong ada yang buatkan makanan.");
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

/**
 * Satu denyut keselamatan, dipanggil main.js SEBELUM tenaga dan mode kerja.
 *
 * Balikan sebuah kalimat berarti keselamatan MENGAMBIL ALIH denyut ini:
 * pemanggil wajib melewatkan istirahat dan mode kerjanya. Balikan undefined
 * berarti tidak ada yang darurat dan companion boleh bekerja seperti biasa.
 */
export function tickSurvival(entity, state, ownerId) {
  if (!alive(entity)) return undefined;
  const mark = markOf(entity);
  const dimension = entity.dimension;
  const now = system.currentTick;

  /* --- 1. Badan terbakar --- */
  if (onFire(entity)) {
    if (isWaterBlock(blockAt(dimension, entity.location.x, entity.location.y, entity.location.z))) {
      extinguish(entity);
      logInfo(TAG, `${entStr(entity)} memadamkan api di air.`);
      return "nyemplung memadamkan api";
    }
    const water = nearestWater(dimension, entity.location, SWIM.fireSearch);
    if (water) {
      if (now - (mark.burnedAt ?? -200) > 200) {
        mark.burnedAt = now;
        logWarn(TAG, `${entStr(entity)} terbakar; lari ke air di ${posStr(water)}.`);
        report(entity, "Badanku kebakar! Aku nyemplung dulu.");
        sayFrom(entity, "hurt");
      }
      setFace(entity, FACE.hurt);
      // Dua pilihan rute yang dua-duanya wajib di sini, dan ini satu-satunya
      // tempat keduanya dipakai:
      //   avoidWater: false  air diberi biaya nol, bukan biaya tinggi
      //   reach: 0.4         "sampai" berarti KAKI DI DALAM airnya
      // Tanpa yang kedua, pathfinding menganggap tugasnya selesai satu setengah
      // blok dari tepi kolam dan companion berdiri di situ sambil terus
      // terbakar — persis kelakuan yang seharusnya diperbaiki.
      steer(entity, water, 0.45, { avoidWater: false, reach: 0.4 });
      return "terbakar, lari ke air terdekat";
    }
    logDebug(TAG, `${entStr(entity)} terbakar tapi tidak ada air dalam ${SWIM.fireSearch} blok.`);
  }

  /* --- 2. Terjebak di air dalam --- */
  if (deepWater(entity)) {
    if (mark.wetSince === undefined) {
      mark.wetSince = now;
      logInfo(TAG, `${entStr(entity)} masuk air dalam di ${posStr(entity.location)}; mulai berenang.`);
      sayFrom(entity, "swim");
    }
    riseTowardSurface(entity);

    const stale = !mark.shore || now - (mark.shoreAt ?? 0) > SWIM.shoreEvery;
    if (stale) {
      mark.shore = nearestShore(dimension, entity.location, SWIM.shoreSearch);
      mark.shoreAt = now;
      if (mark.shore) logDebug(TAG, `Daratan terdekat untuk ${entStr(entity)}: ${posStr(mark.shore)}`);
    }

    const drowning = submerged(entity) && now - mark.wetSince > SWIM.drownAfter * 10;
    if (drowning && !mark.drowned) {
      mark.drowned = true;
      logWarn(TAG, `${entStr(entity)} terlalu lama terbenam; dianggap tersedak air.`);
      report(entity, "Aku kehabisan napas di air! Tolong!");
    }

    if (mark.shore) {
      // Terus melangkah SAMPAI benar-benar keluar dari air. Berhenti begitu
      // "sudah dekat" pernah dicoba dan salah: companion mengambang setengah
      // blok dari tepi, dianggap sudah sampai, lalu denyut berikutnya
      // menemukannya masih di air dalam dan memilih tepi yang sama lagi —
      // bergoyang di pinggir danau tanpa pernah naik.
      steer(entity, mark.shore, 0.42);
      return drowning ? "tenggelam, berenang ke darat" : "berenang ke darat";
    }
    return "berenang mencari daratan";
  }

  if (mark.wetSince !== undefined) {
    logInfo(TAG, `${entStr(entity)} selamat sampai darat sesudah ${now - mark.wetSince} tick di air.`);
    mark.wetSince = undefined;
    mark.shore = undefined;
    setFace(entity, FACE.auto);
    if (mark.drowned) sayFrom(entity, "rest");
  }

  /* --- 3. Pulih: makan atau pesan makanan --- */
  const meal = recover(entity, state, ownerId);
  if (meal) return meal;

  // Lapar sudah tertangani dan nyawanya kembali penuh: lupakan bahwa dia
  // pernah tenggelam, supaya laporan berikutnya tidak salah menyebutnya.
  if (mark.drowned) {
    const { cur, max } = healthOf(entity);
    if (max && cur >= max * SWIM.eatBelow) mark.drowned = false;
  }
  return undefined;
}
