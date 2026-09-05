/**
 * Ingatan yang harus selamat dari dunia ditutup.
 *
 * Semua catatan satu companion disimpan sebagai SATU blob JSON di satu dynamic
 * property, bukan satu properti per hal. Alasannya bukan kerapian: tiap entity
 * punya jatah properti yang terbatas, dan companion sekarang perlu mengingat
 * stasiun, pekerjaan yang sedang dikerjakan, isi tas, rencana galian, dan
 * rancangan bangunan sekaligus. Satu blob juga membuat menambah catatan baru
 * tidak perlu menyentuh manifest atau berkas lain.
 *
 * Patokan chunk dan catatan pengembara disimpan di tingkat DUNIA, bukan di
 * companion — patok tetap ada walau companion yang memasangnya diistirahatkan.
 */

import { world } from "@minecraft/server";

import { PROP } from "./config.js";

const EMPTY = {
  station: null,      // {x,y,z,dim} peti stasiun
  sign: null,         // {x,y,z} papan di sebelah peti
  home: null,         // {x,y,z,dim} titik pulang
  job: null,          // pekerjaan yang sedang dikerjakan
  tool: null,         // tingkat alat yang sedang dipakai
  bag: {},            // barang yang dibawa sebelum disetor ke peti
  plan: {},           // rencana per role (arah terowongan, langkah bangunan, ...)
  blueprint: "fence",
  allowExpand: false, // pemain mengizinkan melebar satu chunk lagi
  decorated: false,
  quiet: false,       // pemain mematikan celotehnya
};

export function readState(entity) {
  try {
    const raw = entity.getDynamicProperty(PROP.state);
    if (typeof raw !== "string") return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export function writeState(entity, state) {
  try {
    entity.setDynamicProperty(PROP.state, JSON.stringify(state));
    return true;
  } catch {
    return false;               // blob kepanjangan, atau entity sudah hilang
  }
}

/** Baca, ubah beberapa kunci, tulis lagi. Bentuk yang paling sering dipakai. */
export function patchState(entity, changes) {
  const state = readState(entity);
  Object.assign(state, changes);
  writeState(entity, state);
  return state;
}

// --- patok chunk (tingkat dunia) -------------------------------------------

export function claimKey(dimensionId, cx, cz) {
  return `${dimensionId}|${cx},${cz}`;
}

export function readClaims() {
  try {
    const raw = world.getDynamicProperty(PROP.claims);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeClaims(claims) {
  try {
    world.setDynamicProperty(PROP.claims, JSON.stringify(claims));
  } catch {
    /* terlalu banyak patok; yang lama tetap berlaku */
  }
}

export function getClaim(dimensionId, cx, cz) {
  return readClaims()[claimKey(dimensionId, cx, cz)];
}

/**
 * Catat satu chunk. `state` 0 = dipatok tapi belum digarap (beam merah),
 * 1 = sudah jadi ladang (beam hijau).
 */
export function setClaim(dimensionId, cx, cz, entry) {
  const claims = readClaims();
  claims[claimKey(dimensionId, cx, cz)] = entry;
  writeClaims(claims);
}

export function clearClaim(dimensionId, cx, cz) {
  const claims = readClaims();
  delete claims[claimKey(dimensionId, cx, cz)];
  writeClaims(claims);
}

export function claimsOf(playerId) {
  const out = [];
  const claims = readClaims();
  for (const [key, entry] of Object.entries(claims)) {
    if (entry?.by !== playerId) continue;
    const [dim, coords] = key.split("|");
    const [cx, cz] = coords.split(",").map(Number);
    out.push({ dim, cx, cz, ...entry });
  }
  return out;
}

// --- catatan pengembara (tingkat dunia) ------------------------------------

const MAX_WAYPOINTS = 48;

export function readWaypoints() {
  try {
    const raw = world.getDynamicProperty(PROP.waypoints);
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Simpan satu temuan. Temuan sejenis yang jaraknya dekat dianggap sama supaya
 * satu gua besar tidak jadi dua puluh catatan.
 */
export function addWaypoint(entry) {
  const list = readWaypoints();
  const near = list.find((w) => w.kind === entry.kind && w.dim === entry.dim &&
    Math.hypot(w.x - entry.x, w.z - entry.z) < 24);
  if (near) return false;
  list.push(entry);
  while (list.length > MAX_WAYPOINTS) list.shift();
  try {
    world.setDynamicProperty(PROP.waypoints, JSON.stringify(list));
  } catch {
    return false;
  }
  return true;
}
