/**
 * Titik masuk add-on VBS Companions.
 */

import { system, world } from "@minecraft/server";
import { setActivity, forget as forgetActivity } from "./activity.js";
import { sayFrom } from "./chat.js";
import { forget as forgetCombat, syncWeapon, tickCombat } from "./combat.js";
import { CHAT, DEFAULT_MODE, FAMILY, LOOK, MODES, TICKS } from "./config.js";
import { tickBuild } from "./builder.js";
import { tickBeams, wireStake } from "./claim.js";
import { tickFarm } from "./farming.js";
import { forget as forgetHold, isHeld, tickHolds } from "./hold.js";
import { forget as forgetLook, tickLook } from "./look.js";
import { tickMine } from "./mining.js";
import { forget as forgetBubble, refreshName, tickBubbles } from "./nametag.js";
import { forget as forgetSocial, tickSocial } from "./social.js";
import { readState } from "./state.js";
import { openMenu } from "./ui.js";
import { tickWander } from "./wander.js";
import {
  alive, allCompanions, applyMode, dist2, getMode, getOwnerId, info, isCompanion,
  resolveOwner, setMode, setOwner, stopWalking, tickSteer,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "MAIN";
const hintCooldown = new Map();
const chatterAt = new Map();
const CHATTER_EVERY = 1400;

const CHATTER_KEY = {
  farm: "farm", mine: "mine", wander: "wander", build: "build", attack: "attack",
};

function tryTame(entity, player) {
  logDebug(TAG, `Mencoba men-tame ${entStr(entity)} ke pemain ${player.name}...`);
  for (const id of ["minecraft:tameable", "minecraft:tamable"]) {
    try {
      const comp = entity.getComponent(id);
      if (comp && typeof comp.tame === "function") {
        const res = comp.tame(player) !== false;
        logInfo(TAG, `Hasil tame (${id}) untuk ${entStr(entity)}: ${res}`);
        return res;
      }
    } catch (e) {
      logWarn(TAG, `Gagal memanggil fungsi tame pada komponen ${id}`, e);
    }
  }
  return false;
}

function bootstrap(entity, claimant) {
  logInfo(TAG, `Memulai bootstrap untuk entity: ${entStr(entity)}`);
  if (!alive(entity) || !isCompanion(entity)) {
    logWarn(TAG, `Bootstrap batal: entity bukan companion atau mati.`);
    return;
  }
  if (!getOwnerId(entity)) {
    const owner = claimant ?? entity.dimension.getPlayers({
      location: entity.location, maxDistance: 10, closest: 1,
    })[0];
    if (owner) {
      logInfo(TAG, `Menetapkan pemilik ${owner.name} untuk companion ${entStr(entity)}`);
      setOwner(entity, owner);
      tryTame(entity, owner);
      owner.sendMessage(`§a${info(entity).name} bergabung. §7Jongkok lalu klik kanan untuk memberi perintah.`);
    } else {
      logWarn(TAG, `Bootstrap: Tidak ditemukan pemain di dekat companion untuk menjadi owner.`);
    }
  }
  const mode = getMode(entity) ?? DEFAULT_MODE;
  logInfo(TAG, `Bootstrap: Mengatur mode awal "${mode}" untuk ${entStr(entity)}`);
  setMode(entity, mode);
  syncWeapon(entity);
  refreshName(entity);
}

function forgetAll(id) {
  logInfo(TAG, `Membersihkan SEMUA cache/state memori untuk entity ID: ${id}`);
  forgetActivity(id);
  forgetBubble(id);
  forgetCombat(id);
  forgetHold(id);
  forgetLook(id);
  forgetSocial(id);
  stopWalking(id);
  chatterAt.delete(id);
}

world.afterEvents.entitySpawn.subscribe((ev) => {
  if (!isCompanion(ev.entity)) return;
  logInfo(TAG, `Event entitySpawn: Companion terdeteksi -> ${entStr(ev.entity)}`);
  system.run(() => bootstrap(ev.entity));
});

world.afterEvents.entityLoad.subscribe((ev) => {
  if (!isCompanion(ev.entity)) return;
  logInfo(TAG, `Event entityLoad: Companion dimuat -> ${entStr(ev.entity)}`);
  system.run(() => {
    if (!alive(ev.entity)) return;
    applyMode(ev.entity, getMode(ev.entity));
    syncWeapon(ev.entity);
    refreshName(ev.entity);
  });
});

try {
  world.afterEvents.entityRemove.subscribe((ev) => {
    logInfo(TAG, `Event entityRemove: Entity ID ${ev.removedEntityId} dihapus.`);
    forgetAll(ev.removedEntityId);
  });
} catch (e) {
  logWarn(TAG, "world.afterEvents.entityRemove tidak didukung.", e);
}

world.afterEvents.entityDie.subscribe((ev) => {
  if (!isCompanion(ev.deadEntity)) return;
  logWarn(TAG, `Event entityDie: Companion ${entStr(ev.deadEntity)} MATI!`);
  forgetAll(ev.deadEntity.id);
});

world.afterEvents.entityHurt.subscribe((ev) => {
  const entity = ev.hurtEntity;
  if (!isCompanion(entity) || !alive(entity)) return;
  logDebug(TAG, `Event entityHurt: ${entStr(entity)} terkena serangan.`);
  if (Math.random() < 0.35) sayFrom(entity, "hurt");
});

world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  if (!isCompanion(target)) return;
  logDebug(TAG, `Pemain ${player.name} berinteraksi dengan ${entStr(target)} (Sneaking: ${player.isSneaking})`);
  if (!player.isSneaking) {
    const last = hintCooldown.get(player.id) ?? 0;
    if (system.currentTick - last > 60) {
      hintCooldown.set(player.id, system.currentTick);
      player.sendMessage("§7Jongkok dulu, baru klik/tap dia untuk membuka menunya.");
    }
    return;
  }
  system.run(async () => {
    if (!alive(target)) return;
    if (!getOwnerId(target)) bootstrap(target, player);
    logInfo(TAG, `Membuka UI untuk ${player.name} pada companion ${entStr(target)}`);
    await openMenu(player, target);
  });
});

