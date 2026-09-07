/**
 * Pathfinding sungguhan: A* tiga dimensi di atas blok dunia.
 *
 * Yang digantikan berkas ini adalah langkah RAKUS di util.js: "maju sedikit ke
 * arah tujuan; kalau mentok, coba sumbu X saja; kalau masih mentok, coba sumbu
 * Z saja." Langkah rakus tidak punya ingatan dan tidak punya rencana, jadi
 * bentuk medan yang paling biasa pun mengalahkannya:
 *
 *   - pagar ladang buatan companion sendiri: dia berdiri mendorong tiang
 *   - tebing setinggi empat blok: dia menempel di dindingnya sampai menyerah
 *   - danau: dia berjalan lurus masuk ke tengahnya
 *   - lubang tambang: dia jatuh, lalu tidak pernah bisa naik lagi
 *
 * Semua itu satu gejala yang sama — "companion mentok" — dan tidak satu pun
 * bisa diperbaiki dengan menambah kasus khusus di langkah rakus, karena yang
 * kurang adalah RENCANA. A* punya rencana: seluruh jalur dihitung dulu sampai
 * ke tujuan, baru dijalani.
 *
 * Bentuknya:
 *
 *   findPath(dimension, from, to, opts)  -> larik titik, atau undefined
 *   follow(entity, to, opts)             -> satu langkah per denyut; ini yang
 *                                           dipakai seluruh mode kerja
 *   pathBlocked(entity)                  -> jalurnya memang tidak ada
 *   forget(id)                            -> lupakan jalur yang tersimpan
 *
 * Jalur DISIMPAN per companion dan dijalani langkah demi langkah. Menghitung
 * ulang tiap denyut akan sama mahalnya dengan tidak punya rencana sama sekali;
 * yang dihitung ulang cuma kalau tujuannya berpindah jauh, kalau jalurnya
 * ternyata terhalang blok baru, atau kalau umurnya sudah lewat.
 */

import { system } from "@minecraft/server";

import { PATH } from "./config.js";
import {
  blockAt, canOccupy, clearWay, dist2, isFooting, isStandable, isWaterBlock,
  stepDirect, yawTo,
} from "./util.js";
import { entStr, logDebug, logInfo, logWarn, posStr } from "./logger.js";

const TAG = "PATH";

/* ------------------------------------------------------------------ *
 * Peta langkah: apa yang boleh dipijak, dan berapa mahal
 * ------------------------------------------------------------------ */

// Delapan arah. Diagonal dibiarkan supaya jalurnya tidak terlihat seperti
// tangga kotak-kotak, tapi diberi biaya akar dua yang jujur — kalau tidak,
// A* akan memilih dua langkah diagonal di atas satu langkah lurus.
const STEPS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: 1.4142 },
  { dx: 1, dz: -1, cost: 1.4142 },
  { dx: -1, dz: 1, cost: 1.4142 },
  { dx: -1, dz: -1, cost: 1.4142 },
];

// Beda tinggi yang boleh ditempuh satu langkah, diurutkan dari yang paling
// kecil. Yang basah boleh naik lebih tinggi: itu berenang, bukan memanjat.
const WALK_STEPS = [0, -1, 1, -2, -3, 2];
const SWIM_STEPS = [0, -1, 1, 2, 3, -2, -3];

function key(x, y, z) {
  return `${x},${y},${z}`;
}

/**
 * Satu petak bisa ditempati badan companion (tinggi dua blok) dan lantainya
 * menopang? Balikan biaya tambahannya, atau undefined kalau memang tidak bisa.
 *
 * Biaya tambahan itulah yang membuat jalurnya masuk akal, bukan sekadar
 * pendek: air lebih mahal daripada tanah, jadi companion memutari kolam kecil
 * alih-alih menyeberanginya — tapi tetap MAU menyeberang kalau memutarinya
 * berarti berjalan jauh lebih jauh. Itu keputusan yang sama dengan yang
 * diambil manusia, dan tidak bisa ditiru oleh aturan "hindari air" yang kaku.
 */
