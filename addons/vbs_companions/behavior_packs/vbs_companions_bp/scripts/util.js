/** Pembantu kecil yang dipakai UI, otak companion, dan mode bertani. */

import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";

import { ARMOR_POINTS, COMPANIONS, DEFAULT_MODE, MODES, PROP } from "./config.js";

export const SLOT_KEYS = ["head", "chest", "legs", "feet", "mainhand"];

const SLOT_ENUM = {
  head: EquipmentSlot.Head,
  chest: EquipmentSlot.Chest,
  legs: EquipmentSlot.Legs,
  feet: EquipmentSlot.Feet,
  mainhand: EquipmentSlot.Mainhand,
};

const SLOT_COMMAND = {
  head: "slot.armor.head",
  chest: "slot.armor.chest",
  legs: "slot.armor.legs",
  feet: "slot.armor.feet",
  mainhand: "slot.weapon.mainhand",
};

export const SLOT_LABEL = {
  head: "Helm",
  chest: "Baju zirah",
  legs: "Celana zirah",
  feet: "Sepatu zirah",
  mainhand: "Senjata",
};

export function info(entity) {
  return COMPANIONS[entity?.typeId];
}

export function isCompanion(entity) {
  return Boolean(info(entity));
}

export function prettyItem(id) {
  if (!id) return "kosong";
  return id.replace("minecraft:", "").replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- kepemilikan -----------------------------------------------------------

export function getOwnerId(entity) {
  const v = entity.getDynamicProperty(PROP.owner);
  return typeof v === "string" ? v : undefined;
}

export function getOwnerName(entity) {
  const v = entity.getDynamicProperty(PROP.ownerName);
  return typeof v === "string" ? v : "belum ada";
}

export function setOwner(entity, player) {
  entity.setDynamicProperty(PROP.owner, player.id);
  entity.setDynamicProperty(PROP.ownerName, player.name);
}

export function resolveOwner(entity) {
  const id = getOwnerId(entity);
  if (!id) return undefined;
  return world.getAllPlayers().find((p) => p.id === id);
}

// --- mode ------------------------------------------------------------------

export function getMode(entity) {
  const v = entity.getDynamicProperty(PROP.mode);
  return typeof v === "string" && MODES[v] ? v : DEFAULT_MODE;
}

export function setMode(entity, mode) {
  if (!MODES[mode]) return false;
  entity.setDynamicProperty(PROP.mode, mode);
  try {
    entity.triggerEvent(MODES[mode].event);
  } catch {
    return false;                    // entity keburu hilang; mode tetap tersimpan
  }
  return true;
}

// --- nyawa dan armor -------------------------------------------------------

export function healthOf(entity) {
  const hp = entity.getComponent("minecraft:health");
  if (!hp) return { cur: 0, max: 0 };
  return {
    cur: Math.max(0, Math.round(hp.currentValue)),
    max: Math.round(hp.effectiveMax ?? hp.defaultValue ?? hp.currentValue),
  };
}

export function bar(cur, max, width = 20) {
  const filled = max > 0 ? Math.max(0, Math.min(width, Math.round((cur / max) * width))) : 0;
  return `§c${"|".repeat(filled)}§8${"|".repeat(width - filled)}`;
}

function equippable(entity) {
  try {
    return entity.getComponent("minecraft:equippable");
  } catch {
    return undefined;
  }
}

/** Isi tiap slot, sebagai typeId. Pakai komponen kalau ada, catatan sendiri kalau tidak. */
export function getGear(entity) {
  const eq = equippable(entity);
  if (eq) {
    const out = {};
    for (const key of SLOT_KEYS) {
      try {
        out[key] = eq.getEquipment(SLOT_ENUM[key])?.typeId;
      } catch {
        /* slot tidak tersedia di versi ini */
      }
    }
    return out;
  }
  try {
    return JSON.parse(entity.getDynamicProperty(PROP.gear) ?? "{}");
  } catch {
    return {};
  }
}

function rememberGear(entity, key, typeId) {
  const gear = (() => {
    try {
      return JSON.parse(entity.getDynamicProperty(PROP.gear) ?? "{}");
    } catch {
      return {};
    }
  })();
  if (typeId) gear[key] = typeId;
  else delete gear[key];
  entity.setDynamicProperty(PROP.gear, JSON.stringify(gear));
}

/** Pasang atau lepas satu slot. `item` undefined artinya dikosongkan. */
export function setGear(entity, key, item) {
  const eq = equippable(entity);
  let done = false;
  if (eq) {
    try {
      done = eq.setEquipment(SLOT_ENUM[key], item) !== false;
    } catch {
      done = false;
    }
  }
  if (!done) {
    try {
      const what = item ? `${item.typeId} 1` : "air 1";
      entity.runCommand(`replaceitem entity @s ${SLOT_COMMAND[key]} 0 ${what}`);
      done = true;
    } catch {
      done = false;
    }
  }
  if (done) rememberGear(entity, key, item?.typeId);
  return done;
}

/** Slot yang cocok untuk sebuah item, atau undefined kalau tidak bisa dipakai. */
export function slotFor(typeId) {
  const short = typeId.replace("minecraft:", "");
  if (short === "turtle_helmet") return "head";
  if (short.endsWith("_helmet")) return "head";
  if (short.endsWith("_chestplate")) return "chest";
  if (short.endsWith("_leggings")) return "legs";
  if (short.endsWith("_boots")) return "feet";
  if (short.endsWith("_sword") || short.endsWith("_axe") || short === "trident") return "mainhand";
  return undefined;
}

/** Total titik armor + nama bahannya, untuk baris "Armor" di UI. */
export function armorSummary(gear) {
  const order = ["head", "chest", "legs", "feet"];
  let points = 0;
  const worn = new Set();
  order.forEach((key, i) => {
    const id = gear[key];
    if (!id) return;
    const short = id.replace("minecraft:", "");
    if (short === "turtle_helmet") {
      points += 2;
      worn.add("Turtle");
      return;
    }
    const material = short.split("_")[0];
    const row = ARMOR_POINTS[material];
    if (row) {
      points += row[i];
      worn.add(material.charAt(0).toUpperCase() + material.slice(1));
    }
  });
  return { points, label: worn.size ? [...worn].join(" + ") : "tanpa zirah" };
}

// --- pembantu lain ---------------------------------------------------------

export function waitTicks(ticks) {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

/**
 * Tampilkan form, tunggu sebentar kalau layar pemain sedang dipakai.
 * Tanpa ini, membuka menu tepat saat pemain menutup layar lain akan gagal diam-diam.
 */
export async function forceShow(player, form, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await waitTicks(2);
  }
  return undefined;
}

export function give(player, itemStack) {
  const inv = player.getComponent("minecraft:inventory");
  const left = inv?.container?.addItem(itemStack);
  if (left) {
    player.dimension.spawnItem(left, player.location);
  }
}

export function makeItem(id, amount = 1) {
  try {
    return new ItemStack(id, amount);
  } catch {
    return undefined;
  }
}
