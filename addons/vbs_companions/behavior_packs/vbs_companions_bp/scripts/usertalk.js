/**
 * Ngobrol dua arah antara pemain dan companion.
 *
 * ARAH PEMAIN -> COMPANION, tiga cara, semuanya jalan tanpa Beta API:
 *
 *   /scriptevent vbs:chat <nama> <pesan>   perintah garis miring sungguhan
 *   chat <nama> <pesan>                    diketik biasa di kotak chat
 *   !<nama> <pesan>                        singkatnya
 *
 * Bedrock tidak mengizinkan add-on mendaftarkan perintah /chat sendiri tanpa
 * menyalakan Beta API eksperimental, dan add-on ini sengaja dibuat supaya tidak
 * perlu eksperimen apa pun. /scriptevent adalah perintah garis miring bawaan
 * Minecraft yang memang disediakan untuk keperluan ini — jadi pemain yang punya
 * izin operator tetap bisa mengetik perintah, dan yang tidak punya izin tetap
 * bisa pakai bentuk "chat <nama> <pesan>".
 *
 * ARAH COMPANION -> PEMAIN sudah jalan lewat report()/say() di chat.js:
 * laporan panen, permintaan bahan, tawaran membangun kampung, dan celoteh
 * biasa semuanya sampai ke chat pemiliknya.
 *
 * Nama "semua" berarti pesan dikirim ke seluruh companion milik pemain itu.
 */

