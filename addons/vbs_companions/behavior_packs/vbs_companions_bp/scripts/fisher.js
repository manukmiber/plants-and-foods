/**
 * Mode Memancing.
 *
 * Companion mencari perairan yang layak, membuat jorannya sendiri, berdiri di
 * tepi, melempar kail, MENUNGGU, lalu membawa pulang tangkapannya ke peti.
 *
 * Perannya bukan hiasan: ikan adalah satu-satunya bahan makanan di add-on ini
 * yang tidak menuntut ladang, tidak menuntut ternak, dan tidak menuntut
 * pemainnya menyetok apa pun. Companion yang baru dijinakkan di tepi danau
 * bisa langsung memberi makan seisi halaman lewat dapur perajin (kitchen.js),
 * jauh sebelum petak ladang pertama jadi.
 *
 * Menunggu itu inti perannya, bukan kekurangannya. Satu tangkapan makan
 * belasan detik, dan selama itu companion benar-benar berdiri diam menghadap
 * air — kalau ikannya langsung muncul, memancing berhenti terasa seperti
 * memancing dan berubah jadi keran ikan gratis.
 */

import { system } from "@minecraft/server";

import { FACE, FISH, POSE, WATER } from "./config.js";
import { report, sayFrom } from "./chat.js";
import { craftItemStep } from "./crafting.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { requestItem } from "./requests.js";
import { ensureMaterial } from "./selfhelp.js";
import { writeState } from "./state.js";
import { ensureStation, stationTravel } from "./station.js";
import {
  alive, blockAt, canOccupy, countIn, dist2, face, getGear, getOwnerId,
  isFooting, makeItem, particle, prettyItem, putIn, randomBetween, setFace,
  sound, steer,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "FISHER";
const ROD = "minecraft:fishing_rod";
const REACH = 2.6;

/* ------------------------------------------------------------------ *
 * Mencari tempat memancing
 * ------------------------------------------------------------------ */

function isWater(dimension, x, y, z) {
  const b = blockAt(dimension, x, y, z);
  return Boolean(b) && WATER.has(b.typeId);
}

/**
 * Perairan itu cukup besar untuk dipancing?
 *
 * Genangan hujan selebar dua blok bukan tempat memancing, dan parit irigasi
 * ladang sendiri apalagi. Ambang ini yang membedakan keduanya dari danau —
 * tanpa itu, pemancing menghabiskan seluruh harinya di depan parit petani.
 */
function bigEnough(dimension, at) {
  let n = 0;
  for (let dx = -FISH.pondCheck; dx <= FISH.pondCheck; dx++) {
    for (let dz = -FISH.pondCheck; dz <= FISH.pondCheck; dz++) {
      if (isWater(dimension, at.x + dx, at.y, at.z + dz)) n++;
    }
  }
  logDebug(TAG, `Perairan di ${posStr(at)}: ${n} blok air dalam petak periksa.`);
  return n >= FISH.pondMin;
}

/**
 * Tempat berdiri memancing: petak KERING yang bersebelahan dengan air besar.
 *
 * Yang dicari titik berdirinya, bukan airnya. Companion yang dikirim ke blok
 * air akan berdiri DI DALAM danau — dan sejak survival.js ada, dia akan
 * langsung berenang keluar lagi. Dua sistem yang saling melawan itulah yang
 * harus dihindari di sini.
 */
export function findSpot(entity, radius) {
  const dimension = entity.dimension;
  const at = entity.location;
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);

  for (let r = 2; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = 3; dy >= -6; dy--) {
          const wx = bx + dx;
          const wy = by + dy;
          const wz = bz + dz;
          if (!isWater(dimension, wx, wy, wz)) continue;
          if (!bigEnough(dimension, { x: wx, y: wy, z: wz })) continue;
          const shore = shoreBeside(dimension, wx, wy, wz);
          if (shore) {
            logInfo(TAG, `${entStr(entity)} memilih tempat memancing di ${posStr(shore)}.`);
            return { stand: shore, water: { x: wx, y: wy, z: wz } };
          }
        }
      }
    }
  }
  return undefined;
}

