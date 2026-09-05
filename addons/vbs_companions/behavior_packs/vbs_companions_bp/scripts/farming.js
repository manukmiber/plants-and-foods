/**
 * Mode bertani.
 *
 * Yang membedakan versi ini dari yang lama: companion tidak lagi "menyapu radius
 * dan mengubah state blok". Dia punya STASIUN (peti + papan), punya ALAT yang
 * dibuatnya sendiri di meja kerja, menanam BERPOLA menurut jalur, dan memanen
 * dengan cara yang butuh waktu — jongkok dulu, mengayun-ayunkan tangan, baru
 * kentangnya lepas dan bibitnya ditanam ulang.
 *
 * Urutan yang dikerjakan tiap denyut selalu sama, dan berhenti di langkah
 * pertama yang belum beres:
 *
 *   1. stasiun ada?          -> kalau belum, pasang peti dan papan
 *   2. cangkul ada?          -> kalau belum, buat di meja kerja dari isi peti
 *   3. sedang mengerjakan?   -> lanjutkan pekerjaan yang sedang berjalan
 *   4. ada yang matang?      -> panen (jongkok, ayun, ambil, tanam ulang)
 *   5. ada petak kosong?     -> tanam menurut jalur
 *   6. boleh melebar?        -> cangkul tanah, gali parit air, tanami
 *   7. sudah rapi semua?     -> hias, lalu patoknya berubah jadi hijau
 *
 * Batas garapan diambil dari patok chunk kalau ada (lihat claim.js); kalau
 * pemain belum mematok apa pun, companion hanya menggarap radius kecil di
 * sekitar stasiun dan tidak pernah melebar sendiri.
 */

import { system } from "@minecraft/server";

import {
  BAND_WIDTH, CROPS, POSE, PROTECTED, SEEDS, TILLABLE, WATER,
} from "./config.js";
import { report, sayFrom } from "./chat.js";
import { craftStep, labelOf } from "./crafting.js";
import { decorateStep } from "./decorate.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { claimAt, chunkBounds, claimsNear, markWorked } from "./claim.js";
import { patchState, writeState } from "./state.js";
import { ensureStation, refreshSign } from "./station.js";
import {
  alive, blockAt, countIn, dist2, face, getGear, give, info, isAir, isSolid,
  makeItem, particle, putIn, randomBetween, sound, steer, takeFrom,
} from "./util.js";

const BUCKETS = ["minecraft:bucket", "minecraft:water_bucket"];
const IRON = "minecraft:iron_ingot";
const IRON_FOR_BUCKET = 3;
const SCAN_PER_TICK = 90;        // kolom yang diperiksa tiap denyut
const HARVEST_TICKS = 36;        // lama jongkok + mengayun sebelum hasilnya lepas
const REACH = 2.6;

// --- petak garapan ---------------------------------------------------------

/**
 * Batas garapan companion ini.
 *
 * Tanpa patok: kotak kecil di sekitar stasiun, dan `chunks` kosong — artinya
 * companion tidak akan pernah mencangkul tanah baru. Dengan patok: satu chunk
 * penuh, dan satu chunk lagi kalau pemain mengizinkan lewat menu.
 */
export function workArea(entity, state, ownerId) {
  const base = state.station ?? entity.location;
  const radius = info(entity)?.farmRadius ?? 6;
  const mine = claimAt(entity.dimension, base, ownerId);
  if (!mine) {
    return {
      x0: Math.floor(base.x) - radius, x1: Math.floor(base.x) + radius,
      z0: Math.floor(base.z) - radius, z1: Math.floor(base.z) + radius,
      y: Math.floor(base.y), chunks: [], claimed: false,
    };
  }
  const chunks = [{ cx: mine.cx, cz: mine.cz }];
  if (state.allowExpand) {
    const extra = claimsNear(entity.dimension, base, ownerId, 4)
      .find((c) => (c.cx !== mine.cx || c.cz !== mine.cz) && !c.entry.worked);
    if (extra) chunks.push({ cx: extra.cx, cz: extra.cz });
  }
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const c of chunks) {
    const b = chunkBounds(c.cx, c.cz);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1);
    z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1);
  }
  return { x0, x1, z0, z1, y: Math.floor(base.y), chunks, claimed: true };
}

function areaWidth(area) {
  return area.x1 - area.x0 + 1;
}

function columnAt(area, index) {
  const w = areaWidth(area);
  return { x: area.x0 + (index % w), z: area.z0 + Math.floor(index / w) };
}

function areaSize(area) {
  return areaWidth(area) * (area.z1 - area.z0 + 1);
}

