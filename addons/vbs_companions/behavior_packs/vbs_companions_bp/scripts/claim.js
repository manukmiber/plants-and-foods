/**
 * Patok ladang: pemain menandai chunk mana yang boleh digarap companion.
 *
 * Alurnya sengaja dibalik dari yang biasa. Companion TIDAK boleh mulai melebarkan
 * ladang sampai pemain memberi izin, dan izin itu berbentuk barang yang bisa
 * dipegang: sebatang stick bernama "Patok Ladang". Klik/tap ke tanah mana pun,
 * chunk tempat blok itu berada jadi terpatok, dan sebuah penanda muncul di tengah
 * chunk dengan pancaran warna:
 *
 *   MERAH  — sudah dipatok, tapi belum digarap jadi ladang
 *   HIJAU  — sudah jadi ladang
 *
 * Klik lagi di chunk yang sama untuk mencabut patoknya.
 *
 * Patok disimpan di tingkat dunia, bukan di companion, supaya tetap ada walau
 * companion yang menggarapnya diistirahatkan atau diganti.
 */

import { system, world } from "@minecraft/server";

import { MARKER, STAKE_ITEM, STAKE_NAME } from "./config.js";
import {
  claimKey, clearClaim, getClaim, readClaims, setClaim,
} from "./state.js";
import {
  blockAt, chunkCenter, chunkOf, dist2, give, isSolid, makeItem, particle, sound,
} from "./util.js";

const BEAM_HEIGHT = 18;
const BEAM_STEP = 2;
// Dua partikel bawaan yang pasti ada di semua versi dan warnanya jelas beda dari
// jauh. Sengaja bukan partikel redstone: identifiernya berbeda antar versi.
const BEAM = {
  free: "minecraft:basic_flame_particle",
  claimed: "minecraft:villager_happy",
};

// --- barang patok ----------------------------------------------------------

export function makeStake() {
  const item = makeItem(STAKE_ITEM, 1);
  if (!item) return undefined;
  item.nameTag = STAKE_NAME;
  try {
    item.setLore([
      "§7Klik tanah untuk mematok chunk itu",
      "§7sebagai ladang. Klik lagi untuk mencabut.",
      "§8Merah = belum digarap, hijau = sudah.",
    ]);
  } catch {
    /* setLore tidak ada di versi ini; namanya saja sudah cukup */
  }
  return item;
}

export function isStake(itemStack) {
  return Boolean(itemStack) && itemStack.typeId === STAKE_ITEM &&
    itemStack.nameTag === STAKE_NAME;
}

/** Beri pemain satu patok kalau dia belum punya. */
export function ensureStake(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return false;
  for (let i = 0; i < container.size; i++) {
    if (isStake(container.getItem(i))) return false;
  }
  give(player, makeStake());
  player.sendMessage(
    "§eKamu diberi §fPatok Ladang§e. §7Klik tanah untuk memilih chunk yang boleh " +
    "digarap. Penanda merah berarti belum digarap, hijau berarti sudah.");
  return true;
}

// --- penanda ---------------------------------------------------------------

function markersIn(dimension) {
  try {
    return dimension.getEntities({ type: MARKER });
  } catch {
    return [];
  }
}

function findMarker(dimension, cx, cz) {
  for (const m of markersIn(dimension)) {
    const c = chunkOf(m.location);
    if (c.cx === cx && c.cz === cz) return m;
  }
  return undefined;
}

/** Permukaan tanah di tengah chunk, supaya penandanya tidak melayang. */
function groundAt(dimension, x, z, from) {
  for (let y = Math.min(from + 12, 318); y > from - 40; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    if (here.isAir && isSolid(below)) return y;
  }
  return from;
}

export function refreshMarker(dimension, cx, cz, entry) {
  const { x, z } = chunkCenter(cx, cz);
  let marker = findMarker(dimension, cx, cz);
  if (!entry) {
    if (marker) {
      try {
        marker.remove();
      } catch {
        /* sudah hilang */
      }
    }
    return undefined;
  }
  if (!marker) {
    const y = groundAt(dimension, x, z, Math.floor(entry.y ?? 64));
    try {
      marker = dimension.spawnEntity(MARKER, { x: x + 0.5, y, z: z + 0.5 });
    } catch {
      return undefined;             // chunk belum dimuat
    }
  }
  try {
    marker.triggerEvent(entry.worked ? "vbs:set_claimed" : "vbs:set_free");
    marker.nameTag = entry.worked
      ? `§aPatok Ladang §7(${cx}, ${cz})\n§asudah jadi ladang`
      : `§cPatok Ladang §7(${cx}, ${cz})\n§cbelum digarap`;
  } catch {
    /* penanda hilang di tengah jalan */
  }
  return marker;
}

