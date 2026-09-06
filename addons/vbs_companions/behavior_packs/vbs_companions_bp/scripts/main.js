/**
 * Titik masuk add-on VBS Companions.
 *
 * SEMUA listener event dan SEMUA denyut interval di berkas ini dibungkus
 * guard() dari logger.js. Itu wajib: kalau satu callback melempar tanpa
 * ditangkap, Minecraft mematikan seluruh mesin skrip dan add-on mati
 * diam-diam tanpa pesan apa pun. Dengan guard(), error-nya tercatat lengkap
 * dengan nama jalurnya dan sisanya tetap jalan.
 */

import { system, world } from "@minecraft/server";
import { setActivity, forget as forgetActivity } from "./activity.js";
import { forget as forgetDig } from "./dig.js";
import { setBetaHandlers, betaSummary } from "./beta.js";
import { wireBook } from "./book.js";
import { openBook } from "./bookui.js";
import { sayFrom } from "./chat.js";
import { forget as forgetCombat, syncWeapon, tickCombat } from "./combat.js";
import { DEFAULT_MODE, FAMILY, LOOK, MODES, TICKS } from "./config.js";
import { tickBuild } from "./builder.js";
import { tickBeams, wireStake } from "./claim.js";
import { tickCrafter } from "./crafter.js";
import { isNight, isSleeping, tickEnergy } from "./energy.js";
import { tickFarm } from "./farming.js";
import { forget as forgetLooter, tickLooter } from "./looter.js";
import { forget as forgetHold, isHeld, reasonFor, tickHolds } from "./hold.js";
import { forget as forgetLook, tickLook } from "./look.js";
import { tickMine } from "./mining.js";
import { forget as forgetBubble, refreshName, tickBubbles } from "./nametag.js";
import { forget as forgetSocial, tickSocial } from "./social.js";
import { readSettings, readState, writeState } from "./state.js";
import {
  forget as forgetTaming, offerFlower, tickTaming,
} from "./taming.js";
import { openMenu } from "./ui.js";
import { deliver, orderMode, wireUserTalk } from "./usertalk.js";
import { tickWander } from "./wander.js";
import {
  alive, allCompanions, applyMode, dist2, getMode, getOwnerId, info, isCompanion,
  resolveOwner, setMode, stopWalking, tickSteer,
} from "./util.js";
import {
  entStr, guard, logDebug, logError, logEvent, logInfo, logWarn,
} from "./logger.js";

const TAG = "MAIN";
const hintCooldown = new Map();
const chatterAt = new Map();
// Companion terasa hidup kalau sering bersuara. Jeda celoteh dipendekkan
// drastis dari versi lama (1400 tick) dan peluangnya dinaikkan.
const CHATTER_EVERY = 420;
const CHATTER_CHANCE = 0.7;
const DAYPART_EVERY = 1200;

// Alasan hold yang TIDAK boleh menghentikan denyut kerja.
const WORK_HOLDS = new Set(["rest", "dig"]);

const CHATTER_KEY = {
  farm: "farm", mine: "mine", wander: "wander", build: "build", attack: "attack",
  crafter: "crafter", looter: "looter", follow: "idle", stay: "idle",
};

let lastNight;
let lastDaypartAt = 0;

/* ------------------------------------------------------------------ *
 * Menjinakkan: companion LIAR sampai diberi satu bunga
 *
 * Yang mengerjakan taming sekarang mesin gim (minecraft:tameable dengan
 * tame_items berisi bunga); berkas ini cuma menyambungnya ke isi add-on —
 * mencatat pemilik, memasang mode awal, dan menyapa. Rinciannya di taming.js.
 * ------------------------------------------------------------------ */

