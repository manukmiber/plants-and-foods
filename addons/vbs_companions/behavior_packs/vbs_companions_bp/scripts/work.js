/**
 * Menjangkau blok kerja: "berdiri di tempat yang dari situ blok ini bisa
 * disentuh", bukan "berjalan ke blok ini".
 *
 * Bedanya kelihatan sepele dan ternyata adalah akar dari keluhan yang paling
 * sering muncul — companion berdiri diam sambil melaporkan dirinya sedang
 * berjalan. Tiap mode kerja dulu menulis kira-kira begini:
 *
 *     if (dist2(entity.location, blok) > reach ** 2) { steer(entity, blok); }
 *
 * Dua hal salah di situ sekaligus.
 *
 * Pertama, `blok` itu tujuan yang MUSTAHIL. Blok yang mau dibongkar memang
 * berisi sesuatu; kalau pun kosong, ia bisa berada lima blok di udara — daun
 * di atas ladang, batang pohon setinggi pinggang tebing. Tidak ada lantai di
 * situ, jadi pathfinding tidak menemukan jalur, langkah kaki cadangan mendorong
 * udara, dan companion berdiri di bawahnya selamanya. Persis inilah baris
 * peringatan yang muncul di layar pemain:
 *
 *     vbs:kohane@(-2778.5, 64.0, -1317.5) tidak maju 60 tick
 *     menuju -2779, 69, -1318; dianggap mentok.
 *
 * Kaki di y=64, tujuan di y=69. Tidak ada yang bisa menyelamatkan perjalanan
 * itu, dan mode kerja tidak pernah menyerah karena "masih berjalan" bukan
 * kegagalan yang bisa dihitung.
 *
 * Kedua, jangkauannya diukur dari KAKI. Pemain Minecraft menjangkau dari MATA
 * sejauh lima blok, jadi blok tiga meter di atas kepala pun bisa dibongkar
 * tanpa memanjat. Diukur dari kaki dengan ambang 2,8 blok, companion menolak
 * menyentuh apa pun yang lebih tinggi dari bahunya sendiri.
 *
 * Yang disediakan di sini:
 *
 *   canTouch(from, at)          jangkauan mata, seperti pemain
 *   standNear(dimension, at)    petak berpijak yang dari situ blok itu terjangkau
 *   reachBlock(entity, at)      satu denyut: READY | WALKING | BLOCKED
 *
 * BLOCKED adalah jawaban yang selama ini tidak pernah ada. Mode kerja yang
 * menerimanya tahu bahwa petak itu memang tidak bisa dikerjakan dari mana pun,
 * dan boleh melewatinya alih-alih menunggu keajaiban.
 */

import { system } from "@minecraft/server";

import { WORK } from "./config.js";
import { pathBlocked, walkable } from "./path.js";
import { blockAt, face, isStuck, isWaterBlock, steer } from "./util.js";
import { entStr, logDebug, posStr } from "./logger.js";

const TAG = "WORK";

// Hukuman skor untuk tempat berdiri yang basah: lebih besar daripada jarak
// mana pun yang mungkin di dalam radius pencarian, jadi petak kering selalu
// menang — tapi petak basah tetap dipakai kalau memang tidak ada yang lain.
const WET_PENALTY = 1e4;

/** Tinggi mata companion di atas kakinya, sama dengan pemain. */
export const EYE = 1.62;

export const READY = "ready";       // sudah bisa disentuh dari tempat berdiri sekarang
export const WALKING = "walking";   // sedang berjalan ke tempat berdirinya
export const BLOCKED = "blocked";   // tidak ada tempat berdiri, atau jalannya buntu

function center(at) {
  return { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5, z: Math.floor(at.z) + 0.5 };
}

/**
 * Blok itu terjangkau dari kaki di `from`? Diukur mata ke tengah blok.
 */
export function canTouch(from, at, reach = WORK.reach) {
  const to = center(at);
  const dx = to.x - from.x;
  const dy = to.y - (from.y + EYE);
  const dz = to.z - from.z;
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}

/**
 * Petak berpijak terbaik yang dari situ `at` bisa disentuh.
 *
 * Yang dicari petak KAKI: lantainya menopang, badan setinggi dua blok muat, dan
 * jarak mata ke blok sasaran masih di dalam jangkauan. Kolom blok itu sendiri
 * ikut dicoba — berdiri DI ATAS gundukan yang mau dipangkas adalah cara pemain
 * meratakan bukit, dan tanpa itu companion tidak akan pernah bisa memangkas
 * kolom yang lebih tinggi dari jangkauannya sendiri.
 */
