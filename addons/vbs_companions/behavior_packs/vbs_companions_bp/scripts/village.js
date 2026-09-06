/**
 * Pekerjaan umum kampung: menugaskan rumah, membuat jalan, dan memasang
 * penerangan.
 *
 * Sebelum ini pembangun berhenti begitu rumah terakhir berdiri. Kampungnya
 * jadi kumpulan kotak kayu yang berdiri di rumput tinggi, gelap begitu malam,
 * tanpa satu pun jalan di antaranya — dan pengumuman "rumahmu sudah jadi" cuma
 * satu baris chat yang tidak mengubah apa pun: companion yang mengantuk tetap
 * tidur di ranjang terdekat mana pun, termasuk ranjang yang sama dengan
 * kawannya.
 *
 * Berkas ini yang membereskan ketiganya, dan yang penting: PENUGASANNYA NYATA.
 * Saat satu rumah selesai, ranjangnya dicatat atas nama satu companion di
 * papan rumah desa (state.js » writeVillageHomes) DAN ditulis ke state
 * companion itu sebagai `state.bed` — kolom yang sama persis yang dipakai
 * pemain waktu menunjuk ranjang sendiri. Sejak itu companion tersebut benar
 * berjalan pulang ke rumahnya sendiri tiap kali mengantuk, dan tidak ada
 * companion lain yang diberi ranjang itu.
 */

import { BED_IDS, FAMILY, LIGHT_IDS, VILLAGE } from "./config.js";
import { report } from "./chat.js";
import { displayName } from "./nametag.js";
import { patchState, readState, readVillageHomes, writeVillageHomes } from "./state.js";
import {
  alive, allCompanions, blockAt, canOccupy, distXZ, face, getOwnerId,
  isFooting, particle, sound,
} from "./util.js";
import { entStr, logDebug, logInfo, posStr } from "./logger.js";

const TAG = "VILLAGE";

/* ------------------------------------------------------------------ *
 * Menugaskan rumah
 * ------------------------------------------------------------------ */

/** Companion satu pemilik yang masih hidup di dimensi ini. */
function housemates(dimensionId, ownerId) {
  return allCompanions(FAMILY).filter((c) =>
    alive(c) && getOwnerId(c) === ownerId && c.dimension.id === dimensionId);
}

/** Ranjang itu masih benar-benar berdiri di situ? */
function bedStands(dimension, at) {
  const block = blockAt(dimension, at.x, at.y, at.z);
  return Boolean(block) && BED_IDS.includes(block.typeId);
}

/**
 * Menugaskan satu rumah yang baru selesai ke satu companion.
 *
 * Yang dipilih: companion pemilik yang sama, yang BELUM punya ranjang sendiri,
 * yang paling jauh dari ranjang mana pun — companion yang selama ini paling
 * sering tidur di lantai. Pembangunnya sendiri ikut antre seperti yang lain;
 * dia tidak mengambil rumah pertama untuk dirinya.
 *
 * Balikannya companion yang ditugasi, atau undefined kalau semua sudah punya
 * rumah (rumahnya tetap dicatat, tinggal menunggu companion berikutnya).
 */
export function assignHome(builder, ownerId, bed) {
  if (!ownerId) return undefined;
  const dimension = builder.dimension;
  const homes = readVillageHomes(ownerId);
  const taken = new Set(homes.map((h) => h.for).filter(Boolean));

  const candidates = housemates(dimension.id, ownerId).filter((c) => {
    if (taken.has(c.id)) return false;
    const bedNow = readState(c).bed;
    // Ranjang yang ditunjuk PEMAIN tidak boleh ditimpa. Kalau pemain sudah
    // repot menunjuk satu ranjang untuk companion ini, rumah baru di kampung
    // bukan alasan memindahkannya.
    if (bedNow && typeof bedNow.x === "number" && bedStands(dimension, bedNow)) return false;
    return true;
  });
  if (!candidates.length) {
    logInfo(TAG, `Rumah di ${posStr(bed)} selesai tapi semua companion sudah punya ranjang.`);
    return undefined;
  }

  // Yang paling jauh dari rumah barunya justru yang paling butuh: dia yang
  // selama ini bekerja paling jauh dari kampung tanpa tempat pulang.
  candidates.sort((a, b) => distXZ(b.location, bed) - distXZ(a.location, bed));
  const chosen = candidates[0];

  patchState(chosen, { bed: { x: bed.x, y: bed.y, z: bed.z, dim: dimension.id } });
  const row = homes.find((h) => h.x === bed.x && h.y === bed.y && h.z === bed.z);
  if (row) {
    row.for = chosen.id;
    row.forName = displayName(chosen);
    writeVillageHomes(ownerId, homes);
  }
  logInfo(TAG, `Rumah di ${posStr(bed)} ditugaskan ke ${entStr(chosen)}.`);
  return chosen;
}