/**
 * Permukaan yang bisa dikerjakan di satu kolom: blok tanah paling atas dalam
 * jangkauan ±4 dari tinggi stasiun, dengan udara di atasnya. Dibatasi begitu
 * supaya companion tidak memanjat bukit atau menggali ke dalam rumah orang.
 */
function surfaceAt(dimension, x, z, baseY) {
  for (let y = baseY + 3; y >= baseY - 4; y--) {
    const here = blockAt(dimension, x, y, z);
    const above = blockAt(dimension, x, y + 1, z);
    if (!here || !above) continue;
    if (here.isAir) continue;
    // Tanaman BUKAN permukaan — yang dicari tanah tempatnya tumbuh. Tanpa baris
    // ini, kolom yang sudah ditanami mengembalikan bloknya sendiri, dan yang
    // matang tidak pernah terlihat oleh pemindai.
    if (CROPS[here.typeId]) continue;
    if (!isAir(above) && !CROPS[above.typeId]) return undefined;
    return here;
  }
  return undefined;
}

// --- bibit dan pola --------------------------------------------------------

/** Bibit yang ada di peti, dalam urutan tetap — itu yang jadi urutan jalurnya. */
function seedsIn(container) {
  return Object.keys(SEEDS).filter((id) => countIn(container, id) > 0);
}

/**
 * Bibit untuk satu kolom.
 *
 * Ladangnya dibagi jadi jalur selebar BAND_WIDTH blok sepanjang sumbu X, dan
 * jalur ke-n memakai bibit ke-n. Karena patokannya tepi kiri petak dan bukan
 * posisi companion, jalurnya tetap di tempat yang sama walau companion berpindah
 * atau dunia ditutup — itulah bedanya "berpola" dengan "acak".
 */
function seedForColumn(x, area, available) {
  if (!available.length) return undefined;
  const band = Math.floor((x - area.x0) / BAND_WIDTH);
  return available[((band % available.length) + available.length) % available.length];
}

// --- pengairan -------------------------------------------------------------

function isChannelColumn(x, area) {
  const off = ((x - area.x0) % 8 + 8) % 8;
  return off === 3;
}

function waterNear(dimension, x, y, z, radius = 8) {
  for (let dx = -radius; dx <= radius; dx += 2) {
    for (let dz = -radius; dz <= radius; dz += 2) {
      for (let dy = -2; dy <= 1; dy++) {
        const block = blockAt(dimension, x + dx, y + dy, z + dz);
        if (block && WATER.has(block.typeId)) return { x: x + dx, y: y + dy, z: z + dz };
      }
    }
  }
  return undefined;
}

/**
 * Boleh menggali parit? Butuh ember di peti, atau besi yang cukup untuk membuat
 * satu — dan harus ada air sungguhan di dekat ladang, karena airnya diangkut
 * dari situ, bukan diciptakan.
 */
function irrigation(entity, state, container, area) {
  if (!container) return { ok: false, why: "no-chest" };
  const river = waterNear(entity.dimension,
                          Math.floor((area.x0 + area.x1) / 2), area.y,
                          Math.floor((area.z0 + area.z1) / 2), 12);
  if (!river) return { ok: false, why: "no-river" };
  if (countIn(container, BUCKETS) > 0) return { ok: true, river };
  if (countIn(container, IRON) >= IRON_FOR_BUCKET) {
    takeFrom(container, IRON, IRON_FOR_BUCKET);
    putIn(container, makeItem("minecraft:bucket", 1));
    sound(entity.dimension, "random.anvil_use", entity.location);
    return { ok: true, river, forged: true };
  }
  return { ok: false, why: "no-bucket" };
}

// --- panen -----------------------------------------------------------------

function ripe(block) {
  const crop = CROPS[block?.typeId];
  if (!crop) return false;
  try {
    return block.permutation.getState(crop.state) === crop.ripe;
  } catch {
    return false;
  }
}

/**
 * Hasil panen masuk ke kantong pemilik kalau dia sedang di dekat situ, dan ke
 * peti stasiun kalau tidak. Bukan salah satu saja: kalau selalu ke kantong,
 * pemain yang sedang jauh tidak dapat apa-apa; kalau selalu ke peti, berdiri di
 * sebelah companion sambil panen jadi terasa aneh.
 */
function deliver(entity, owner, container, item) {
  if (!item) return;
  if (owner && owner.dimension.id === entity.dimension.id &&
      dist2(owner.location, entity.location) < 16 * 16) {
    give(owner, item);
    return;
  }
  if (container) {
    putIn(container, item, entity.dimension, entity.location);
    return;
  }
  entity.dimension.spawnItem(item, entity.location);
}

/**
 * Menyelesaikan satu panen: hasilnya keluar, umur tanamannya dibalikkan ke nol.
 * Mengembalikan nama hasil utamanya untuk dilaporkan.
 */