/** Dipanggil taming.js begitu companion benar-benar jinak. */
function onTamed(entity, player) {
  logInfo(TAG, `${entStr(entity)} dijinakkan oleh ${player.name}.`);
  bootstrap(entity);
  player.sendMessage(
    `§a${info(entity).name} jinak dan sekarang mengikutimu. ` +
    "§7Jongkok lalu klik kanan untuk membuka menunya, atau ketik " +
    `§f chat ${info(entity).name} halo§7 untuk mengajaknya bicara.`);
  sayFrom(entity, "greet", { toOwnerAlways: true });
}

function bootstrap(entity) {
  logInfo(TAG, `Bootstrap untuk ${entStr(entity)}`);
  if (!alive(entity) || !isCompanion(entity)) {
    logWarn(TAG, "Bootstrap batal: entity bukan companion atau sudah mati.");
    return;
  }
  const mode = getMode(entity) ?? DEFAULT_MODE;
  logInfo(TAG, `Bootstrap: mode awal "${mode}" untuk ${entStr(entity)}`);
  setMode(entity, mode);
  syncWeapon(entity);
  refreshName(entity);
}

function forgetAll(id) {
  logInfo(TAG, `Membersihkan seluruh cache memori untuk entity ID: ${id}`);
  forgetActivity(id);
  forgetBubble(id);
  forgetDig(id);
  forgetCombat(id);
  forgetHold(id);
  forgetLook(id);
  forgetLooter(id);
  forgetSocial(id);
  forgetTaming(id);
  stopWalking(id);
  chatterAt.delete(id);
}

/* ------------------------------------------------------------------ *
 * Event dunia — semuanya dicatat, semuanya dibungkus guard()
 * ------------------------------------------------------------------ */

function subscribe(source, name, handler) {
  try {
    source.subscribe(guard(TAG, name, handler));
    logDebug(TAG, `Listener "${name}" terpasang.`);
  } catch (e) {
    logWarn(TAG, `Gagal memasang listener "${name}" (tidak didukung versi ini?)`, e);
  }
}

subscribe(world.afterEvents.entitySpawn, "entitySpawn", (ev) => {
  if (!isCompanion(ev.entity)) return;
  logEvent(TAG, "entitySpawn", entStr(ev.entity));
  system.run(guard(TAG, "entitySpawn/run", () => bootstrap(ev.entity)));
});

subscribe(world.afterEvents.entityLoad, "entityLoad", (ev) => {
  if (!isCompanion(ev.entity)) return;
  logEvent(TAG, "entityLoad", entStr(ev.entity));
  system.run(guard(TAG, "entityLoad/run", () => {
    if (!alive(ev.entity)) return;
    applyMode(ev.entity, getMode(ev.entity));
    syncWeapon(ev.entity);
    refreshName(ev.entity);
  }));
});

subscribe(world.afterEvents.entityRemove, "entityRemove", (ev) => {
  logEvent(TAG, "entityRemove", ev.removedEntityId);
  forgetAll(ev.removedEntityId);
});

subscribe(world.afterEvents.entityDie, "entityDie", (ev) => {
  if (!isCompanion(ev.deadEntity)) return;
  logWarn(TAG, `Companion MATI: ${entStr(ev.deadEntity)}`);
  forgetAll(ev.deadEntity.id);
});

subscribe(world.afterEvents.entityHurt, "entityHurt", (ev) => {
  const entity = ev.hurtEntity;
  if (!isCompanion(entity) || !alive(entity)) return;
  logDebug(TAG, `${entStr(entity)} terkena serangan (${ev.damage ?? "?"} damage).`);
  if (Math.random() < 0.5) sayFrom(entity, "hurt");
});

