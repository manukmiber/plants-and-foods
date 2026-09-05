/**
 * Titik masuk add-on VBS Companions.
 *
 * Berkas ini sengaja tidak berisi logika kerja satu pun. Isinya hanya denyut dan
 * penyaluran: siapa dipanggil kapan, dan apa yang harus dibereskan waktu
 * companion muncul, dimuat ulang, atau hilang. Semua yang "melakukan sesuatu"
 * ada di modulnya masing-masing.
 *
 * Ada tiga denyut, dan pembagiannya penting untuk server:
 *
 *   CEPAT (4 tick)  — hal yang harus terasa langsung: tatapan pemain, gelembung
 *                     teks, dan melepaskan companion yang tahanannya habis.
 *   KERJA (10 tick) — satu langkah pekerjaan tiap companion, apa pun modenya.
 *   LAMBAT          — tali penarik ke pemilik, pancaran patok, obrolan antar
 *                     companion, dan celoteh sesekali.
 *
 * Yang berat (memindai ladang, menggali, membangun) semuanya di denyut KERJA dan
 * masing-masing punya anggaran per denyut, jadi jumlah companion menentukan
 * beban secara linier, bukan meledak.
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

const hintCooldown = new Map();
const chatterAt = new Map();
const CHATTER_EVERY = 1400;

/** Baris celoteh yang cocok dengan mode yang sedang dijalankan. */
const CHATTER_KEY = {
  farm: "farm", mine: "mine", wander: "wander", build: "build", attack: "attack",
};

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

/** Companion baru muncul: cari pemiliknya, beri penanda, nyalakan mode awal. */
function bootstrap(entity, claimant) {
  if (!alive(entity) || !isCompanion(entity)) return;
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
  syncWeapon(entity);
  refreshName(entity);
}

function forgetAll(id) {
  forgetActivity(id);
  forgetBubble(id);
  forgetCombat(id);
  forgetHold(id);
  forgetLook(id);
  forgetSocial(id);
  stopWalking(id);
  chatterAt.delete(id);
}

// --- kejadian --------------------------------------------------------------

world.afterEvents.entitySpawn.subscribe((ev) => {
  if (!isCompanion(ev.entity)) return;
  system.run(() => bootstrap(ev.entity));
});

world.afterEvents.entityLoad.subscribe((ev) => {
  if (!isCompanion(ev.entity)) return;
  system.run(() => {
    if (!alive(ev.entity)) return;
    applyMode(ev.entity, getMode(ev.entity));    // samakan lagi component group
    syncWeapon(ev.entity);
    refreshName(ev.entity);
  });
});

try {
  world.afterEvents.entityRemove.subscribe((ev) => forgetAll(ev.removedEntityId));
} catch {
  /* tidak ada di versi ini; peta catatannya cuma tumbuh pelan */
}

world.afterEvents.entityDie.subscribe((ev) => {
  if (!isCompanion(ev.deadEntity)) return;
  forgetAll(ev.deadEntity.id);
});

world.afterEvents.entityHurt.subscribe((ev) => {
  const entity = ev.hurtEntity;
  if (!isCompanion(entity) || !alive(entity)) return;
  if (Math.random() < 0.35) sayFrom(entity, "hurt");
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
    if (!alive(target)) return;
    if (!getOwnerId(target)) bootstrap(target, player);
    await openMenu(player, target);
  });
});

world.afterEvents.playerLeave.subscribe((ev) => hintCooldown.delete(ev.playerId));

wireStake();

// --- denyut cepat: tatapan, gelembung, pelepasan tahanan --------------------

system.runInterval(() => {
  const companions = allCompanions(FAMILY).filter(alive);
  const byId = new Map(companions.map((c) => [c.id, c]));
  tickHolds(byId);
  tickBubbles(byId);
  if (LOOK.enabled) tickLook(companions);
  // Langkah jalan diteruskan di sini, bukan di denyut kerja: yang sedang ditahan
  // benar-benar berhenti, yang sedang menuju sesuatu berjalan dengan kecepatan
  // yang wajar.
  for (const entity of companions) {
    if (isHeld(entity)) continue;
    tickSteer(entity);
  }
}, TICKS.fast);

// --- denyut kerja: satu langkah pekerjaan tiap companion --------------------

system.runInterval(() => {
  for (const entity of allCompanions(FAMILY)) {
    if (!alive(entity)) continue;
    try {
      workOnce(entity);
    } catch (err) {
      // Satu companion yang bermasalah tidak boleh mematikan denyut untuk yang
      // lain — itulah gunanya try/catch per companion, bukan per denyut.
      console.warn(`[VBS] ${entity.typeId}: ${err}`);
    }
  }
}, TICKS.brain);

function workOnce(entity) {
  const mode = getMode(entity);
  const meta = info(entity);
  const owner = resolveOwner(entity);
  const state = readState(entity);

  // Ditahan (disapa pemain, sedang mengobrol): benar-benar tidak mengerjakan
  // apa pun. Ini yang bikin "dilihat berarti berhenti" berlaku untuk semua mode.
  if (isHeld(entity)) return;

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

/** Sesekali berkomentar tentang apa yang sedang dikerjakan. */
function chatter(entity, mode) {
  if (readState(entity).quiet) return;
  const last = chatterAt.get(entity.id) ?? -CHATTER_EVERY;
  if (system.currentTick - last < CHATTER_EVERY) return;
  chatterAt.set(entity.id, system.currentTick + Math.floor(Math.random() * 400));
  if (Math.random() > 0.5) return;
  sayFrom(entity, CHATTER_KEY[mode] ?? "idle");
}

// --- denyut lambat ---------------------------------------------------------

// Tali tak kelihatan: kalau ketinggalan jauh atau beda dimensi, ditarik pulang.
// Mode mengembara dan menambang sengaja dikecualikan — tugas keduanya memang
// menjauh, dan yang menariknya pulang adalah modul modenya sendiri.
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

// Pancaran patok ladang.
system.runInterval(() => {
  try {
    tickBeams();
  } catch {
    /* tidak ada patok, atau dunianya belum siap */
  }
}, 20);

// Obrolan antar companion.
system.runInterval(() => {
  const companions = allCompanions(FAMILY).filter(alive);
  if (companions.length < 2) return;
  try {
    tickSocial(companions);
  } catch (err) {
    console.warn(`[VBS] obrolan: ${err}`);
  }
}, TICKS.social);

system.run(() => {
  console.log(`[VBS Companions] siap — ${Object.keys(MODES).length} mode, ` +
              `keluarga entity "${FAMILY}", gelembung ${CHAT.bubbleRadius} blok`);
});
