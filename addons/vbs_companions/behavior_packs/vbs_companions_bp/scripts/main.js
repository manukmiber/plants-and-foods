/**
 * Titik masuk add-on VBS Companions.
 */

import { system, world } from "@minecraft/server";
import { setActivity, forget as forgetActivity } from "./activity.js";
import { sayFrom } from "./chat.js";
import { forget as forgetCombat, syncWeapon, tickCombat } from "./combat.js";
import { CHAT, DEFAULT_MODE, FAMILY, FLOWERS, LOOK, MODES, TICKS } from "./config.js";
import { tickBuild } from "./builder.js";
import { tickBeams, wireStake } from "./claim.js";
import { tickCrafter } from "./crafter.js";
import { tickEnergy } from "./energy.js";
import { tickFarm } from "./farming.js";
import { tickLooter } from "./looter.js";
import { forget as forgetHold, isHeld, reasonFor, tickHolds } from "./hold.js";
import { forget as forgetLook, tickLook } from "./look.js";
import { tickMine } from "./mining.js";
import { forget as forgetBubble, refreshName, tickBubbles } from "./nametag.js";
import { forget as forgetSocial, tickSocial } from "./social.js";
import { readState, writeState } from "./state.js";
import { openMenu } from "./ui.js";
import { wireUserTalk } from "./usertalk.js";
import { tickWander } from "./wander.js";
import {
  alive, allCompanions, applyMode, dist2, getMode, getOwnerId, info, isCompanion,
  particle, resolveOwner, setMode, setOwner, stopWalking, tickSteer,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "MAIN";
const hintCooldown = new Map();
const chatterAt = new Map();
const CHATTER_EVERY = 1400;

const CHATTER_KEY = {
  farm: "farm", mine: "mine", wander: "wander", build: "build", attack: "attack",
  crafter: "crafter", looter: "looter",
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
  // Secara default companion LIAR (untamed) begitu muncul — tidak ada lagi
  // pengambilan pemilik otomatis dari pemain terdekat. Satu-satunya jalan
  // menjadi pemiliknya adalah memberinya bunga (lihat tryFeedFlower di bawah),
  // dan claimant di sini hanya diisi dari jalur itu.
  if (claimant && !getOwnerId(entity)) {
    logInfo(TAG, `Menetapkan pemilik ${claimant.name} untuk companion ${entStr(entity)}`);
    setOwner(entity, claimant);
    tryTame(entity, claimant);
    claimant.sendMessage(
      `§a${info(entity).name} jinak dan sekarang mengikutimu. ` +
      "§7Jongkok lalu klik kanan untuk memberi perintah.");
  }
  const mode = getMode(entity) ?? DEFAULT_MODE;
  logInfo(TAG, `Bootstrap: Mengatur mode awal "${mode}" untuk ${entStr(entity)}`);
  setMode(entity, mode);
  syncWeapon(entity);
  refreshName(entity);
}

function heldFlower(player) {
  try {
    const eq = player.getComponent("minecraft:equippable");
    const stack = eq?.getEquipment("Mainhand");
    return stack && FLOWERS.has(stack.typeId) ? stack : undefined;
  } catch (e) {
    logWarn(TAG, `Gagal membaca item di tangan ${player?.name} saat cek bunga`, e);
    return undefined;
  }
}

function consumeOne(player, stack) {
  const eq = player.getComponent("minecraft:equippable");
  if (stack.amount > 1) {
    stack.amount -= 1;
    eq.setEquipment("Mainhand", stack);
  } else {
    eq.setEquipment("Mainhand", undefined);
  }
}

function tryFeedFlower(entity, player) {
  const stack = heldFlower(player);
  if (!stack) return false;
  logInfo(TAG, `${player.name} memberi bunga (${stack.typeId}) ke ${entStr(entity)} untuk menjinakkannya.`);
  try {
    consumeOne(player, stack);
  } catch (e) {
    logWarn(TAG, `Gagal mengambil bunga dari tangan ${player.name}`, e);
    return false;
  }
  bootstrap(entity, player);
  particle(entity.dimension, "minecraft:heart_particle", {
    x: entity.location.x, y: entity.location.y + 2.1, z: entity.location.z,
  });
  player.playSound("random.eat", { location: player.location });
  return true;
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

  if (!getOwnerId(target)) {
    if (!player.isSneaking && tryFeedFlower(target, player)) return;
    const last = hintCooldown.get(player.id) ?? 0;
    if (system.currentTick - last > 60) {
      hintCooldown.set(player.id, system.currentTick);
      player.sendMessage("§7Companion ini masih liar. Beri dia satu bunga (apa saja) untuk menjinakkannya.");
    }
    return;
  }

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
    logInfo(TAG, `Membuka UI untuk ${player.name} pada companion ${entStr(target)}`);
    await openMenu(player, target);
  });
});

world.afterEvents.playerLeave.subscribe((ev) => {
  logDebug(TAG, `Pemain keluar: ID ${ev.playerId}`);
  hintCooldown.delete(ev.playerId);
});

wireStake();
wireUserTalk();

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

  // Hold karena "rest" sengaja tidak menghentikan workOnce sepenuhnya — kalau
  // begitu, tickEnergy (yang justru menjalankan pemulihan tenaga dan
  // pengecekan "sudah cukup istirahat belum") tidak akan pernah terpanggil
  // lagi selama companion ditahan diam oleh hold-nya sendiri.
  if (isHeld(entity) && reasonFor(entity) !== "rest") {
    logDebug(TAG, `workOnce: ${entStr(entity)} sedang di-hold, aksi kerja diskip.`);
    return;
  }

  if (!getOwnerId(entity)) {
    logDebug(TAG, `workOnce: ${entStr(entity)} masih liar, tidak bekerja sebelum dijinakkan.`);
    return;
  }

  if (tickEnergy(entity, state, mode)) {
    writeState(entity, state);
    setActivity(entity, "beristirahat memulihkan tenaga");
    return;
  }

  logDebug(TAG, `workOnce: Mengeksekusi mode "${mode}" untuk ${entStr(entity)}`);
  let status;
  switch (mode) {
    case "farm": status = tickFarm(entity, state, owner); break;
    case "mine": status = tickMine(entity, state, owner); break;
    case "wander": status = tickWander(entity, state, owner); break;
    case "build": status = tickBuild(entity, state, owner); break;
    case "crafter": status = tickCrafter(entity, state, owner); break;
    case "looter": status = tickLooter(entity, state, owner); break;
    case "attack": {
      const n = tickCombat(entity, meta?.damage ?? 5);
      status = n ? `bertarung (${n} musuh dekat)` : "berjaga, tidak ada musuh";
      break;
    }
    case "stay": status = "berjaga di tempat"; break;
    default: status = "mengikuti"; break;
  }
  writeState(entity, state);
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
      // Cuma mode "Ikuti Aku" yang boleh ditarik paksa ke pemilik. Mode kerja
      // lainnya (bertani, menambang, membangun, bertarung, mengembara, merajin,
      // mencari barang, diam) harus tetap di chunk tempat mereka bekerja —
      // ditarik terus-terusan cuma bikin mereka tidak pernah selesai kerja.
      if (mode !== "follow") continue;
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