function finishHarvest(entity, block, owner, container) {
  const crop = CROPS[block.typeId];
  if (!crop) return undefined;
  let main;
  for (const [id, min, max] of crop.drops) {
    const count = randomBetween(min, max);
    if (count <= 0) continue;
    if (!main) main = id;
    deliver(entity, owner, container, makeItem(id, count));
  }
  try {
    block.setPermutation(block.permutation.withState(crop.state, 0));   // tanam ulang
  } catch {
    return main;
  }
  return main;
}

// --- satu denyut -----------------------------------------------------------

/**
 * Satu denyut mode bertani. Mengembalikan keterangan pendek tentang apa yang
 * sedang dikerjakan, supaya pemanggilnya bisa memberi tahu pemain kalau
 * companion berhenti karena kekurangan sesuatu.
 */
export function tickFarm(entity, state, owner) {
  if (!alive(entity)) return "hilang";
  const dimension = entity.dimension;
  const ownerId = owner?.id ?? state.ownerId;

  // 1. stasiun
  const station = ensureStation(entity, state);
  if (!station) return "tidak ada tempat untuk stasiun";
  const container = station.container;

  // 2. cangkul
  const held = getGear(entity).mainhand;
  const craft = craftStep(entity, state, "hoe", container, held);
  if (craft === "no-material") return "peti kosong: butuh kayu, batu, besi, emas atau intan";
  if (craft === "no-table") return "tidak ada meja kerja dan tidak ada papan di peti";
  if (craft === "walking" || craft === "crafting") {
    writeState(entity, state);
    return "membuat cangkul";
  }
  if (craft === "done") {
    writeState(entity, state);
    sayFrom(entity, "done");
    return `${labelOf("hoe")} baru selesai`;
  }

  const area = workArea(entity, state, ownerId);
  refreshSign(entity, state);

  // 3. pekerjaan yang sedang berjalan
  if (state.job?.kind === "harvest") {
    const status = continueHarvest(entity, state, owner, container);
    writeState(entity, state);
    if (status) return status;
  }

  // 4-6. cari pekerjaan berikutnya
  const found = scan(entity, state, area, container, ownerId);
  writeState(entity, state);
  return found;
}

/** Lanjutkan panen yang sedang berjalan. Mengembalikan status, atau undefined kalau selesai. */
function continueHarvest(entity, state, owner, container) {
  const job = state.job;
  const at = job.at;
  const block = blockAt(entity.dimension, at.x, at.y, at.z);
  if (!block || !ripe(block)) {
    state.job = null;                       // sudah dipanen orang lain
    return undefined;
  }
  const target = { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };

  if (dist2(entity.location, target) > REACH ** 2) {
    steer(entity, target);
    return "menuju tanaman";
  }

  // Disapa pemain di tengah panen: berhenti sepenuhnya, dan pekerjaannya
  // menunggu. Pose menyapa yang menang, bukan pose memanen.
  if (isGreeting(entity)) {
    job.until = system.currentTick + HARVEST_TICKS;
    return "berhenti karena disapa";
  }

  const now = system.currentTick;
  if (!job.until) {
    face(entity, target);
    job.until = now + HARVEST_TICKS;
    hold(entity, HARVEST_TICKS + 8, { pose: POSE.harvest, reason: "harvest" });
    sound(entity.dimension, "dig.grass", target);
    return "jongkok di depan tanaman";
  }
  if (now < job.until) {
    hold(entity, 12, { pose: POSE.harvest, reason: "harvest" });
    if (now % 8 === 0) {
      particle(entity.dimension, "minecraft:crop_growth_emitter",
               { x: target.x, y: at.y + 0.4, z: target.z });
      sound(entity.dimension, "dig.grass", target, { volume: 0.5 });
    }
    return "menarik tanaman";
  }

  const main = finishHarvest(entity, block, owner, container);
  state.job = null;
  sound(entity.dimension, "random.pop", target);
  particle(entity.dimension, "minecraft:villager_happy",
           { x: target.x, y: at.y + 0.6, z: target.z });
  return main ? `memanen ${main.replace("minecraft:", "")}` : undefined;
}

/**
 * Sapu petak garapan mulai dari tempat terakhir berhenti dan kerjakan hal
 * pertama yang ketemu. Kursornya disimpan supaya ladang seluas satu chunk pun
 * tersapu habis tanpa memeriksa 256 kolom sekaligus tiap denyut.
 */
