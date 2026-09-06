/**
 * Rancangan bangunan yang datang dari berkas JSON, bukan dari kode.
 *
 * `blueprints/*.json` di folder add-on adalah tempat menaruh rancangan baru —
 * termasuk hasil AI mengubah schematic yang ditemukan di internet. Generator
 * (tools/gen_blueprints.py) menyalin isinya ke blueprints.data.js, dan berkas ini
 * yang mengubah denah huruf-per-huruf itu menjadi langkah kerja yang dimengerti
 * builder.js.
 *
 * Satu langkah = { x, z, yOff, role, block }:
 *
 *   x, z    koordinat dunia (sudah digeser ke posisi companion berdiri)
 *   yOff    ketinggian relatif terhadap TANAH: 0 = blok tanah itu sendiri,
 *           1 = satu blok di atasnya. Sengaja tidak memakai `dy` seperti
 *           rancangan bawaan, karena `dy` punya pergeseran +1 khusus untuk
 *           lantai dan jalan yang akan membingungkan kalau dipakai di sini.
 *   role    peran bahan ("wall", "floor", ...) — companion memakai apa pun
 *           yang cocok dari petinya
 *   block   blok tertentu; dipakai kalau ada di peti, kalau habis jatuh ke role
 */

import { DATA_BLUEPRINTS } from "./blueprints.data.js";
import { logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "BLUEPRINTS";

// Langkah hasil parse tidak berubah selama dunia hidup, jadi cukup dihitung
// sekali per rancangan. Yang berubah tiap pemakaian hanya titik originnya.
const cache = new Map();

function bounds(cells) {
  const b = {
    x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity,
    z0: Infinity, z1: -Infinity,
  };
  for (const [x, y, z] of cells) {
    if (x < b.x0) b.x0 = x;
    if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y;
    if (y > b.y1) b.y1 = y;
    if (z < b.z0) b.z0 = z;
    if (z > b.z1) b.z1 = z;
  }
  return b;
}

/** Langkah relatif terhadap titik berdiri companion, sudah diurutkan. */
export function relativeSteps(doc) {
  const hit = cache.get(doc.id);
  if (hit) return hit;

  const b = bounds(doc.cells);
  const anchorX = doc.origin === "corner" ? b.x0 : b.x0 + Math.floor((b.x1 - b.x0) / 2);
  const anchorZ = doc.origin === "corner" ? b.z0 : b.z0 + Math.floor((b.z1 - b.z0) / 2);

  const steps = [];
  for (const [x, y, z, key] of doc.cells) {
    const cell = doc.palette[key];
    if (!cell) {
      logWarn(TAG, `Rancangan "${doc.id}": huruf "${key}" tidak ada di palette; dilewati.`);
      continue;
    }
    steps.push({
      dx: x - anchorX,
      dz: z - anchorZ,
      yOff: y - b.y0,
      role: cell.role ?? "wall",
      block: cell.block,
    });
  }

  // Bangun dari bawah ke atas, dan kosongkan ruangan sebelum mengisinya —
  // kalau tidak, blok yang baru dipasang bisa langsung dibongkar lagi oleh
  // langkah "air" di lapis yang sama.
  steps.sort((a, c) =>
    a.yOff - c.yOff ||
    (a.role === "air" ? 0 : 1) - (c.role === "air" ? 0 : 1) ||
    a.dz - c.dz || a.dx - c.dx);

  logInfo(TAG, `Rancangan "${doc.id}" (${doc.source}) siap: ${steps.length} langkah, ` +
    `ukuran ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}x${b.z1 - b.z0 + 1}.`);
  cache.set(doc.id, steps);
  return steps;
}

/** Langkah dalam koordinat dunia, siap dijalankan builder.js. */
export function stepsAt(doc, origin) {
  return relativeSteps(doc).map((s) => ({
    x: origin.x + s.dx,
    z: origin.z + s.dz,
    yOff: s.yOff,
    role: s.role,
    block: s.block,
  }));
}

/**
 * Rancangan JSON dalam bentuk yang sama persis dengan BLUEPRINTS bawaan di
 * builder.js, supaya menu dan mesin pembangunnya tidak perlu tahu bedanya.
 */
export function dataBlueprints() {
  const out = {};
  for (const doc of DATA_BLUEPRINTS) {
    out[doc.id] = {
      label: doc.label,
      hint: doc.hint || `Rancangan dari ${doc.source}`,
      // Bangunan JSON dibangun RATA: satu ketinggian dasar untuk seluruh denah,
      // bukan mengikuti kontur tiap kolom. Menara yang separuhnya naik mengikuti
      // bukit bukan menara.
      flat: true,
      source: doc.source,
      plan: (ctx) => stepsAt(doc, ctx.origin),
    };
  }
  logDebug(TAG, `${Object.keys(out).length} rancangan JSON dimuat: ${Object.keys(out).join(", ") || "tidak ada"}`);
  return out;
}
