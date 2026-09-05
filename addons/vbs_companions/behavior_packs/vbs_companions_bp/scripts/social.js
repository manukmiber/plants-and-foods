/**
 * Companion yang mengobrol dengan companion lain.
 *
 * Dua companion yang berdiri berdekatan cukup lama akan berhenti, saling
 * menghadap, dan bertukar beberapa kalimat. Topiknya dipilih dari mode yang
 * sedang mereka jalankan — dua petani membicarakan ladang, penambang yang
 * bertemu pengembara membicarakan perjalanan — jadi obrolannya nyambung dengan
 * apa yang sedang terjadi, bukan kalimat acak.
 *
 * Yang bicara ditahan lewat hold.js, sama seperti waktu disapa pemain, jadi
 * setelah obrolan selesai keduanya kembali ke perintah masing-masing sendiri.
 * Kalau pemain menatap salah satunya di tengah obrolan, tatapan pemain yang
 * menang — obrolannya dibatalkan.
 */

import { system } from "@minecraft/server";

import { POSE, TICKS } from "./config.js";
import { say } from "./chat.js";
import { hold } from "./hold.js";
import { TOPICS } from "./lines.js";
import { isGreeting } from "./look.js";
import { readState } from "./state.js";
import { alive, dist2, face, getMode, getOwnerId, pick } from "./util.js";

const TALK_RADIUS = 7;
const TURN_TICKS = 46;
const COOLDOWN = 900;            // sekitar 45 detik sebelum pasangan yang sama boleh lagi
const CHANCE = 0.5;

const talking = new Map();       // entityId -> percakapan (dua-duanya menunjuk objek yang sama)
const lastTalk = new Map();      // "idA|idB" -> tick

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function topicFor(modeA, modeB) {
  const fit = TOPICS.filter((t) => {
    try {
      return t.when(modeA, modeB);
    } catch {
      return false;
    }
  });
  return pick(fit.length ? fit : TOPICS);
}

/** Mulai satu percakapan antara dua companion. */
function begin(a, b) {
  const topic = topicFor(getMode(a), getMode(b));
  const convo = {
    speakers: [a.id, b.id],
    entities: [a, b],
    turns: topic.turns,
    index: 0,
    nextAt: system.currentTick,
    tag: topic.tag,
  };
  talking.set(a.id, convo);
  talking.set(b.id, convo);
  lastTalk.set(pairKey(a.id, b.id), system.currentTick);
  return convo;
}

function end(convo) {
  for (const id of convo.speakers) talking.delete(id);
}

/** Sedang mengobrol? Dipakai mode kerja untuk berhenti sebentar. */
export function isTalking(entity) {
  return talking.has(entity?.id);
}

/**
 * Satu denyut. Menjalankan percakapan yang sedang berlangsung, lalu mencoba
 * memulai yang baru dari pasangan yang berdekatan.
 */
export function tickSocial(companions) {
  const now = system.currentTick;
  const byId = new Map(companions.map((c) => [c.id, c]));

  // --- lanjutkan yang sedang berlangsung ---
  const seen = new Set();
  for (const convo of talking.values()) {
    if (seen.has(convo)) continue;
    seen.add(convo);
    const [a, b] = convo.speakers.map((id) => byId.get(id));
    if (!alive(a) || !alive(b) || a.dimension.id !== b.dimension.id ||
        dist2(a.location, b.location) > (TALK_RADIUS + 4) ** 2) {
      end(convo);
      continue;
    }
    if (isGreeting(a) || isGreeting(b)) {
      end(convo);                    // pemain lebih penting daripada obrolan
      continue;
    }
    if (now < convo.nextAt) {
      hold(a, TURN_TICKS, { pose: POSE.talk, reason: "talk" });
      hold(b, TURN_TICKS, { pose: POSE.talk, reason: "talk" });
      continue;
    }
    if (convo.index >= convo.turns.length) {
      end(convo);
      continue;
    }
    const speaker = convo.index % 2 === 0 ? a : b;
    const listener = speaker === a ? b : a;
    face(speaker, listener.location);
    face(listener, speaker.location);
    hold(speaker, TURN_TICKS + 10, { pose: POSE.talk, reason: "talk" });
    hold(listener, TURN_TICKS + 10, { pose: POSE.normal, reason: "listen" });
    // Di teks topik, {kamu} menunjuk LAWAN BICARA, bukan pemilik — itu sebabnya
    // lawan bicaranya diteruskan ke say().
    say(speaker, convo.turns[convo.index], { other: listener });
    convo.index++;
    convo.nextAt = now + TURN_TICKS;
  }

  // --- coba mulai yang baru ---
  for (let i = 0; i < companions.length; i++) {
    const a = companions[i];
    if (talking.has(a.id) || isGreeting(a) || readState(a).quiet) continue;
    for (let j = i + 1; j < companions.length; j++) {
      const b = companions[j];
      if (talking.has(b.id) || isGreeting(b) || readState(b).quiet) continue;
      if (a.dimension.id !== b.dimension.id) continue;
      if (dist2(a.location, b.location) > TALK_RADIUS ** 2) continue;
      if (getOwnerId(a) && getOwnerId(b) && getOwnerId(a) !== getOwnerId(b)) continue;
      const key = pairKey(a.id, b.id);
      if (now - (lastTalk.get(key) ?? -COOLDOWN) < COOLDOWN) continue;
      if (Math.random() > CHANCE) {
        lastTalk.set(key, now - COOLDOWN + TICKS.social);   // coba lagi nanti
        continue;
      }
      begin(a, b);
      break;
    }
  }
}

export function forget(id) {
  const convo = talking.get(id);
  if (convo) end(convo);
  for (const key of [...lastTalk.keys()]) {
    if (key.includes(id)) lastTalk.delete(key);
  }
}
