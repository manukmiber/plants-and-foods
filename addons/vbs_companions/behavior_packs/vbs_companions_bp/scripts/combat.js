/**
 * Mode bertarung.
 */

import { system } from "@minecraft/server";
import { POSE } from "./config.js";
import { alive, dist2, getGear, setPose } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "COMBAT";
const RANGED = new Set(["minecraft:bow", "minecraft:crossbow"]);
const SIGHT = 18;

const weaponOf = new Map();     // entityId -> "melee" | "bow"
const watch = new Map();        // entityId -> { targetId, health, since }

export function syncWeapon(entity) {
  if (!alive(entity)) return;
  const held = getGear(entity).mainhand;
  const want = held && RANGED.has(held) ? "bow" : "melee";
  const current = weaponOf.get(entity.id);
  if (current === want) return;

  logInfo(TAG, `Sinkronisasi senjata ${entStr(entity)}: held="${held ?? "empty"}" -> mode=${want} (sebelumnya: ${current ?? "none"})`);
  try {
    entity.triggerEvent(want === "bow" ? "vbs:use_bow" : "vbs:use_melee");
    weaponOf.set(entity.id, want);
    logDebug(TAG, `Event senjata berhasil dipicu untuk ${entStr(entity)}`);
  } catch (e) {
    logWarn(TAG, `Gagal sinkronisasi senjata pada ${entStr(entity)}`, e);
  }
}

export function weaponKind(entity) {
  return weaponOf.get(entity?.id) ?? "melee";
}

function hostilesNear(entity, radius) {
  try {
    const list = entity.dimension.getEntities({
      location: entity.location,
      maxDistance: radius,
      families: ["monster"],
    }).filter((m) => alive(m) && m.id !== entity.id);
    logDebug(TAG, `hostilesNear untuk ${entStr(entity)} (r=${radius}): ditemukan ${list.length} monster.`);
    return list;
  } catch (e) {
    logWarn(TAG, `Gagal mencari hostilesNear untuk ${entStr(entity)}`, e);
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

function backupSwing(entity, target, damage) {
  const now = system.currentTick;
  const hp = healthOfEntity(target);
  const row = watch.get(entity.id);

  if (!row || row.targetId !== target.id) {
    logDebug(TAG, `Memulai pengawasan target serang cadangan: ${entStr(target)} (HP: ${hp}) oleh ${entStr(entity)}`);
    watch.set(entity.id, { targetId: target.id, health: hp, since: now });
    return;
  }
  if (hp < row.health - 0.01) {
    logDebug(TAG, `Damage masuk ke target ${entStr(target)} (HP lama: ${row.health}, baru: ${hp}). Ayunan normal berhasil.`);
    row.health = hp;
    row.since = now;
    return;
  }
  const idleTicks = now - row.since;
  if (idleTicks < 60) {
    logDebug(TAG, `Menunggu ayunan bawaan... ${idleTicks}/60 ticks`);
    return;
  }
  try {
    const dmg = Math.max(1, Math.round(damage));
    logWarn(TAG, `Jaring pengaman aktif! Memaksa applyDamage(${dmg}) dari ${entStr(entity)} ke ${entStr(target)}`);
    target.applyDamage(dmg, {
      cause: "entityAttack", damagingEntity: entity,
    });
    row.health = healthOfEntity(target);
    row.since = now;
  } catch (e) {
    logWarn(TAG, `Gagal applyDamage cadangan ke target ${entStr(target)}`, e);
  }
}

export function tickCombat(entity, damage) {
  logDebug(TAG, `tickCombat dijalankan untuk ${entStr(entity)} dengan base damage=${damage}`);
  syncWeapon(entity);
  const bow = weaponKind(entity) === "bow";
  const near = hostilesNear(entity, SIGHT);

  if (!near.length) {
    logDebug(TAG, `Tidak ada musuh di dekat ${entStr(entity)}. Pose normal.`);
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

  const targetDist = Math.sqrt(best).toFixed(1);
  logDebug(TAG, `Musuh terdekat: ${entStr(closest)} jarak: ${targetDist}m. Senjata: ${bow ? "Busur" : "Melee"}`);

  setPose(entity, bow ? POSE.aim : POSE.guard);
  if (!bow && best <= 2.6 ** 2) {
    logDebug(TAG, `Musuh menempel (${targetDist}m). Menjalankan backupSwing...`);
    backupSwing(entity, closest, damage * 0.6);
  } else {
    watch.delete(entity.id);
  }
  return near.length;
}

export function threatened(entity, radius = 10) {
  const count = hostilesNear(entity, radius).length;
  logDebug(TAG, `threatened dicek untuk ${entStr(entity)} (r=${radius}): ${count > 0} (${count} monster)`);
  return count > 0;
}

export function forget(id) {
  logInfo(TAG, `Membersihkan data combat untuk ID: ${id}`);
  weaponOf.delete(id);
  watch.delete(id);
}