/**
 * Ingatan satu pencarian.
 *
 * Tanpa ini, satu pencarian A* membaca blok yang sama berkali-kali: tiap petak
 * diperiksa dari delapan tetangganya, dan tiap pemeriksaan membaca tiga blok.
 * Sembilan ratus simpul berarti seratus ribu pembacaan `getBlock` — cukup
 * untuk terasa sebagai lag di dunia yang sedang berjalan. Dengan cache, tiap
 * petak dibaca tepat sekali.
 */
let cache;

function costAt(dimension, x, y, z, opts) {
  const k = key(x, y, z);
  if (cache) {
    const hit = cache.get(k);
    if (hit !== undefined) return hit === -1 ? undefined : hit;
  }
  const value = readCost(dimension, x, y, z, opts);
  if (cache) cache.set(k, value === undefined ? -1 : value);
  return value;
}

function readCost(dimension, x, y, z, opts) {
  const feet = blockAt(dimension, x, y, z);
  const head = blockAt(dimension, x, y + 1, z);
  const floor = blockAt(dimension, x, y - 1, z);
  if (!feet || !head || !floor) return undefined;   // chunk belum dimuat
  if (!canOccupy(feet) || !canOccupy(head)) return undefined;
  if (!isStandable(floor)) return undefined;

  let cost = 0;
  if (isWaterBlock(floor) || isWaterBlock(feet)) {
    if (opts.avoidWater === false) return 0;
    cost += PATH.waterCost;
  }
  // Blok berbahaya: lava, api, kaktus, salju bubuk. Bukan dilarang keras —
  // diberi biaya sangat besar, jadi A* memilihnya HANYA kalau memang tidak
  // ada jalan lain sama sekali, dan mode kerja yang memanggil bisa membaca
  // panjang jalurnya lalu memutuskan untuk tidak pergi.
  if (PATH.hazards.has(floor.typeId) || PATH.hazards.has(feet.typeId)) {
    cost += PATH.hazardCost;
  }
  return cost;
}

function stepCost(dimension, x, y, z, opts) {
  return costAt(dimension, x, y, z, opts);
}

/** Titik ini boleh jadi awal atau akhir jalur? */
export function walkable(dimension, x, y, z, opts = {}) {
  return stepCost(dimension, x, y, z, opts) !== undefined;
}

/**
 * Petak berpijak terdekat pada satu kolom.
 *
 * Tujuan yang diberikan mode kerja hampir tidak pernah tepat berdiri di petak
 * yang bisa dipijak — "peti di (10, 65, 10)" itu blok petinya sendiri, dan
 * yang dimaksud adalah berdiri DI SEBELAHNYA. Fungsi ini yang menerjemahkan.
 */
function settle(dimension, x, y, z, opts) {
  for (const dy of [0, 1, -1, 2, -2, 3, -3]) {
    if (walkable(dimension, x, y + dy, z, opts)) return { x, y: y + dy, z };
  }
  return undefined;
}

/**
 * Petak berpijak terdekat di sekitar satu titik — dipakai untuk tujuan.
 *
 * Cincinnya dilebarkan sampai `PATH.goalRadius`, bukan cuma delapan tetangga.
 * Tujuan yang diberikan mode kerja sering berada di tempat yang memang tidak
 * bisa dipijak siapa pun: di dalam blok yang mau dibongkar, di tengah parit
 * yang baru digali, di atas peti. Dengan satu cincin saja, kolam kecil atau
 * dinding satu blok di sekelilingnya sudah cukup untuk membuat seluruh
 * perjalanan dinyatakan mustahil.
 */
function nearGoal(dimension, goal, opts) {
  const direct = settle(dimension, goal.x, goal.y, goal.z, opts);
  if (direct) return direct;
  const radius = opts.goalRadius ?? PATH.goalRadius;
  let best;
  let bestD = Infinity;
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const spot = settle(dimension, goal.x + dx, goal.y, goal.z + dz, opts);
        if (!spot) continue;
        const d = dx * dx + dz * dz + (spot.y - goal.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = spot;
        }
      }
    }
    if (best) return best;
  }
  logDebug(TAG, `Tidak ada petak berpijak di sekitar ${posStr(goal)}.`);
  return undefined;
}

/* ------------------------------------------------------------------ *
 * A*
 * ------------------------------------------------------------------ */

