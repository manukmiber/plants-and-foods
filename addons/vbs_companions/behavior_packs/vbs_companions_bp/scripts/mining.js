/**
 * Mode menambang.
 */

import {
  DIGGABLE, DIGGABLE_EXTRA, MINE_KEY_OF, MINE_SPOIL, MINE_SPOIL_CAP,
  MINE_TARGETS, ORES, POSE, PROTECTED,
} from "./config.js";
import { askOwner } from "./ask.js";
import { report, sayFrom } from "./chat.js";
import { craftItemStep, craftStep } from "./crafting.js";
import { chipAway } from "./dig.js";
import { isGreeting } from "./look.js";
import { requestMaterial, requestTool } from "./requests.js";
import { ensureMaterial } from "./selfhelp.js";
import { writeState } from "./state.js";
import { ensureStation, stationTravel } from "./station.js";
import {
  alive, blockAt, countIn, dist2, face, getGear, getOwnerId, isAir, isFooting,
  makeItem, particle, putIn, sound, steer,
} from "./util.js";
import { entStr, logDebug, logError, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "MINING";
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TORCH_EVERY = 8;
const BRANCH_EVERY = 3;
const BRANCH_LENGTH = 8;
// Muatan yang dibawa sekali jalan. Dinaikkan dari 96 sejak hasil galian biasa
// (batu, tanah, kerikil) ikut dibawa pulang: dengan batas lama, penambang
// pulang menyetor tiap belasan blok dan hampir tidak sempat menggali.
const BAG_LIMIT = 192;
const REACH = 4.0;
// Lebar x tinggi terowongan: 1 blok lebar, 3 blok tinggi — cukup lega untuk
// companion (dan pemain) berjalan tanpa menunduk, tidak seperti versi lama
// yang cuma 2 tinggi dan terasa sempit.
const TUNNEL_HEIGHT = 3;
const LAVA = new Set(["minecraft:lava", "minecraft:flowing_lava"]);

/**
 * Sampai berapa dalam terowongan diturunkan.
 *
 * Dulu selalu -54, kedalaman intan, apa pun yang sebenarnya dicari. Sekarang
 * jawaban pemilik ikut dihitung: kalau yang diminta cuma batu bara dan besi,
 * tidak ada gunanya menggali sampai dasar dunia — companion berhenti di
 * kedalaman yang memang tempat bijih itu berada, dan mulai bercabang di situ.
 */
function targetDepth(dimensionId, wants) {
  if (dimensionId === "minecraft:nether") return 14;
  if (dimensionId === "minecraft:the_end") return 20;
  const keys = Array.isArray(wants) && wants.length ? wants : undefined;
  if (!keys) return -54;
  const depths = keys
    .map((key) => MINE_TARGETS[key]?.depth)
    .filter((d) => typeof d === "number");
  return depths.length ? Math.min(...depths) : -54;
}

/**
 * Hasil galian biasa dibawa pulang?
 *
 * Bawaannya menyala. Pemain yang memang cuma mau bijih bisa mematikannya di
 * Buku Panduan » Apa yang Ditambang, dan sesudah itu batu galian kembali
 * menguap seperti dulu.
 */
function haulSpoil(state) {
  return state.mineHaul !== false;
}

/** Bijih ini termasuk yang diminta pemilik? null/kosong berarti "apa saja". */
function wanted(state, itemId) {
  const wants = state.mineWants;
  if (!Array.isArray(wants) || !wants.length) return true;
  const key = MINE_KEY_OF[itemId];
  return key ? wants.includes(key) : true;
}

function bagCount(bag) {
  return Object.values(bag).reduce((a, b) => a + b, 0);
}

function addToBag(state, id, amount = 1) {
  state.bag[id] = (state.bag[id] ?? 0) + amount;
  logDebug(TAG, `Menambah item ke tas mining: +${amount} ${id} (total item tipe ini: ${state.bag[id]})`);
}

/**
 * Blok ini boleh digali?
 *
 * Yang TIDAK boleh cuma dua: blok terlindungi (peti, ranjang, spawner,
 * bedrock, obsidian...) dan lava. Selebihnya — termasuk pasir, basalt, sculk,
 * batu bata reruntuhan dan blok apa pun yang tidak ada di daftar — boleh
 * dibongkar. Versi lama memakai daftar putih ketat, jadi satu blok asing
 * setinggi kepala membuat seluruh kolom galian dibatalkan dan terowongan
 * membelok; hasilnya lorong yang sempit dan berkelok, bukan 1x3 yang lurus.
 */
function diggable(block) {
  if (!block) return false;
  try {
    if (block.isAir) return true;
    const id = block.typeId;
    if (PROTECTED.has(id) || LAVA.has(id)) return false;
    if (block.isLiquid) return false;
    return true;
  } catch (e) {
    logWarn(TAG, "Gagal memeriksa apakah blok bisa digali", e);
    return false;
  }
}

/** Blok yang memang diharapkan ada di jalur galian (untuk pencatatan saja). */
function expected(block) {
  const id = block?.typeId;
  return Boolean(id) && (DIGGABLE.has(id) || DIGGABLE_EXTRA.has(id));
}

/**
 * Menggali satu kolom setinggi TUNNEL_HEIGHT — SATU sel sekali denyut.
 *
 * Dulu seluruh kolom (tiga blok) dibongkar sekaligus, dua kolom tiap denyut:
 * enam blok batu tiap setengah detik, tanpa satu pun ayunan yang terlihat.
 * Sekarang selnya dicari satu per satu dari bawah ke atas dan masing-masing
 * dipukul sampai patah (dig.js), jadi lorongnya tumbuh sepelan penambang
 * sungguhan — dan bergantung pada tingkat beliung yang dipegangnya.
 *
 * Balikan: { status: "clear" } kolomnya sudah terbuka, { status: "breaking" }
 * masih diayun, { status: "broke" } satu sel patah tick ini, atau
 * { status: "blocked" } seluruh kolomnya memang tidak boleh dibongkar.
 */
function digColumn(entity, state, dimension, x, baseY, z, tool) {
  let blocked = 0;
  for (let dy = 0; dy < TUNNEL_HEIGHT; dy++) {
    const cell = blockAt(dimension, x, baseY + dy, z);
    if (!cell) {
      logDebug(TAG, `Sel (${x}, ${baseY + dy}, ${z}) tidak terbaca (chunk belum dimuat?).`);
      blocked++;
      continue;
    }
    if (cell.isAir) continue;
    if (!diggable(cell)) {
      logDebug(TAG, `Sel (${x}, ${baseY + dy}, ${z}) dilewati: ${cell.typeId} tidak boleh dibongkar.`);
      blocked++;
      continue;
    }
    if (!expected(cell)) {
      logDebug(TAG, `Blok tak terduga di jalur galian: ${cell.typeId} di (${x}, ${baseY + dy}, ${z}) — tetap dibongkar.`);
    }
    return dig(entity, state, cell, tool);
  }
  if (blocked >= TUNNEL_HEIGHT) return { status: "blocked" };
  return { status: "clear" };
}

/** Lantai kaki harus padat, kalau tidak companion jatuh ke lubang gua. */
function floorUnder(dimension, x, y, z) {
  const floor = blockAt(dimension, x, y - 1, z);
  if (!floor || floor.isAir || floor.isLiquid) {
    try {
      blockAt(dimension, x, y - 1, z)?.setType("minecraft:cobblestone");
      logDebug(TAG, `Lantai terowongan di (${x}, ${y - 1}, ${z}) ditambal.`);
    } catch (e) {
      logDebug(TAG, `Tidak bisa menambal lantai di (${x}, ${y - 1}, ${z})`, e);
    }
  }
}

function lavaNear(dimension, x, y, z) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
                              [0, 1, 0], [0, -1, 0], [0, 2, 0]]) {
    const block = blockAt(dimension, x + dx, y + dy, z + dz);
    if (block && LAVA.has(block.typeId)) {
      logWarn(TAG, `LAVA terdeteksi di sekitar (${x + dx}, ${y + dy}, ${z + dz})!`);
      return true;
    }
  }
  return false;
}