/** Rumah yang sudah ada penghuninya, untuk ditampilkan di menu dan buku. */
export function homeLines(ownerId) {
  const homes = readVillageHomes(ownerId);
  if (!homes.length) return ["§8Belum ada rumah desa yang selesai."];
  return homes.map((h) => {
    const where = `${h.x}, ${h.y}, ${h.z}`;
    return h.forName
      ? `§7Rumah §f${where} §7» §a${h.forName}`
      : `§7Rumah §f${where} §8(belum ada penghuni)`;
  });
}

/* ------------------------------------------------------------------ *
 * Jalan antar bangunan
 * ------------------------------------------------------------------ */

/**
 * Titik-titik penting kampung: balai kerja dan tiap ranjang rumah.
 *
 * Jalannya menghubungkan ini, bukan titik acak. Kampung yang jalannya berawal
 * dan berakhir di tempat yang benar-benar didatangi companion adalah kampung
 * yang jalannya terpakai.
 */
export function landmarks(dimension, ownerId, station) {
  const out = [];
  if (station) out.push({ x: Math.floor(station.x), z: Math.floor(station.z), what: "balai kerja" });
  for (const home of readVillageHomes(ownerId)) {
    if (home.dim && home.dim !== dimension.id) continue;
    out.push({ x: home.x, z: home.z, what: home.forName ? `rumah ${home.forName}` : "rumah" });
  }
  return out;
}

/**
 * Sepasang titik yang belum tersambung jalan.
 *
 * Yang dibangun pohon rentang sederhana: tiap titik disambungkan ke titik
 * TERDEKAT yang sudah tersambung. Kampung sepuluh rumah jadi punya sembilan
 * ruas jalan, bukan empat puluh lima — dan yang sembilan itu semuanya terpakai.
 */
export function nextRoad(dimension, ownerId, station, done) {
  const points = landmarks(dimension, ownerId, station);
  if (points.length < 2) return undefined;
  const linked = new Set([0]);
  const seen = new Set(done ?? []);
  while (linked.size < points.length) {
    let best;
    for (const i of linked) {
      for (let j = 0; j < points.length; j++) {
        if (linked.has(j)) continue;
        const d = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
        if (!best || d < best.d) best = { from: i, to: j, d };
      }
    }
    if (!best) break;
    linked.add(best.to);
    const key = roadKey(points[best.from], points[best.to]);
    if (seen.has(key)) continue;
    if (best.d > VILLAGE.roadMax) {
      logDebug(TAG, `Ruas ${key} sejauh ${Math.round(best.d)} blok; terlalu jauh untuk dijalani.`);
      continue;
    }
    return { key, from: points[best.from], to: points[best.to] };
  }
  return undefined;
}

function roadKey(a, b) {
  const one = `${a.x},${a.z}`;
  const two = `${b.x},${b.z}`;
  return one < two ? `${one}|${two}` : `${two}|${one}`;
}

/**
 * Langkah-langkah satu ruas jalan.
 *
 * Lebarnya dua blok dengan sengaja: jalan selebar satu blok tidak pernah
 * terlihat sebagai jalan dari mata pemain yang berdiri di atasnya, dan tiga
 * blok memakan bahan dua kali lipat tanpa terlihat lebih baik.
 */
