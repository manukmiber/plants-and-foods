/**
 * Mode bertarung.
 *
 * Sebagian besar pekerjaannya sudah pindah ke behavior pack — pemilih sasaran,
 * pengejaran, dan ayunan senjata semuanya goal bawaan gim, dan yang dulu bikin
 * mode ini diam saja adalah tiga goal yang memakai priority sama plus komponen
 * minecraft:angry yang menahan pemilihan sasaran. Keduanya sudah diperbaiki di
 * gen_packs.py.
 *
 * Yang tersisa di sini tiga hal yang memang hanya bisa dikerjakan script:
 *
 *   1. Memilih grup senjata dari isi tangan companion — pedang/kapak memasang
 *      behavior.melee_attack, busur memasang minecraft:shooter dan
 *      behavior.ranged_attack.
 *   2. Menyalakan pose kuda-kuda atau pose membidik, karena pose sekarang
 *      dikendalikan entity property, bukan query.is_angry.
 *   3. Jaring pengaman: kalau ada monster menempel selama tiga detik dan
 *      nyawanya sama sekali tidak berkurang, berarti goal bawaan tidak menggigit
 *      di versi gim ini — script yang memukul. Sengaja seketat itu supaya dalam
 *      keadaan normal jaring ini tidak pernah aktif dan damage tidak dobel.
 */

import { system } from "@minecraft/server";

import { POSE } from "./config.js";
import { alive, dist2, getGear, setPose } from "./util.js";

const RANGED = new Set(["minecraft:bow", "minecraft:crossbow"]);
const SIGHT = 18;

const weaponOf = new Map();     // entityId -> "melee" | "bow"
const watch = new Map();        // entityId -> { targetId, health, since }

/** Pasang grup senjata yang cocok dengan isi tangan. */
export function syncWeapon(entity) {
  if (!alive(entity)) return;
  const held = getGear(entity).mainhand;
  const want = held && RANGED.has(held) ? "bow" : "melee";
  if (weaponOf.get(entity.id) === want) return;
  try {
    entity.triggerEvent(want === "bow" ? "vbs:use_bow" : "vbs:use_melee");
    weaponOf.set(entity.id, want);
  } catch {
    /* entity keburu hilang */
  }
}

export function weaponKind(entity) {
  return weaponOf.get(entity?.id) ?? "melee";
}

function hostilesNear(entity, radius) {
  try {
    return entity.dimension.getEntities({
      location: entity.location,
      maxDistance: radius,
      families: ["monster"],
    }).filter((m) => alive(m) && m.id !== entity.id);
  } catch {
    return [];
  }
}

function healthOfEntity(target) {
  try {
    return target.getComponent("minecraft:health")?.currentValue ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Jaring pengaman. Hanya menyala kalau satu monster benar-benar menempel dan
 * nyawanya tidak bergerak sama sekali selama tiga detik — artinya ayunan bawaan
 * gim tidak sampai. Begitu ada satu pukulan yang masuk, catatannya di-reset dan
 * jaring ini diam lagi.
 */
function backupSwing(entity, target, damage) {
  const now = system.currentTick;
  const hp = healthOfEntity(target);
  const row = watch.get(entity.id);
  if (!row || row.targetId !== target.id) {
    watch.set(entity.id, { targetId: target.id, health: hp, since: now });
    return;
  }
  if (hp < row.health - 0.01) {                   // ada damage masuk: aman
    row.health = hp;
    row.since = now;
    return;
  }
  if (now - row.since < 60) return;               // belum tiga detik
  try {
    target.applyDamage(Math.max(1, Math.round(damage)), {
      cause: "entityAttack", damagingEntity: entity,
    });
    row.health = healthOfEntity(target);
    row.since = now;
  } catch {
    /* target keburu mati */
  }
}

/** Satu denyut mode bertarung untuk satu companion. */
export function tickCombat(entity, damage) {
  syncWeapon(entity);
  const bow = weaponKind(entity) === "bow";
  const near = hostilesNear(entity, SIGHT);
  if (!near.length) {
    setPose(entity, POSE.normal);
    watch.delete(entity.id);
    return 0;
  }

  let closest = near[0];
  let best = dist2(entity.location, closest.location);
  for (const m of near) {
    const d = dist2(entity.location, m.location);
    if (d < best) {
      best = d;
      closest = m;
    }
  }

  setPose(entity, bow ? POSE.aim : POSE.guard);
  if (!bow && best <= 2.6 ** 2) backupSwing(entity, closest, damage * 0.6);
  else watch.delete(entity.id);
  return near.length;
}

/** Ada monster di dekat sini? Dipakai mode lain untuk tahu kapan harus waspada. */
export function threatened(entity, radius = 10) {
  return hostilesNear(entity, radius).length > 0;
}

export function forget(id) {
  weaponOf.delete(id);
  watch.delete(id);
}
