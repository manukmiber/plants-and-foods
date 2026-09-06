/**
 * Bekerja sendirian kalau belum ada yang bisa dimintai tolong.
 *
 * Rantai bahan add-on ini punya satu titik patah yang besar: petani, penambang
 * dan pembangun tidak pernah mencari bahannya sendiri — mereka MEMASANG
 * PERMINTAAN dan menunggu. Kalau pemain baru punya satu companion, atau belum
 * satu pun disuruh ke mode Merajin / Mencari Barang, permintaan itu tidak ada
 * yang membaca dan companion berdiri diam selamanya sambil mengulang
 * "menunggu bahan kayu".
 *
 * Modul ini menutup lubang itu. Sebelum menunggu, companion memeriksa: adakah
 * companion LAIN milik pemilik yang sama yang bermode Merajin atau Mencari
 * Barang? Kalau ada, biarkan rantai bekerja seperti biasa. Kalau tidak ada, dia
 * mengerjakannya sendiri: menebang pohon dengan tangan kosong, menggali batu,
 * membabat rumput untuk bibit — persis seperti pemain di menit pertama dunia
 * baru. Hasilnya langsung masuk ke peti/kantongnya sendiri, jadi kode yang
 * sudah ada (merakit meja kerja, peti, papan nama, alat) tinggal jalan.
 */

import { FAMILY, MATERIAL_REQUESTS } from "./config.js";
import { findMaterial, harvestBlock, roam } from "./gather.js";
import { requestMaterial } from "./requests.js";
import { smeltableFor, smeltStep } from "./smelting.js";
import {
  alive, allCompanions, getMode, getOwnerId, makeItem, putIn,
} from "./util.js";
import { entStr, logDebug, logInfo } from "./logger.js";

const TAG = "SELFHELP";

// Mode yang dianggap "ada yang bisa dimintai tolong".
const HELPER_MODES = new Set(["crafter", "looter"]);

/**
 * Adakah companion LAIN milik pemilik yang sama yang bertugas melayani
 * permintaan? `self` dikecualikan supaya perajin tidak mengira dirinya sendiri
 * sebagai penolongnya sendiri dan menunggu selamanya.
 */
export function hasHelper(ownerId, self) {
  if (!ownerId) return false;
  for (const other of allCompanions(FAMILY)) {
    if (!alive(other)) continue;
    if (self && other.id === self.id) continue;
    if (getOwnerId(other) !== ownerId) continue;
    if (HELPER_MODES.has(getMode(other))) return true;
  }
  return false;
}

/** Nama ramah bahan, untuk baris status dan laporan. */
function labelOf(kind) {
  return MATERIAL_REQUESTS[kind]?.label ?? kind;
}

/**
 * Satu denyut mencari bahan sendiri.
 *
 * Balikannya baris status kalau companion memang mengerjakannya sendiri, atau
 * undefined kalau tidak — entah karena ada penolong yang seharusnya membaca
 * permintaan, atau karena bahan itu memang tidak bisa dicari tangan kosong.
 * Pemanggil yang memutuskan apa yang dilakukan kalau undefined (biasanya:
 * kembalikan baris "menunggu bahan" seperti dulu).
 */
export function gatherOwn(entity, state, ownerId, kind, container, { search = false } = {}) {
  if (!container) return undefined;
  if (hasHelper(ownerId, entity)) {
    logDebug(TAG, `${entStr(entity)} menunggu bahan ${kind}: ada penolong di dekat sini.`);
    return undefined;
  }

  // Besi mentah tidak berubah jadi batangan dengan cara digali lebih banyak,
  // dan kayu tidak berubah jadi arang dengan cara ditebang lebih banyak: dua-
  // duanya harus lewat TUNGKU. Kalau bahannya sudah ada di peti, membakarnya
  // jauh lebih dekat daripada berkeliling mencari bijih baru yang ujungnya
  // sama-sama tidak terpakai.
  let want = kind;
  const oven = smeltableFor(container, kind);
  if (oven) {
    const burn = smeltStep(entity, state, container, state.station);
    if (burn.status === "walking") return `menuju tungku untuk melebur ${oven.label}`;
    if (burn.status === "smelting") return `melebur ${oven.label} di tungku`;
    if (burn.status === "done") return `${oven.label} selesai dilebur`;
    // Tungkunya belum ada, atau tidak ada bahan bakarnya: yang dicari berubah
    // jadi bahan untuk menutup kekurangan itu, bukan bijih yang sudah menumpuk.
    if (burn.status === "no-furnace") want = burn.missing ?? "stone";
    else if (burn.status === "no-fuel") want = "coal";
    if (want !== kind) {
      logInfo(TAG, `${entStr(entity)} butuh ${want} dulu supaya tungkunya bisa melebur ${oven.label}.`);
      requestMaterial(entity, state, ownerId, want, state.station);
    }
  }

  const target = findMaterial(entity, want);
  if (!target) {
    // Tidak ada sasarannya di sekitar. BERKELILING mencarinya cuma boleh kalau
    // pemanggil bilang pekerjaannya memang mentok tanpa bahan itu (`search`).
    //
    // Ini bukan kehati-hatian berlebihan: penambang yang kehabisan arang
    // sebenarnya tetap bisa menggali (obor cuma pelengkap), dan versi pertama
    // yang selalu berkeliling membuatnya berjalan ke arah acak tiap setengah
    // detik sambil "mencari arang" — terowongannya tidak pernah jadi.
    if (!search) return undefined;
    roam(entity);
    return `mencari ${labelOf(want)} sendiri (belum ada perajin/pencari barang)`;
  }

  const result = harvestBlock(entity, target, (id, amount) => {
    putIn(container, makeItem(id, amount), entity.dimension, entity.location);
  });
  if (result.walking) return `menuju ${labelOf(want)} untuk diambil sendiri`;
  logInfo(TAG, `${entStr(entity)} mengambil ${labelOf(want)} sendiri di ${target.id}.`);
  return `mengambil ${labelOf(want)} sendiri (belum ada perajin/pencari barang)`;
}

/**
 * Jalur lengkap yang dipakai hampir semua pemanggil: pasang permintaannya
 * seperti biasa (supaya perajin/pencari barang yang datang belakangan tahu apa
 * yang kurang), LALU kerjakan sendiri kalau memang tidak ada yang akan datang.
 */
export function ensureMaterial(entity, state, ownerId, kind, stationPos, container, options) {
  requestMaterial(entity, state, ownerId, kind, stationPos);
  return gatherOwn(entity, state, ownerId, kind, container, options);
}