export function roadPlan(from, to) {
  const out = [];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  if (!steps) return out;
  // Sisi lebar jalan tegak lurus arah jalannya.
  const sx = Math.abs(dx) >= Math.abs(dz) ? 0 : 1;
  const sz = Math.abs(dx) >= Math.abs(dz) ? 1 : 0;
  for (let i = 0; i <= steps; i++) {
    const x = from.x + Math.round((dx * i) / steps);
    const z = from.z + Math.round((dz * i) / steps);
    out.push({ x, z, role: "road" });
    out.push({ x: x + sx, z: z + sz, role: "road" });
    // Lampu jalan berdiri di TEPI, bukan di tengah — companion yang berjalan
    // pulang tidak boleh menabrak tiang lampunya sendiri.
    if (i > 0 && i % VILLAGE.lampEvery === 0) {
      out.push({ x: x - sx, z: z - sz, role: "lamp" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Penerangan
 * ------------------------------------------------------------------ */

/**
 * Titik gelap terdekat yang perlu diberi obor.
 *
 * Yang dicek permukaan tanahnya, bukan udara di atasnya: obor yang dipasang
 * melayang tidak menerangi apa pun dan langsung jatuh. Petaknya dijelajahi
 * dengan langkah `lightStep` supaya satu kampung tidak berubah jadi lautan
 * obor rapat — jaraknya cukup untuk menahan monster, tidak lebih.
 */
export function darkSpot(dimension, center, radius) {
  const step = VILLAGE.lightStep;
  const cx = Math.floor(center.x);
  const cz = Math.floor(center.z);
  const cy = Math.floor(center.y);
  for (let r = step; r <= radius; r += step) {
    for (let dx = -r; dx <= r; dx += step) {
      for (let dz = -r; dz <= r; dz += step) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        const y = surfaceUnder(dimension, x, cy, z);
        if (y === undefined) continue;
        if (lightNear(dimension, x, y, z, VILLAGE.lightStep)) continue;
        const here = blockAt(dimension, x, y, z);
        if (!here || !canOccupy(here)) continue;
        return { x, y, z };
      }
    }
  }
  return undefined;
}

function surfaceUnder(dimension, x, baseY, z) {
  for (let y = baseY + 4; y >= baseY - 5; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    if (canOccupy(here) && isFooting(below)) return y;
  }
  return undefined;
}

/**
 * Sudah ada cahaya di dekat sini?
 *
 * Diperiksa berjarak dua blok, bukan tiap blok. Petak 13x13x4 penuh berarti
 * 676 pembacaan blok untuk SATU calon titik obor, dan pembangun memeriksa
 * puluhan calon tiap denyut — itu bukan penerangan, itu cara membekukan server.
 * Langkah dua sudah cukup: obor bukan benda setebal satu piksel yang bisa
 * bersembunyi di antara dua pemeriksaan.
 */
function lightNear(dimension, x, y, z, radius) {
  for (let dx = -radius; dx <= radius; dx += 2) {
    for (let dz = -radius; dz <= radius; dz += 2) {
      for (let dy = 0; dy <= 1; dy++) {
        const block = blockAt(dimension, x + dx, y + dy, z + dz);
        if (block && LIGHT_IDS.includes(block.typeId)) return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Pengumuman
 * ------------------------------------------------------------------ */

/**
 * Memberi tahu penghuni barunya — sesudah ranjangnya benar-benar ditugaskan.
 *
 * Urutannya penting: chat menyusul perbuatan, bukan menggantikannya.
 */
export function announceHome(builder, chosen, bed, owner) {
  const name = displayName(chosen);
  report(builder, `${name}, rumahmu sudah jadi. Ranjangnya di ${bed.x}, ${bed.y}, ${bed.z} — itu punyamu.`);
  try {
    face(builder, { x: chosen.location.x, y: chosen.location.y, z: chosen.location.z });
  } catch (e) {
    logDebug(TAG, "Gagal menghadap penghuni baru", e);
  }
  particle(builder.dimension, "minecraft:villager_happy",
           { x: bed.x + 0.5, y: bed.y + 1, z: bed.z + 0.5 });
  sound(builder.dimension, "random.levelup", bed, { volume: 0.6 });
  owner?.sendMessage?.(
    `§2Rumah baru selesai§7: ranjang di §f${bed.x}, ${bed.y}, ${bed.z} §7sekarang milik §a${name}§7.`);
  logInfo(TAG, `Penghuni ${entStr(chosen)} diberi tahu soal rumahnya di ${posStr(bed)}.`);
}
