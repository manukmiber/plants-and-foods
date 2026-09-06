/**
 * Semua layar yang dilihat pemain.
 */

import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { ENERGY, FAMILY, FOOD_HEAL, MODES, SLEEP } from "./config.js";
import { getActivity } from "./activity.js";
import { BLUEPRINTS, startBlueprint } from "./builder.js";
import { claimsNear, ensureStake, ensureVillageStake } from "./claim.js";
import { syncWeapon } from "./combat.js";
import { bestTier, tierName, toolRank } from "./crafting.js";
import { energyOf, isResting, isSleeping, needsLabel, sleepOf } from "./energy.js";
import { farmPhaseLabel, setExpand } from "./farming.js";
import { displayName, refreshName } from "./nametag.js";
import { requestLines } from "./requests.js";
import { patchState, readSettings, readState, writeSettings } from "./state.js";
import { stationContainer } from "./station.js";
import { waypointLines } from "./wander.js";
import {
  alive, allCompanions, armorSummary, bar, forceShow, getGear, getMode,
  getOwnerName, healthOf, info, makeItem, prettyItem, setGear, setMode,
  SLOT_KEYS, SLOT_LABEL, slotFor,
} from "./util.js";
import {
  entStr, isWatching, logDebug, logInfo, logStats, logWarn,
  recentLogs, watchLogs,
} from "./logger.js";

const TAG = "UI";
const MODE_KEYS = Object.keys(MODES);

function getOwnerIdOf(entity) {
  try {
    return entity.getDynamicProperty("vbs:owner");
  } catch {
    return undefined;
  }
}

function title(entity) {
  const meta = info(entity);
  return `§l${meta.color}${displayName(entity)}`;
}

function stationLine(entity, state) {
  if (!state.station) return "§7Stasiun   §8belum ada";
  const s = state.station;
  return `§7Stasiun   §f${s.x}, ${s.y}, ${s.z}`;
}

function toolLine(entity, state) {
  const held = getGear(entity).mainhand;
  for (const kind of ["hoe", "pickaxe", "axe"]) {
    const rank = toolRank(held, kind);
    if (rank > 0) return `§7Alat      §f${prettyItem(held)}`;
  }
  const container = stationContainer(entity, state);
  const next = container ? bestTier(container, "hoe") : undefined;
  return next
    ? `§7Alat      §8belum ada §7(bahan ${tierName(next.key)} tersedia)`
    : "§7Alat      §8belum ada";
}

function statusBody(entity) {
  const meta = info(entity);
  const state = readState(entity);
  const { cur, max } = healthOf(entity);
  const gear = getGear(entity);
  const armor = armorSummary(gear);
  const mode = MODES[getMode(entity)];
  const doing = getActivity(entity);
  const energy = Math.round(energyOf(state));
  const sleepy = Math.round(sleepOf(state));
  const hidden = state.hideOwner || readSettings(getOwnerIdOf(entity)).hideOwner;
  const lines = [
    `§7Pemilik   §f${hidden ? "§8disembunyikan" : getOwnerName(entity)}`,
    `§7Tugas     §f${mode.label}  §8${mode.hint}`,
    doing ? `§7Sekarang  §a${doing}` : "§7Sekarang  §8menunggu perintah",
  ];
  if (getMode(entity) === "farm") lines.push(`§7Tahap     §f${farmPhaseLabel(state)}`);
  lines.push(
    "",
    `§cNyawa     §f${cur}§7/§f${max}`,
    bar(cur, max),
    `§eTenaga    §f${energy}§7/§f${ENERGY.max}${isResting(state) ? " §8(beristirahat)" : ""}`,
    bar(energy, ENERGY.max, 20, "§e"),
    `§bKantuk    §f${sleepy}§7/§f${SLEEP.max}${isSleeping(state) ? " §8(tidur)" : ""}`,
    bar(sleepy, SLEEP.max, 20, "§b"),
    `§7Kondisi   §f${needsLabel(state)}`,
    "",
    `§9Armor     §f${armor.points} §7(${armor.label})`,
    `§7Senjata   §f${prettyItem(gear.mainhand)}`,
    toolLine(entity, state),
    stationLine(entity, state),
    "",
    `§8${meta.name} akan menuruti perintah yang kamu pilih di bawah.`,
    "§8Bisa juga diajak bicara: §7chat " + `${displayName(entity)} halo`,
  );
  return lines.join("\n");
}