/**
 * Satu ayunan ke satu blok. Balikan sama bentuknya dengan digColumn.
 *
 * Bijih hasil pukulan masuk kantong hanya pada tick blok itu benar-benar
 * patah — jadi tidak ada lagi bijih yang "didapat" sebelum blok yang
 * bersangkutan hilang dari dunia.
 */
function dig(entity, state, block, tool) {
  const swing = chipAway(entity, block, tool, { pose: POSE.mine, reason: "dig" });
  if (swing.status === "breaking") return { status: "breaking", progress: swing.progress };
  if (swing.status !== "broke") return { status: "clear" };

  const id = swing.id;
  const ore = ORES[id];
  const at = { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };
  if (ore) {
    // Bijih yang kebetulan berdiri di jalur terowongan tetap dipungut walau
    // tidak diminta — meninggalkannya berarti membuangnya, karena bloknya
    // sudah terlanjur harus dibongkar supaya lorongnya bisa lewat. Yang benar
    // -benar disaring jawaban pemilik adalah bijih di DINDING (lihat tunnel()):
    // ke situ companion harus menyimpang, dan menyimpang untuk sesuatu yang
    // tidak diminta itulah yang membuang waktu.
    logInfo(TAG, `BIJIH DITEMUKAN: ${id} -> Menghasilkan ${ore}`);
    addToBag(state, ore, 1);
    particle(entity.dimension, "minecraft:villager_happy", at);
    sound(entity.dimension, "random.orb", at, { volume: 0.4 });
  } else if (haulSpoil(state)) {
    // Hasil galian biasa. Bloknya toh sudah terlanjur harus dibongkar supaya
    // lorongnya lewat; membiarkannya menguap sama saja dengan membuangnya,
    // padahal batu dan tanah itulah yang ditunggu petani (tanah timbun),
    // pembangun (batu) dan perajin (tungku) di permukaan.
    const spoil = MINE_SPOIL[id];
    if (spoil && (state.bag[spoil] ?? 0) < MINE_SPOIL_CAP) {
      addToBag(state, spoil, 1);
    }
  }
  return { status: "broke", id };
}

