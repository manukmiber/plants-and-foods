/**
 * Buku Panduan Companion — item yang tidak bisa hilang.
 *
 * Ditempa dari SATU BUKU + SATU BUNGA (resep ada di behavior pack,
 * recipes/guide_from_*.json — satu berkas per bunga, karena resep Bedrock tidak
 * bisa menyebut beberapa kemungkinan untuk satu bahan). Bunga dipilih karena
 * bunga jugalah yang menjinakkan companion.
 *
 * "Tidak bisa hilang" dijaga tiga lapis, karena satu lapis saja tidak cukup:
 *
 *   1. mati              playerSpawn sesudah respawn -> diberikan lagi
 *   2. dibuang/dilempar  item entity-nya dipungut kembali pada denyut berikutnya
 *   3. hilang cara lain  denyut lambat memeriksa kantong tiap pemain
 *
 * Semuanya bisa dimatikan per pemain lewat saklar "Buku tidak bisa hilang" di
 * dalam bukunya sendiri — kalau dimatikan, buku berlaku seperti item biasa dan
 * tidak dikembalikan lagi.
 *
 * Isi bukunya sendiri ada di bookui.js.
 */

import { system, world } from "@minecraft/server";
import { readSettings } from "./state.js";
import { give, makeItem } from "./util.js";
import { openBook } from "./bookui.js";
import { guard, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "BOOK";

export const GUIDE_ID = "vbs:guide";
const GUIDE_NAME = "§6Buku Panduan Companion";
const CHECK_EVERY = 100;          // 5 detik: cukup cepat, tidak berisik
const RESCUE_RADIUS = 12;

/** ItemStack buku, lengkap dengan nama dan keterangannya. */
export function makeBook() {
  const item = makeItem(GUIDE_ID, 1);
  if (!item) {
    // Item kustom gagal dibuat = pack resource/behavior tidak lengkap dipasang.
    logWarn(TAG, `Gagal membuat ItemStack ${GUIDE_ID}. Behavior pack terpasang utuh?`);
    return undefined;
  }
  try {
    item.nameTag = GUIDE_NAME;
    item.setLore([
      "§7Pakai (klik kanan / tahan) untuk membuka",
      "§7panduan, kendali companion, dan pengaturan.",
      "§8Ditempa dari satu buku dan satu bunga.",
    ]);
  } catch (e) {
    logDebug(TAG, "setLore/nameTag tidak didukung versi ini; buku tetap dipakai.", e);
  }
  return item;
}

export function isBook(itemStack) {
  return Boolean(itemStack) && itemStack.typeId === GUIDE_ID;
}

function inventoryOf(player) {
  try {
    return player.getComponent("minecraft:inventory")?.container;
  } catch (e) {
    logWarn(TAG, `Gagal membaca kantong ${player?.name}`, e);
    return undefined;
  }
}

export function hasBook(player) {
  const container = inventoryOf(player);
  if (!container) return false;
  for (let i = 0; i < container.size; i++) {
    if (isBook(container.getItem(i))) return true;
  }
  return false;
}

/**
 * Pastikan pemain punya bukunya. Balikan true kalau baru saja diberikan.
 *
 * `announce` dimatikan untuk pemeriksaan berkala supaya pemain tidak dibanjiri
 * pesan yang sama tiap lima detik kalau kantongnya kebetulan penuh.
 */
export function ensureBook(player, { announce = true } = {}) {
  if (!player) return false;
  const prefs = readSettings(player.id);
  if (!prefs.keepBook) {
    logDebug(TAG, `${player.name} mematikan "buku tidak bisa hilang"; tidak diberikan.`);
    return false;
  }
  if (hasBook(player)) return false;
  const book = makeBook();
  if (!book) return false;
  give(player, book);
  logInfo(TAG, `Buku panduan diberikan ke ${player.name}.`);
  if (announce) {
    player.sendMessage(
      "§6Buku Panduan Companion§7 ada di kantongmu. §8Pakai (klik kanan / tahan " +
      "di layar sentuh) untuk membuka panduan, mengendalikan companion, dan " +
      "mengatur mod ini.");
  }
  return true;
}

/**
 * Buku yang tergeletak di tanah dipungut kembali ke pemilik terdekat.
 *
 * Bedrock tidak punya event "pemain membuang item" yang bisa dibatalkan, jadi
 * inilah caranya: item entity-nya sendiri yang diambil kembali. Yang dijaga
 * bukan cuma dibuang sengaja — mati di lava, kantong penuh, dan /clear ikut
 * tertangani, karena semuanya berakhir sebagai item entity atau kantong kosong.
 */
function rescueDropped(entity) {
  let stack;
  try {
    stack = entity.getComponent("minecraft:item")?.itemStack;
  } catch (e) {
    logDebug(TAG, "Gagal membaca item entity yang jatuh.", e);
    return;
  }
  if (!isBook(stack)) return;

  const here = entity.location;
  let nearest;
  let best = RESCUE_RADIUS ** 2;
  for (const player of world.getAllPlayers()) {
    if (player.dimension.id !== entity.dimension.id) continue;
    if (!readSettings(player.id).keepBook) continue;
    const dx = player.location.x - here.x;
    const dy = player.location.y - here.y;
    const dz = player.location.z - here.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= best) {
      best = d2;
      nearest = player;
    }
  }
  if (!nearest) {
    logDebug(TAG, "Buku jatuh tapi tidak ada pemain yang menjaganya di dekat situ.");
    return;
  }
  try {
    entity.remove();
  } catch (e) {
    logWarn(TAG, "Gagal menghapus buku yang jatuh; dibiarkan tergeletak.", e);
    return;
  }
  if (!hasBook(nearest)) give(nearest, makeBook());
  nearest.sendMessage("§7Buku panduan tidak bisa dibuang — dikembalikan ke kantongmu. " +
    "§8Matikan di §fBuku » Pengaturan Mod§8 kalau memang mau membuangnya.");
  logInfo(TAG, `Buku yang jatuh dikembalikan ke ${nearest.name}.`);
}

