/**
 * Semua layar yang dilihat pemain.
 *
 * Menu utama sengaja menaruh Nyawa, Armor dan Mode di badan form, bukan di tombol,
 * supaya sekali buka langsung kelihatan keadaan companion sebelum memilih perintah.
 */

import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";

import { FOOD_HEAL, MODES } from "./config.js";
import {
  armorSummary, bar, forceShow, getGear, getMode, getOwnerName, healthOf, info,
  makeItem, prettyItem, setGear, setMode, setOwner, SLOT_KEYS, SLOT_LABEL, slotFor,
} from "./util.js";

const MODE_KEYS = Object.keys(MODES);

function title(entity) {
  const meta = info(entity);
  return `§l${meta.color}${meta.name}`;
}

function statusBody(entity) {
  const meta = info(entity);
  const { cur, max } = healthOf(entity);
  const gear = getGear(entity);
  const armor = armorSummary(gear);
  const mode = MODES[getMode(entity)];
  return [
    `§7Pemilik   §f${getOwnerName(entity)}`,
    `§7Mode      §f${mode.label}  §8${mode.hint}`,
    "",
    `§cNyawa     §f${cur}§7/§f${max}`,
    bar(cur, max),
    `§9Armor     §f${armor.points} §7(${armor.label})`,
    `§7Senjata   §f${prettyItem(gear.mainhand)}`,
    "",
    `§8${meta.name} akan menuruti perintah yang kamu pilih di bawah.`,
  ].join("\n");
}

/** Menu utama: keadaan companion + empat perintah. */
export async function openMenu(player, entity) {
  if (!entity.isValid) return;
  const current = getMode(entity);
  const form = new ActionFormData()
    .title(title(entity))
    .body(statusBody(entity));

  for (const key of MODE_KEYS) {
    const m = MODES[key];
    const mark = key === current ? " §8(sekarang)" : "";
    form.button(`${m.button}${mark}\n§8${m.hint}`, m.icon);
  }
  form.button("§bPerlengkapan & Lainnya\n§8Zirah, senjata, makan, nama", "textures/items/name_tag");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;

  if (res.selection < MODE_KEYS.length) {
    const key = MODE_KEYS[res.selection];
    applyMode(player, entity, key);
    return;
  }
  await openGear(player, entity);
}

export function applyMode(player, entity, key) {
  const meta = info(entity);
  if (setMode(entity, key)) {
    refreshName(entity);
    player.sendMessage(`${meta.color}${meta.name} §7» §f${MODES[key].label}`);
    player.playSound("random.orb", { location: player.location });
  } else {
    player.sendMessage("§cGagal mengganti mode.");
  }
}

/** Nama melayang: nama karakter + mode yang sedang dijalankan. */
export function refreshName(entity) {
  const meta = info(entity);
  if (!meta) return;
  const mode = MODES[getMode(entity)];
  entity.nameTag = `${meta.color}${meta.name}§r §8${mode.label}`;
}

/** Layar kedua: perlengkapan dan tindakan lain. */
async function openGear(player, entity) {
  const gear = getGear(entity);
  const worn = SLOT_KEYS.map((k) => `§7${SLOT_LABEL[k]}: §f${prettyItem(gear[k])}`).join("\n");
  const held = player.getComponent("minecraft:equippable")
    ?.getEquipment("Mainhand")?.typeId;

  const form = new ActionFormData()
    .title(title(entity))
    .body(`${worn}\n\n§7Item di tanganmu: §f${prettyItem(held)}`)
    .button("§aPakaikan Item di Tangan\n§8Zirah atau senjata", "textures/items/iron_chestplate")
    .button("§eBeri Makan\n§8Pulihkan nyawa dengan makanan di tangan", "textures/items/bread")
    .button("§6Lepas Semua Perlengkapan\n§8Dikembalikan ke kantongmu", "textures/items/leather")
    .button("§bGanti Nama", "textures/items/name_tag")
    .button("§dPanggil ke Sini\n§8Tarik dia ke tempatmu berdiri", "textures/items/ender_pearl")
    .button("§cIstirahatkan\n§8Companion dihilangkan dari dunia", "textures/items/barrier")
    .button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;

  switch (res.selection) {
    case 0: equipHeld(player, entity); break;
    case 1: feed(player, entity); break;
    case 2: stripGear(player, entity); break;
    case 3: await rename(player, entity); break;
    case 4: recall(player, entity); break;
    case 5: await dismiss(player, entity); break;
    default: await openMenu(player, entity); return;
  }
}

