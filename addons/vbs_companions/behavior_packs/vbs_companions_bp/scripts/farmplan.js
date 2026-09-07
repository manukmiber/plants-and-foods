/**
 * Rencana ladang: satu gambar lengkap, dibuat sekali, lalu dikerjakan.
 *
 * Mesin fase yang lama ("ratakan semua -> gali parit -> cangkul -> tanam")
 * punya satu sifat yang membuatnya rapuh sampai tidak bisa diselamatkan
 * dengan tambalan: fase berikutnya tidak boleh dimulai sebelum fase sekarang
 * selesai SELURUHNYA. Satu kolom yang tidak bisa ditimbun, satu petak yang
 * tidak bisa diairi, satu pohon yang tidak boleh ditebang — apa pun yang tidak
 * pernah bisa "selesai" mengunci seluruh ladang, dan dari luar itu terlihat
 * persis seperti companion yang berdiri diam.
 *
 * Rencana di berkas ini membalik urutan berpikirnya. Ladang digambar DULU
 * sebagai daftar petak beserta perannya:
 *
 *     .  = di luar ladang        ~  = parit air
 *     #  = petak tanam            o  = petak sumber air di parit
 *     x  = tidak bisa dipakai (blok terlindungi, batu induk, tebing)
 *
 * Gambar itu tetap sama sepanjang umur ladang. Yang berubah cuma DAFTAR TUGAS
 * yang diturunkan darinya, dan tiap tugas berdiri sendiri: "ratakan kolom
 * (3,7)", "gali parit (11,4)", "tuang air di (11,6)", "cangkul (5,9)",
 * "tanam gandum di (5,9)". Satu tugas yang tidak bisa dikerjakan ditandai
 * mustahil dan DILEWATI — sisanya jalan terus.
 *
 * Akibatnya ladang selalu maju. Ladang yang separuh petaknya batu tetap jadi
 * ladang, cuma lebih kecil; ladang yang satu pohonnya tidak boleh ditebang
 * tetap jadi ladang, cuma berlubang satu. Tidak ada lagi keadaan "menunggu
 * sesuatu yang tidak akan pernah datang".
 */

import {
  BAND_WIDTH, CROPS, FARM, FILL_SOURCE, PROTECTED, TILLABLE, WATER,
} from "./config.js";
import { chunkBounds } from "./claim.js";
import { blockAt, groundTop, isAir, isCanopy } from "./util.js";
import { logDebug, logInfo } from "./logger.js";

const TAG = "FARMPLAN";

export const CELL = {
  outside: ".",
  crop: "#",
  channel: "~",
  source: "o",
  blocked: "x",
};

/* ------------------------------------------------------------------ *
 * Menggambar ladang
 * ------------------------------------------------------------------ */

/**
 * Kolom parit ditentukan dari tepi PATOK, bukan tepi petak yang sedang
 * digarap.
 *
 * Petak inti melebar sedikit demi sedikit, jadi tepinya bergerak. Kalau pola
 * paritnya ikut tepi petak, parit yang kemarin berair berhenti dianggap parit
 * hari ini: petani mencangkulnya jadi ladang, ladang di sebelahnya kehilangan
 * sumber air, dan seluruh petak balik jadi tanah. Dipatok ke tepi klaim,
 * polanya tidak pernah bergeser seumur ladang.
 */
export function isChannelColumn(x, anchorX) {
  const off = (((x - anchorX) % FARM.channelEvery) + FARM.channelEvery) % FARM.channelEvery;
  return off === FARM.channelOffset;
}

export function channelXFor(x, anchorX) {
  const off = (((x - anchorX) % FARM.channelEvery) + FARM.channelEvery) % FARM.channelEvery;
  return x - off + FARM.channelOffset;
}

/**
 * Bidang kerja: satu atau dua chunk berpatok, dengan tinggi permukaan yang
 * sudah dibetulkan (claim.js » ensureClaimHeight).
 */
export function fieldBounds(chunks, y) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of chunks) {
    const b = chunkBounds(c.cx, c.cz);
    x0 = Math.min(x0, b.x0);
    x1 = Math.max(x1, b.x1);
    z0 = Math.min(z0, b.z0);
    z1 = Math.max(z1, b.z1);
  }
  return { x0, x1, z0, z1, y };
}