subscribe(world.afterEvents.playerInteractWithEntity, "playerInteractWithEntity", (ev) => {
  const { player, target } = ev;
  if (!isCompanion(target)) return;
  logDebug(TAG, `${player.name} berinteraksi dengan ${entStr(target)} (jongkok: ${player.isSneaking})`);

  if (!getOwnerId(target)) {
    // Bunganya boleh diberikan sambil jongkok atau tidak — menuntut pemain
    // berdiri tegak cuma membuat "kok tidak jinak-jinak" bertambah satu sebab.
    if (offerFlower(target, player, ev.itemStack)) return;
    const last = hintCooldown.get(player.id) ?? 0;
    if (readSettings(player.id).hints && system.currentTick - last > 60) {
      hintCooldown.set(player.id, system.currentTick);
      player.sendMessage("§7Companion ini masih §cliar§7. Beri dia satu §fbunga§7 (apa saja) untuk menjinakkannya.");
    }
    return;
  }

  if (!player.isSneaking) {
    const last = hintCooldown.get(player.id) ?? 0;
    if (readSettings(player.id).hints && system.currentTick - last > 60) {
      hintCooldown.set(player.id, system.currentTick);
      player.sendMessage("§7Jongkok dulu, baru klik/tap dia untuk membuka menunya.");
    }
    return;
  }
  system.run(guard(TAG, "openMenu", async () => {
    if (!alive(target)) return;
    logInfo(TAG, `Membuka menu untuk ${player.name} pada ${entStr(target)}`);
    await openMenu(player, target);
  }));
});

subscribe(world.afterEvents.playerLeave, "playerLeave", (ev) => {
  logEvent(TAG, "playerLeave", ev.playerId);
  hintCooldown.delete(ev.playerId);
});

wireStake();
wireUserTalk();
wireBook();

// Perintah garis miring Beta API dilayani oleh modul yang sudah ada; beta.js
// sengaja tidak meng-import mereka sendiri supaya tidak ada lingkaran import.
setBetaHandlers({
  openBook,
  talk: (player, name, message) => deliver(player, name, message),
  setMode: (player, name, mode) => orderMode(player, name, mode),
});

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

// DENYUT CEPAT (4 tick): langkah kaki, gelembung teks, tatapan pemain.
system.runInterval(guard(TAG, "denyut cepat", () => {
  const companions = allCompanions(FAMILY).filter(alive);
  const byId = new Map(companions.map((c) => [c.id, c]));
  tickHolds(byId);
  tickBubbles(byId);
  tickTaming(byId, world.getAllPlayers(), onTamed);
  if (LOOK.enabled) tickLook(companions);
  for (const entity of companions) {
    if (isHeld(entity)) continue;
    tickSteer(entity);
  }
}), TICKS.fast);

// DENYUT KERJA (10 tick): otak tiap companion.
system.runInterval(guard(TAG, "denyut kerja", () => {
  for (const entity of allCompanions(FAMILY)) {
    if (!alive(entity)) continue;
    try {
      workOnce(entity);
    } catch (err) {
      logError(TAG, `Error saat workOnce pada ${entStr(entity)}`, err);
    }
  }
}), TICKS.brain);

function workOnce(entity) {
  const mode = getMode(entity);
  const meta = info(entity);
  const owner = resolveOwner(entity);
  const state = readState(entity);

  // Hold karena istirahat/tidur sengaja TIDAK menghentikan workOnce: kalau
  // begitu, tickEnergy (yang justru memulihkan tenaga dan memutuskan kapan
  // bangun) tidak akan pernah terpanggil lagi.
  //
  // "dig" ikut dikecualikan sejak blok butuh waktu untuk dibongkar (dig.js):
  // kemajuan ayunan dihitung DI DALAM denyut kerja, jadi menghentikan denyut
  // kerja selama menahan pose menambang berarti tidak ada satu blok pun yang
  // pernah patah — companion mengayun selamanya di depan blok yang sama.
  const heldReason = reasonFor(entity);
  if (isHeld(entity) && !WORK_HOLDS.has(heldReason)) {
    logDebug(TAG, `workOnce: ${entStr(entity)} sedang ditahan (${heldReason}); kerja dilewati.`);
    return;
  }

  if (!getOwnerId(entity)) {
    logDebug(TAG, `workOnce: ${entStr(entity)} masih liar; belum bekerja.`);
    return;
  }

  if (tickEnergy(entity, state, mode)) {
    writeState(entity, state);
    setActivity(entity, isSleeping(state) ? "tidur memulihkan kantuk" : "beristirahat memulihkan tenaga");
    return;
  }

  logDebug(TAG, `workOnce: menjalankan mode "${mode}" untuk ${entStr(entity)}`);
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
  chatterAt.set(entity.id, system.currentTick + Math.floor(Math.random() * 200));
  if (Math.random() > CHATTER_CHANCE) return;
  const key = CHATTER_KEY[mode] ?? "idle";
  logDebug(TAG, `Celoteh acak untuk ${entStr(entity)} (kunci: ${key})`);
  sayFrom(entity, key);
}