let wired = false;

export function wireBook() {
  if (wired) return;
  wired = true;
  logInfo(TAG, "Memasang buku panduan: pemberian otomatis, penyelamatan saat jatuh, dan pembukaan menu.");

  const subscribe = (source, name, handler) => {
    try {
      source.subscribe(guard(TAG, name, handler));
      logDebug(TAG, `Listener buku "${name}" terpasang.`);
    } catch (e) {
      logWarn(TAG, `Listener buku "${name}" tidak tersedia di versi ini.`, e);
    }
  };

  // Dipakai: buka bukunya. Ini event stabil — tidak butuh custom component beta.
  subscribe(world.afterEvents.itemUse, "itemUse", (ev) => {
    if (!isBook(ev.itemStack)) return;
    const player = ev.source;
    if (!player || player.typeId !== "minecraft:player") return;
    logInfo(TAG, `${player.name} membuka buku panduan.`);
    system.run(guard(TAG, "itemUse/openBook", async () => { await openBook(player); }));
  });

  // Masuk dunia DAN respawn sesudah mati lewat event yang sama; bedanya cuma
  // ev.initialSpawn. Keduanya harus memberi buku, dan justru yang sesudah mati
  // yang paling penting.
  subscribe(world.afterEvents.playerSpawn, "playerSpawn", (ev) => {
    const player = ev.player;
    if (!player) return;
    const reason = ev.initialSpawn ? "masuk dunia" : "respawn sesudah mati";
    system.run(guard(TAG, "playerSpawn/ensureBook", () => {
      if (ensureBook(player)) {
        logInfo(TAG, `Buku dikembalikan ke ${player.name} (${reason}).`);
      }
    }));
  });

  // Dua jalan cadangan membuka buku, untuk kalau event "dipakai" tidak sampai
  // (beberapa perangkat sentuh tidak mengirimkannya untuk item tanpa animasi
  // pakai) atau bukunya kebetulan tidak di tangan.
  try {
    system.afterEvents.scriptEventReceive.subscribe(guard(TAG, "scriptEventReceive", (ev) => {
      if (ev.id !== "vbs:panduan" && ev.id !== "vbs:buku") return;
      const player = ev.sourceEntity;
      if (!player || player.typeId !== "minecraft:player") return;
      system.run(guard(TAG, "scriptevent/openBook", async () => { await openBook(player); }));
    }));
  } catch (e) {
    logWarn(TAG, "scriptEventReceive tidak tersedia; /scriptevent vbs:panduan dilewati.", e);
  }

  subscribe(world.beforeEvents.chatSend, "chatSend", (ev) => {
    if (!/^!\s*(panduan|buku|guide)\s*$/i.test(ev.message ?? "")) return;
    const player = ev.sender;
    ev.cancel = true;
    system.run(guard(TAG, "chatSend/openBook", async () => { await openBook(player); }));
  });

  // Buku yang tergeletak — dibuang, atau tercecer waktu pemainnya mati.
  subscribe(world.afterEvents.entitySpawn, "entitySpawn", (ev) => {
    if (ev.entity?.typeId !== "minecraft:item") return;
    system.run(guard(TAG, "entitySpawn/rescue", () => rescueDropped(ev.entity)));
  });

  // Jaring pengaman terakhir: apa pun yang lolos dari dua jalur di atas
  // (kantong penuh saat respawn, /clear, dunia lama yang belum pernah punya
  // buku) tertangani di sini.
  system.runInterval(guard(TAG, "denyut buku", () => {
    for (const player of world.getAllPlayers()) {
      ensureBook(player, { announce: false });
    }
  }), CHECK_EVERY);
}