function torchAt(entity, state, x, y, z) {
  if ((state.bag["minecraft:torch"] ?? 0) < 1) return false;
  const spot = blockAt(entity.dimension, x, y, z);
  const floor = blockAt(entity.dimension, x, y - 1, z);
  if (!isAir(spot) || !isFooting(floor)) return false;
  try {
    spot.setType("minecraft:torch");
    logInfo(TAG, `Obor dipasang di (${x}, ${y}, ${z})`);
  } catch {
    return false;
  }
  state.bag["minecraft:torch"] -= 1;
  if (state.bag["minecraft:torch"] <= 0) delete state.bag["minecraft:torch"];
  return true;
}

function freshPlan(entity) {
  const at = entity.location;
  const dir = Math.floor(Math.random() * 4);
  const plan = {
    phase: "descend",
    x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z),
    dir, step: 0, branch: 0, branchSide: 1, branchStep: 0,
  };
  logInfo(TAG, `Rencana mining baru dibuat untuk ${entStr(entity)}: ${JSON.stringify(plan)}`);
  return plan;
}

/**
 * "Apa saja yang harus aku tambang?"
 *
 * Ditanyakan sekali per companion. Jawabannya dicentang pemain di Buku Panduan
 * (banyak pilihan sekaligus) dan tersimpan di state.mineWants; selama belum
 * dijawab, mineWants tetap null dan artinya "apa saja" — jadi penambang yang
 * pertanyaannya diabaikan tetap bekerja seperti sebelum ada fitur ini.
 */
function askMineTargets(entity, state, ownerId) {
  if (!ownerId) return;
  // Larik kosong BUKAN "belum dijawab": itu jawaban "apa saja boleh", dan
  // menanyakannya lagi tiap lima menit adalah cara tercepat membuat fitur ini
  // menyebalkan.
  if (Array.isArray(state.mineWants)) return;
  askOwner(entity, ownerId, {
    id: "mine",
    field: "mineWants",
    multi: true,
    text: "Apa saja yang harus aku mine? Centang di Buku Panduan, nanti kedalaman galiannya kusesuaikan.",
    options: Object.entries(MINE_TARGETS).map(([key, meta]) => ({ key, label: meta.label })),
  });
}

