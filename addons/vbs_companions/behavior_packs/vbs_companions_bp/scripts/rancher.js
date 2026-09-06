/**
 * Mode Beternak.
 *
 * Companion yang memagari satu petak di chunk berpatok desa, menggiring hewan
 * liar ke dalamnya, memberi makan, membiakkan sampai batas populasi, mencukur
 * domba, memerah sapi, memungut telur, dan menyembelih kelebihannya jadi
 * daging untuk dapur perajin.
 *
 * Kenapa perannya ada: dapur (kitchen.js) bisa memanggang apa pun, tapi tidak
 * bisa MENGADAKAN daging. Petani menanam gandum, pemancing membawa ikan, dan
 * di antara keduanya tidak ada satu pun yang menghasilkan kulit, wol, susu
 * atau telur — bahan yang dibutuhkan pedagang untuk dijual dan perajin untuk
 * memasak. Peternak menutup lubang itu.
 *
 * Yang jujur dan yang ditiru
 * --------------------------
 * Script API Bedrock yang stabil TIDAK punya cara menyalakan "love mode"
 * vanilla, tidak punya tali, dan tidak bisa memerintah AI hewan mengikuti
 * seseorang. Jadi:
 *
 * - Menggiring memakai dorongan kecil (applyKnockback) dari sisi berlawanan
 *   gerbang. Hewannya benar-benar berjalan melewati dunia, benar-benar
 *   tertahan pagar, dan benar-benar bisa gagal kalau ada tebing di jalannya.
 *   Bukan teleport.
 * - Beranak: pakannya benar-benar habis dari peti, dua induk dewasa harus
 *   benar-benar berdiri berdekatan di dalam kandang, jedanya nyata, dan
 *   anaknya lahir di antara mereka lewat spawnEntity + minecraft:entity_born
 *   (event bawaan hewan ternak vanilla). Yang ditiru cuma pemicu asmaranya.
 * - Mencukur dan memerah memakai event vanilla yang memang ada
 *   (minecraft:on_sheared) dan barang yang memang habis (gunting, ember).
 *
 * Ditulis terang-terangan supaya tidak ada yang mengira add-on ini menyetir
 * AI ternak vanilla. Kalau suatu hari API-nya ada, yang perlu diganti cuma
 * herd(), breedStep() dan milkStep() di berkas ini.
 */

import { system } from "@minecraft/server";

