/**
 * Mode bertani: panen tanaman matang di sekitar companion lalu tanam ulang.
 *
 * Yang menggerakkan kakinya ke petak berikutnya adalah behavior.move_to_block di
 * behavior pack; file ini yang mengurus bloknya. Pemindaian dibatasi anggaran per
 * denyut dan memakai kursor yang disimpan di entity, jadi ladang seluas radius 7
 * pun tersapu habis dalam beberapa detik tanpa memberatkan server.
 */

import { CROPS, PROP, SEEDS } from "./config.js";
import { give, info, makeItem, resolveOwner } from "./util.js";

const SCAN_BUDGET = 160;      // posisi yang diperiksa tiap denyut
const MAX_HARVEST = 4;        // panen maksimum tiap denyut
const MAX_PLANT = 2;          // tanam maksimum tiap denyut

/** Offset pindaian, diurutkan dari yang terdekat supaya yang di kaki dulu digarap. */
function buildOffsets(radius) {
  const out = [];
  for (let dy = 2; dy >= -2; dy--) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz <= radius * radius) out.push([dx, dy, dz]);
      }
    }
  }
  out.sort((a, b) => {
    const da = a[0] * a[0] + a[2] * a[2] + Math.abs(a[1]) * 3;
    const db = b[0] * b[0] + b[2] * b[2] + Math.abs(b[1]) * 3;
    return da - db;
  });
  return out;
}

const OFFSETS = new Map();
function offsetsFor(radius) {
  if (!OFFSETS.has(radius)) OFFSETS.set(radius, buildOffsets(radius));
  return OFFSETS.get(radius);
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Panen satu tanaman matang: hasil ke pemilik, umur blok dibalikkan ke nol. */
function harvest(block, owner) {
  const crop = CROPS[block.typeId];
  if (!crop) return false;
  let permutation;
  try {
    permutation = block.permutation;
    if (permutation.getState(crop.state) !== crop.ripe) return false;
  } catch {
    return false;
  }
  const where = { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };
  for (const [id, min, max] of crop.drops) {
    const count = randomBetween(min, max);
    if (count <= 0) continue;
    const item = makeItem(id, count);
    if (!item) continue;
    if (owner && owner.dimension.id === block.dimension.id) give(owner, item);
    else block.dimension.spawnItem(item, where);
  }
  try {
    block.setPermutation(permutation.withState(crop.state, 0));   // tanam ulang
  } catch {
    return false;
  }
  return true;
}

/** Ambil satu bibit dari kantong pemilik, kalau ada. */
function takeSeed(owner) {
  const container = owner?.getComponent("minecraft:inventory")?.container;
  if (!container) return undefined;
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (!stack || !SEEDS[stack.typeId]) continue;
    const id = stack.typeId;
    if (stack.amount > 1) {
      stack.amount -= 1;
      container.setItem(i, stack);
    } else {
      container.setItem(i, undefined);
    }
    return id;
  }
  return undefined;
}

/** Tanami petak kosong dengan bibit milik pemilik. */
function plant(block, owner) {
  let above;
  try {
    above = block.above(1);
    if (!above || !above.isAir) return false;
  } catch {
    return false;
  }
  const seed = takeSeed(owner);
  if (!seed) return false;
  try {
    above.setType(SEEDS[seed]);
  } catch {
    give(owner, makeItem(seed, 1));            // gagal ditanam, bibit dikembalikan
    return false;
  }
  return true;
}

/**
 * Satu denyut mode bertani untuk satu companion.
 * Mengembalikan jumlah tanaman yang dipanen.
 */
export function tickFarm(entity) {
  const meta = info(entity);
  if (!meta) return 0;
  const owner = resolveOwner(entity);
  const dimension = entity.dimension;
  const offsets = offsetsFor(meta.farmRadius);
  const base = {
    x: Math.floor(entity.location.x),
    y: Math.floor(entity.location.y),
    z: Math.floor(entity.location.z),
  };

  const stored = entity.getDynamicProperty(PROP.scan);
  let cursor = typeof stored === "number" ? stored : 0;
  let harvested = 0;
  let planted = 0;

  for (let n = 0; n < SCAN_BUDGET; n++) {
    const [dx, dy, dz] = offsets[cursor % offsets.length];
    cursor = (cursor + 1) % offsets.length;
    let block;
    try {
      block = dimension.getBlock({ x: base.x + dx, y: base.y + dy, z: base.z + dz });
    } catch {
      continue;                                  // di luar chunk yang dimuat
    }
    if (!block) continue;
    if (CROPS[block.typeId]) {
      if (harvested < MAX_HARVEST && harvest(block, owner)) harvested++;
    } else if (block.typeId === "minecraft:farmland" && planted < MAX_PLANT && owner) {
      if (plant(block, owner)) planted++;
    }
    if (harvested >= MAX_HARVEST && planted >= MAX_PLANT) break;
  }

  entity.setDynamicProperty(PROP.scan, cursor);
  return harvested;
}