export async function openMenu(player, entity) {
  logInfo(TAG, `openMenu dibuka untuk ${player.name} pada ${entStr(entity)}`);
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
  form.button("§bPengaturan & Perlengkapan\n§8Zirah, ladang, rancangan, catatan", "textures/items/name_tag");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) {
    logDebug(TAG, `Menu utama dibatalkan oleh ${player.name}`);
    return;
  }

  if (res.selection < MODE_KEYS.length) {
    applyMode(player, entity, MODE_KEYS[res.selection]);
    return;
  }
  await openSettings(player, entity);
}

export function applyMode(player, entity, key) {
  logInfo(TAG, `Pemain ${player.name} mengubah mode ${entStr(entity)} ke: "${key}"`);
  const meta = info(entity);
  if (!setMode(entity, key)) {
    player.sendMessage("§cGagal mengganti mode.");
    return;
  }
  refreshName(entity);
  syncWeapon(entity);
  player.sendMessage(`${meta.color}${displayName(entity)} §7» §f${MODES[key].label}`);
  player.playSound("random.orb", { location: player.location });
  if (key === "farm") ensureStake(player);
}

async function openSettings(player, entity) {
  logInfo(TAG, `openSettings dibuka oleh ${player.name}`);
  const state = readState(entity);
  const global = readSettings(player.id);
  const gear = getGear(entity);
  const worn = SLOT_KEYS.map((k) => `§7${SLOT_LABEL[k]}: §f${prettyItem(gear[k])}`).join("\n");
  const held = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand")?.typeId;

  const form = new ActionFormData()
    .title(title(entity))
    .body(`${worn}\n\n§7Item di tanganmu: §f${prettyItem(held)}`)
    .button("§aPakaikan Item di Tangan\n§8Zirah, senjata, busur atau alat", "textures/items/iron_chestplate")
    .button("§eBeri Makan\n§8Pulihkan nyawa dengan makanan di tangan", "textures/items/bread")
    .button("§6Lepas Semua Perlengkapan\n§8Dikembalikan ke kantongmu", "textures/items/leather")
    .button("§2Ladang & Patok\n§8Batas garapan dan izin melebar", "textures/items/wheat")
    .button("§eRancangan Bangunan\n§8Pilih yang akan dibangun", "textures/items/brick")
    .button("§bCatatan Pengembara\n§8Temuan beserta koordinatnya", "textures/items/map_filled")
    .button(`§7Celoteh: ${state.quiet ? "§cmati" : "§ahidup"}\n§8Gelembung teks dan obrolan`, "textures/items/book_normal")
    .button(`§7Nama pemilik (dia saja): ${state.hideOwner ? "§csembunyi" : "§aterlihat"}\n§8Berlaku untuk companion ini saja`, "textures/items/paper")
    .button(`§7Nama pemilik (SEMUA milikku): ${global.hideOwner ? "§csembunyi" : "§aterlihat"}\n§8Kalau disembunyikan, tidak ada pemain di server yang tahu ini punya siapa`, "textures/items/paper")
    .button("§6Permintaan Bantuan\n§8Siapa sedang menunggu bahan atau alat", "textures/items/emerald")
    .button("§bCatatan Kejadian (Log)\n§8Untuk melacak error dan memperbaikinya", "textures/items/book_writable")
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
    case 3: await openFarm(player, entity); break;
    case 4: await openBlueprints(player, entity); break;
    case 5: await openWaypoints(player, entity); break;
    case 6: toggleQuiet(player, entity); break;
    case 7: toggleHideOwner(player, entity); break;
    case 8: toggleHideOwnerAll(player, entity); break;
    case 9: await openRequests(player, entity); break;
    case 10: await openLogs(player, entity); break;
    case 11: await rename(player, entity); break;
    case 12: recall(player, entity); break;
    case 13: await dismiss(player, entity); break;
    default: await openMenu(player, entity); return;
  }
}

/**
 * Papan permintaan: siapa sedang menunggu bahan atau alat dari siapa. Ini
 * jendela pemain ke rantai kerja pencari barang -> perajin -> pekerja lain.
 */
async function openRequests(player, entity) {
  const form = new ActionFormData()
    .title("§l§6Permintaan Bantuan")
    .body([
      "§7Companion yang kehabisan bahan memasang permintaan di sini.",
      "§7Perajin mengerjakan pesanan alat dan barang, pencari barang",
      "§7mengerjakan pesanan bahan mentah.",
      "",
      ...requestLines(player.id, 10),
      "",
      "§8Kalau ada yang menggantung lama, pastikan ada companion bermode",
      "§8§fMerajin§8 dan §fMencari Barang§8 di dekat mereka.",
    ].join("\n"))
    .button("§8« Kembali");
  await forceShow(player, form);
  await openSettings(player, entity);
}

