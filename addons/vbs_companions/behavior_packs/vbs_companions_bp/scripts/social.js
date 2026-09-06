/**
 * Companion yang mengobrol dengan companion lain.
 */

import { system } from "@minecraft/server";
import { POSE, TICKS } from "./config.js";
import { say } from "./chat.js";
import { restoreFromChat } from "./energy.js";
import { hold } from "./hold.js";
import { TOPICS } from "./lines.js";
import { isGreeting } from "./look.js";
import { patchState, readState } from "./state.js";
import { alive, dist2, face, getMode, getOwnerId, pick } from "./util.js";
import { entStr, logDebug, logInfo } from "./logger.js";

const TAG = "SOCIAL";
// Companion terasa "mati" kalau jarang bersuara. Jangkauan diperlebar,
// jeda antar obrolan dipendekkan, dan peluang memulai obrolan dinaikkan —
// jadi dua companion yang berpapasan hampir selalu bertegur sapa.
const TALK_RADIUS = 10;
const TURN_TICKS = 42;
const COOLDOWN = 420;
const CHANCE = 0.85;

const talking = new Map();
const lastTalk = new Map();

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
  const chosen = pick(fit.length ? fit : TOPICS);
  logDebug(TAG, `Topik obrolan terpilih: "${chosen.tag}" untuk mode [${modeA}] & [${modeB}]`);
  return chosen;
}

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
  logInfo(TAG, `Mulai percakapan antara ${entStr(a)} dan ${entStr(b)}: Topik="${topic.tag}"`);
  // Ngobrol sebentar juga menghitung sebagai istirahat — companion tidak
  // cuma boleh pulih tenaga dengan tidur.
  for (const who of [a, b]) {
    const st = readState(who);
    restoreFromChat(who, st);
    patchState(who, { energy: st.energy });
  }
  return convo;
}

function end(convo) {
  logInfo(TAG, `Mengakhiri obrolan topik: "${convo.tag}"`);
  for (const id of convo.speakers) talking.delete(id);
}

export function isTalking(entity) {
  return talking.has(entity?.id);
}

export function tickSocial(companions) {
  const now = system.currentTick;
  const byId = new Map(companions.map((c) => [c.id, c]));

  const seen = new Set();
  for (const convo of talking.values()) {
    if (seen.has(convo)) continue;
    seen.add(convo);
    const [a, b] = convo.speakers.map((id) => byId.get(id));
    if (!alive(a) || !alive(b) || a.dimension.id !== b.dimension.id ||
        dist2(a.location, b.location) > (TALK_RADIUS + 4) ** 2) {
      logDebug(TAG, `Obrolan "${convo.tag}" dibatalkan: lawan bicara menjauh/mati.`);
      end(convo);
      continue;
    }
    if (isGreeting(a) || isGreeting(b)) {
      logDebug(TAG, `Obrolan "${convo.tag}" dibatalkan karena salah satu disapa pemilik.`);
      end(convo);
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
    logInfo(TAG, `Turn obrolan [${convo.index + 1}/${convo.turns.length}] oleh ${entStr(speaker)}`);
    say(speaker, convo.turns[convo.index], { other: listener });
    convo.index++;
    convo.nextAt = now + TURN_TICKS;
  }

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
        lastTalk.set(key, now - COOLDOWN + TICKS.social);
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