export function tickMine(entity, state, owner) {
  logDebug(TAG, `tickMine dimulai untuk ${entStr(entity)}`);
  if (!alive(entity)) return "hilang";
  if (isGreeting(entity)) return "berhenti karena disapa";

  const dimension = entity.dimension;
  const ownerId = getOwnerId(entity);
  const station = ensureStation(entity, state);
  const container = station?.container;

  if (!container) {
    logError(TAG, `${entStr(entity)} tidak punya peti maupun kantong!`);
    return "tidak ada tempat menyimpan apa pun";
  }
  // Peti gudangnya berdiri di balai kerja bersama; kalau penambang belum
  // pernah ke sana, ke sana dulu. Sesudah petinya berdiri, dia turun dan
  // pulang ke titik itu tiap kali kantongnya penuh.
  const trip = stationTravel(entity, station);
  if (trip) {
    writeState(entity, state);
    return trip;
  }
  if (station.missing) {
    const own = ensureMaterial(entity, state, ownerId, station.missing,
                               station.chest ?? state.station, container);
    if (own) {
      writeState(entity, state);
      return own;
    }
  }

  // Sekali saja: apa yang sebenarnya dicari pemilik di bawah sana? Selama
  // belum dijawab penambang tetap bekerja seperti biasa (memungut apa saja),
  // jadi pertanyaan yang tidak dijawab tidak pernah menghentikan pekerjaan.
  askMineTargets(entity, state, ownerId);

  // Beliung dulu, dan HARUS berurutan: kayu, batu, besi, emas, intan. Kalau
  // bahan tingkat berikutnya belum ada, dia meminta bahannya — bukan melompat
  // ke bahan tingkat yang lebih tinggi yang kebetulan tergeletak di peti.
  const held = getGear(entity).mainhand;
  const craft = craftStep(entity, state, "pickaxe", container, held);
  if (craft === "no-material") {
    requestTool(entity, state, ownerId, "pickaxe", held, station.chest ?? state.station);
    logInfo(TAG, `${entStr(entity)} belum punya beliung apa pun; mencari bahan kayu.`);
    const own = ensureMaterial(entity, state, ownerId, "wood",
                               station.chest ?? state.station, container, { search: true });
    writeState(entity, state);
    return own ?? "belum punya beliung kayu: minta kayu ke perajin & pencari barang";
  }
  if (craft === "no-table") {
    const own = ensureMaterial(entity, state, ownerId, "wood",
                               station.chest ?? state.station, container, { search: true });
    writeState(entity, state);
    return own ?? "butuh meja kerja (dan kayu untuk membuatnya)";
  }
  if (craft === "walking" || craft === "crafting") {
    writeState(entity, state);
    return "membuat beliung";
  }
  if (craft === "done") {
    writeState(entity, state);
    sayFrom(entity, "done");
    return `beliung baru selesai: ${getGear(entity).mainhand ?? "?"}`.replace("minecraft:", "");
  }

  if ((state.bag["minecraft:torch"] ?? 0) === 0) {
    const taken = takeTorches(container);
    if (taken) {
      logInfo(TAG, `Mengambil ${taken} obor dari peti stasiun.`);
      addToBag(state, "minecraft:torch", taken);
    } else if (countIn(container, ["minecraft:coal", "minecraft:charcoal"]) > 0) {
      // Obor pun dibuat sendiri dari arang + stik, bukan muncul dari udara.
      const made = craftItemStep(entity, state, "torch", container);
      if (made.status === "done") {
        logInfo(TAG, `${entStr(entity)} membuat ${made.amount} obor sendiri.`);
      } else if (made.status === "walking" || made.status === "crafting") {
        writeState(entity, state);
        return "membuat obor";
      }
    } else {
      // Obor cuma pelengkap: penambang tetap bisa menggali tanpa obor, jadi
      // yang dilakukan cukup memasang permintaan. Mencarikan arangnya sendiri
      // di sini berarti meninggalkan galian yang sedang dikerjakan.
      requestMaterial(entity, state, ownerId, "coal", station.chest ?? state.station);
    }
  }

  const plan = state.plan?.mine ?? freshPlan(entity);
  if (!state.plan) state.plan = {};
  state.plan.mine = plan;

  const currentBag = bagCount(state.bag);
  logDebug(TAG, `Kapasitas tas mining: ${currentBag}/${BAG_LIMIT} item.`);
  if (currentBag >= BAG_LIMIT || plan.phase === "haul") {
    logInfo(TAG, `Tas penuh (${currentBag}/${BAG_LIMIT}) atau mode haul. Pulang menyetor...`);
    const status = haul(entity, state, station);
    writeState(entity, state);
    return status;
  }

  const status = plan.phase === "descend"
    ? descend(entity, state, plan, held)
    : tunnel(entity, state, plan, held);
  writeState(entity, state);
  return status;
}

function takeTorches(container) {
  let n = 0;
  for (let i = 0; i < container.size && n < 16; i++) {
    const stack = container.getItem(i);
    if (stack?.typeId !== "minecraft:torch") continue;
    const take = Math.min(16 - n, stack.amount);
    n += take;
    if (stack.amount > take) {
      stack.amount -= take;
      container.setItem(i, stack);
    } else {
      container.setItem(i, undefined);
    }
  }
  return n;
}