import { FACE, POSE, RANCH } from "./config.js";
import { claimsNear, ensureClaimHeight } from "./claim.js";
import { report, sayFrom } from "./chat.js";
import { craftItemStep } from "./crafting.js";
import { hold } from "./hold.js";
import { isGreeting } from "./look.js";
import { requestItem } from "./requests.js";
import { ensureMaterial } from "./selfhelp.js";
import { writeState } from "./state.js";
import { ensureStation, stationTravel } from "./station.js";
import {
  alive, blockAt, canOccupy, chunkCenter, countIn, dist2, distXZ, face,
  getOwnerId, isFooting, makeItem, particle, prettyItem, putIn, setFace, sound,
  steer, takeFrom,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "RANCHER";
const SHEARS = "minecraft:shears";
const BUCKET = "minecraft:bucket";
const MILK = "minecraft:milk_bucket";
const EGG = "minecraft:egg";

/* ------------------------------------------------------------------ *
 * Kandang
 * ------------------------------------------------------------------ */

/**
 * Petak kandang di dalam chunk berpatok desa.
 *
 * Ukurannya ganjil dengan sengaja: gerbangnya duduk tepat di tengah sisi
 * selatan, jadi arah dorongan menggiring selalu satu garis lurus dan hewan
 * tidak pernah dipepet ke sudut pagar.
 */
export function penBounds(claim, y) {
  const center = chunkCenter(claim.cx, claim.cz);
  const half = Math.floor(RANCH.pen / 2);
  const cx = Math.floor(center.x);
  const cz = Math.floor(center.z);
  return {
    y,
    x0: cx - half, x1: cx + half,
    z0: cz - half, z1: cz + half,
    center: { x: cx + 0.5, y, z: cz + 0.5 },
    gate: { x: cx, y, z: cz + half },
  };
}

export function insidePen(pen, loc) {
  if (!pen || !loc) return false;
  return loc.x >= pen.x0 && loc.x <= pen.x1 + 1 &&
    loc.z >= pen.z0 && loc.z <= pen.z1 + 1 &&
    Math.abs(loc.y - pen.y) < 4;
}

/** Titik pagar berikutnya yang belum berdiri. */
function nextFenceGap(dimension, pen) {
  for (let x = pen.x0; x <= pen.x1; x++) {
    for (const z of [pen.z0, pen.z1]) {
      const gap = gapAt(dimension, pen, x, z);
      if (gap) return gap;
    }
  }
  for (let z = pen.z0 + 1; z < pen.z1; z++) {
    for (const x of [pen.x0, pen.x1]) {
      const gap = gapAt(dimension, pen, x, z);
      if (gap) return gap;
    }
  }
  return undefined;
}

function gapAt(dimension, pen, x, z) {
  const isGate = x === pen.gate.x && z === pen.gate.z;
  const want = isGate ? RANCH.gate : RANCH.fence;
  // Tanah kandang boleh naik-turun; pagarnya menempel di permukaan, bukan di
  // satu ketinggian datar yang menggantung di udara.
  for (let dy = 2; dy >= -2; dy--) {
    const floor = blockAt(dimension, x, pen.y + dy - 1, z);
    const here = blockAt(dimension, x, pen.y + dy, z);
    if (!floor || !here) continue;
    if (!isFooting(floor)) continue;
    if (here.typeId === want) return undefined;
    if (!canOccupy(here)) return undefined;
    return { x, y: pen.y + dy, z, block: want, gate: isGate };
  }
  return undefined;
}

/**
 * Memasang satu batang pagar, memakai bahan yang benar-benar ada di peti.
 *
 * Pagar tidak muncul dari udara: kalau tidak ada di peti, peternak merakitnya
 * dari papan lewat perajin/permintaan bahan seperti mode lain.
 */
function fenceStep(entity, state, container, pen) {
  const gap = nextFenceGap(entity.dimension, pen);
  if (!gap) return undefined;

  const target = { x: gap.x + 0.5, y: gap.y, z: gap.z + 0.5 };
  if (dist2(entity.location, target) > RANCH.workReach ** 2) {
    steer(entity, target, 0.34);
    return "berjalan ke garis pagar kandang";
  }
  if (takeFrom(container, gap.block, 1) !== 1) {
    return { missing: gap.gate ? "gerbang" : "pagar" };
  }
  const block = blockAt(entity.dimension, gap.x, gap.y, gap.z);
  try {
    block.setType(gap.block);
  } catch (e) {
    logWarn(TAG, `Gagal memasang ${gap.block} di ${posStr(gap)}`, e);
    putIn(container, makeItem(gap.block, 1));
    return "pagar gagal dipasang di situ";
  }
  face(entity, target);
  hold(entity, 12, { pose: POSE.build, reason: "fence" });
  sound(entity.dimension, "random.wood_click", target, { volume: 0.6 });
  logDebug(TAG, `${entStr(entity)} memasang ${gap.block} di ${posStr(gap)}.`);
  return gap.gate ? "memasang gerbang kandang" : "memagari kandang";
}

/* ------------------------------------------------------------------ *
 * Hewan
 * ------------------------------------------------------------------ */

function isBaby(animal) {
  try {
    if (animal.getComponent("minecraft:is_baby")) return true;
  } catch { /* versi lama tidak punya komponennya */ }
  try {
    return animal.getProperty?.("minecraft:is_baby") === true;
  } catch {
    return false;
  }
}

/** Semua hewan ternak yang diurus, dalam radius tertentu. */
export function herdAround(entity, radius) {
  const out = [];
  for (const type of Object.keys(RANCH.kinds)) {
    let found;
    try {
      found = entity.dimension.getEntities({
        type, location: entity.location, maxDistance: radius,
      });
    } catch (e) {
      logDebug(TAG, `getEntities("${type}") gagal di versi ini`, e);
      continue;
    }
    for (const a of found) {
      if (alive(a)) out.push(a);
    }
  }
  return out;
}

/** Jumlah hewan dewasa per jenis di dalam kandang. */
export function census(animals, pen) {
  const counts = {};
  for (const a of animals) {
    if (!insidePen(pen, a.location)) continue;
    const row = counts[a.typeId] ?? (counts[a.typeId] = { adults: 0, babies: 0, list: [] });
    if (isBaby(a)) row.babies++;
    else {
      row.adults++;
      row.list.push(a);
    }
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * Menggiring
 * ------------------------------------------------------------------ */

/**
 * Satu dorongan menggiring.
 *
 * Peternak berdiri di sisi hewan yang MEMBELAKANGI gerbang, lalu mendorong
 * pelan. Kalau berdirinya asal saja, hewannya sama saja didorong menjauh —
 * itu bedanya menggiring dengan menabrak.
 */
function herd(entity, state, animal, pen) {
  const at = animal.location;
  const goal = insidePen(pen, at) ? pen.center : { x: pen.gate.x + 0.5, y: pen.gate.y, z: pen.gate.z + 0.5 };
  const dx = goal.x - at.x;
  const dz = goal.z - at.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;

  // Berdiri di belakang hewannya, sejauh jangkauan dorong.
  const behind = {
    x: at.x - ux * RANCH.herdReach,
    y: at.y,
    z: at.z - uz * RANCH.herdReach,
  };
  if (dist2(entity.location, behind) > (RANCH.herdReach * 0.9) ** 2) {
    steer(entity, behind, 0.36);
    return `menggiring ${labelOf(animal.typeId)} ke kandang`;
  }
  face(entity, at);
  try {
    animal.applyKnockback?.({ x: ux * RANCH.nudge, z: uz * RANCH.nudge }, 0.08);
  } catch (e) {
    // Tanda tangan lama: applyKnockback(dx, dz, kuat, tegak).
    try {
      animal.applyKnockback(ux, uz, RANCH.nudge, 0.08);
    } catch (e2) {
      logDebug(TAG, "applyKnockback tidak tersedia di versi ini", e2);
    }
  }
  hold(entity, 8, { pose: POSE.build, reason: "herd" });
  sound(entity.dimension, "random.pop", at, { volume: 0.4 });
  return `menggiring ${labelOf(animal.typeId)} ke kandang`;
}

function labelOf(typeId) {
  return RANCH.kinds[typeId]?.label ?? prettyItem(typeId);
}

/* ------------------------------------------------------------------ *
 * Merawat
 * ------------------------------------------------------------------ */

/** Berdiri di samping hewannya dulu; true kalau sudah cukup dekat. */
function reachAnimal(entity, animal) {
  if (dist2(entity.location, animal.location) > RANCH.workReach ** 2) {
    steer(entity, animal.location, 0.34);
    return false;
  }
  face(entity, animal.location);
  return true;
}

/**
 * Beranak: pakan benar-benar diambil dari peti, dua induk harus berdekatan.
 *
 * Batas populasi dicek DULU. Kandang yang beranak tanpa rem adalah cara
 * tercepat membuat dunia Bedrock berhenti bernapas, dan itu bukan fitur.
 */
function breedStep(entity, state, container, pen, typeId, row, kind) {
  if (row.adults < 2) return undefined;
  if (row.adults + row.babies >= kind.cap) return undefined;

  const now = system.currentTick;
  state.breedAt = state.breedAt ?? {};
  if (now - (state.breedAt[typeId] ?? -RANCH.breedEvery) < RANCH.breedEvery) return undefined;

  const feed = kind.feed.find((id) => countIn(container, id) >= 2);
  if (!feed) return undefined;

  // Dua induk yang benar-benar berdiri berdekatan.
  let pair;
  for (let i = 0; i < row.list.length && !pair; i++) {
    for (let j = i + 1; j < row.list.length; j++) {
      if (distXZ(row.list[i].location, row.list[j].location) <= 6) {
        pair = [row.list[i], row.list[j]];
        break;
      }
    }
  }
  if (!pair) return undefined;
  if (!reachAnimal(entity, pair[0])) return `membawa ${prettyItem(feed)} ke ${kind.label}`;

  if (takeFrom(container, feed, 2) !== 2) return undefined;
  state.breedAt[typeId] = now;

  const at = {
    x: (pair[0].location.x + pair[1].location.x) / 2,
    y: pair[0].location.y,
    z: (pair[0].location.z + pair[1].location.z) / 2,
  };
  let baby;
  try {
    baby = entity.dimension.spawnEntity(typeId, at);
    baby.triggerEvent("minecraft:entity_born");
  } catch (e) {
    logWarn(TAG, `Gagal melahirkan ${typeId} di ${posStr(at)}`, e);
    if (baby) {
      try { baby.remove(); } catch { /* sudah hilang */ }
    }
    return "anaknya gagal lahir di sini";
  }
  hold(entity, 20, { pose: POSE.harvest, face: FACE.happy, reason: "breed" });
  setFace(entity, FACE.happy);
  particle(entity.dimension, "minecraft:heart_particle", at);
  sound(entity.dimension, "random.levelup", at, { volume: 0.5 });
  logInfo(TAG, `${entStr(entity)} membiakkan ${typeId}; kini ${row.adults + row.babies + 1} ekor.`);
  sayFrom(entity, "rancher");
  return `${kind.label} beranak (${row.adults + row.babies + 1}/${kind.cap})`;
}

/** Memberi makan hewan yang belum dewasa supaya cepat besar. */
function feedStep(entity, state, container, animals, pen) {
  const now = system.currentTick;
  state.fedAt = state.fedAt ?? {};
  for (const a of animals) {
    if (!insidePen(pen, a.location)) continue;
    if (!isBaby(a)) continue;
    const kind = RANCH.kinds[a.typeId];
    if (!kind) continue;
    if (now - (state.fedAt[a.id] ?? -RANCH.feedEvery) < RANCH.feedEvery) continue;
    const feed = kind.feed.find((id) => countIn(container, id) >= 1);
    if (!feed) continue;
    if (!reachAnimal(entity, a)) return `membawa ${prettyItem(feed)} ke anak ${kind.label}`;
    if (takeFrom(container, feed, 1) !== 1) continue;
    state.fedAt[a.id] = now;
    hold(entity, 14, { pose: POSE.harvest, face: FACE.happy, reason: "feed" });
    particle(entity.dimension, "minecraft:heart_particle", a.location);
    sound(entity.dimension, "random.eat", a.location, { volume: 0.5 });
    logDebug(TAG, `${entStr(entity)} memberi makan anak ${a.typeId}.`);
    return `memberi makan anak ${kind.label}`;
  }
  return undefined;
}

/** Mencukur domba yang berbulu, memakai gunting yang benar-benar dipegang. */
function shearStep(entity, state, container, animals, pen) {
  if (countIn(container, SHEARS) < 1) return undefined;
  const now = system.currentTick;
  state.shornAt = state.shornAt ?? {};
  for (const a of animals) {
    if (!RANCH.kinds[a.typeId]?.shear) continue;
    if (!insidePen(pen, a.location)) continue;
    if (isBaby(a)) continue;
    if (now - (state.shornAt[a.id] ?? -RANCH.shearEvery) < RANCH.shearEvery) continue;
    if (!reachAnimal(entity, a)) return "mendekati domba untuk dicukur";
    try {
      a.triggerEvent("minecraft:on_sheared");
    } catch (e) {
      logDebug(TAG, `minecraft:on_sheared ditolak untuk ${a.typeId}`, e);
      state.shornAt[a.id] = now;
      continue;
    }
    state.shornAt[a.id] = now;
    const wool = makeItem("minecraft:wool", 1 + Math.floor(Math.random() * 3));
    if (wool) putIn(container, wool, entity.dimension, entity.location);
    hold(entity, 18, { pose: POSE.harvest, reason: "shear" });
    sound(entity.dimension, "mob.sheep.shear", a.location);
    logInfo(TAG, `${entStr(entity)} mencukur domba di ${posStr(a.location)}.`);
    sayFrom(entity, "rancher");
    return "mencukur domba";
  }
  return undefined;
}

/** Memerah sapi; embernya benar-benar berubah jadi ember susu. */
function milkStep(entity, state, container, animals, pen) {
  if (countIn(container, BUCKET) < 1) return undefined;
  const now = system.currentTick;
  state.milkedAt = state.milkedAt ?? {};
  for (const a of animals) {
    if (!RANCH.kinds[a.typeId]?.milk) continue;
    if (!insidePen(pen, a.location)) continue;
    if (isBaby(a)) continue;
    if (now - (state.milkedAt[a.id] ?? -RANCH.milkEvery) < RANCH.milkEvery) continue;
    if (!reachAnimal(entity, a)) return "mendekati sapi untuk diperah";
    if (takeFrom(container, BUCKET, 1) !== 1) return undefined;
    state.milkedAt[a.id] = now;
    const milk = makeItem(MILK, 1);
    if (milk) putIn(container, milk, entity.dimension, entity.location);
    hold(entity, 18, { pose: POSE.harvest, reason: "milk" });
    sound(entity.dimension, "mob.cow.milk", a.location);
    logInfo(TAG, `${entStr(entity)} memerah sapi di ${posStr(a.location)}.`);
    return "memerah sapi";
  }
  return undefined;
}

/**
 * Memungut telur yang tergeletak di kandang.
 *
 * Ayam bertelur sendiri; yang dikerjakan peternak cuma memungutnya sebelum
 * hilang termuat waktu. Barangnya entity item sungguhan yang benar-benar
 * dihapus dari dunia — bukan telur yang dikarang dari jumlah ayam.
 */
function eggStep(entity, state, container, pen) {
  let items;
  try {
    items = entity.dimension.getEntities({
      type: "minecraft:item", location: entity.location, maxDistance: RANCH.eggRadius,
    });
  } catch (e) {
    logDebug(TAG, "getEntities(item) gagal di versi ini", e);
    return undefined;
  }
  for (const drop of items) {
    if (!alive(drop)) continue;
    if (!insidePen(pen, drop.location)) continue;
    let stack;
    try {
      stack = drop.getComponent("minecraft:item")?.itemStack;
    } catch { continue; }
    if (!stack) continue;
    if (!PICKUP.has(stack.typeId)) continue;
    if (dist2(entity.location, drop.location) > RANCH.workReach ** 2) {
      steer(entity, drop.location, 0.34);
      return `memungut ${prettyItem(stack.typeId)}`;
    }
    putIn(container, stack, entity.dimension, entity.location);
    try { drop.remove(); } catch { /* sudah dipungut orang lain */ }
    hold(entity, 8, { pose: POSE.harvest, reason: "pickup" });
    sound(entity.dimension, "random.pop", drop.location, { volume: 0.4 });
    logDebug(TAG, `${entStr(entity)} memungut ${stack.amount}x ${stack.typeId} di kandang.`);
    return `memungut ${stack.amount}x ${prettyItem(stack.typeId)}`;
  }
  return undefined;
}

// Yang dipungut di dalam kandang: telur, dan apa pun yang jatuh dari hewan
// yang disembelih sendiri. Barang pemain yang kebetulan tergeletak di situ
// TIDAK ikut — kandang bukan tempat sampah.
const PICKUP = new Set([EGG, "minecraft:feather", "minecraft:wool", "minecraft:leather"]);

/**
 * Menyembelih kelebihan populasi.
 *
 * Rem terakhir mode ini, dan satu-satunya sumber daging di add-on. Batasnya
 * dijaga dua arah: tidak pernah menyembelih anak, dan tidak pernah membuat
 * satu jenis tersisa di bawah `cullBelow` — kandang yang habis disembelih
 * tidak bisa beranak lagi, dan peternaknya berhenti punya pekerjaan.
 */
function cullStep(entity, state, container, pen, typeId, row, kind) {
  if (row.adults + row.babies <= kind.cap) return undefined;
  if (row.adults <= RANCH.cullBelow) return undefined;

  const victim = row.list[row.list.length - 1];
  if (!victim || !alive(victim)) return undefined;
  if (!reachAnimal(entity, victim)) return `mendekati ${kind.label} yang berlebih`;

  const at = { ...victim.location };
  try {
    victim.kill();
  } catch (e) {
    logWarn(TAG, `Gagal menyembelih ${typeId}`, e);
    return undefined;
  }
  // Jatuhannya nyata: entity item dari kematian vanilla, dipungut denyut
  // berikutnya lewat eggStep. Yang dimasukkan langsung ke peti cuma satu
  // potong daging supaya dapur tidak menunggu sia-sia kalau barangnya
  // terlanjur hanyut.
  const meat = kind.drops?.[0];
  if (meat) {
    const item = makeItem(meat, 1);
    if (item) putIn(container, item, entity.dimension, entity.location);
  }
  hold(entity, 24, { pose: POSE.harvest, reason: "cull" });
  sound(entity.dimension, "random.pop", at, { volume: 0.6 });
  logInfo(TAG, `${entStr(entity)} menyembelih satu ${typeId}; populasi kembali ke batas ${kind.cap}.`);
  report(entity, `${kind.label} sudah kebanyakan, satu kusembelih untuk dapur.`);
  return `menyembelih ${kind.label} yang berlebih`;
}

/* ------------------------------------------------------------------ *
 * Denyut
 * ------------------------------------------------------------------ */

export function tickRancher(entity, state, owner) {
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const dimension = entity.dimension;
  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station.container;
  if (!container) return "tidak ada tempat menyimpan apa pun";

  // 1. Kandang butuh patok desa. Tanpa itu peternak tidak memagari apa pun —
  //    pemain yang memutuskan tanah mana yang jadi kandang, bukan companion.
  const claims = claimsNear(dimension, entity.location, ownerId, 8, "village");
  if (!claims.length) {
    const now = system.currentTick;
    if (now - (state.noPenAt ?? -RANCH.complainEvery) > RANCH.complainEvery) {
      state.noPenAt = now;
      report(entity, "Aku butuh patok desa dulu untuk membuka kandang. Patoknya ada di Buku Panduan.");
    }
    writeState(entity, state);
    return "menunggu patok desa untuk kandang";
  }
  const claim = claims[0];
  const fixed = ensureClaimHeight(dimension, claim.cx, claim.cz);
  const y = fixed?.y ?? claim.entry.y ?? Math.floor(entity.location.y);
  const pen = penBounds(claim, y);
  state.pen = { cx: claim.cx, cz: claim.cz, y };

  // 2. Alat. Gunting dan ember dibuat sendiri, bukan diberikan cuma-cuma.
  for (const [key, id] of [["shears", SHEARS], ["bucket", BUCKET]]) {
    if (countIn(container, id) >= 1) continue;
    const made = craftItemStep(entity, state, key, container);
    if (made.status === "walking" || made.status === "crafting") {
      writeState(entity, state);
      return `membuat ${key === "shears" ? "gunting" : "ember"}`;
    }
    if (made.status === "done") {
      writeState(entity, state);
      sayFrom(entity, "done");
      return `${key === "shears" ? "gunting" : "ember"} selesai dibuat`;
    }
    // Alatnya tidak wajib: kandang tetap jalan tanpa gunting, cuma tidak ada
    // wol. Jadi permintaannya dipasang lalu kerjanya diteruskan, tidak macet.
    if (made.status !== "no-table") {
      requestItem(entity, state, ownerId, key, station.chest ?? state.station);
      ensureMaterial(entity, state, ownerId, made.missing ?? "iron",
                     station.chest ?? state.station, container, { search: true });
    }
    break;
  }

  // 3. Pagarnya berdiri dulu. Menggiring hewan ke petak tanpa pagar sama saja
  //    menggiringnya ke tanah lapang.
  const fence = fenceStep(entity, state, container, pen);
  if (typeof fence === "string") {
    writeState(entity, state);
    return fence;
  }
  if (fence?.missing) {
    // Pagarnya dirakit sendiri dari papan dan stik. Yang diminta ke luar cuma
    // kayunya — barang jadi yang muncul begitu saja adalah keluhan lama yang
    // tidak boleh kembali lewat kandang.
    const key = fence.missing === "gerbang" ? "fence_gate" : "fence";
    const made = craftItemStep(entity, state, key, container);
    if (made.status === "walking" || made.status === "crafting") {
      writeState(entity, state);
      return `membuat ${fence.missing} kandang`;
    }
    if (made.status === "done") {
      writeState(entity, state);
      return `${fence.missing} kandang selesai dibuat`;
    }
    const own = ensureMaterial(entity, state, ownerId, made.missing ?? "wood",
                               station.chest ?? state.station, container, { search: true });
    if (made.status !== "no-table") {
      requestItem(entity, state, ownerId, key, station.chest ?? state.station);
    }
    writeState(entity, state);
    return own ?? `menunggu ${made.missing ?? "kayu"} untuk ${fence.missing} kandang`;
  }

  const animals = herdAround(entity, RANCH.searchRadius);
  const counts = census(animals, pen);
  state.penCount = Object.fromEntries(
    Object.entries(counts).map(([id, r]) => [id, r.adults + r.babies]));

  // 4. Merawat yang sudah di dalam: telur, cukur, perah, makan, beranak, sembelih.
  const eggs = eggStep(entity, state, container, pen);
  if (eggs) {
    writeState(entity, state);
    return eggs;
  }
  const shear = shearStep(entity, state, container, animals, pen);
  if (shear) {
    writeState(entity, state);
    return shear;
  }
  const milk = milkStep(entity, state, container, animals, pen);
  if (milk) {
    writeState(entity, state);
    return milk;
  }
  const fed = feedStep(entity, state, container, animals, pen);
  if (fed) {
    writeState(entity, state);
    return fed;
  }
  for (const [typeId, row] of Object.entries(counts)) {
    const kind = RANCH.kinds[typeId];
    if (!kind) continue;
    const culled = cullStep(entity, state, container, pen, typeId, row, kind);
    if (culled) {
      writeState(entity, state);
      return culled;
    }
    const bred = breedStep(entity, state, container, pen, typeId, row, kind);
    if (bred) {
      writeState(entity, state);
      return bred;
    }
  }

  // 5. Menggiring yang masih liar — hanya jenis yang kandangnya belum penuh.
  const stray = animals.find((a) => {
    if (insidePen(pen, a.location)) return false;
    const kind = RANCH.kinds[a.typeId];
    if (!kind) return false;
    const row = counts[a.typeId];
    return ((row?.adults ?? 0) + (row?.babies ?? 0)) < kind.cap;
  });
  if (stray) {
    const status = herd(entity, state, stray, pen);
    writeState(entity, state);
    return status;
  }

  // 6. Tidak ada yang perlu digiring: pulang menyetor lalu berjaga di kandang.
  const trip = stationTravel(entity, station);
  if (trip) {
    writeState(entity, state);
    return trip;
  }
  if (dist2(entity.location, pen.center) > (RANCH.pen / 2 + 2) ** 2) {
    steer(entity, pen.center, 0.3);
    writeState(entity, state);
    return "kembali menjaga kandang";
  }
  writeState(entity, state);
  const total = Object.values(counts).reduce((n, r) => n + r.adults + r.babies, 0);
  return total
    ? `menjaga kandang (${total} ekor)`
    : "kandang siap, belum ada hewan yang bisa digiring";
}

/** Ringkasan untuk menu dan buku. */
export function rancherLines(state) {
  if (!state.pen) return ["§8Belum ada kandang. Patok satu chunk sebagai desa dulu."];
  const out = [`§7Kandang: §fchunk ${state.pen.cx}, ${state.pen.cz}`];
  const counted = state.penCount ?? {};
  const rows = Object.entries(RANCH.kinds)
    .map(([id, kind]) => `${kind.label} ${counted[id] ?? 0}/${kind.cap}`)
    .join("§7, §f");
  out.push(`§7Isi: §f${rows}`);
  return out;
}