// DENYUT LAMBAT (leash): HANYA mode "Ikuti Aku" yang boleh ditarik ke pemilik.
// Mode kerja lainnya harus tetap di chunk tempat mereka bekerja — ditarik
// terus-terusan justru membuat mereka tidak pernah menyelesaikan pekerjaan.
system.runInterval(guard(TAG, "denyut leash", () => {
  for (const entity of allCompanions(FAMILY)) {
    if (!alive(entity)) continue;
    const mode = getMode(entity);
    if (mode !== "follow") {
      logDebug(TAG, `Leash dilewati untuk ${entStr(entity)}: mode "${mode}" bekerja di tempatnya sendiri.`);
      continue;
    }
    const owner = resolveOwner(entity);
    if (!owner) continue;
    const sameDimension = owner.dimension.id === entity.dimension.id;
    if (sameDimension && dist2(entity.location, owner.location) < TICKS.teleportAt ** 2) continue;
    logInfo(TAG, `Menarik ${entStr(entity)} ke pemiliknya ${owner.name} (mode ikuti).`);
    try {
      const angle = Math.random() * Math.PI * 2;
      entity.teleport({
        x: owner.location.x + Math.cos(angle) * 1.5,
        y: owner.location.y,
        z: owner.location.z + Math.sin(angle) * 1.5,
      }, { dimension: owner.dimension });
    } catch (e) {
      logWarn(TAG, `Gagal teleportasi leash pada ${entStr(entity)}`, e);
    }
  }
}), TICKS.leash);

system.runInterval(guard(TAG, "denyut patok", () => tickBeams()), 20);

system.runInterval(guard(TAG, "denyut sosial", () => {
  const companions = allCompanions(FAMILY).filter(alive);
  if (companions.length < 2) return;
  tickSocial(companions);
}), TICKS.social);

// Sapaan pagi dan malam, supaya dunia tidak terasa sunyi.
system.runInterval(guard(TAG, "denyut pagi/malam", () => {
  const night = isNight();
  const now = system.currentTick;
  if (night === lastNight || now - lastDaypartAt < DAYPART_EVERY) {
    lastNight = night;
    return;
  }
  lastNight = night;
  lastDaypartAt = now;
  const companions = allCompanions(FAMILY).filter(alive).filter((c) => getOwnerId(c));
  if (!companions.length) return;
  const speaker = companions[Math.floor(Math.random() * companions.length)];
  logInfo(TAG, `Pergantian waktu: sekarang ${night ? "malam" : "siang"}. ${entStr(speaker)} bersuara.`);
  sayFrom(speaker, night ? "night" : "morning", { toOwnerAlways: true });
}), 200);

system.run(guard(TAG, "siap", () => {
  const beta = betaSummary();
  logInfo(TAG, `[VBS Companions] Sistem siap. Mode tersedia: ${Object.keys(MODES).join(", ")}.`);
  logInfo(TAG, `[VBS Companions] Beta API: ${beta.beta ? "aktif" : "tidak aktif"}` +
    (beta.commands.length ? `, perintah: ${beta.commands.join(" ")}` : "") + ".");
}));