function shoreBeside(dimension, x, y, z) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                          [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (const dy of [0, 1]) {
      const sx = x + dx;
      const sy = y + dy;
      const sz = z + dz;
      const feet = blockAt(dimension, sx, sy, sz);
      const head = blockAt(dimension, sx, sy + 1, sz);
      const floor = blockAt(dimension, sx, sy - 1, sz);
      if (!feet || !head || !floor) continue;
      if (isWater(dimension, sx, sy, sz)) continue;
      if (!canOccupy(feet) || !canOccupy(head) || !isFooting(floor)) continue;
      return { x: sx, y: sy, z: sz };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Tangkapan
 * ------------------------------------------------------------------ */

/**
 * Satu tangkapan, ditimbang dari daftar di config.
 *
 * Sampah ikut masuk daftar dengan sengaja. Memancing yang selalu menghasilkan
 * ikan bukan memancing — dan sepatu bot bekas yang sesekali tersangkut adalah
 * satu-satunya hal yang membuat pemain benar-benar menonton pemancingnya.
 */
function rollCatch() {
  const total = FISH.loot.reduce((sum, row) => sum + row.weight, 0);
  let roll = Math.random() * total;
  for (const row of FISH.loot) {
    roll -= row.weight;
    if (roll <= 0) return row;
  }
  return FISH.loot[0];
}

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

export function tickFisher(entity, state, owner) {
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station.container;
  if (!container) return "tidak ada tempat menyimpan apa pun";

  // Tas penuh: pulang menyetor dulu.
  const caught = countIn(container, FISH.loot.map((r) => r.id));
  if (state.fishTrip && caught >= FISH.haulAt) {
    const trip = stationTravel(entity, station);
    if (trip) {
      writeState(entity, state);
      return trip;
    }
    state.fishTrip = null;
  }

  // 1. Joran. Tanpa itu tidak ada yang bisa dilempar ke air.
  if (countIn(container, ROD) < 1 && getGear(entity).mainhand !== ROD) {
    const made = craftItemStep(entity, state, "fishing_rod", container);
    if (made.status === "walking" || made.status === "crafting") {
      writeState(entity, state);
      return "membuat joran";
    }
    if (made.status === "done") {
      writeState(entity, state);
      sayFrom(entity, "done");
      return "joran selesai dibuat";
    }
    if (made.status === "no-table") {
      const own = ensureMaterial(entity, state, ownerId, "wood",
                                 station.chest ?? state.station, container);
      writeState(entity, state);
      return own ?? "butuh meja kerja untuk membuat joran";
    }
    requestItem(entity, state, ownerId, "fishing_rod", station.chest ?? state.station);
    const own = ensureMaterial(entity, state, ownerId, made.missing ?? "wood",
                               station.chest ?? state.station, container, { search: true });
    writeState(entity, state);
    return own ?? `menunggu ${made.missing ?? "bahan"} untuk joran`;
  }

  // 2. Tempat memancing. Sekali ketemu, dipegang — mencarinya tiap denyut itu
  //    mahal, dan pemancing yang berpindah kolam tiap setengah detik tidak
  //    pernah sempat menunggu satu tangkapan pun.
  let spot = state.fishSpot;
  if (!spot || !isWater(entity.dimension, spot.water.x, spot.water.y, spot.water.z)) {
    spot = findSpot(entity, FISH.searchRadius);
    if (!spot) {
      const now = system.currentTick;
      if (now - (state.noWaterAt ?? -FISH.complainEvery) > FISH.complainEvery) {
        state.noWaterAt = now;
        report(entity, "Tidak ada perairan yang cukup besar di sekitar sini.");
      }
      writeState(entity, state);
      return "mencari perairan untuk memancing";
    }
    state.fishSpot = spot;
    state.fishCast = null;
  }

  // 3. Berdiri di tepinya.
  const stand = { x: spot.stand.x + 0.5, y: spot.stand.y, z: spot.stand.z + 0.5 };
  if (dist2(entity.location, stand) > REACH ** 2) {
    steer(entity, stand, 0.34);
    writeState(entity, state);
    return "berjalan ke tempat memancing";
  }
  face(entity, spot.water);

  // 4. Melempar kail, lalu MENUNGGU.
  const now = system.currentTick;
  if (!state.fishCast) {
    state.fishCast = {
      until: now + Math.round(randomBetween(FISH.waitMin, FISH.waitMax)),
      at: spot.water,
    };
    hold(entity, FISH.waitMax, { pose: POSE.build, face: FACE.neutral, reason: "fish" });
    sound(entity.dimension, "random.bow", stand, { volume: 0.5 });
    particle(entity.dimension, "minecraft:water_splash_particle",
             { x: spot.water.x + 0.5, y: spot.water.y + 1, z: spot.water.z + 0.5 });
    logDebug(TAG, `${entStr(entity)} melempar kail; menunggu ${state.fishCast.until - now} tick.`);
    writeState(entity, state);
    return "melempar kail";
  }
  if (now < state.fishCast.until) {
    const left = Math.ceil((state.fishCast.until - now) / 20);
    writeState(entity, state);
    return `menunggu umpan disambar (${left} detik)`;
  }

  // 5. Kena.
  const row = rollCatch();
  const amount = Math.max(1, Math.round(randomBetween(row.min ?? 1, row.max ?? 1)));
  const item = makeItem(row.id, amount);
  if (item) putIn(container, item, entity.dimension, entity.location);
  else logWarn(TAG, `Gagal membuat item tangkapan ${row.id}.`);

  state.fishCast = null;
  state.fishTrip = true;
  hold(entity, 18, { pose: POSE.harvest, face: FACE.happy, reason: "catch" });
  setFace(entity, FACE.happy);
  sound(entity.dimension, "random.splash", stand);
  particle(entity.dimension, "minecraft:water_splash_particle",
           { x: spot.water.x + 0.5, y: spot.water.y + 1, z: spot.water.z + 0.5 });
  logInfo(TAG, `${entStr(entity)} menangkap ${amount}x ${row.id}.`);
  if (row.junk) {
    sayFrom(entity, "idle");
    return `dapat ${prettyItem(row.id)} — bukan ikan`;
  }
  sayFrom(entity, "fisher");
  return `dapat ${amount}x ${prettyItem(row.id)}`;
}

/** Ringkasan untuk menu dan buku. */
export function fisherLines(state, container) {
  const caught = countIn(container, FISH.loot.map((r) => r.id));
  return [
    state.fishSpot
      ? `§7Tempat memancing: §f${posStr(state.fishSpot.stand)}`
      : "§8Belum menemukan perairan yang cukup besar.",
    `§7Tangkapan di peti: §f${caught}`,
  ];
}