/**
 * Petak yang benar-benar digarap sekarang: kotak di tengah patok yang melebar
 * begitu isinya sudah jadi ladang.
 *
 * Tepi kiri-kanan DIPASKAN ke kolom parit. Tanpa itu, petak bisa berhenti
 * tepat sebelum kolom paritnya sendiri: petak di dalamnya tidak akan pernah
 * kebagian air, dan ladangnya berputar antara "gali parit" dan "cangkul"
 * selamanya.
 */
export function plotOf(field, size) {
  const half = Math.floor(size / 2);
  const cx = Math.round((field.x0 + field.x1) / 2);
  const cz = Math.round((field.z0 + field.z1) / 2);

  let lo = channelXFor(Math.max(field.x0, cx - half), field.x0);
  if (lo > field.x0) lo -= FARM.channelEvery;
  let hi = channelXFor(Math.min(field.x1, cx + half), field.x0);
  if (hi < field.x1) hi += FARM.channelEvery;

  const plot = {
    x0: Math.max(field.x0, lo), x1: Math.min(field.x1, hi),
    z0: Math.max(field.z0, cz - half), z1: Math.min(field.z1, cz + half),
    y: field.y, field,
  };
  plot.whole = plot.x0 <= field.x0 && plot.x1 >= field.x1 &&
    plot.z0 <= field.z0 && plot.z1 >= field.z1;
  return plot;
}

/**
 * Gambar ladang untuk satu petak: peran tiap kolom, sekali jalan.
 *
 * Cuma MEMBACA dunia. Menggambar dan mengerjakan sengaja dipisah, karena
 * gambar yang dibuat sambil mengerjakan itulah yang dulu membuat petak yang
 * sudah jadi ladang berubah peran di tengah jalan.
 */
export function drawField(dimension, plot) {
  const w = plot.x1 - plot.x0 + 1;
  const h = plot.z1 - plot.z0 + 1;
  const cells = new Array(w * h);
  const anchorX = plot.field.x0;
  const anchorZ = plot.field.z0;
  let crops = 0;
  let channels = 0;
  let blocked = 0;

  for (let iz = 0; iz < h; iz++) {
    for (let ix = 0; ix < w; ix++) {
      const x = plot.x0 + ix;
      const z = plot.z0 + iz;
      let role = isChannelColumn(x, anchorX) ? CELL.channel : CELL.crop;

      // Sumber air tiap beberapa blok sepanjang parit: air mengalir tujuh
      // blok, jadi lebih rapat dari itu cuma membuang ember.
      if (role === CELL.channel) {
        const off = z - anchorZ;
        if (off % FARM.sourceEvery === 0 || z === plot.z1) role = CELL.source;
        channels++;
      } else {
        crops++;
      }

      // Blok yang tidak boleh dibongkar membuat kolomnya batal — sekali,
      // di sini, bukan sebagai kejutan di tengah pekerjaan.
      const top = topBlocker(dimension, x, z, plot.y);
      if (top) {
        role = CELL.blocked;
        blocked++;
        crops -= role === CELL.crop ? 1 : 0;
      }
      cells[iz * w + ix] = role;
    }
  }

  logInfo(TAG, `Ladang digambar ${w}x${h} di y=${plot.y}: ` +
    `${crops} petak tanam, ${channels} petak parit, ${blocked} batal.`);
  return { w, h, x0: plot.x0, z0: plot.z0, y: plot.y, cells, anchorX, anchorZ };
}

/** Blok terlindungi di kolom ini yang membuat petaknya batal. */
function topBlocker(dimension, x, z, y) {
  for (let dy = 0; dy <= FARM.clearHeight; dy++) {
    const b = blockAt(dimension, x, y + dy, z);
    if (b && PROTECTED.has(b.typeId)) return b;
  }
  const ground = blockAt(dimension, x, y, z);
  if (ground && PROTECTED.has(ground.typeId)) return ground;
  return undefined;
}

export function roleAt(map, x, z) {
  const ix = x - map.x0;
  const iz = z - map.z0;
  if (ix < 0 || iz < 0 || ix >= map.w || iz >= map.h) return CELL.outside;
  return map.cells[iz * map.w + ix];
}

/* ------------------------------------------------------------------ *
 * Menurunkan daftar tugas dari gambar
 * ------------------------------------------------------------------ */

export const JOB = {
  level: "ratakan",
  borrow: "gali tanah timbun",
  dig: "gali parit",
  pour: "tuang air",
  till: "cangkul",
  plant: "tanam",
  harvest: "panen",
};