function atFace(entity, target) {
  const d2 = dist2(entity.location, target);
  if (d2 <= REACH ** 2) return true;
  logDebug(TAG, `Menuju titik galian ${posStr(target)} (${Math.sqrt(d2).toFixed(1)}m > ${REACH}m)`);
  steer(entity, target);
  return false;
}

function descend(entity, state, plan, tool) {
  const dimension = entity.dimension;
  const [dx, dz] = DIRS[plan.dir];
  const floor = targetDepth(dimension.id, state.mineWants);

  if (plan.y <= floor) {
    plan.phase = "tunnel";
    plan.step = 0;
    logInfo(TAG, `Mencapai kedalaman target (${plan.y} <= ${floor}). Beralih ke fase terowongan utama!`);
    report(entity, `Sampai kedalaman ${plan.y}. Mulai terowongan.`);
    return "mulai terowongan utama";
  }

  const target = { x: plan.x + 0.5, y: plan.y, z: plan.z + 0.5 };
  if (!atFace(entity, target)) return "menuruni tangga";

  const nx = plan.x + dx;
  const nz = plan.z + dz;
  const ny = plan.y - 1;
  if (lavaNear(dimension, nx, ny, nz)) {
    plan.dir = (plan.dir + 1) % 4;
    logWarn(TAG, `Lava menghalangi tangga! Membelokkan arah ke ${plan.dir}`);
    report(entity, "Ada lava di depan. Aku belok.");
    return "menghindari lava";
  }
  // Sel kaki wajib bisa dibongkar; sel di atasnya boleh dilewati satu-satu.
  const foot = blockAt(dimension, nx, ny, nz);
  if (foot && !diggable(foot)) {
    plan.dir = (plan.dir + 1) % 4;
    logWarn(TAG, `Blok kaki ${foot.typeId} tidak bisa digali. Membelokkan tangga ke arah ${plan.dir}`);
    return "membelokkan tangga";
  }

  const result = digColumn(entity, state, dimension, nx, ny, nz, tool);
  if (result.status === "breaking") {
    return `menggali tangga turun (${Math.round(result.progress * 100)}%)`;
  }
  if (result.status === "broke") return "menggali tangga turun";
  if (result.status === "blocked") {
    plan.dir = (plan.dir + 1) % 4;
    logWarn(TAG, `Seluruh kolom tangga (${nx}, ${ny}, ${nz}) terhalang; arah dibelokkan.`);
    return "membelokkan tangga";
  }

  // Kolomnya benar-benar terbuka: baru sekarang langkahnya maju satu.
  floorUnder(dimension, nx, ny, nz);
  plan.x = nx;
  plan.z = nz;
  plan.y = ny;
  plan.step++;
  if (plan.step % TORCH_EVERY === 0) torchAt(entity, state, plan.x, plan.y, plan.z);
  return "menuruni tangga yang baru digali";
}

/**
 * Bijih di DINDING terowongan yang memang diminta pemilik.
 *
 * Dipisah supaya penambang menyimpang ke bijih SATU per satu dan tiap bijih
 * tetap harus dipukul sampai patah, bukan dipanen sekaligus dalam satu denyut
 * seperti versi lama.
 */
function oreBeside(dimension, state, x, y, z) {
  const offsets = [[0, -1, 0], [0, TUNNEL_HEIGHT, 0]];
  for (let dy = 0; dy < TUNNEL_HEIGHT; dy++) {
    offsets.push([1, dy, 0], [-1, dy, 0], [0, dy, 1], [0, dy, -1]);
  }
  for (const [ox, oy, oz] of offsets) {
    const near = blockAt(dimension, x + ox, y + oy, z + oz);
    const ore = near && ORES[near.typeId];
    if (ore && wanted(state, ore)) return near;
  }
  return undefined;
}