export function standNear(dimension, at, opts = {}) {
  const reach = opts.reach ?? WORK.reach;
  const radius = opts.radius ?? WORK.standRadius;
  const from = opts.from;
  let best;
  let bestScore = Infinity;

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const x = Math.floor(at.x) + dx;
      const z = Math.floor(at.z) + dz;
      for (const dy of WORK.standLevels) {
        const y = Math.floor(at.y) + dy;
        if (!walkable(dimension, x, y, z, opts)) continue;
        if (!canTouch({ x: x + 0.5, y, z: z + 0.5 }, at, reach - WORK.slack)) continue;
        // Yang dipilih tempat berdiri terdekat dari companion, bukan yang
        // terdekat dari bloknya: memutari pohon demi berdiri setengah blok
        // lebih dekat itu perjalanan yang sia-sia.
        //
        // Petak BASAH dihukum berat, bukan dilarang. Air memenuhi semua syarat
        // berpijak — badan muat, lantainya "menopang" — jadi tanpa hukuman ini
        // tempat berdiri terdekat dari sebuah blok air adalah air itu sendiri,
        // dan petani yang cuma mau mengisi ember berjalan ke tengah danau lalu
        // turun ke dasarnya. Dari situ dia tidak bisa memanjat keluar lagi, dan
        // seluruh ladangnya berhenti karena penggarapnya berdiri di bawah air.
        const wet = isWaterBlock(blockAt(dimension, x, y - 1, z)) ||
          isWaterBlock(blockAt(dimension, x, y, z));
        const score = (wet ? WET_PENALTY : 0) + (from
          ? (x + 0.5 - from.x) ** 2 + (z + 0.5 - from.z) ** 2 + (y - from.y) ** 2 * 2
          : dx * dx + dz * dz + Math.abs(dy));
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, z };
        }
        break;   // satu ketinggian per kolom sudah cukup
      }
    }
  }
  return best;
}

// Tempat berdiri yang sudah dipilih, dipegang selama sasarannya belum berubah.
// Tanpa ini pilihan bisa berpindah-pindah selagi companion berjalan — dia
// berbelok tiap denyut dan tidak pernah sampai ke satu pun di antaranya.
const spots = new Map();   // entityId -> { key, spot, at }

export function forget(id) {
  if (spots.delete(id)) logDebug(TAG, `forget tempat berdiri untuk ID: ${id}`);
}

function spotFor(entity, at, opts) {
  const key = `${Math.floor(at.x)},${Math.floor(at.y)},${Math.floor(at.z)}`;
  const now = system.currentTick;
  const held = spots.get(entity.id);
  if (held && held.key === key && now - held.at < WORK.keepSpot) {
    const s = held.spot;
    if (walkable(entity.dimension, s.x, s.y, s.z, opts)) return s;
  }
  const spot = standNear(entity.dimension, at, { ...opts, from: entity.location });
  if (spot) spots.set(entity.id, { key, spot, at: now });
  else spots.delete(entity.id);
  return spot;
}

/**
 * Satu denyut menuju posisi kerja untuk `at`.
 *
 *   READY    blok itu sudah terjangkau; companion sudah menghadap ke sana
 *   WALKING  masih berjalan ke tempat berdirinya
 *   BLOCKED  tidak ada tempat berdiri, jalurnya buntu, atau memang mentok
 */
export function reachBlock(entity, at, opts = {}) {
  const reach = opts.reach ?? WORK.reach;
  if (canTouch(entity.location, at, reach)) {
    face(entity, center(at));
    spots.delete(entity.id);
    return READY;
  }

  const spot = spotFor(entity, at, opts);
  if (!spot) {
    logDebug(TAG, `${entStr(entity)} tidak punya tempat berdiri untuk ${posStr(at)}.`);
    return BLOCKED;
  }

  const target = { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 };
  // Pilihan yang diteruskan ke langkah kaki disebut satu per satu, TIDAK
  // disalin bulat-bulat dari opts. `reach` di sini artinya "sejauh apa tangan
  // sampai", di path.js artinya "sedekat apa dianggap tiba" — diteruskan apa
  // adanya, companion menyatakan dirinya sudah tiba empat blok sebelum sampai,
  // lalu berdiri di situ karena dari sana bloknya memang belum terjangkau.
  steer(entity, target, opts.step ?? 0.32, {
    // Dan `reach` yang dipakai berjalan sengaja KETAT. Ambang bawaan
    // pathfinding satu setengah blok: cukup untuk "sampai di peti", jauh
    // terlalu longgar untuk "berdiri di petak ini". Companion menyatakan
    // dirinya tiba satu setengah blok sebelum petaknya, berhenti melangkah,
    // dan denyut berikutnya menghitungnya sebagai tidak maju — mentok, di
    // tengah lapangan kosong, satu setengah blok dari tujuannya.
    reach: WORK.stepReach,
    avoidWater: opts.avoidWater,
    budget: opts.budget,
    range: opts.range,
    goalRadius: opts.goalRadius,
  });
  if (canTouch(entity.location, at, reach)) {
    face(entity, center(at));
    return READY;
  }
  // Mentok itu jawaban, bukan keadaan yang ditunggui. Mode kerja yang menerima
  // BLOCKED menghitungnya sebagai kegagalan petak dan pindah ke petak lain.
  if (isStuck(entity) || pathBlocked(entity)) {
    logDebug(TAG, `${entStr(entity)} mentok menuju ${posStr(spot)} untuk ${posStr(at)}.`);
    spots.delete(entity.id);
    return BLOCKED;
  }
  return WALKING;
}