/**
 * Jendela log di dalam game. Content log Minecraft tidak selalu bisa dibaca
 * pemain (apalagi di HP dan di server), padahal justru di situ error tercatat.
 */
async function openLogs(player, entity) {
  const stats = logStats();
  const watching = isWatching(player.id);
  const form = new ActionFormData()
    .title("§l§bCatatan Kejadian")
    .body([
      `§7Tercatat: §f${stats.INFO} info§7, §6${stats.WARN} peringatan§7, §c${stats.ERROR} error§7.`,
      `§7Tersimpan di ingatan: §f${stats.buffered}§7 baris terakhir.`,
      "",
      "§8Baris terbaru di bawah (paling baru di bawah sendiri):",
      "",
      ...recentLogs(14).map((l) => `§8${l.slice(0, 120)}`),
    ].join("\n"))
    .button(watching
      ? "§cBerhenti kirim peringatan ke chat\n§8Peringatan & error tidak lagi masuk chatmu"
      : "§aKirim peringatan & error ke chat\n§8Setiap WARN/ERROR langsung muncul di chatmu")
    .button("§8« Kembali");
  const res = await forceShow(player, form);
  if (res && !res.canceled && res.selection === 0) {
    const on = watchLogs(player.id, !watching);
    player.sendMessage(on
      ? "§aPeringatan dan error akan dikirim ke chatmu."
      : "§7Pengiriman peringatan ke chat dimatikan.");
    logInfo(TAG, `${player.name} mengubah pemantauan log ke: ${on}`);
  }
  await openSettings(player, entity);
}

async function openFarm(player, entity) {
  const state = readState(entity);
  const claims = claimsNear(entity.dimension, entity.location, player.id, 6);
  const lines = claims.length
    ? claims.map((c) => `§7• §fchunk ${c.cx}, ${c.cz} §7— ` +
        (c.entry.worked ? "§asudah jadi ladang" : "§cbelum digarap"))
    : ["§8Belum ada chunk yang dipatok."];

  const form = new ActionFormData()
    .title("§l§6Ladang & Patok")
    .body([
      "§7Patok menentukan sampai mana companion boleh menggarap.",
      "§7Klik tanah pakai §fPatok Ladang§7 untuk memilih chunk.",
      "§8Merah = dipatok tapi belum digarap. Hijau = sudah jadi ladang.",
      "",
      ...lines,
      "",
      `§7Izin melebar satu chunk lagi: ${state.allowExpand ? "§ahidup" : "§cmati"}`,
      "§8Kalau dihidupkan, companion menggarap chunk berpatok kedua yang terdekat",
      "§8setelah chunk pertama selesai — asal ada ember/besi dan sungai di dekatnya.",
    ].join("\n"))
    .button("§eBeri Aku Patok Ladang", "textures/items/stick")
    .button(state.allowExpand ? "§cMatikan izin melebar" : "§aIzinkan melebar 1 chunk lagi", "textures/items/wheat")
    .button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection === 0) {
    if (!ensureStake(player)) player.sendMessage("§7Patok Ladang sudah ada di kantongmu.");
  } else if (res.selection === 1) {
    setExpand(entity, !state.allowExpand);
    player.sendMessage(state.allowExpand
      ? "§7Izin melebar dimatikan."
      : "§aIzin melebar dihidupkan. Patok satu chunk lagi supaya ada tujuannya.");
  }
  await openSettings(player, entity);
}

async function openBlueprints(player, entity) {
  const keys = Object.keys(BLUEPRINTS);
  const state = readState(entity);
  const form = new ActionFormData()
    .title("§l§eRancangan Bangunan")
    .body([
      "§7Bahannya diambil dari peti stasiun. Yang tidak ada bahannya dilewati,",
      "§7dan alasannya muncul di baris §fSekarang§7 di menu utama.",
      "",
      `§7Rancangan sekarang: §f${BLUEPRINTS[state.blueprint]?.label ?? "belum dipilih"}`,
      "",
      "§7Mau bikin kampung kecil? Ambil §fPatok Desa§7 di bawah, patok beberapa",
      "§7chunk, lalu suruh dia ke Mode Membangun — rumah lengkap ranjang akan",
      "§7dibangun duluan sebelum rancangan di atas.",
      "",
      "§8Rancangan bertanda §7JSON§8 datang dari berkas di folder",
      "§8addons/vbs_companions/blueprints/ — tambah berkas di sana untuk",
      "§8menambah rancangan baru tanpa menyentuh kode.",
    ].join("\n"));
  for (const key of keys) {
    const bp = BLUEPRINTS[key];
    const mark = key === state.blueprint ? " §8(sekarang)" : "";
    const from = bp.source ? " §7JSON" : "";
    form.button(`§f${bp.label}${mark}${from}\n§8${bp.hint}`);
  }
  form.button("§2Ajukan Desa\n§8Minta Patok Desa untuk menandai chunk yang boleh dibangun rumah");
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection === keys.length) {
    if (!ensureVillageStake(player)) player.sendMessage("§7Patok Desa sudah ada di kantongmu.");
    await openBlueprints(player, entity);
    return;
  }
  if (res.selection < keys.length) {
    const key = keys[res.selection];
    const fresh = readState(entity);
    startBlueprint(entity, fresh, key, player);
    patchState(entity, { blueprint: key });
    player.sendMessage(`§eRancangan diganti: §f${BLUEPRINTS[key].label}§e. ` +
      "§7Pilih §fMode Membangun§7 supaya dia mulai mengerjakannya.");
  }
  await openSettings(player, entity);
}