function scan(entity, state, area, container, ownerId) {
  const dimension = entity.dimension;
  const total = areaSize(area);
  const plan = state.plan ?? {};
  let cursor = typeof plan.cursor === "number" ? plan.cursor : 0;
  const seeds = seedsIn(container);
  const water = area.claimed ? irrigation(entity, state, container, area) : { ok: false };
  let tilled = 0;
  let planted = 0;
  // Yang matang tidak langsung diambil begitu ketemu: dikumpulkan dulu selama
  // satu sapuan, lalu yang TERDEKAT yang dituju. Mengambil yang pertama ketemu
  // membuat companion menyeberangi ladang bolak-balik, dan itu terlihat jelas
  // di ladang seluas satu chunk.
  let nearest;
  let nearestD = Infinity;

  for (let n = 0; n < SCAN_PER_TICK; n++) {
    const { x, z } = columnAt(area, cursor);
    cursor = (cursor + 1) % total;

    const surface = surfaceAt(dimension, x, z, area.y);
    if (!surface) continue;
    if (PROTECTED.has(surface.typeId)) continue;
    const above = blockAt(dimension, x, surface.y + 1, z);

    if (above && ripe(above)) {
      const d = dist2(entity.location, { x: x + 0.5, y: above.y, z: z + 0.5 });
      if (d < nearestD) {
        nearestD = d;
        nearest = { x, y: above.y, z };
      }
      continue;
    }

    if (surface.typeId === "minecraft:farmland") {
      if (!isAir(above) || planted >= 3) continue;
      const seed = seedForColumn(x, area, seeds);
      if (!seed) continue;
      if (takeFrom(container, seed, 1) !== 1) continue;
      try {
        above.setType(SEEDS[seed]);
        planted++;
        particle(dimension, "minecraft:crop_growth_emitter",
                 { x: x + 0.5, y: above.y + 0.3, z: z + 0.5 });
      } catch {
        putIn(container, makeItem(seed, 1));
      }
      continue;
    }

    // Melebarkan ladang: hanya di dalam chunk yang dipatok, dan hanya di petak
    // yang airnya sampai. Dua jalan ke situ — companion menggali parit sendiri
    // (butuh ember dan sungai di dekat ladang), atau petaknya kebetulan sudah
    // dekat air alami. Jalan kedua penting: tanpa itu, pemain yang base-nya jauh
    // dari sungai tidak bisa memakai fitur ini sama sekali.
    if (!area.claimed || tilled >= 3) continue;
    if (!TILLABLE.has(surface.typeId)) continue;
    if (!isAir(above)) continue;
    const wet = water.ok || waterNear(dimension, x, surface.y, z, 4);
    if (!wet) continue;

    if (water.ok && isChannelColumn(x, area)) {
      try {
        surface.setType("minecraft:water");
        tilled++;
        sound(dimension, "bucket.empty_water", { x, y: surface.y, z });
      } catch {
        /* tidak bisa menaruh air di sini */
      }
      continue;
    }
    try {
      surface.setType("minecraft:farmland");
      tilled++;
      if (tilled === 1) {
        hold(entity, 16, { pose: POSE.build, reason: "till" });
        sound(dimension, "step.gravel", { x, y: surface.y, z });
      }
    } catch {
      /* blok tidak bisa diubah */
    }
  }

  plan.cursor = cursor;
  state.plan = plan;

  if (nearest) {
    plan.idle = 0;
    state.job = { kind: "harvest", at: nearest, until: 0 };
    return "menuju tanaman matang";
  }

  if (tilled || planted) {
    plan.idle = 0;
    state.plan = plan;
    return tilled ? "mencangkul dan menggali parit" : "menanam berpola";
  }
  // Satu denyut hanya memeriksa sebagian petak, jadi "tidak menemukan apa-apa"
  // sekali belum berarti ladangnya sudah beres. Menghias baru boleh setelah
  // tiga sapuan berturut-turut kosong — cukup untuk melewati seluruh petak.
  plan.idle = (plan.idle ?? 0) + 1;
  state.plan = plan;

  // 7. tidak ada lagi yang bisa dikerjakan di petak ini
  if (!seeds.length && area.claimed) return "peti kehabisan bibit";
  if (area.claimed && !water.ok && water.why === "no-bucket") {
    return "butuh ember atau besi di peti untuk mengairi";
  }
  if (area.claimed && !water.ok && water.why === "no-river") {
    return "tidak ada sungai di dekat ladang, tidak bisa melebar";
  }

  if (plan.idle < 3) return "memeriksa ladang";

  const decorated = decorateStep(entity, state, area, container);
  if (decorated) return decorated;

  for (const c of area.chunks) {
    if (markWorked(dimension, c.cx, c.cz)) {
      report(entity, `Chunk (${c.cx}, ${c.cz}) sudah jadi ladang.`);
    }
  }
  return "ladang sudah rapi";
}

/** Dipanggil UI saat pemain mengizinkan perluasan satu chunk lagi. */
export function setExpand(entity, allow) {
  patchState(entity, { allowExpand: Boolean(allow) });
}