/**
 * Blok mana di kolom ini yang harus dipangkas berikutnya — dan kenapa itu bukan
 * "yang paling atas".
 *
 * Versi sebelumnya menyapu dari `clearHeight` ke bawah dan mengembalikan blok
 * pertama yang ditemukannya: yang PALING TINGGI. Di padang rumput itu tidak
 * kelihatan salah. Di hutan birch, yang paling tinggi adalah daun tujuh blok di
 * atas kepala, dan tidak ada tempat berdiri di mana pun yang bisa menyentuhnya.
 * Petani berjalan ke bawah pucuk pohon, mendorong udara, dan berdiri di situ
 * selamanya — inilah baris yang muncul di layar pemain:
 *
 *     vbs:kohane@(-2778.5, 64.0, -1317.5) tidak maju 60 tick
 *     menuju -2779, 69, -1318; dianggap mentok.
 *
 * Yang dipilih sekarang mengikuti cara pemain sungguhan mengosongkan lahan:
 *
 *   - ada POHON di kolom ini  -> tebang dari PANGKALNYA, batang paling bawah.
 *     Itu satu-satunya bagian pohon yang bisa dijangkau dari tanah, dan
 *     sesudahnya batang di atasnya melorot (farming.js » sinkColumn) sehingga
 *     pangkalnya selalu tetap terjangkau.
 *   - cuma TANAH -> pangkas dari PUNCAKNYA, dan petani berdiri di atas gundukan
 *     itu sendiri untuk mengerjakannya. Menggali dari bawah akan melubangi
 *     bukit dan meninggalkan topinya melayang.
 */
export function cutTarget(dimension, x, z, y) {
  let lowestCanopy;
  let highestGround;
  for (let dy = 1; dy <= FARM.clearHeight; dy++) {
    const above = blockAt(dimension, x, y + dy, z);
    if (!above || isAir(above) || above.isLiquid) continue;
    if (CROPS[above.typeId]) continue;   // tanaman sendiri, bukan penghalang
    if (isCanopy(above)) {
      if (lowestCanopy === undefined) lowestCanopy = y + dy;
      continue;
    }
    highestGround = y + dy;
  }
  // TANAH lebih dulu, POHON belakangan — dan urutan itu bukan selera.
  //
  // Pohon yang tumbuh di atas gundukan berdiri LEBIH TINGGI daripada
  // gundukannya. Ditebang lebih dulu, pangkalnya berada di luar jangkauan dari
  // tanah datar di bawah, dan petani menghabiskan seluruh waktunya berjalan
  // bolak-balik di kaki gundukan menuju daun yang tidak akan pernah bisa
  // disentuhnya. Dipangkas gundukannya dulu, pohonnya ikut MELOROT bersama
  // tanah yang dipangkas (farming.js » sinkColumn) sampai pangkalnya berada
  // tepat di permukaan ladang — dan di situ dia bisa ditebang sambil berdiri.
  if (highestGround !== undefined) return { y: highestGround, canopy: false };
  // Pohon yang menggantung jauh di atas kepala DIBIARKAN.
  //
  // Yang tersisa di ketinggian itu hampir selalu daun dari pohon yang batangnya
  // sudah ditebang, dan daun tanpa batang gugur sendiri di Minecraft. Dikejar,
  // petani berjalan bolak-balik di bawahnya menuju tempat berdiri yang tidak
  // ada, menyerah, lalu mencobanya lagi semenit kemudian — selamanya. Batang
  // yang benar-benar tumbuh di sini tidak akan terlewat: pangkalnya ada di
  // permukaan, dan sisa batangnya melorot tiap kali pangkalnya ditebang.
  if (lowestCanopy !== undefined && lowestCanopy <= y + FARM.canopyMax) {
    return { y: lowestCanopy, canopy: true };
  }
  return undefined;
}

/**
 * Satu kolom tanah yang boleh DIGALI untuk menambal cekungan ladang.
 *
 * Ini jawaban untuk kebuntuan yang paling sering terlihat di dunia sungguhan:
 * ladang yang bergelombang butuh tanah timbun, petinya kosong, dan petani
 * menyerah petak demi petak sampai ladangnya tinggal seperempat. Padahal tanah
 * timbunnya ada di sekelilingnya — itu gundukan yang memang harus dipangkas.
 *
 * Urutan pilihannya sengaja: yang lebih TINGGI dari permukaan ladang lebih dulu
 * (menggalinya sekaligus meratakan tanah), baru sesudah itu permukaan datar di
 * luar petak, dan tidak pernah lebih dalam dari `FARM.borrowDepth`. Petak yang
 * sedang digarap tidak pernah disentuh: menggali lubang di ladang sendiri untuk
 * menambal lubang lain di ladang yang sama tidak akan pernah selesai.
 */