async function openWaypoints(player, entity) {
  const form = new ActionFormData()
    .title("§l§bCatatan Pengembara")
    .body([
      "§7Yang ditemukan companion sambil mengembara, terbaru di atas.",
      "",
      ...waypointLines(14),
    ].join("\n"))
    .button("§8« Kembali");
  await forceShow(player, form);
  await openSettings(player, entity);
}

function toggleQuiet(player, entity) {
  const state = readState(entity);
  patchState(entity, { quiet: !state.quiet });
  player.sendMessage(state.quiet
    ? "§aCeloteh dihidupkan lagi."
    : "§7Celoteh dimatikan. Dia tetap bekerja, cuma diam.");
}

function toggleHideOwner(player, entity) {
  const state = readState(entity);
  patchState(entity, { hideOwner: !state.hideOwner });
  refreshName(entity);
  logInfo(TAG, `${player.name} menyetel sembunyikan-pemilik ${entStr(entity)} = ${!state.hideOwner}`);
  player.sendMessage(state.hideOwner
    ? "§aNama pemilik ditampilkan lagi di penanda companion ini."
    : "§7Nama pemilik companion ini disembunyikan.");
}

/**
 * Saklar menyeluruh: semua companion milik pemain ini berhenti memajang nama
 * pemiliknya, di penanda kepala maupun di papan stasiun. Inilah yang membuat
 * pemain lain di server tidak bisa tahu companion itu punya siapa.
 */
function toggleHideOwnerAll(player, entity) {
  const before = readSettings(player.id).hideOwner;
  const next = writeSettings(player.id, { hideOwner: !before });
  logInfo(TAG, `${player.name} menyetel sembunyikan-pemilik MENYELURUH = ${next.hideOwner}`);
  let touched = 0;
  try {
    for (const c of allCompanions(FAMILY)) {
      if (!alive(c)) continue;
      refreshName(c);
      touched++;
    }
  } catch (e) {
    logWarn(TAG, "Gagal menyegarkan penanda seluruh companion", e);
  }
  player.sendMessage(next.hideOwner
    ? `§7Nama pemilik disembunyikan di §fSEMUA§7 companionmu (${touched} disegarkan). ` +
      "§8Pemain lain di server tidak akan tahu ini punya siapa."
    : "§aNama pemilik ditampilkan lagi di semua companionmu.");
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
    player.sendMessage("§cItu bukan zirah, senjata atau alat yang bisa dipakai.");
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
  syncWeapon(entity);
  const extra = item.typeId === "minecraft:bow" || item.typeId === "minecraft:crossbow"
    ? " §7Dia akan bertarung sebagai pemanah." : "";
  player.sendMessage(`§a${SLOT_LABEL[slot]} dipasang: §f${prettyItem(item.typeId)}${extra}`);
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
  syncWeapon(entity);
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
  patchState(entity, { nick: value || null });
  refreshName(entity);
  player.sendMessage(value
    ? `§aSekarang dipanggil §f${value}§a.`
    : `§7Nama dikembalikan ke §f${meta.name}§7.`);
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
    .body(`§7${displayName(entity)} akan dihilangkan dari dunia. Perlengkapan yang ` +
          "dipakainya dikembalikan ke kantongmu. Stasiun dan patoknya tetap ada." +
          "\n\n§8Kamu bisa memanggilnya lagi dengan spawn egg.")
    .button1("§cYa, istirahatkan")
    .button2("§7Batal");
  const res = await forceShow(player, confirm);
  if (!res || res.canceled || res.selection !== 0) return;
  stripGear(player, entity);
  entity.dimension.spawnParticle?.("minecraft:large_explosion", entity.location);
  entity.remove();
  player.sendMessage(`§7${meta.name} beristirahat.`);
}