/** Pancaran warna dari tiap penanda. Hanya digambar kalau ada pemain di dekatnya. */
export function tickBeams() {
  const players = world.getAllPlayers();
  if (!players.length) return;
  const claims = readClaims();
  for (const [key, entry] of Object.entries(claims)) {
    const [dimId, coords] = key.split("|");
    const [cx, cz] = coords.split(",").map(Number);
    let dimension;
    try {
      dimension = world.getDimension(dimId);
    } catch {
      continue;
    }
    const { x, z } = chunkCenter(cx, cz);
    const watcher = players.find((p) => p.dimension.id === dimId &&
      dist2(p.location, { x, y: p.location.y, z }) < 64 * 64);
    if (!watcher) continue;
    const marker = findMarker(dimension, cx, cz);
    const base = marker ? marker.location.y : groundAt(dimension, x, z, 64);
    const id = entry.worked ? BEAM.claimed : BEAM.free;
    for (let dy = 1; dy <= BEAM_HEIGHT; dy += BEAM_STEP) {
      particle(dimension, id, { x: x + 0.5, y: base + dy, z: z + 0.5 });
    }
  }
}

// --- pemakaian patok oleh pemain -------------------------------------------

/** Balik status chunk tempat blok ini berada. Mengembalikan teks untuk pemain. */
export function toggleClaim(player, block) {
  const { cx, cz } = chunkOf(block.location);
  const dimId = player.dimension.id;
  const existing = getClaim(dimId, cx, cz);
  if (existing) {
    clearClaim(dimId, cx, cz);
    refreshMarker(player.dimension, cx, cz, undefined);
    sound(player.dimension, "random.break", block.location);
    return `§7Patok chunk §f(${cx}, ${cz})§7 dicabut.`;
  }
  const entry = { by: player.id, name: player.name, worked: false,
                  y: Math.floor(block.location.y) + 1 };
  setClaim(dimId, cx, cz, entry);
  refreshMarker(player.dimension, cx, cz, entry);
  sound(player.dimension, "random.orb", block.location);
  return `§cChunk (${cx}, ${cz}) dipatok§7 — belum digarap. ` +
    "§7Suruh companionmu ke mode bertani, dia yang akan menggarapnya.";
}

/** Tandai satu chunk sudah jadi ladang: penandanya berubah merah -> hijau. */
export function markWorked(dimension, cx, cz) {
  const entry = getClaim(dimension.id, cx, cz);
  if (!entry || entry.worked) return false;
  entry.worked = true;
  setClaim(dimension.id, cx, cz, entry);
  refreshMarker(dimension, cx, cz, entry);
  return true;
}

/** Chunk yang dipatok pemilik companion ini, terdekat dulu. */
export function claimsNear(dimension, origin, ownerId, limit = 8) {
  const out = [];
  const claims = readClaims();
  for (const [key, entry] of Object.entries(claims)) {
    const [dimId, coords] = key.split("|");
    if (dimId !== dimension.id) continue;
    if (ownerId && entry.by !== ownerId) continue;
    const [cx, cz] = coords.split(",").map(Number);
    const c = chunkCenter(cx, cz);
    out.push({ cx, cz, entry, d: Math.hypot(c.x - origin.x, c.z - origin.z) });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, limit);
}

export function claimAt(dimension, loc, ownerId) {
  const { cx, cz } = chunkOf(loc);
  const entry = getClaim(dimension.id, cx, cz);
  if (!entry) return undefined;
  if (ownerId && entry.by !== ownerId) return undefined;
  return { cx, cz, entry, key: claimKey(dimension.id, cx, cz) };
}

/** Kotak blok satu chunk: dipakai mode bertani untuk tahu batas garapannya. */
export function chunkBounds(cx, cz) {
  return { x0: cx * 16, z0: cz * 16, x1: cx * 16 + 15, z1: cz * 16 + 15 };
}

// --- pasang pendengar ------------------------------------------------------

let wired = false;

export function wireStake() {
  if (wired) return;
  wired = true;
  const handle = (player, itemStack, block) => {
    if (!player || !block || !isStake(itemStack)) return false;
    system.run(() => {
      try {
        player.sendMessage(toggleClaim(player, block));
      } catch {
        /* pemain keluar tepat saat mengklik */
      }
    });
    return true;
  };

  // Dua nama event untuk hal yang sama di versi gim yang berbeda. Dipasang
  // dua-duanya dan dijaga supaya tidak menangani klik yang sama dua kali.
  const seen = new Map();
  const once = (player, block) => {
    const key = `${player.id}:${block.x},${block.y},${block.z}`;
    const last = seen.get(key) ?? -99;
    if (system.currentTick - last < 6) return false;
    seen.set(key, system.currentTick);
    return true;
  };

  try {
    world.afterEvents.itemUseOn.subscribe((ev) => {
      if (!once(ev.source, ev.block)) return;
      handle(ev.source, ev.itemStack, ev.block);
    });
  } catch {
    /* tidak ada di versi ini */
  }
  try {
    world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
      if (!once(ev.player, ev.block)) return;
      handle(ev.player, ev.itemStack ?? ev.beforeItemStack, ev.block);
    });
  } catch {
    /* tidak ada di versi ini */
  }
}