export function borrowSpot(dimension, area, plot, from, floorY) {
  const inPlot = (x, z) => x >= plot.x0 && x <= plot.x1 && z >= plot.z0 && z <= plot.z1;
  const inField = (x, z) => x >= area.x0 && x <= area.x1 && z >= area.z0 && z <= area.z1;
  const bx = Math.floor(from.x);
  const bz = Math.floor(from.z);
  const limit = Math.min(FARM.borrowRadius,
    Math.max(area.x1 - area.x0, area.z1 - area.z0));

  let flat;
  for (let r = 1; r <= limit; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = bx + dx;
        const z = bz + dz;
        if (!inField(x, z) || inPlot(x, z)) continue;
        const top = groundTop(dimension, x, z, floorY,
                              { up: FARM.clearHeight, down: FARM.borrowDepth + 1 });
        // Tidak pernah menggali di bawah permukaan ladang. Menggali lubang
        // untuk menambal lubang itu pekerjaan yang tidak akan pernah selesai —
        // dan lebih buruk lagi, lubang barunya jadi jebakan yang membuat
        // petani jatuh ke dalamnya tiap kali lewat.
        if (top === undefined || top < floorY) continue;
        const block = blockAt(dimension, x, top, z);
        if (!block || !FILL_SOURCE.has(block.typeId)) continue;
        // Gundukan menang seketika: menggalinya adalah pekerjaan yang memang
        // harus dilakukan, dan hasilnya persis bahan yang sedang dicari.
        if (top > floorY) {
          logDebug(TAG, `Tanah timbun diambil dari gundukan (${x}, ${z}) di y=${top}.`);
          return { kind: JOB.borrow, x, z, y: top };
        }
        if (!flat) flat = { kind: JOB.borrow, x, z, y: top };
      }
    }
  }
  if (flat) logDebug(TAG, `Tanah timbun diambil dari tanah datar (${flat.x}, ${flat.z}).`);
  return flat;
}

/**
 * Apa yang masih kurang di satu kolom, dibaca dari dunia apa adanya.
 * Balikan undefined kalau kolom itu memang sudah beres.
 */
export function needAt(dimension, map, x, z, container) {
  const role = roleAt(map, x, z);
  if (role === CELL.outside || role === CELL.blocked) return undefined;
  const y = map.y;

  // 1. Apa pun yang berdiri di atas permukaan ladang harus turun dulu —
  //    rumput, bunga, pohon, gundukan tanah.
  const cut = cutTarget(dimension, x, z, y);
  if (cut) return { kind: JOB.level, x, z, y: cut.y, canopy: cut.canopy };

  const ground = blockAt(dimension, x, y, z);
  if (!ground) return undefined;

  if (role === CELL.channel || role === CELL.source) {
    // Parit: lubangnya kosong, lantainya rapat, dan sumbernya berair.
    if (!ground.isAir && !WATER.has(ground.typeId)) {
      return { kind: JOB.dig, x, z, y };
    }
    if (role === CELL.source && !WATER.has(ground.typeId)) {
      return { kind: JOB.pour, x, z, y };
    }
    return undefined;
  }

  // Petak tanam: harus padat, lalu jadi farmland, lalu ada bibitnya.
  if (ground.isAir || ground.isLiquid) {
    return { kind: JOB.level, x, z, y, fill: true };
  }
  if (ground.typeId !== "minecraft:farmland") {
    // Batu, pasir, kerikil: tidak bisa dicangkul, jadi permukaannya DIGANTI.
    // Bongkar satu blok, dan denyut berikutnya membaca kolomnya sebagai cekung
    // lalu menimbunnya dengan tanah. Dulu kolom seperti ini cuma dibiarkan:
    // ladang di tepi pantai atau di atas singkapan batu berakhir belang, dan
    // tidak ada satu pun pesan yang menjelaskan kenapa.
    if (!TILLABLE.has(ground.typeId)) return { kind: JOB.level, x, z, y, swap: true };
    if (!hydrated(dimension, map, x, z)) return undefined;   // nanti, sesudah airnya ada
    return { kind: JOB.till, x, z, y };
  }
  const crop = blockAt(dimension, x, y + 1, z);
  if (crop && isAir(crop)) return { kind: JOB.plant, x, z, y: y + 1 };
  return undefined;
}

