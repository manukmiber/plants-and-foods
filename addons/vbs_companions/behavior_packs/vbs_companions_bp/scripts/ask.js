/**
 * Companion bertanya, pemain menjawab.
 *
 * Sampai sekarang arah bicara companion -> pemain cuma berupa laporan: kalimat
 * lewat, dan pemain tidak bisa menjawabnya. Dua keputusan justru paling masuk
 * akal ditanyakan, bukan ditebak sendiri oleh kode:
 *
 *   petani    "Aku cari bibit sendiri, atau kamu yang carikan?"     ya / tidak
 *   penambang "Apa saja yang harus aku tambang?"                    pilihan
 *
 * Pertanyaan disimpan per PEMILIK di dynamic property dunia, jadi tetap ada
 * sesudah dunia ditutup — pemain yang keluar di tengah pertanyaan tidak
 * kehilangan jawabannya.
 *
 * Ada dua cara menjawab, dan keduanya benar-benar terpasang:
 *
 *   1. ketik §fya§r atau §ftidak§r di chat  (usertalk.js)
 *   2. buka Buku Panduan » Pertanyaan Companion  (bookui.js)
 *
 * Jawabannya ditulis ke satu field di state companion yang bertanya (`field`),
 * jadi modul yang bertanya tinggal membaca state-nya sendiri dan tidak perlu
 * tahu apa-apa soal berkas ini.
 */

import { system, world } from "@minecraft/server";
import { FAMILY, PROP } from "./config.js";
import { say } from "./chat.js";
import { displayName } from "./nametag.js";
import { patchState } from "./state.js";
import { alive, allCompanions } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "ASK";
const MAX_OPEN = 8;
// Pertanyaan yang sama tidak diulang secepat itu; kalau pemain sedang tidak
// sempat menjawab, companion tidak boleh berubah jadi tukang spam.
const REASK_AFTER = 6000;      // ~5 menit

function key(ownerId) {
  return `${PROP.asks}:${ownerId}`;
}

function write(ownerId, list) {
  try {
    world.setDynamicProperty(key(ownerId), JSON.stringify(list.slice(-MAX_OPEN)));
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal menyimpan pertanyaan milik ${ownerId} (kuota limit?)`, e);
    return false;
  }
}

/** Semua pertanyaan yang belum dijawab, milik satu pemain. */
export function pendingAsks(ownerId) {
  if (!ownerId) return [];
  try {
    const raw = world.getDynamicProperty(key(ownerId));
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) {
    logWarn(TAG, `Gagal membaca pertanyaan milik ${ownerId}`, e);
    return [];
  }
}

/** Pertanyaan yang sedang menggantung dari satu companion tertentu. */
export function askOf(ownerId, entityId) {
  return pendingAsks(ownerId).find((q) => q.from === entityId);
}

/**
 * Ajukan pertanyaan. Balikannya true kalau pertanyaannya baru saja diajukan —
 * false kalau yang sama masih menggantung atau baru saja ditanyakan.
 *
 * `options` adalah daftar { key, label }. Untuk pertanyaan ya/tidak, pakai
 * kunci "ya" dan "tidak" supaya bisa dijawab langsung dari chat.
 */
export function askOwner(entity, ownerId, { id, field, text, options, multi = false }) {
  if (!ownerId) return false;
  const list = pendingAsks(ownerId);
  const mine = `${entity.id}:${id}`;
  const existing = list.find((q) => q.id === mine);
  if (existing) {
    if (system.currentTick - (existing.askedAt ?? 0) < REASK_AFTER) return false;
    existing.askedAt = system.currentTick;
    write(ownerId, list);
  } else {
    list.push({
      id: mine, from: entity.id, fromName: displayName(entity),
      field, text, options, multi, askedAt: system.currentTick,
    });
    write(ownerId, list);
  }

  logInfo(TAG, `${entStr(entity)} bertanya ke pemiliknya: "${text}"`);
  say(entity, text, { toOwnerAlways: true });

  const owner = world.getAllPlayers().find((p) => p.id === ownerId);
  if (owner) {
    const how = options.length === 2 && options.some((o) => o.key === "ya")
      ? `§7Jawab dengan mengetik §fya§7 atau §ftidak§7 di chat, atau lewat ` +
        "§6Buku Panduan §7» §fPertanyaan Companion§7."
      : "§7Pilih jawabannya di §6Buku Panduan §7» §fPertanyaan Companion§7.";
    owner.sendMessage(how);
  }
  return true;
}

function findCompanion(entityId) {
  return allCompanions(FAMILY).find((c) => alive(c) && c.id === entityId);
}

/**
 * Jawab satu pertanyaan. `value` adalah kunci pilihan (atau larik kunci untuk
 * pertanyaan yang boleh dijawab lebih dari satu).
 */
export function answerAsk(ownerId, askId, value) {
  const list = pendingAsks(ownerId);
  const question = list.find((q) => q.id === askId);
  if (!question) {
    logDebug(TAG, `Jawaban untuk pertanyaan ${askId} datang tapi pertanyaannya sudah tidak ada.`);
    return undefined;
  }
  write(ownerId, list.filter((q) => q.id !== askId));

  const entity = findCompanion(question.from);
  if (!entity) {
    logWarn(TAG, `Pertanyaan ${askId} dijawab tapi ${question.fromName} sudah tidak ada di dunia.`);
    return question;
  }
  patchState(entity, { [question.field]: value });
  logInfo(TAG, `${entStr(entity)}.${question.field} = ${JSON.stringify(value)} (jawaban pemilik).`);

  const chosen = Array.isArray(value)
    ? (value.length ? value.map((v) => labelIn(question, v)).join(", ") : "Apa saja boleh")
    : labelIn(question, value);
  say(entity, `Baik. ${chosen}.`, { toOwnerAlways: true });
  return question;
}

function labelIn(question, value) {
  return question.options.find((o) => o.key === value)?.label ?? String(value);
}

/**
 * Jawaban singkat yang diketik di chat ("ya" / "tidak"). Dipakai untuk
 * pertanyaan ya/tidak yang paling lama menggantung.
 */
export function answerLatestYesNo(ownerId, value) {
  const question = pendingAsks(ownerId)
    .filter((q) => !q.multi && q.options.some((o) => o.key === value))
    .shift();
  if (!question) return undefined;
  return answerAsk(ownerId, question.id, value);
}

/** Buang pertanyaan companion yang sudah tidak ada lagi di dunia. */
export function dropAsksFrom(ownerId, entityId) {
  const list = pendingAsks(ownerId);
  const next = list.filter((q) => q.from !== entityId);
  if (next.length !== list.length) write(ownerId, next);
}

/** Ringkasan untuk ditampilkan di buku. */
export function askLines(ownerId) {
  const list = pendingAsks(ownerId);
  if (!list.length) return ["§8Tidak ada pertanyaan yang menunggu jawaban."];
  return list.map((q) => `§7• §f${q.fromName}§7: ${q.text}`);
}