function tunnel(entity, state, plan, tool) {
  const dimension = entity.dimension;
  const main = DIRS[plan.dir];
  const side = DIRS[(plan.dir + (plan.branchSide > 0 ? 1 : 3)) % 4];
  const digging = plan.branchStep > 0;
  const [dx, dz] = digging ? side : main;

  const target = { x: plan.x + 0.5, y: plan.y, z: plan.z + 0.5 };
  if (!atFace(entity, target)) return digging ? "menuju cabang" : "menuju ujung terowongan";

  // Bijih di dinding lebih dulu: itu memang tujuan seluruh terowongan ini.
  const vein = oreBeside(dimension, state, plan.x, plan.y, plan.z);
  if (vein) {
    const hit = dig(entity, state, vein, tool);
    if (hit.status === "breaking") {
      return `mengejar bijih di dinding (${Math.round(hit.progress * 100)}%)`;
    }
    if (hit.status === "broke") return "memungut bijih dari dinding";
  }

  const nx = plan.x + dx;
  const nz = plan.z + dz;
  if (lavaNear(dimension, nx, plan.y, nz)) {
    if (digging) plan.branchStep = 0;
    else plan.dir = (plan.dir + 1) % 4;
    report(entity, "Lava. Aku tidak menembus situ.");
    return "menghindari lava";
  }
  const foot = blockAt(dimension, nx, plan.y, nz);
  if (foot && !diggable(foot)) {
    logWarn(TAG, `Blok kaki ${foot.typeId} di (${nx}, ${plan.y}, ${nz}) tidak boleh dibongkar.`);
    if (digging) plan.branchStep = 0;
    else plan.dir = (plan.dir + 1) % 4;
    return "membelokkan terowongan";
  }

  const result = digColumn(entity, state, dimension, nx, plan.y, nz, tool);
  if (result.status === "breaking") {
    return digging
      ? `menggali cabang (${Math.round(result.progress * 100)}%)`
      : `menggali terowongan utama (${Math.round(result.progress * 100)}%)`;
  }
  if (result.status === "broke") return digging ? "menggali cabang" : "menggali terowongan utama";
  if (result.status === "blocked") {
    logWarn(TAG, `Seluruh kolom (${nx}, ${plan.y}, ${nz}) terhalang; terowongan dibelokkan.`);
    if (digging) plan.branchStep = 0;
    else plan.dir = (plan.dir + 1) % 4;
    return "membelokkan terowongan";
  }

  floorUnder(dimension, nx, plan.y, nz);
  plan.x = nx;
  plan.z = nz;
  if (digging) {
    plan.branchStep--;
    if (plan.branchStep <= 0) {
      plan.x -= side[0] * BRANCH_LENGTH;
      plan.z -= side[1] * BRANCH_LENGTH;
      plan.branchSide = -plan.branchSide;
      logInfo(TAG, "Cabang selesai. Kembali ke sumbu terowongan utama.");
    }
    return "menggali cabang";
  }
  plan.step++;
  if (plan.step % TORCH_EVERY === 0) torchAt(entity, state, plan.x, plan.y, plan.z);
  if (plan.step % BRANCH_EVERY === 0) {
    plan.branchStep = BRANCH_LENGTH;
    logInfo(TAG, `Mulai menggali cabang baru sepanjang ${BRANCH_LENGTH} blok.`);
    return "menggali cabang";
  }
  return "menggali terowongan utama";
}

function haul(entity, state, station) {
  const plan = state.plan.mine;
  plan.phase = "haul";
  if (!station?.chest) {
    // Petinya belum berdiri: hasil tambang tetap di kantong pribadi, dan
    // begitu peti jadi (ensureStation) isinya otomatis dipindahkan.
    logDebug(TAG, `${entStr(entity)} belum punya peti; hasil tambang disimpan di kantong.`);
    plan.phase = plan.y <= targetDepth(entity.dimension.id, state.mineWants) ? "tunnel" : "descend";
    return "kantong penuh, menunggu peti berdiri";
  }
  const chest = station.chest;
  const target = { x: chest.x + 0.5, y: chest.y, z: chest.z + 0.5 };
  const d2 = dist2(entity.location, target);

  if (d2 > 3.2 ** 2) {
    logDebug(TAG, `Berjalan pulang menyetor ke peti (${Math.sqrt(d2).toFixed(1)}m > 3.2m)...`);
    steer(entity, target, 0.42);
    return "pulang membawa hasil tambang";
  }

  let moved = 0;
  for (const [id, amount] of Object.entries(state.bag)) {
    let left = amount;
    while (left > 0) {
      const take = Math.min(64, left);
      const item = makeItem(id, take);
      if (!item) break;
      putIn(station.container, item, entity.dimension, target);
      left -= take;
      moved += take;
    }
    delete state.bag[id];
  }
  face(entity, target);
  sound(entity.dimension, "random.chestopen", target);
  plan.phase = plan.y <= targetDepth(entity.dimension.id, state.mineWants) ? "tunnel" : "descend";
  logInfo(TAG, `Menyetor ${moved} barang ke peti stasiun. Kembali ke fase: ${plan.phase}`);
  if (moved) report(entity, `${moved} barang kusetor ke peti.`);
  return "menyetor hasil tambang";
}