/**
 * Petak ini benar-benar kebagian air?
 *
 * Farmland di Minecraft tetap basah kalau ada air dalam empat blok mendatar
 * pada ketinggian yang sama atau satu di atasnya. Karena letak parit sudah
 * pasti, cukup dua pembacaan blok — bukan sapuan 9x9 seperti dulu.
 */
export function hydrated(dimension, map, x, z) {
  const cx = channelXFor(x, map.anchorX);
  if (Math.abs(cx - x) > 4) return false;
  for (const dy of [0, 1]) {
    const b = blockAt(dimension, cx, map.y + dy, z);
    if (b && WATER.has(b.typeId)) return true;
  }
  return false;
}

/**
 * Tugas berikutnya: kolom terdekat dari companion yang masih butuh sesuatu.
 *
 * Sapuannya dibatasi `budget` kolom per denyut. Ladang 16x16 itu 256 kolom,
 * dan memeriksa semuanya tiap setengah detik jauh lebih mahal daripada
 * pekerjaan yang sebenarnya dikerjakan.
 *
 * `offset` yang membuat batas itu tidak berubah jadi KEBUTAAN. Sapuan selalu
 * dimulai dari petak tempat companion berdiri, jadi selama dia diam, sembilan
 * puluh enam kolom yang sama itu juga yang diperiksa — tiap denyut, selamanya.
 * Seratus enam puluh kolom sisanya tidak pernah dilihat sekali pun. Itulah
 * sebabnya ladang bisa berhenti dengan sudut-sudutnya masih bergelombang
 * sementara petaninya berdiri diam melaporkan "ladang sudah rapi": pekerjaannya
 * memang ada, cuma di luar jendela sapuan. Pemanggil menggeser offset tiap kali
 * sapuan pulang dengan tangan kosong, jadi seluruh petak kebagian diperiksa
 * dalam beberapa denyut.
 */
export function nextJob(dimension, map, from, container, skip,
                        budget = FARM.scanPerTick, offset = 0) {
  const total = map.w * map.h;
  let best;
  let bestD = Infinity;
  let looked = 0;
  const start = (cursorOf(map, from) + offset + total) % total;

  for (let n = 0; n < total && looked < budget; n++) {
    const i = (start + n) % total;
    const x = map.x0 + (i % map.w);
    const z = map.z0 + Math.floor(i / map.w);
    if (skip && skip.has(`${x},${z}`)) continue;
    looked++;
    const need = needAt(dimension, map, x, z, container);
    if (!need) continue;
    const d = (x - from.x) ** 2 + (z - from.z) ** 2;
    // Urutannya bukan selera: memangkas dulu, baru menimbun.
    //
    // Dua-duanya "meratakan", tapi memangkas MENGHASILKAN tanah dan menimbun
    // MENGHABISKANNYA. Dikerjakan dengan urutan acak, petani menemui petak
    // cekung pertama selagi petinya masih kosong, menyerah, dan begitu terus —
    // ladang berakhir sebagai saringan berlubang padahal tanah timbunnya ada
    // di gundukan sebelah, tinggal dipangkas. Sesudah itu barulah parit,
    // karena petak yang belum rata membuat parit di sebelahnya bocor.
    const rank = need.kind === JOB.level ? (need.fill ? 1 : 0)
      : need.kind === JOB.dig ? 2 : 3;
    const score = rank * 1e6 + d;
    if (score < bestD) {
      bestD = score;
      best = need;
    }
  }
  if (best) logDebug(TAG, `Tugas berikutnya: ${best.kind} di (${best.x}, ${best.z}).`);
  return best;
}

function cursorOf(map, from) {
  const ix = Math.min(map.w - 1, Math.max(0, Math.round(from.x) - map.x0));
  const iz = Math.min(map.h - 1, Math.max(0, Math.round(from.z) - map.z0));
  return iz * map.w + ix;
}

/** Bibit apa untuk kolom ini — berjalur, supaya ladangnya terbaca rapi. */
export function seedForColumn(x, map, available) {
  if (!available.length) return undefined;
  const band = Math.floor((x - map.anchorX) / BAND_WIDTH);
  return available[((band % available.length) + available.length) % available.length];
}

/** Sudah tidak ada lagi yang bisa dikerjakan di petak ini? */
export function plotDone(dimension, map, container, skip) {
  return !nextJob(dimension, map, { x: map.x0, z: map.z0 }, container, skip, map.w * map.h);
}
