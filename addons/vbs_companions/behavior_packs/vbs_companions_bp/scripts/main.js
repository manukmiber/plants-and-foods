/**
 * Titik masuk add-on VBS Companions.
 *
 * Tiga hal yang diurus di sini:
 *   1. Membuka UI saat pemain jongkok lalu berinteraksi dengan companion.
 *   2. Menyiapkan companion yang baru muncul: pemilik, nama melayang, mode awal.
 *   3. Dua denyut berkala — mode bertani, dan tali tak kelihatan yang menarik
 *      companion pulang kalau ketinggalan jauh dari pemiliknya.
 *
 * Gerak jalan, mengejar musuh dan mencari petak ladang dikerjakan oleh behavior
 * pack (component group per mode); script hanya menyalakan mode yang mana.
 */

import { system, world } from "@minecraft/server";

import { DEFAULT_MODE, FAMILY, MODES, TICKS } from "./config.js";
import { tickFarm } from "./farming.js";
import { openMenu, refreshName } from "./ui.js";
import { getMode, getOwnerId, info, isCompanion, resolveOwner, setMode, setOwner } from "./util.js";

const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
const hintCooldown = new Map();

function allCompanions() {
  const out = [];
  for (const id of DIMENSIONS) {
    try {
      out.push(...world.getDimension(id).getEntities({ families: [FAMILY] }));
    } catch {
      /* dimensi belum dimuat */
    }
  }
  return out;
}

/** Coba jadikan pemain pemilik resmi di mata mesin gim, supaya follow_owner jalan. */
function tryTame(entity, player) {
  for (const id of ["minecraft:tameable", "minecraft:tamable"]) {
    try {
      const comp = entity.getComponent(id);
      if (comp && typeof comp.tame === "function") return comp.tame(player) !== false;
    } catch {
      /* versi ini tidak menyediakannya; pemain masih bisa memberi roti */
    }
  }
  return false;
}

/** Companion baru muncul: cari pemiliknya, beri nama, nyalakan mode awal. */
function bootstrap(entity, claimant) {
  if (!entity.isValid || !isCompanion(entity)) return;
  if (!getOwnerId(entity)) {
    const owner = claimant ?? entity.dimension.getPlayers({
      location: entity.location, maxDistance: 10, closest: 1,
    })[0];
    if (owner) {
      setOwner(entity, owner);
      tryTame(entity, owner);
      owner.sendMessage(
        `§a${info(entity).name} bergabung. §7Jongkok lalu klik kanan untuk memberi perintah.`);
    }
  }
  setMode(entity, getMode(entity) ?? DEFAULT_MODE);
  refreshName(entity);
}

world.afterEvents.entitySpawn.subscribe((ev) => {
  if (!isCompanion(ev.entity)) return;
  system.run(() => bootstrap(ev.entity));
});

world.afterEvents.entityLoad.subscribe((ev) => {
  if (!isCompanion(ev.entity)) return;
  system.run(() => {
    if (!ev.entity.isValid) return;
    setMode(ev.entity, getMode(ev.entity));      // samakan lagi component group
    refreshName(ev.entity);
  });
});

// Jongkok + klik kanan (atau tombol interact di layar sentuh) membuka UI.
world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  if (!isCompanion(target)) return;
  if (!player.isSneaking) {
    const last = hintCooldown.get(player.id) ?? 0;
    if (system.currentTick - last > 60) {
      hintCooldown.set(player.id, system.currentTick);
      player.sendMessage("§7Jongkok dulu, baru klik/tap dia untuk membuka menunya.");
    }
    return;
  }
  system.run(async () => {
    if (!target.isValid) return;
    if (!getOwnerId(target)) bootstrap(target, player);
    await openMenu(player, target);
  });
});

// Denyut mode bertani.
system.runInterval(() => {
  for (const entity of allCompanions()) {
    try {
      if (getMode(entity) === "farm") tickFarm(entity);
    } catch {
      /* companion hilang di tengah denyut */
    }
  }
}, TICKS.brain);

// Tali tak kelihatan: kalau ketinggalan jauh atau beda dimensi, ditarik pulang.
system.runInterval(() => {
  for (const entity of allCompanions()) {
    try {
      if (getMode(entity) === "stay") continue;
      const owner = resolveOwner(entity);
      if (!owner) continue;
      const sameDimension = owner.dimension.id === entity.dimension.id;
      if (sameDimension) {
        const a = entity.location;
        const b = owner.location;
        const far = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (far < TICKS.teleportAt ** 2) continue;
      }
      const angle = Math.random() * Math.PI * 2;
      entity.teleport({
        x: owner.location.x + Math.cos(angle) * 1.5,
        y: owner.location.y,
        z: owner.location.z + Math.sin(angle) * 1.5,
      }, { dimension: owner.dimension });
    } catch {
      /* pemain baru keluar, atau chunk-nya belum dimuat */
    }
  }
}, TICKS.leash);

world.afterEvents.playerLeave.subscribe((ev) => hintCooldown.delete(ev.playerId));

system.run(() => {
  console.log(`[VBS Companions] siap — ${Object.keys(MODES).length} mode, ` +
              `keluarga entity "${FAMILY}"`);
});