/**
 * Antrean prioritas biner. Larik yang di-sort ulang tiap dorong pernah dicoba
 * dan itu yang membuat pencarian seribu simpul terasa di dunia: sort O(n log n)
 * dikali seribu dorongan. Heap-nya delapan belas baris dan menghapus seluruh
 * masalah itu.
 */
class Heap {
  constructor() {
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Jarak Chebyshev berbobot: tepat untuk gerak delapan arah, dan TIDAK pernah
// melebih-lebihkan jarak sesungguhnya — syarat supaya A* tetap menemukan jalur
// terpendek dan tidak mengembara.
function heuristic(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  const dy = Math.abs(a.y - b.y);
  return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) + dy * 0.5;
}

/**
 * Jalur dari `from` ke `to`, atau undefined kalau memang tidak ada.
 *
 * `opts.budget` membatasi berapa simpul yang boleh diperiksa. Itu bukan
 * pengaman kinerja yang malu-malu: dunia Minecraft tidak berhingga, dan tujuan
 * di seberang gunung tanpa jalan akan membuat A* memeriksa seluruh lereng
 * sebelum menyerah. Batas ini yang membuat "tidak ada jalan" jadi jawaban yang
 * datang dalam satu denyut, bukan dalam satu detik penuh yang terasa.
 */
/**
 * Jalan lurus yang benar-benar bisa dilalui? Kalau ya, itu jawabannya.
 *
 * Ini bukan pengoptimalan yang malu-malu: sebagian besar perjalanan companion
 * adalah beberapa blok di ladang terbuka, dan menjalankan A* penuh untuk itu
 * sama saja dengan menggambar peta kota untuk menyeberang halaman. Uji lurus
 * ini paling belasan pembacaan blok, dan menangkap kasus yang paling sering.
 */
function straightRun(dimension, start, goal, opts) {
  const dx = goal.x - start.x;
  const dz = goal.z - start.z;
  const span = Math.max(Math.abs(dx), Math.abs(dz));
  if (span === 0 || span > PATH.straightMax) return undefined;

  const out = [start];
  let y = start.y;
  for (let i = 1; i <= span; i++) {
    const x = Math.round(start.x + (dx * i) / span);
    const z = Math.round(start.z + (dz * i) / span);
    let landed;
    for (const dy of [0, -1, 1]) {
      if (costAt(dimension, x, y + dy, z, opts) !== undefined) {
        landed = y + dy;
        break;
      }
    }
    if (landed === undefined) return undefined;
    y = landed;
    out.push({ x, y, z });
  }
  if (out[out.length - 1].y !== goal.y) return undefined;
  return out;
}

export function findPath(dimension, from, to, opts = {}) {
  const budget = opts.budget ?? PATH.budget;
  const maxRange = opts.range ?? PATH.range;
  cache = new Map();
  try {
    return search(dimension, from, to, opts, budget, maxRange);
  } finally {
    cache = undefined;
  }
}

function search(dimension, from, to, opts, budget, maxRange) {
  const start = settle(dimension, Math.floor(from.x), Math.floor(from.y), Math.floor(from.z), opts);
  const goal = nearGoal(dimension, {
    x: Math.floor(to.x), y: Math.floor(to.y), z: Math.floor(to.z),
  }, opts);
  if (!start || !goal) {
    logDebug(TAG, `findPath batal: awal=${Boolean(start)} tujuan=${Boolean(goal)}`);
    return undefined;
  }
  if (start.x === goal.x && start.y === goal.y && start.z === goal.z) return [goal];

  const straight = straightRun(dimension, start, goal, opts);
  if (straight) {
    logDebug(TAG, `Jalur lurus cukup: ${straight.length} petak.`);
    return straight;
  }

  const open = new Heap();
  const seen = new Map();
  const startKey = key(start.x, start.y, start.z);
  seen.set(startKey, { g: 0, from: undefined, node: start });
  open.push({ f: heuristic(start, goal), k: startKey, node: start });

  let looked = 0;
  // Simpul terdekat ke tujuan yang pernah dilihat. Kalau jalur penuhnya tidak
  // ada, berjalan SEDEKAT MUNGKIN jauh lebih berguna daripada tidak bergerak
  // sama sekali — companion yang berhenti di tepi jurang yang salah tetap
  // terlihat sedang berusaha, dan denyut berikutnya mencoba lagi dari situ.
  let best = { k: startKey, h: heuristic(start, goal) };

  while (open.size && looked < budget) {
    const cur = open.pop();
    const row = seen.get(cur.k);
    if (!row || cur.f - heuristic(row.node, goal) > row.g + 1e-6) continue;
    looked++;

    const here = row.node;
    if (here.x === goal.x && here.y === goal.y && here.z === goal.z) {
      logDebug(TAG, `Jalur ketemu: ${looked} simpul diperiksa.`);
      return rebuild(seen, cur.k);
    }
    const h = heuristic(here, goal);
    if (h < best.h) best = { k: cur.k, h };

    for (const step of STEPS) {
      const nx = here.x + step.dx;
      const nz = here.z + step.dz;
      if (Math.abs(nx - start.x) > maxRange || Math.abs(nz - start.z) > maxRange) continue;

      // Naik-turun diperiksa dari beda tinggi TERKECIL: datar dulu, lalu turun
      // satu, lalu naik satu. Kalau naik didahulukan, penambang memanjat keluar
      // dari tangganya sendiri tiap langkah.
      //
      // Dari DALAM AIR pilihannya lebih tinggi, karena di dalam air memang bisa
      // berenang naik. Tanpa itu, companion yang sudah terlanjur berada di dasar
      // danau tidak punya satu pun langkah sah menuju tepian yang tiga blok di
      // atas kepalanya: pathfinding melaporkan "tidak ada jalur" dan dia
      // benar-benar terkurung di dasar danau sampai ada yang menariknya.
      const wet = isWaterBlock(blockAt(dimension, here.x, here.y, here.z));
      for (const dy of (wet ? SWIM_STEPS : WALK_STEPS)) {
        const ny = here.y + dy;
        const extra = stepCost(dimension, nx, ny, nz, opts);
        if (extra === undefined) continue;
        // Langkah diagonal tidak boleh menembus sudut dua dinding.
        if (step.dx && step.dz) {
          if (stepCost(dimension, nx, ny, here.z, opts) === undefined &&
              stepCost(dimension, here.x, ny, nz, opts) === undefined) continue;
        }
        // Memanjat butuh ruang DI ATAS kepala di petak asal. Tanpa uji ini
        // jalur bisa memanjat lewat langit-langit gua atau lewat lantai rumah,
        // dan companion menabrak plafon tiap langkah sampai dianggap mentok.
        if (dy > 0 && !headroom(dimension, here, dy)) continue;
        // Naik lebih dari satu blok cuma boleh kalau memang ada yang dipanjat;
        // turun jauh diberi biaya, karena jatuh itu murah tapi naik lagi tidak.
        const climb = dy > 1 ? PATH.climbCost * (dy - 1) : 0;
        const drop = dy < -1 ? PATH.dropCost * (-dy - 1) : 0;

        const nk = key(nx, ny, nz);
        const g = row.g + step.cost + extra + climb + drop;
        const known = seen.get(nk);
        if (known && known.g <= g + 1e-6) continue;
        const node = { x: nx, y: ny, z: nz };
        seen.set(nk, { g, from: cur.k, node });
        open.push({ f: g + heuristic(node, goal), k: nk, node });
        break;   // satu ketinggian per petak sudah cukup
      }
    }
  }

  if (best.k === startKey) {
    logDebug(TAG, `Tidak ada jalur ke ${posStr(goal)} (${looked} simpul diperiksa).`);
    return undefined;
  }
  // Jalur yang PALING MENDEKAT, bukan jalur ke tujuan. Berguna kalau ujungnya
  // memang tinggal beberapa blok dari tujuan — companion berjalan sampai ke
  // tepi tembok, lalu pemanggilnya memutuskan sendiri. Kalau ujungnya masih
  // jauh, jalur itu bukan jawaban melainkan jebakan: companion menyusuri kaki
  // tebing berpuluh blok mencari tanjakan yang tidak ada, sepanjang jalan
  // terlihat "sedang berjalan", dan tidak pernah dianggap gagal karena dia
  // memang bergerak terus.
  const near = seen.get(best.k).node;
  const gap = Math.max(Math.abs(near.x - goal.x), Math.abs(near.z - goal.z)) +
    Math.abs(near.y - goal.y);
  if (gap > (opts.partialMax ?? PATH.partialMax)) {
    logDebug(TAG, `Tidak ada jalur ke ${posStr(goal)}; yang terdekat pun ${gap} blok meleset.`);
    return undefined;
  }
  logDebug(TAG, `Jalur penuh tidak ada; dipakai yang paling mendekat (${looked} simpul).`);
  const out = rebuild(seen, best.k);
  out.partial = true;
  return out;
}

/** Ruang kosong di atas kepala di petak asal, syarat memanjat setinggi `dy`. */
function headroom(dimension, here, dy) {
  for (let h = 2; h <= dy + 1; h++) {
    if (!canOccupy(blockAt(dimension, here.x, here.y + h, here.z))) return false;
  }
  return true;
}

function rebuild(seen, endKey) {
  const out = [];
  let k = endKey;
  while (k !== undefined) {
    const row = seen.get(k);
    if (!row) break;
    out.push(row.node);
    k = row.from;
  }
  out.reverse();
  return out;
}

/* ------------------------------------------------------------------ *
 * Menjalani jalur
 * ------------------------------------------------------------------ */

const trips = new Map();   // entityId -> lihat newTrip()

export function forget(id) {
  if (trips.delete(id)) logDebug(TAG, `forget jalur untuk ID: ${id}`);
}

/**
 * Jalur ke tujuan terakhir memang tidak ada? Mode kerja membaca ini.
 *
 * "Tidak ada" berarti salah satu dari tiga hal, dan ketiganya baru bisa
 * dijawab sesudah dicoba: pencarian tidak menemukan jalur sama sekali; jalur
 * yang ada habis di tempat yang bukan tujuan (tujuannya melayang di udara);
 * atau companion berkali-kali tidak bergerak sedikit pun padahal jalurnya sah.
 */
export function pathBlocked(entity) {
  return Boolean(trips.get(entity?.id)?.failed);
}

/** Sisa langkah menuju tujuan, untuk laporan "masih 12 blok lagi". */
export function stepsLeft(entity) {
  const trip = trips.get(entity?.id);
  if (!trip || !trip.path) return 0;
  return Math.max(0, trip.path.length - trip.at);
}

function samePlace(a, b) {
  return a && b && Math.floor(a.x) === Math.floor(b.x) &&
    Math.floor(a.y) === Math.floor(b.y) && Math.floor(a.z) === Math.floor(b.z);
}

function newTrip(now, to, path, tries) {
  return {
    path, at: 0, lastAt: 0, goal: { x: to.x, y: to.y, z: to.z },
    madeAt: now, stuckSince: now, atSince: now, tries,
    failed: false, failedAt: 0,
  };
}

function giveUp(entity, trip, now, why) {
  if (trip.failed) return;
  trip.failed = true;
  trip.failedAt = now;
  logDebug(TAG, `${entStr(entity)} menyerah menuju ${posStr(trip.goal)}: ${why}.`);
}

/**
 * Satu langkah menuju `to`, dipanggil tiap denyut. Balikan true begitu sampai.
 *
 * Ini satu-satunya cara mode kerja menyuruh companion berjalan. Jalurnya
 * dihitung sekali, disimpan, dan dijalani; yang dihitung ulang cuma kalau
 * tujuannya berpindah, jalurnya terhalang, atau umurnya habis.
 *
 * Yang baru: perjalanan bisa MENYERAH, dan mode kerja bisa membacanya lewat
 * pathBlocked(). Sebelum ini tidak ada satu pun jalan keluar dari tujuan yang
 * mustahil. Kalau tujuannya melayang di udara — dan mode kerja memang sering
 * memberi tujuan begitu: blok daun yang mau dibongkar, batang pohon setinggi
 * lima meter — A* mengembalikan "jalur yang paling mendekat", jalur itu habis
 * di bawah tujuannya, dan denyut berikutnya menghitung ulang jalur yang sama
 * persis. Selamanya. Dari luar: companion berdiri diam melaporkan dirinya
 * sedang berjalan, dan catatan kejadian penuh "tidak maju 60 tick".
 */
export function follow(entity, to, opts = {}) {
  if (!entity || !to) return false;
  const dimension = entity.dimension;
  const now = system.currentTick;
  const reach = opts.reach ?? PATH.reach;

  if (dist2(entity.location, to) <= reach * reach) {
    trips.delete(entity.id);
    return true;
  }

  let trip = trips.get(entity.id);
  if (trip && !samePlace(trip.goal, to)) {
    trips.delete(entity.id);
    trip = undefined;
  }

  // Tujuan yang sudah dinyatakan mustahil tidak dicari ulang tiap denyut: itu
  // satu pencarian A* penuh, dua kali sedetik, untuk jawaban yang sudah
  // diketahui. Sesudah jeda dicoba sekali lagi — dunia memang bisa berubah.
  if (trip?.failed) {
    if (now - trip.failedAt < PATH.retryBlocked) {
      stepDirect(entity, to, opts.step ?? PATH.step, opts);
      return dist2(entity.location, to) <= reach * reach;
    }
    trips.delete(entity.id);
    trip = undefined;
  }

  // "Habis" berarti kaki companion BENAR-BENAR sudah berada di petak terakhir
  // jalur, bukan sekadar sedang menuju ke sana. Diuji dengan kursor saja,
  // seluruh pendekatan terakhir dihitung ulang tiap denyut — dan tiap
  // perjalanan yang normal berakhir dinyatakan mustahil.
  const last = trip?.path?.[trip.path.length - 1];
  const arrived = Boolean(last) && trip.at >= trip.path.length - 1 &&
    reachedCell(entity.location, last);

  // Dan "habis" juga berarti KURSORNYA TIDAK MAJU-MAJU, walaupun kakinya
  // bergerak terus.
  //
  // Ini yang paling sering terjadi di medan bertingkat, dan yang paling lama
  // tidak terlihat: petak terakhir jalur berada di atas teras setinggi tiga
  // blok, companion berdiri tepat di bawahnya, dan reachedCell menolak
  // menyebutnya "sampai" karena bedanya tiga blok tegak. Kursornya berhenti di
  // petak itu selamanya; jalurnya tidak pernah dinyatakan habis; perjalanannya
  // tidak pernah dinyatakan gagal. Yang terlihat pemain: companion bergoyang
  // maju-mundur setengah blok di kaki tebing, jam demi jam.
  const stalled = Boolean(trip?.path) &&
    now - (trip.atSince ?? trip.madeAt) > PATH.cursorStall;
  const spent = arrived || stalled;
  const stale = !trip || spent || !trip.path || now - trip.madeAt > PATH.replanEvery;

  if (stale) {
    // Jalur yang HABIS tanpa sampai tujuan itu bukti, bukan kebetulan: jalur
    // terbaik yang bisa ditemukan berakhir di tempat lain. Dihitung sebagai
    // percobaan, dan sesudah beberapa kali perjalanannya dinyatakan mustahil.
    // Jalur yang sejak awal cuma "paling mendekat" sudah menjawab pertanyaannya
    // begitu dijalani sekali: tujuannya memang tidak bisa dicapai. Tidak ada
    // gunanya mengulanginya tiga kali.
    const tries = spent
      ? (trip.tries ?? 0) + (trip.path.partial ? PATH.giveUpAfter : 1)
      : (trip?.tries ?? 0);
    const path = findPath(dimension, entity.location, to, opts);
    trip = newTrip(now, to, path, tries);
    trips.set(entity.id, trip);
    if (!path) {
      giveUp(entity, trip, now, "tidak ada jalur sama sekali");
      // Tidak ada jalur bukan alasan untuk membeku: satu langkah lurus tetap
      // dicoba, dan itu sering cukup untuk keluar dari sudut yang membuat
      // pencarian gagal sejak awal.
      stepDirect(entity, to, opts.step ?? PATH.step, opts);
      return false;
    }
    if (tries >= PATH.giveUpAfter) {
      giveUp(entity, trip, now, `${tries} jalur berturut-turut habis sebelum sampai`);
      return false;
    }
    logDebug(TAG, `${entStr(entity)} punya jalur baru: ${path.length} petak ke ${posStr(to)}.`);
  }

  const path = trip.path;
  // Petak yang sudah dilewati dibuang.
  //
  // Yang diperiksa jarak MENDATAR, bukan jarak tiga dimensi. Sempat sebaliknya,
  // dan itu mengunci seluruh jalur di petak pertama: begitu petak berikutnya
  // dua blok lebih tinggi, jarak tiga dimensinya tidak pernah turun di bawah
  // ambang, kursor tidak pernah maju, dan langkah kaki menganggap dirinya
  // "sudah sampai" karena mendatar memang sudah dekat. Companion berdiri di
  // bawah tanjakan selamanya sambil melaporkan dirinya sedang berjalan.
  while (trip.at < path.length - 1 && reachedCell(entity.location, path[trip.at])) {
    trip.at++;
  }
  if (trip.at !== trip.lastAt) {
    trip.lastAt = trip.at;
    trip.atSince = now;
  }

  const target = center(path[trip.at]);
  const before = entity.location;
  stepDirect(entity, target, opts.step ?? PATH.step, opts);
  const moved = dist2(before, entity.location) > 0.004;

  if (moved) {
    trip.stuckSince = now;
  } else if (now - trip.stuckSince > PATH.stuckTicks) {
    // Mentok di tengah jalur yang tadinya sah: biasanya blok baru dipasang,
    // atau daun tumbuh. Sibakkan yang bisa disibakkan, lalu rencanakan ulang.
    const feet = blockAt(dimension, target.x, target.y, target.z);
    const head = blockAt(dimension, target.x, target.y + 1, target.z);
    if (!clearWay(entity, feet) && !clearWay(entity, head)) {
      const tries = (trip.tries ?? 0) + 1;
      logDebug(TAG, `${entStr(entity)} mentok di ${posStr(target)}; jalur dihitung ulang.`);
      if (tries >= PATH.giveUpAfter) {
        trip.tries = tries;
        giveUp(entity, trip, now, `mentok ${tries} kali di jalur yang sah`);
        return false;
      }
      const again = newTrip(now, to, undefined, tries);
      trips.set(entity.id, again);
    }
    trip.stuckSince = now;
  }
  return dist2(entity.location, to) <= reach * reach;
}

function center(cell) {
  return { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
}

/**
 * Kaki companion sudah berada di petak ini?
 *
 * Mendatar diuji ketat (setengah petak), tegak longgar (sampai dua setengah
 * blok): petak jalur berikutnya memang boleh berada di atas atau di bawah, dan
 * yang harus benar adalah "aku sudah di kolom ini", bukan "aku sudah di
 * ketinggian ini".
 */
function reachedCell(at, cell) {
  return Math.abs(at.x - (cell.x + 0.5)) < 0.75 &&
    Math.abs(at.z - (cell.z + 0.5)) < 0.75 &&
    Math.abs(at.y - cell.y) < 2.5;
}

/**
 * Jalur yang sudah dihitung, sebagai daftar titik — dipakai Pembangun untuk
 * memasang jalan setapak persis di tempat companion memang berjalan, bukan di
 * garis lurus yang tidak pernah dilewati siapa pun.
 */
export function routeBetween(dimension, from, to, opts = {}) {
  const path = findPath(dimension, from, to, { ...opts, budget: opts.budget ?? PATH.budget * 2 });
  if (!path) {
    logInfo(TAG, `routeBetween: tidak ada jalur ${posStr(from)} -> ${posStr(to)}.`);
    return undefined;
  }
  return path;
}

/** Titik aman terdekat dari sebuah titik sembarang; undefined kalau tidak ada. */
export function standableNear(dimension, at, radius = 6, opts = {}) {
  const bx = Math.floor(at.x);
  const by = Math.floor(at.y);
  const bz = Math.floor(at.z);
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (r && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const spot = settle(dimension, bx + dx, by, bz + dz, opts);
        if (spot) return spot;
      }
    }
  }
  logWarn(TAG, `Tidak ada petak berpijak dalam ${radius} blok dari ${posStr(at)}.`);
  return undefined;
}

/** Lantai padat yang menopang di bawah satu titik — dipakai jalan & lampu. */
export function groundUnder(dimension, x, z, from, span = 8) {
  for (let y = from + span; y >= from - span; y--) {
    const here = blockAt(dimension, x, y, z);
    const below = blockAt(dimension, x, y - 1, z);
    if (!here || !below) continue;
    if (canOccupy(here) && isFooting(below)) return y - 1;
  }
  return undefined;
}

export { yawTo };
