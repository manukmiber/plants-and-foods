/**
 * Ingatan yang harus selamat dari dunia ditutup.
 */

import { world } from "@minecraft/server";
import { PROP } from "./config.js";
import { entStr, logDebug, logError, logInfo, logWarn } from "./logger.js";

const TAG = "STATE";

const EMPTY = {
  station: null,
  sign: null,
  home: null,
  job: null,
  tool: null,
  bag: {},
  plan: {},
  blueprint: "fence",
  allowExpand: false,
  decorated: false,
  quiet: false,
};

export function readState(entity) {
  try {
    const raw = entity.getDynamicProperty(PROP.state);
    if (typeof raw !== "string") return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch (e) {
    logWarn(TAG, `Gagal membaca dynamic property state pada ${entStr(entity)}`, e);
    return { ...EMPTY };
  }
}

export function writeState(entity, state) {
  try {
    const json = JSON.stringify(state);
    entity.setDynamicProperty(PROP.state, json);
    logDebug(TAG, `State tersimpan untuk ${entStr(entity)} (${json.length} bytes)`);
    return true;
  } catch (e) {
    logError(TAG, `Gagal menulis dynamic property state untuk ${entStr(entity)}`, e);
    return false;
  }
}

export function patchState(entity, changes) {
  logInfo(TAG, `Patching state untuk ${entStr(entity)}: ${JSON.stringify(changes)}`);
  const state = readState(entity);
  Object.assign(state, changes);
  writeState(entity, state);
  return state;
}

export function claimKey(dimensionId, cx, cz) {
  return `${dimensionId}|${cx},${cz}`;
}

export function readClaims() {
  try {
    const raw = world.getDynamicProperty(PROP.claims);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch (e) {
    logWarn(TAG, "Gagal membaca claims dunia", e);
    return {};
  }
}

function writeClaims(claims) {
  try {
    world.setDynamicProperty(PROP.claims, JSON.stringify(claims));
    logDebug(TAG, `Claims dunia berhasil disimpan.`);
  } catch (e) {
    logError(TAG, "Gagal menulis claims dunia (kuota limit?)", e);
  }
}

export function getClaim(dimensionId, cx, cz) {
  return readClaims()[claimKey(dimensionId, cx, cz)];
}

export function setClaim(dimensionId, cx, cz, entry) {
  logInfo(TAG, `setClaim: chunk (${cx}, ${cz}) pada ${dimensionId}`);
  const claims = readClaims();
  claims[claimKey(dimensionId, cx, cz)] = entry;
  writeClaims(claims);
}

export function clearClaim(dimensionId, cx, cz) {
  logInfo(TAG, `clearClaim: chunk (${cx}, ${cz}) pada ${dimensionId}`);
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

const MAX_WAYPOINTS = 48;

export function readWaypoints() {
  try {
    const raw = world.getDynamicProperty(PROP.waypoints);
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) {
    logWarn(TAG, "Gagal membaca waypoints dunia", e);
    return [];
  }
}

export function addWaypoint(entry) {
  logInfo(TAG, `addWaypoint: ${entry.kind} di (${entry.x}, ${entry.y}, ${entry.z})`);
  const list = readWaypoints();
  const near = list.find((w) => w.kind === entry.kind && w.dim === entry.dim &&
    Math.hypot(w.x - entry.x, w.z - entry.z) < 24);
  if (near) {
    logDebug(TAG, `Waypoint duplikat (jarak < 24 blok). Dilewati.`);
    return false;
  }
  list.push(entry);
  while (list.length > MAX_WAYPOINTS) list.shift();
  try {
    world.setDynamicProperty(PROP.waypoints, JSON.stringify(list));
    logInfo(TAG, `Waypoint tersimpan. Total waypoints: ${list.length}`);
    return true;
  } catch (e) {
    logError(TAG, "Gagal menulis waypoints ke world dynamic property", e);
    return false;
  }
}