function heldStack(player) {
  const eq = player.getComponent("minecraft:equippable");
  try {
    return eq?.getEquipment("Mainhand");
  } catch {
    return undefined;
  }
}

function consumeHeld(player) {
  const eq = player.getComponent("minecraft:equippable");
  const stack = heldStack(player);
  if (!stack) return undefined;
  const one = makeItem(stack.typeId, 1);
  if (stack.amount > 1) {
    stack.amount -= 1;
    eq.setEquipment("Mainhand", stack);
  } else {
    eq.setEquipment("Mainhand", undefined);
  }
  return one;
}

function equipHeld(player, entity) {
  const stack = heldStack(player);
  if (!stack) {
    player.sendMessage("§cTanganmu kosong.");
    return;
  }
  const slot = slotFor(stack.typeId);
  if (!slot) {
    player.sendMessage("§cItu bukan zirah atau senjata yang bisa dipakai.");
    return;
  }
  const old = getGear(entity)[slot];
  const item = consumeHeld(player);
  if (!setGear(entity, slot, item)) {
    player.sendMessage("§cGagal memasangkan item.");
    return;
  }
  if (old) {
    const back = makeItem(old, 1);
    if (back) player.dimension.spawnItem(back, player.location);
  }
  player.sendMessage(`§a${SLOT_LABEL[slot]} dipasang: §f${prettyItem(item.typeId)}`);
  player.playSound("armor.equip_generic", { location: player.location });
}

function stripGear(player, entity) {
  const gear = getGear(entity);
  let n = 0;
  for (const key of SLOT_KEYS) {
    if (!gear[key]) continue;
    if (setGear(entity, key, undefined)) {
      const back = makeItem(gear[key], 1);
      if (back) player.dimension.spawnItem(back, player.location);
      n++;
    }
  }
  player.sendMessage(n ? `§a${n} perlengkapan dikembalikan.` : "§7Tidak ada yang dipakai.");
}

function feed(player, entity) {
  const stack = heldStack(player);
  const heal = stack ? FOOD_HEAL[stack.typeId] : undefined;
  if (!heal) {
    player.sendMessage("§cPegang makanan dulu (roti, apel, daging matang, kue...).");
    return;
  }
  const hp = entity.getComponent("minecraft:health");
  const { cur, max } = healthOf(entity);
  if (cur >= max) {
    player.sendMessage("§7Nyawanya sudah penuh.");
    return;
  }
  consumeHeld(player);
  hp.setCurrentValue(Math.min(max, cur + heal));
  entity.dimension.spawnParticle?.("minecraft:heart_particle", {
    x: entity.location.x, y: entity.location.y + 2.1, z: entity.location.z,
  });
  player.playSound("random.eat", { location: player.location });
  player.sendMessage(`§a+${heal} nyawa.`);
}

async function rename(player, entity) {
  const form = new ModalFormData()
    .title(title(entity))
    .textField("Nama panggilan baru", "kosongkan untuk memakai nama asli");
  const res = await forceShow(player, form);
  if (!res || res.canceled) return;
  const value = (res.formValues?.[0] ?? "").toString().trim().slice(0, 24);
  const meta = info(entity);
  if (!value) {
    refreshName(entity);
    player.sendMessage(`§7Nama dikembalikan ke §f${meta.name}§7.`);
    return;
  }
  entity.nameTag = `${meta.color}${value}`;
  player.sendMessage(`§aSekarang dipanggil §f${value}§a.`);
}

function recall(player, entity) {
  const at = player.location;
  entity.teleport({ x: at.x, y: at.y, z: at.z }, { dimension: player.dimension });
  player.playSound("mob.endermen.portal", { location: player.location });
  player.sendMessage("§dDitarik ke tempatmu.");
}

async function dismiss(player, entity) {
  const meta = info(entity);
  const confirm = new MessageFormData()
    .title("§cIstirahatkan?")
    .body(`§7${meta.name} akan dihilangkan dari dunia. Perlengkapan yang dipakainya ` +
          "dikembalikan ke kantongmu.\n\n§8Kamu bisa memanggilnya lagi dengan spawn egg.")
    .button1("§cYa, istirahatkan")
    .button2("§7Batal");
  const res = await forceShow(player, confirm);
  if (!res || res.canceled || res.selection !== 0) return;
  stripGear(player, entity);
  entity.dimension.spawnParticle?.("minecraft:large_explosion", entity.location);
  entity.remove();
  player.sendMessage(`§7${meta.name} beristirahat.`);
}
