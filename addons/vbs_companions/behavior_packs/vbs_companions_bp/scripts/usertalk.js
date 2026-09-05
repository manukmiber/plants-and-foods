/**
 * Ngobrol dua arah: pemain ke companion.
 *
 * Bedrock tidak bisa mendaftarkan command kustom (/chat ...) tanpa menyalakan
 * Beta APIs eksperimental, dan add-on ini sengaja dibuat supaya tidak perlu
 * eksperimen apa pun (lihat manifest). Jadi jalan tengahnya: pemain mengetik
 * kalimat BIASA di chat berformat "chat <nama> <pesan>" (tanpa garis miring),
 * pesan itu ditangkap sebelum tersiar ke chat umum, dan companion yang
 * namanya cocok akan membalas. Arah sebaliknya — companion ke pemain — sudah
 * ada lewat report()/say() di chat.js.
 */

import { system, world } from "@minecraft/server";
import { FAMILY } from "./config.js";
import { say, sayFrom } from "./chat.js";
import { getActivity } from "./activity.js";
import { energyOf, isResting } from "./energy.js";
import { displayName } from "./nametag.js";
import { readState } from "./state.js";
import { alive, allCompanions, dist2, getOwnerId } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "USERTALK";
const COMMAND = /^chat\s+(\S+)\s+([\s\S]+)$/i;

function ownedCompanions(playerId) {
  return allCompanions(FAMILY).filter((c) => alive(c) && getOwnerId(c) === playerId);
}

function findTarget(player, name) {
  const mine = ownedCompanions(player.id);
  const needle = name.toLowerCase();
  const exact = mine.filter((c) => displayName(c).toLowerCase() === needle);
  const pool = exact.length ? exact : mine.filter((c) => displayName(c).toLowerCase().startsWith(needle));
  if (!pool.length) {
    logDebug(TAG, `Tidak ada companion milik ${player.name} yang cocok dengan nama "${name}".`);
    return undefined;
  }
  if (pool.length > 1) {
    pool.sort((a, b) => dist2(player.location, a.location) - dist2(player.location, b.location));
  }
  return pool[0];
}

const STATUS_WORDS = /\b(ngapain|lagi apa|status|kerja apa|sedang apa)\b/;
const GREET_WORDS = /\b(halo|hai|hei|hey|oi|hallo)\b/;
const THANKS_WORDS = /\b(makasih|terima\s*kasih|thanks|thx)\b/;
const TIRED_WORDS = /\b(capek|lelah|istirahat|tired)\b/;
const BYE_WORDS = /\b(dadah|bye|sampai jumpa|daag)\b/;

function respondTo(entity, message) {
  const text = message.toLowerCase();
  const opts = { toOwnerAlways: true };

  if (STATUS_WORDS.test(text)) {
    const doing = getActivity(entity);
    const state = readState(entity);
    const restNote = isResting(state) ? ` (tenaga ${Math.round(energyOf(state))})` : "";
    const line = doing ? `Sedang ${doing}${restNote}.` : "Belum ada perintah, menunggu saja.";
    logDebug(TAG, `Balasan status untuk ${entStr(entity)}: "${line}"`);
    say(entity, line, opts);
    return;
  }
  if (GREET_WORDS.test(text)) { sayFrom(entity, "greet", opts); return; }
  if (THANKS_WORDS.test(text) || BYE_WORDS.test(text)) { sayFrom(entity, "done", opts); return; }
  if (TIRED_WORDS.test(text)) { sayFrom(entity, "tired", opts); return; }
  sayFrom(entity, "reply", opts);
}

let wired = false;

export function wireUserTalk() {
  if (wired) return;
  wired = true;
  logInfo(TAG, "Memasang listener chat dua-arah (format: \"chat <nama> <pesan>\").");

  world.beforeEvents.chatSend.subscribe((ev) => {
    const match = COMMAND.exec(ev.message);
    if (!match) return;
    const [, name, message] = match;
    const player = ev.sender;
    ev.cancel = true;
    logDebug(TAG, `${player.name} mengetik perintah chat ke "${name}": "${message}"`);

    system.run(() => {
      try {
        const target = findTarget(player, name);
        if (!target) {
          player.sendMessage(`§cTidak ada companion bernama "${name}" yang kamu miliki di dekat sini.`);
          return;
        }
        logInfo(TAG, `${player.name} -> ${entStr(target)}: "${message}"`);
        respondTo(target, message);
      } catch (e) {
        logWarn(TAG, `Gagal memproses chat dari ${player.name}`, e);
      }
    });
  });
}