world.afterEvents.playerLeave.subscribe((ev) => {
  logDebug(TAG, `Pemain keluar: ID ${ev.playerId}`);
  hintCooldown.delete(ev.playerId);
});

wireStake();

// DENYUT CEPAT (4 ticks)
system.runInterval(() => {
  const companions = allCompanions(FAMILY).filter(alive);
  const byId = new Map(companions.map((c) => [c.id, c]));
  tickHolds(byId);
  tickBubbles(byId);
  if (LOOK.enabled) tickLook(companions);
  for (const entity of companions) {
    if (isHeld(entity)) continue;
    tickSteer(entity);
  }
}, TICKS.fast);

// DENYUT KERJA (10 ticks)
system.runInterval(() => {
  for (const entity of allCompanions(FAMILY)) {
    if (!alive(entity)) continue;
    try {
      workOnce(entity);
    } catch (err) {
      logError(TAG, `Error saat workOnce pada ${entStr(entity)}`, err);
    }
  }
}, TICKS.brain);

function workOnce(entity) {
  const mode = getMode(entity);
  const meta = info(entity);
  const owner = resolveOwner(entity);
  const state = readState(entity);

  if (isHeld(entity)) {
    logDebug(TAG, `workOnce: ${entStr(entity)} sedang di-hold, aksi kerja diskip.`);
    return;
  }

  logDebug(TAG, `workOnce: Mengeksekusi mode "${mode}" untuk ${entStr(entity)}`);
  let status;
  switch (mode) {
    case "farm": status = tickFarm(entity, state, owner); break;
    case "mine": status = tickMine(entity, state, owner); break;
    case "wander": status = tickWander(entity, state, owner); break;
    case "build": status = tickBuild(entity, state, owner); break;
    case "attack": {
      const n = tickCombat(entity, meta?.damage ?? 5);
      status = n ? `bertarung (${n} musuh dekat)` : "berjaga, tidak ada musuh";
      break;
    }
    case "stay": status = "berjaga di tempat"; break;
    default: status = "mengikuti"; break;
  }
  if (status) setActivity(entity, status);
  chatter(entity, mode);
}

function chatter(entity, mode) {
  if (readState(entity).quiet) return;
  const last = chatterAt.get(entity.id) ?? -CHATTER_EVERY;
  if (system.currentTick - last < CHATTER_EVERY) return;
  chatterAt.set(entity.id, system.currentTick + Math.floor(Math.random() * 400));
  if (Math.random() > 0.5) return;
  const key = CHATTER_KEY[mode] ?? "idle";
  logDebug(TAG, `Celoteh acak dipicu untuk ${entStr(entity)} (key: ${key})`);
  sayFrom(entity, key);
}

// DENYUT LAMBAT (Leash, Beams, Social)
system.runInterval(() => {
  for (const entity of allCompanions(FAMILY)) {
    try {
      const mode = getMode(entity);
      if (mode === "stay" || mode === "wander" || mode === "mine") continue;
      const owner = resolveOwner(entity);
      if (!owner) continue;
      const sameDimension = owner.dimension.id === entity.dimension.id;
      if (sameDimension && dist2(entity.location, owner.location) < TICKS.teleportAt ** 2) {
        continue;
      }
      logInfo(TAG, `Teleportasi penarik: Menarik ${entStr(entity)} ke owner ${owner.name}`);
      const angle = Math.random() * Math.PI * 2;
      entity.teleport({
        x: owner.location.x + Math.cos(angle) * 1.5,
        y: owner.location.y,
        z: owner.location.z + Math.sin(angle) * 1.5,
      }, { dimension: owner.dimension });
    } catch (e) {
      logWarn(TAG, `Gagal melakukan teleportasi leash pada ${entStr(entity)}`, e);
    }
  }
}, TICKS.leash);

system.runInterval(() => {
  try {
    tickBeams();
  } catch (e) {
    logWarn(TAG, "Error saat tickBeams", e);
  }
}, 20);

system.runInterval(() => {
  const companions = allCompanions(FAMILY).filter(alive);
  if (companions.length < 2) return;
  try {
    tickSocial(companions);
  } catch (err) {
    logError(TAG, "Error saat tickSocial", err);
  }
}, TICKS.social);

system.run(() => {
  logInfo(TAG, `[VBS Companions] Sistem Siap! Total mode: ${Object.keys(MODES).length}`);
});