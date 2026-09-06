/**
 * Stasiun kerja companion: satu peti miliknya sendiri dan satu papan nama.
 *
 * Dua hal berubah dari versi lama:
 *
 * 1. Peti dan papan TIDAK lagi muncul dari udara. Companion harus punya
 *    delapan papan untuk peti dan enam papan + satu stik untuk papan nama.
 *    Selama belum mampu, dia bekerja memakai kantong pribadinya (bag.js) dan
 *    memasang permintaan kayu ke pencari barang.
 * 2. Companion tidak lagi menyerobot peti pemain yang kebetulan ada di dekat
 *    situ. Yang boleh dipakai bersama hanyalah peti yang memang terdaftar
 *    sebagai stasiun companion milik pemilik yang sama — jadi hasil panen
 *    selalu masuk ke peti mereka sendiri, bukan ke peti pemain.
 */

import { world } from "@minecraft/server";
import { CHEST_IDS, MODES, PROP, SIGN_IDS } from "./config.js";
import { bagContainer, emptyBagInto } from "./bag.js";
import { takeOrMake } from "./items.js";
import { displayName } from "./nametag.js";
import { patchState, readSettings } from "./state.js";
import {
  blockAt, chunkOf, containerAt, getMode, getOwnerId, getOwnerName, isAir,
  isSolid, makeItem, putIn, sound,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "STATION";
const CHEST = "minecraft:chest";
const SIGN = "minecraft:standing_sign";
const CHESTS = new Set(CHEST_IDS);
const SHARE_RADIUS = 20;

/* ------------------------------------------------------------------ *
 * Daftar stasiun companion di dunia — supaya companion satu pemilik
 * bisa saling meminjam peti, dan supaya peti pemain tidak pernah dikira
 * peti stasiun.
 * ------------------------------------------------------------------ */

function readStations() {
  try {
    const raw = world.getDynamicProperty(PROP.stations);
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) {
    logWarn(TAG, "Gagal membaca daftar stasiun dunia", e);
    return [];
  }
}

function writeStations(list) {
  try {
    world.setDynamicProperty(PROP.stations, JSON.stringify(list.slice(-64)));
    return true;
  } catch (e) {
    logError(TAG, "Gagal menyimpan daftar stasiun dunia (kuota limit?)", e);
    return false;
  }
}

export function registerStation(entity, pos) {
  const ownerId = getOwnerId(entity) ?? "";
  const dim = entity.dimension.id;
  const list = readStations().filter((s) =>
    !(s.dim === dim && s.x === pos.x && s.y === pos.y && s.z === pos.z));
  list.push({ dim, x: pos.x, y: pos.y, z: pos.z, owner: ownerId, by: entity.id });
  logInfo(TAG, `Stasiun ${posStr(pos)} didaftarkan atas nama ${entStr(entity)} (pemilik ${ownerId || "-"}).`);
  writeStations(list);
}

export function unregisterStation(dimensionId, pos) {
  const list = readStations();
  const next = list.filter((s) =>
    !(s.dim === dimensionId && s.x === pos.x && s.y === pos.y && s.z === pos.z));
  if (next.length !== list.length) {
    logInfo(TAG, `Stasiun ${posStr(pos)} dicabut dari daftar (petinya hilang).`);
    writeStations(next);
  }
}

/** Stasiun companion lain milik pemilik yang sama, paling dekat dulu. */
export function stationsOf(ownerId, dimensionId, near, radius = SHARE_RADIUS) {
  const out = [];
  for (const s of readStations()) {
    if (s.dim !== dimensionId) continue;
    if (ownerId && s.owner && s.owner !== ownerId) continue;
    const d = Math.hypot(s.x - near.x, s.z - near.z);
    if (d > radius) continue;
    out.push({ ...s, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

/* ------------------------------------------------------------------ *
 * Papan nama
 * ------------------------------------------------------------------ */

function writeSign(dimension, pos, entity) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  if (!block) {
    logWarn(TAG, `Papan stasiun di ${posStr(pos)} tidak bisa dibaca.`);
    return false;
  }
  const { cx, cz } = chunkOf(pos);
  const mode = MODES[getMode(entity)] ?? MODES.follow;
  // Nama pemilik ikut aturan "sembunyikan pemilik": kalau dimatikan, papan
  // cuma menyebut nama companion dan tugasnya, jadi pemain lain di server
  // tidak bisa tahu ini punya siapa.
  const hide = hideOwnerFor(entity);
  try {
    const lines = [`§0${displayName(entity)}`, mode.label];
    lines.push(hide ? "§8(pemilik disembunyikan)" : `milik ${getOwnerName(entity)}`);
    lines.push(`(${cx}, ${cz})`);
    const text = lines.join("\n");
    block.getComponent("minecraft:sign")?.setText(text);
    logInfo(TAG, `Papan stasiun ditulis di ${posStr(pos)}: "${text.replace(/\n/g, " / ")}"`);
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal menulis teks pada papan di ${posStr(pos)}`, e);
    return false;
  }
}

// Dipisah jadi fungsi sendiri supaya station.js tidak perlu meng-import
// state.js dua arah bersama nametag.js.
function hideOwnerFor(entity) {
  try {
    const raw = entity.getDynamicProperty(PROP.state);
    const own = typeof raw === "string" ? Boolean(JSON.parse(raw).hideOwner) : false;
    return own || readSettings(getOwnerId(entity)).hideOwner;
  } catch (e) {
    logDebug(TAG, "Gagal membaca saklar sembunyikan-pemilik; dianggap tampil.", e);
    return false;
  }
}

export function refreshSign(entity, state) {
  if (!state.sign) return;
  writeSign(entity.dimension, state.sign, entity);
}

/* ------------------------------------------------------------------ *
 * Stasiun
 * ------------------------------------------------------------------ */

function freeSpot(dimension, origin, radius = 5) {
  for (let r = 2; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let dy = 1; dy >= -2; dy--) {
          const spot = blockAt(dimension, origin.x + dx, origin.y + dy, origin.z + dz);
          const above = blockAt(dimension, origin.x + dx, origin.y + dy + 1, origin.z + dz);
          const floor = blockAt(dimension, origin.x + dx, origin.y + dy - 1, origin.z + dz);
          if (isAir(spot) && isAir(above) && isSolid(floor)) {
            return { x: spot.x, y: spot.y, z: spot.z };
          }
        }
      }
    }
  }
  logWarn(TAG, `Tidak ada lokasi kosong untuk stasiun di sekitar ${posStr(origin)}`);
  return undefined;
}

function chestStillThere(dimension, pos) {
  const block = blockAt(dimension, pos.x, pos.y, pos.z);
  return Boolean(block) && CHESTS.has(block.typeId);
}

function trySign(entity, state, container, spot) {
  if (state.sign) return;
  const got = takeOrMake(container, "sign", entity, SIGN_IDS);
  if (!got.got) {
    logDebug(TAG, `Papan nama ditunda: bahan kurang (${got.missing ?? "kayu"}).`);
    state.needs = { ...(state.needs ?? {}), sign: got.missing ?? "wood" };
    return;
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const at = blockAt(entity.dimension, spot.x + dx, spot.y, spot.z + dz);
    const floor = blockAt(entity.dimension, spot.x + dx, spot.y - 1, spot.z + dz);
    if (!isAir(at) || !isSolid(floor)) continue;
    try {
      at.setType(SIGN);
      state.sign = { x: at.x, y: at.y, z: at.z };
      writeSign(entity.dimension, state.sign, entity);
      logInfo(TAG, `Papan nama stasiun dipasang di ${posStr(state.sign)}.`);
      return;
    } catch (e) {
      logWarn(TAG, `Gagal memasang papan nama di ${posStr(at)}`, e);
    }
  }
  // Tidak jadi terpasang: kembalikan papannya ke peti supaya tidak hangus.
  putIn(container, makeItem(got.got, 1));
  logWarn(TAG, "Tidak ada sisi peti yang muat untuk papan nama, papan dikembalikan ke peti.");
}

/**
 * Menyiapkan tempat kerja companion.
 *
 * Balikan selalu punya `container` yang bisa dipakai — peti sungguhan kalau
 * sudah ada, kantong pribadi kalau belum. Field `chest` hanya terisi kalau
 * petinya benar-benar berdiri, dan `missing` menyebut bahan yang masih kurang
 * untuk membangunnya.
 */
export function ensureStation(entity, state) {
  const dimension = entity.dimension;
  const here = {
    x: Math.floor(entity.location.x),
    y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };
  logDebug(TAG, `ensureStation untuk ${entStr(entity)} di ${posStr(here)}`);

  // 1. Peti yang sudah tercatat sebagai miliknya.
  if (state.station) {
    if (chestStillThere(dimension, state.station)) {
      const container = containerAt(dimension, state.station);
      if (container) return { chest: state.station, container, sign: state.sign };
      logWarn(TAG, `Peti stasiun di ${posStr(state.station)} ada tapi inventarinya tidak terbaca.`);
    } else {
      logWarn(TAG, `Peti stasiun lama di ${posStr(state.station)} hilang/hancur!`);
      unregisterStation(dimension.id, state.station);
      state.station = null;
      state.sign = null;
      patchState(entity, { station: null, sign: null });
    }
  }

  // 2. Stasiun companion lain milik pemilik yang sama (peti bersama).
  const ownerId = getOwnerId(entity);
  for (const mate of stationsOf(ownerId, dimension.id, here)) {
    if (!chestStillThere(dimension, mate)) {
      unregisterStation(dimension.id, mate);
      continue;
    }
    const container = containerAt(dimension, mate);
    if (!container) continue;
    const pos = { x: mate.x, y: mate.y, z: mate.z };
    logInfo(TAG, `${entStr(entity)} memakai peti stasiun companion lain di ${posStr(pos)}.`);
    patchState(entity, { station: pos });
    state.station = pos;
    // Isi kantong baru dipindahkan kalau companion memang sudah berdiri di
    // depan petinya — barang tidak boleh berpindah dari jarak jauh.
    if (Math.hypot(entity.location.x - pos.x, entity.location.z - pos.z) < 4) {
      emptyBagInto(entity, state, container, pos);
    }
    return { chest: pos, container, sign: state.sign, shared: true };
  }

  // 3. Belum punya peti: kerja dulu pakai kantong, sambil mencoba merakit peti.
  const bag = bagContainer(entity, state);
  const spot = freeSpot(dimension, here);
  if (!spot) {
    return { container: bag, virtual: true, missing: undefined, why: "no-space" };
  }

  const got = takeOrMake(bag, "chest", entity, CHEST_IDS);
  if (!got.got) {
    logDebug(TAG, `${entStr(entity)} belum bisa memasang peti: butuh ${got.missing ?? "kayu"}.`);
    return { container: bag, virtual: true, missing: got.missing ?? "wood" };
  }

  const block = blockAt(dimension, spot.x, spot.y, spot.z);
  try {
    block.setType(got.got === "minecraft:barrel" ? "minecraft:barrel" : CHEST);
  } catch (e) {
    logError(TAG, `Gagal memasang peti di ${posStr(spot)}`, e);
    putIn(bag, makeItem(got.got, 1));
    return { container: bag, virtual: true, missing: undefined, why: "place-failed" };
  }
  sound(dimension, "random.wood_click", spot);
  logInfo(TAG, `Peti stasiun baru berdiri di ${posStr(spot)} (${got.how}) untuk ${entStr(entity)}.`);

  const container = containerAt(dimension, spot);
  if (!container) {
    logError(TAG, `Peti baru di ${posStr(spot)} tidak punya inventory component!`);
    return { container: bag, virtual: true };
  }

  state.station = spot;
  patchState(entity, { station: spot });
  registerStation(entity, spot);
  emptyBagInto(entity, state, container, spot);
  trySign(entity, state, container, spot);
  patchState(entity, { station: spot, sign: state.sign ?? null });

  return { chest: spot, container, sign: state.sign };
}

export function stationContainer(entity, state) {
  if (!state.station) return undefined;
  return containerAt(entity.dimension, state.station);
}