import { system, world } from "@minecraft/server";
import { FAMILY, MODES } from "./config.js";
import { report, say, sayFrom } from "./chat.js";
import { getActivity } from "./activity.js";
import { energyOf, isResting, isSleeping, needsLabel, sleepOf } from "./energy.js";
import { displayName } from "./nametag.js";
import { readState } from "./state.js";
import { alive, allCompanions, dist2, getMode, getOwnerId, setMode } from "./util.js";
import { entStr, guard, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "USERTALK";
const CHAT_FORM = /^(?:chat|bicara)\s+(\S+)\s+([\s\S]+)$/i;
const BANG_FORM = /^!(\S+)\s+([\s\S]+)$/;

function ownedCompanions(playerId) {
  return allCompanions(FAMILY).filter((c) => alive(c) && getOwnerId(c) === playerId);
}

function findTargets(player, name) {
  const mine = ownedCompanions(player.id);
  const needle = name.toLowerCase();
  if (needle === "semua" || needle === "all") {
    logDebug(TAG, `${player.name} bicara ke SEMUA companion miliknya (${mine.length}).`);
    return mine;
  }
  const exact = mine.filter((c) => displayName(c).toLowerCase() === needle);
  const pool = exact.length
    ? exact
    : mine.filter((c) => displayName(c).toLowerCase().startsWith(needle));
  if (!pool.length) {
    logDebug(TAG, `Tidak ada companion milik ${player.name} yang cocok dengan "${name}".`);
    return [];
  }
  pool.sort((a, b) => dist2(player.location, a.location) - dist2(player.location, b.location));
  return [pool[0]];
}

/* --- perintah yang bisa diselipkan di dalam kalimat --- */

const ORDERS = [
  { mode: "farm", words: /\b(bertani|tani|ladang|cangkul|nyawah)\b/ },
  { mode: "mine", words: /\b(menambang|tambang|gali|nambang)\b/ },
  { mode: "build", words: /\b(bangun|membangun|rumah)\b/ },
  { mode: "crafter", words: /\b(merajin|rajin|craft|tempa|bikin alat)\b/ },
  { mode: "looter", words: /\b(cari barang|looter|kumpulkan|nyari bahan)\b/ },
  { mode: "attack", words: /\b(serang|bertarung|jaga aku|lawan)\b/ },
  { mode: "follow", words: /\b(ikut|ikuti|sini|mari)\b/ },
  { mode: "stay", words: /\b(diam|tunggu|stay|berhenti)\b/ },
  { mode: "wander", words: /\b(jelajah|keliling|mengembara)\b/ },
];

const STATUS_WORDS = /\b(ngapain|lagi apa|status|kerja apa|sedang apa|gimana)\b/;
const GREET_WORDS = /\b(halo|hai|hei|hey|oi|hallo|pagi|malam)\b/;
const THANKS_WORDS = /\b(makasih|terima\s*kasih|thanks|thx)\b/;
const TIRED_WORDS = /\b(capek|lelah|istirahat|tired|ngantuk|tidur)\b/;
const BYE_WORDS = /\b(dadah|bye|sampai jumpa|daag)\b/;
const NEED_WORDS = /\b(butuh|perlu|kurang|minta)\b/;

function statusLine(entity) {
  const state = readState(entity);
  const doing = getActivity(entity);
  const mode = MODES[getMode(entity)]?.label ?? "?";
  const energy = Math.round(energyOf(state));
  const sleepy = Math.round(sleepOf(state));
  const what = doing ? `Sedang ${doing}` : `Tugasku ${mode}, belum ada yang dikerjakan`;
  return `${what}. Tenaga ${energy}, kantuk ${sleepy} — ${needsLabel(state)}.`;
}

function needLine(entity) {
  const state = readState(entity);
  const pending = Object.keys(state.needs ?? {});
  if (state.craft) return `Aku sedang menempa ${state.craft.tier} ${state.craft.kind}.`;
  if (pending.length) return `Aku masih butuh: ${pending.join(", ")}.`;
  return "Sekarang tidak ada yang kurang. Semua bahanku cukup.";
}

function respondTo(entity, message, player) {
  const text = message.toLowerCase();
  const opts = { toOwnerAlways: true };
  logInfo(TAG, `${player.name} -> ${entStr(entity)}: "${message}"`);

  // Perintah kerja disebut di dalam kalimat: dituruti, lalu dijawab.
  for (const order of ORDERS) {
    if (!order.words.test(text)) continue;
    if (getMode(entity) === order.mode) {
      say(entity, `Aku memang sedang ${MODES[order.mode].label.toLowerCase()}.`, opts);
      return;
    }
    if (setMode(entity, order.mode)) {
      logInfo(TAG, `${entStr(entity)} pindah mode ke "${order.mode}" atas perintah chat ${player.name}.`);
      say(entity, `Baik, aku ${MODES[order.mode].label.toLowerCase()} sekarang.`, opts);
    } else {
      logWarn(TAG, `Gagal memindahkan ${entStr(entity)} ke mode ${order.mode}.`);
      say(entity, "Maaf, aku tidak bisa pindah tugas sekarang.", opts);
    }
    return;
  }

  if (STATUS_WORDS.test(text)) {
    say(entity, statusLine(entity), opts);
    return;
  }
  if (NEED_WORDS.test(text)) {
    say(entity, needLine(entity), opts);
    return;
  }
  if (GREET_WORDS.test(text)) { sayFrom(entity, "greet", opts); return; }
  if (THANKS_WORDS.test(text)) { sayFrom(entity, "thanks", opts); return; }
  if (BYE_WORDS.test(text)) { sayFrom(entity, "done", opts); return; }
  if (TIRED_WORDS.test(text)) {
    const state = readState(entity);
    if (isSleeping(state)) { sayFrom(entity, "sleepy", opts); return; }
    if (isResting(state)) { sayFrom(entity, "rest", opts); return; }
    sayFrom(entity, "tired", opts);
    return;
  }
  sayFrom(entity, "reply", opts);
}

export function deliver(player, name, message) {
  const targets = findTargets(player, name);
  if (!targets.length) {
    player.sendMessage(
      `§cTidak ada companion bernama "${name}" yang kamu miliki. ` +
      "§7Pakai §fchat semua <pesan>§7 untuk bicara ke semuanya.");
    return;
  }
  for (const target of targets) {
    try {
      respondTo(target, message, player);
    } catch (e) {
      logWarn(TAG, `Gagal memproses balasan dari ${entStr(target)}`, e);
    }
  }
}

/**
 * Ganti tugas companion dari luar (perintah garis miring Beta API).
 *
 * Dipisah dari deliver() karena perintah membalas dengan status berhasil/gagal
 * ke pemanggilnya, bukan lewat gelembung teks.
 */
export function orderMode(player, name, mode) {
  const wanted = String(mode ?? "").toLowerCase();
  if (!MODES[wanted]) {
    return { ok: false, message: `Tugas "${mode}" tidak dikenal. Pilih: ${Object.keys(MODES).join(", ")}.` };
  }
  const targets = findTargets(player, name);
  if (!targets.length) {
    return { ok: false, message: `Tidak ada companion bernama "${name}" yang kamu miliki.` };
  }
  let changed = 0;
  for (const target of targets) {
    if (!setMode(target, wanted)) continue;
    changed++;
    say(target, `Baik, aku ${MODES[wanted].label.toLowerCase()} sekarang.`, { toOwnerAlways: true });
  }
  logInfo(TAG, `${player.name} menyuruh ${changed} companion ke mode "${wanted}" lewat perintah.`);
  return changed
    ? { ok: true, message: `${changed} companion sekarang ${MODES[wanted].label}.` }
    : { ok: false, message: "Tidak ada companion yang bisa diperintah sekarang." };
}

let wired = false;

export function wireUserTalk() {
  if (wired) return;
  wired = true;
  logInfo(TAG, 'Memasang listener chat dua-arah: "/scriptevent vbs:chat <nama> <pesan>", "chat <nama> <pesan>", "!<nama> <pesan>".');

  // Perintah garis miring sungguhan.
  try {
    system.afterEvents.scriptEventReceive.subscribe(guard(TAG, "scriptEventReceive", (ev) => {
      if (ev.id !== "vbs:chat" && ev.id !== "vbs:bicara") return;
      const player = ev.sourceEntity;
      if (!player || player.typeId !== "minecraft:player") {
        logWarn(TAG, `scriptevent ${ev.id} dipanggil bukan oleh pemain; diabaikan.`);
        return;
      }
      const parts = String(ev.message ?? "").trim();
      const match = /^(\S+)\s+([\s\S]+)$/.exec(parts);
      if (!match) {
        player.sendMessage("§7Cara pakai: §f/scriptevent vbs:chat <nama> <pesan>");
        return;
      }
      logDebug(TAG, `scriptevent ${ev.id} dari ${player.name}: "${parts}"`);
      deliver(player, match[1], match[2]);
    }));
    logDebug(TAG, "Berhasil subscribe ke system.afterEvents.scriptEventReceive.");
  } catch (e) {
    logWarn(TAG, "scriptEventReceive tidak tersedia di versi ini; perintah /scriptevent dilewati.", e);
  }

  // Bentuk yang diketik biasa, untuk pemain tanpa izin operator.
  try {
    world.beforeEvents.chatSend.subscribe(guard(TAG, "chatSend", (ev) => {
      const raw = ev.message ?? "";
      const match = CHAT_FORM.exec(raw) ?? BANG_FORM.exec(raw);
      if (!match) return;
      const [, name, message] = match;
      const player = ev.sender;
      ev.cancel = true;
      logDebug(TAG, `${player.name} mengetik pesan ke "${name}": "${message}"`);
      system.run(guard(TAG, "chatSend/run", () => deliver(player, name, message)));
    }));
    logDebug(TAG, "Berhasil subscribe ke world.beforeEvents.chatSend.");
  } catch (e) {
    logWarn(TAG, "Gagal subscribe ke world.beforeEvents.chatSend", e);
  }
}

/** Dipakai main.js: companion menyapa pemiliknya lebih dulu sesekali. */
export function greetOwner(entity, key) {
  sayFrom(entity, key, { toOwnerAlways: true });
}

export { report };
