// Simulasi otak companion di luar Minecraft.
import { system, world, __harness, __setPlayers, __setDimension } from "@minecraft/server";
import { makeWorld, makeContainer, makeCompanion, makePlayer } from "./world.mjs";
import { LOG_CONFIG, LogLevel, logStats } from "./scripts/logger.js";
import { readState, writeState, patchState } from "./scripts/state.js";
import { setClaim } from "./scripts/state.js";
import { tickFarm, plotOf, workArea } from "./scripts/farming.js";
import { tickMine } from "./scripts/mining.js";
import { tickCrafter } from "./scripts/crafter.js";
import { tickLooter } from "./scripts/looter.js";
import { tickEnergy } from "./scripts/energy.js";
import { readRequests } from "./scripts/requests.js";
import { getGear, getMode, setMode } from "./scripts/util.js";
import { BLUEPRINTS, tickBuild } from "./scripts/builder.js";
import { relativeSteps } from "./scripts/blueprints.js";
import { DATA_BLUEPRINTS } from "./scripts/blueprints.data.js";
import { linesFor, TOPICS, dialogueStats } from "./scripts/lines.js";
import { ensureBook, hasBook, isBook, makeBook } from "./scripts/book.js";
import { betaSummary, hasBeta, betaLines, setBetaHandlers } from "./scripts/beta.js";
import { orderMode } from "./scripts/usertalk.js";
import { writeSettings } from "./scripts/state.js";
import { offerFlower, tickTaming, isTamed, heldFlower } from "./scripts/taming.js";
import { hasHelper, gatherOwn } from "./scripts/selfhelp.js";
import { findMaterial, forget as forgetGather } from "./scripts/gather.js";
import { pickSmelt } from "./scripts/smelting.js";
import {
  chunkMap, nearestClaimHint, toggleClaimAt, claimsNear,
} from "./scripts/claim.js";
import { askOwner, pendingAsks, answerAsk, answerLatestYesNo } from "./scripts/ask.js";
import { openBook } from "./scripts/bookui.js";
import { getActivity, setActivity } from "./scripts/activity.js";
import { summarize, setGear, makeItem, stopWalking } from "./scripts/util.js";
import { bagCount } from "./scripts/bag.js";

LOG_CONFIG.minLevel = LogLevel.WARN;   // simulasi: cuma tampilkan yang penting

let failures = 0;
function check(ok, what, detail = "") {
  console.log(`${ok ? "  PASS" : "  GAGAL"}  ${what}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

function advance(n = 1) { system.currentTick += n; }

/* ---------------- Uji 1: petani meratakan, mengairi, mencangkul ------------ */
console.log("\n== Uji petani: ratakan -> parit -> cangkul -> tanam ==");
{
  const W = makeWorld({ groundY: 64, jagged: true });
  // Sungai kecil di sebelah ladang, sumber air untuk mengisi ember.
  for (let z = 0; z < 16; z++) for (let x = -6; x < -3; x++) W.put(x, 64, z, "minecraft:water");

  const farmer = makeCompanion(W.dimension, "vbs:kohane", { x: 8, y: 65, z: 8 });
  farmer.setDynamicProperty("vbs:owner", "P1");
  farmer.setDynamicProperty("vbs:owner_name", "Pemain");
  farmer.setDynamicProperty("vbs:mode", "farm");
  setClaim("minecraft:overworld", 0, 0, { by: "P1", name: "Pemain", worked: false, kind: "farm", y: 64 });

  // Peti stasiun sudah berisi bahan; petani tinggal bekerja.
  W.put(10, 65, 10, "minecraft:chest");
  patchState(farmer, { station: { x: 10, y: 65, z: 10 } });
  const chest = W.dimension.getBlock({ x: 10, y: 65, z: 10 }).getComponent("minecraft:inventory").container;
  chest.fill("minecraft:oak_planks", 64);
  chest.fill("minecraft:stick", 32);
  chest.fill("minecraft:iron_ingot", 6);
  chest.fill("minecraft:dirt", 64);
  chest.fill("minecraft:wheat_seeds", 64);
  chest.fill("minecraft:carrot", 64);

  const phases = new Set();
  let status = "";
  for (let i = 0; i < 45000; i++) {
    const state = readState(farmer);
    status = tickFarm(farmer, state, undefined);
    writeState(farmer, state);
    phases.add(state.plan?.farm?.phase);
    advance(10);
  }

  const st = readState(farmer);
  const hand = getGear(farmer).mainhand;
  check(Boolean(hand && hand.includes("hoe")), "petani menempa cangkul sendiri", String(hand));
  check(hand === "minecraft:wooden_hoe", "cangkul PERTAMA harus kayu, bukan langsung besi", String(hand));
  check(phases.has("level"), "melewati fase meratakan lahan", [...phases].join(" -> "));
  check(phases.has("water"), "melewati fase menggali & mengairi parit");

  // Berapa banyak air yang benar-benar dituang di kolom parit?
  let water = 0;
  let farmland = 0;
  let dryFarmland = 0;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const id = W.dimension.getBlock({ x, y: 64, z }).typeId;
      if (id === "minecraft:water") water++;
      if (id !== "minecraft:farmland") continue;
      farmland++;
      // Air terdekat harus dalam 4 blok mendatar — syarat farmland tetap basah.
      let wet = false;
      for (let dx = -4; dx <= 4 && !wet; dx++) {
        for (let dz = -4; dz <= 4 && !wet; dz++) {
          for (const dy of [0, 1]) {
            const b = W.dimension.getBlock({ x: x + dx, y: 64 + dy, z: z + dz });
            if (b && (b.typeId === "minecraft:water" || b.typeId === "minecraft:flowing_water")) wet = true;
          }
        }
      }
      if (!wet) dryFarmland++;
    }
  }
  check(water > 0, "parit benar-benar terisi air", `${water} blok air`);
  check(farmland > 0, "ada petak yang dicangkul", `${farmland} farmland`);
  check(dryFarmland === 0, "TIDAK ADA farmland yang kering (tanpa supply air)", `${dryFarmland} kering`);

  // Lahan harus rata di satu ketinggian — DI PETAK YANG SEDANG DIGARAP.
  //
  // Sejak v1.7 ladang tidak dibuka satu chunk sekaligus: petak inti digarap
  // sampai benar-benar jadi ladang, baru melebar (config.PLOT). Memeriksa
  // seluruh chunk berarti menuntut petani sudah menggarap tanah yang memang
  // belum gilirannya. Yang diperiksa di sini petak yang sedang dikerjakan.
  const FURNITURE = new Set(["minecraft:chest", "minecraft:crafting_table",
    "minecraft:standing_sign", "minecraft:barrel", "minecraft:torch"]);
  const plot = plotOf(readState(farmer), workArea(farmer, readState(farmer), "P1"));
  let uneven = 0;
  const samples = [];
  for (let x = plot.x0; x <= plot.x1; x++) {
    for (let z = plot.z0; z <= plot.z1; z++) {
      const at65 = W.dimension.getBlock({ x, y: 65, z });
      const at66 = W.dimension.getBlock({ x, y: 66, z });
      if (FURNITURE.has(at65.typeId) || FURNITURE.has(at66.typeId)) continue;
      const solid65 = !at65.isAir && at65.typeId !== "minecraft:water" &&
        !at65.typeId.includes("wheat") && !at65.typeId.includes("carrot") &&
        !at65.typeId.includes("potato") && !at65.typeId.includes("beetroot") &&
        !at65.typeId.includes("fence") && !at65.typeId.includes("hay");
      if (solid65) { uneven++; if (samples.length < 5) samples.push(`${x},${z}=${at65.typeId}`); }
    }
  }
  check(uneven === 0, "permukaan petak yang digarap rata di satu ketinggian",
        `${uneven} kolom menyimpang di petak (${plot.x0}..${plot.x1}, ${plot.z0}..${plot.z1}) ${samples.join(" ")}`);
  const planted = (() => {
    let n = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const t = W.dimension.getBlock({ x, y: 65, z }).typeId;
      if (t.includes("wheat") || t.includes("carrot")) n++;
    }
    return n;
  })();
  console.log(`  catatan: medan uji ini sengaja ekstrem (beda tinggi antar kolom sampai 4 blok); ${planted} tanaman`);
  console.log(`  status akhir: ${status}`);
}

/* ---------------- Uji 2: penambang, lorong 1x3 dan urutan beliung --------- */
console.log("\n== Uji penambang: lorong 1x3 dan urutan tingkat beliung ==");
{
  const W = makeWorld({ groundY: 64 });
  // Blok asing di ketinggian kepala sepanjang jalur — dulu ini membuat
  // penambang membatalkan seluruh kolom galian dan lorongnya jadi sempit.
  for (let x = -40; x < 40; x++) {
    for (let z = -40; z < 40; z++) {
      if ((x + z) % 5 === 0) W.put(x, 40, z, "minecraft:smooth_basalt");
      if ((x * z) % 7 === 0) W.put(x, 41, z, "minecraft:amethyst_block");
    }
  }
  const miner = makeCompanion(W.dimension, "vbs:akito", { x: 0, y: 65, z: 0 });
  miner.setDynamicProperty("vbs:owner", "P1");
  miner.setDynamicProperty("vbs:mode", "mine");
  W.put(3, 65, 3, "minecraft:chest");
  patchState(miner, { station: { x: 3, y: 65, z: 3 } });
  const chest = W.dimension.getBlock({ x: 3, y: 65, z: 3 }).getComponent("minecraft:inventory").container;
  chest.fill("minecraft:oak_planks", 64);
  chest.fill("minecraft:stick", 32);
  // Sengaja disediakan besi berlimpah: penambang TETAP harus mulai dari kayu.
  chest.fill("minecraft:iron_ingot", 64);
  chest.fill("minecraft:cobblestone", 64);

  const seen = [];
  for (let i = 0; i < 12000; i++) {
    const state = readState(miner);
    tickMine(miner, state, undefined);
    writeState(miner, state);
    const hand = getGear(miner).mainhand;
    if (hand && seen[seen.length - 1] !== hand) seen.push(hand);
    advance(10);
  }
  check(seen[0] === "minecraft:wooden_pickaxe",
        "beliung PERTAMA adalah kayu, bukan langsung besi", seen.join(" -> "));
  check(!seen.includes("minecraft:iron_pickaxe") ||
        seen.indexOf("minecraft:stone_pickaxe") < seen.indexOf("minecraft:iron_pickaxe"),
        "besi hanya sesudah batu (tidak melompati tingkat)", seen.join(" -> "));

  // Ukur penampang lorong: cari kolom udara dan hitung tingginya.
  let tall = 0;
  let short = 0;
  for (let y = -54; y < 60; y++) {
    for (let x = -40; x < 40; x++) {
      for (let z = -40; z < 40; z++) {
        const a = W.dimension.getBlock({ x, y, z });
        if (!a || !a.isAir) continue;
        const below = W.dimension.getBlock({ x, y: y - 1, z });
        if (!below || below.isAir) continue;         // hanya lantai lorong
        if (y > 62) continue;                        // abaikan permukaan
        const h1 = W.dimension.getBlock({ x, y: y + 1, z });
        const h2 = W.dimension.getBlock({ x, y: y + 2, z });
        if (h1?.isAir && h2?.isAir) tall++; else short++;
      }
    }
  }
  check(tall > 0, "lorong tergali", `${tall} sel setinggi 3`);
  check(tall > short * 3, "lorong benar-benar 1x3, bukan 1x1", `tinggi3=${tall}, pendek=${short}`);
}

/* -------- Uji 3: ladang di tanah datar harus sampai fase menanam --------- */
console.log("\n== Uji petani di tanah datar: sampai menanam dan memanen ==");
{
  const W = makeWorld({ groundY: 64, jagged: false });
  for (let z = -2; z < 18; z++) for (let x = -6; x < -3; x++) W.put(x, 64, z, "minecraft:water");
  const farmer = makeCompanion(W.dimension, "vbs:toya", { x: 8, y: 65, z: 8 });
  farmer.setDynamicProperty("vbs:owner", "P2");
  farmer.setDynamicProperty("vbs:mode", "farm");
  setClaim("minecraft:overworld", 0, 0, { by: "P2", worked: false, kind: "farm", y: 64 });
  W.put(10, 65, 10, "minecraft:chest");
  patchState(farmer, { station: { x: 10, y: 65, z: 10 } });
  const chest = W.dimension.getBlock({ x: 10, y: 65, z: 10 }).getComponent("minecraft:inventory").container;
  for (const [id, n] of [["minecraft:oak_planks", 64], ["minecraft:stick", 64],
                         ["minecraft:iron_ingot", 6], ["minecraft:dirt", 64],
                         ["minecraft:wheat_seeds", 64], ["minecraft:carrot", 64]]) {
    chest.addItem({ typeId: id, amount: n });
  }

  const phases = new Set();
  let status = "";
  for (let i = 0; i < 40000; i++) {
    const state = readState(farmer);
    status = tickFarm(farmer, state, undefined);
    writeState(farmer, state);
    phases.add(state.plan?.farm?.phase);
    advance(10);
  }
  check(phases.has("plant"), "mencapai fase menanam", [...phases].join(" -> "));
  let planted = 0;
  let farmland = 0;
  let dry = 0;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const ground = W.dimension.getBlock({ x, y: 64, z }).typeId;
      const top = W.dimension.getBlock({ x, y: 65, z }).typeId;
      if (ground === "minecraft:farmland") {
        farmland++;
        let wet = false;
        for (let dx = -4; dx <= 4 && !wet; dx++) {
          for (let dz = -4; dz <= 4 && !wet; dz++) {
            for (const dy of [0, 1]) {
              const b = W.dimension.getBlock({ x: x + dx, y: 64 + dy, z: z + dz });
              if (b && b.typeId.includes("water")) wet = true;
            }
          }
        }
        if (!wet) dry++;
      }
      if (top.includes("wheat") || top.includes("carrot")) planted++;
    }
  }
  check(farmland > 40, "sebagian besar petak jadi farmland", `${farmland} petak`);
  check(dry === 0, "tidak ada farmland kering", `${dry} kering`);
  check(planted > 0, "bibit ditanam berjalur", `${planted} tanaman`);
  console.log(`  status akhir: ${status}`);
}

/* -------- Uji 4: rantai bantuan perajin & pencari barang ----------------- */
console.log("\n== Uji peran baru: perajin melayani pesanan, pencari barang mengantar ==");
{
  const W = makeWorld({ groundY: 64, jagged: false });
  // Hutan kecil untuk ditebang pencari barang.
  for (let x = 20; x < 30; x++) {
    for (let z = 20; z < 30; z++) {
      if ((x + z) % 3) continue;
      for (let dy = 1; dy <= 4; dy++) W.put(x, 64 + dy, z, "minecraft:oak_log");
    }
  }

  // Penambang tanpa bahan sama sekali: dia harus MEMINTA, bukan diam.
  const miner = makeCompanion(W.dimension, "vbs:akito", { x: 0, y: 65, z: 0 });
  miner.setDynamicProperty("vbs:owner", "P3");
  miner.setDynamicProperty("vbs:mode", "mine");
  W.put(2, 65, 2, "minecraft:chest");
  patchState(miner, { station: { x: 2, y: 65, z: 2 } });

  for (let i = 0; i < 40; i++) {
    const st = readState(miner);
    tickMine(miner, st, undefined);
    writeState(miner, st);
    advance(10);
  }
  const asked = readRequests("P3");
  check(asked.length > 0, "penambang tanpa bahan MEMASANG permintaan bantuan",
        asked.map((r) => `${r.type}/${r.kind}`).join(", "));
  check(asked.some((r) => r.type === "material"),
        "ada permintaan bahan mentah untuk pencari barang");

  // Pencari barang mengerjakan pesanan bahan itu.
  const looter = makeCompanion(W.dimension, "vbs:an", { x: 24, y: 65, z: 24 });
  looter.setDynamicProperty("vbs:owner", "P3");
  looter.setDynamicProperty("vbs:mode", "looter");
  W.put(26, 65, 26, "minecraft:chest");
  patchState(looter, { station: { x: 26, y: 65, z: 26 } });
  // Perajin bekerja BERSAMAAN dengan pencari barang, seperti di dunia nyata.
  const crafter = makeCompanion(W.dimension, "vbs:flins", { x: 4, y: 65, z: 4 });
  crafter.setDynamicProperty("vbs:owner", "P3");
  crafter.setDynamicProperty("vbs:mode", "crafter");
  W.put(6, 65, 6, "minecraft:chest");
  patchState(crafter, { station: { x: 6, y: 65, z: 6 } });
  const cc = W.dimension.getBlock({ x: 6, y: 65, z: 6 }).getComponent("minecraft:inventory").container;
  cc.addItem({ typeId: "minecraft:oak_planks", amount: 64 });
  cc.addItem({ typeId: "minecraft:stick", amount: 64 });

  for (let i = 0; i < 2000; i++) {
    const ls = readState(looter);
    tickLooter(looter, ls, undefined);
    writeState(looter, ls);
    const cs = readState(crafter);
    tickCrafter(crafter, cs, undefined);
    writeState(crafter, cs);
    advance(10);
  }
  const minerChest = W.dimension.getBlock({ x: 2, y: 65, z: 2 })
    .getComponent("minecraft:inventory").container;
  let delivered = 0;
  for (let i = 0; i < minerChest.size; i++) {
    const it = minerChest.getItem(i);
    if (it) delivered += it.amount;
  }
  check(delivered > 0, "pencari barang benar-benar mengantar bahan ke peti pemesan",
        `${delivered} barang di peti penambang`);

  let tools = 0;
  for (let i = 0; i < minerChest.size; i++) {
    const it = minerChest.getItem(i);
    if (it && it.typeId.includes("pickaxe")) tools += it.amount;
  }
  check(tools > 0, "perajin menempa beliung dan mengantarnya ke peti penambang",
        `${tools} beliung diantar`);
}

/* -------- Uji 5: tenaga dan kantuk ------------------------------------- */
console.log("\n== Uji tenaga & kantuk: companion tidak bisa kerja terus ==");
{
  const W = makeWorld({ groundY: 64, jagged: false });
  const worker = makeCompanion(W.dimension, "vbs:kohane", { x: 0, y: 65, z: 0 });
  worker.setDynamicProperty("vbs:owner", "P4");
  const state = readState(worker);
  let restedAt = -1;
  let sleptAt = -1;
  for (let i = 0; i < 3000; i++) {
    const busy = tickEnergy(worker, state, "farm");
    if (busy && state.resting && restedAt < 0) restedAt = i;
    if (busy && state.sleeping && sleptAt < 0) sleptAt = i;
    advance(10);
  }
  check(restedAt > 0, "tenaga terkuras sampai companion berhenti istirahat",
        `mulai istirahat pada denyut ke-${restedAt}`);
  check(state.sleepiness > 0, "kantuk ikut naik seiring waktu",
        `kantuk ${state.sleepiness.toFixed(1)}`);
  check(sleptAt > 0 || state.sleepiness < 85,
        "kantuk memicu tidur kalau sudah melewati ambang",
        sleptAt > 0 ? `mulai tidur pada denyut ke-${sleptAt}` : "belum melewati ambang");
}

/* -------- Uji 6: rancangan bangunan dari berkas JSON -------------------- */
console.log("\n== Uji rancangan JSON: dibaca, diurut, dan benar-benar dibangun ==");
{
  check(DATA_BLUEPRINTS.length > 0, "ada rancangan JSON yang ikut terbungkus",
        `${DATA_BLUEPRINTS.length} rancangan`);
  for (const doc of DATA_BLUEPRINTS) {
    check(Boolean(BLUEPRINTS[doc.id]), `rancangan "${doc.id}" masuk ke menu`,
          BLUEPRINTS[doc.id]?.label);
  }

  const tower = DATA_BLUEPRINTS.find((d) => d.id === "watchtower");
  const steps = tower ? relativeSteps(tower) : [];
  let rising = true;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].yOff < steps[i - 1].yOff) rising = false;
  }
  check(rising, "langkahnya diurut dari lapis bawah ke atas",
        `${steps.length} langkah`);
  check(steps.some((s) => s.yOff === 0), "ada lapis yang menimpa blok tanah (yOff 0)");

  // Bangun sungguhan di dunia tiruan, di atas tanah yang tidak rata: menara
  // harus tetap rata, bukan mengikuti kontur tiap kolom.
  const W = makeWorld({ groundY: 64, jagged: true });
  const builder = makeCompanion(W.dimension, "vbs:toya", { x: 8, y: 66, z: 8 });
  builder.setDynamicProperty("vbs:owner", "P5");
  builder.setDynamicProperty("vbs:mode", "build");
  W.put(11, 66, 11, "minecraft:chest");
  patchState(builder, { station: { x: 11, y: 66, z: 11 }, blueprint: "watchtower" });
  const chest = W.dimension.getBlock({ x: 11, y: 66, z: 11 })
    .getComponent("minecraft:inventory").container;
  for (const id of ["minecraft:oak_planks", "minecraft:cobblestone", "minecraft:oak_log",
                    "minecraft:glass_pane", "minecraft:oak_fence", "minecraft:oak_door",
                    "minecraft:lantern", "minecraft:oak_stairs"]) {
    for (let i = 0; i < 4; i++) chest.fill(id, 64);
  }

  let status = "";
  for (let i = 0; i < 6000; i++) {
    const st = readState(builder);
    status = tickBuild(builder, st, undefined);
    writeState(builder, st);
    advance(10);
    if (String(status).includes("selesai")) break;
  }
  const job = readState(builder).plan?.build;
  check(String(status).includes("selesai") || (job && job.index > 0),
        "pembangun benar-benar mengerjakan rancangan JSON", status);

  // Semua blok yang dipasang harus duduk di atas SATU ketinggian dasar.
  const placed = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 60; y < 80; y++) {
        const id = W.dimension.getBlock({ x, y, z }).typeId;
        if (id === "minecraft:oak_fence" || id === "minecraft:oak_log") placed.push({ x, y, z, id });
      }
    }
  }
  check(placed.length > 0, "blok rancangan benar-benar terpasang di dunia",
        `${placed.length} blok pagar/tiang`);
}

/* -------- Uji 7: dialog dari berkas JSON -------------------------------- */
console.log("\n== Uji dialog JSON: kalimat dan topik ikut terpakai ==");
{
  const stats = dialogueStats();
  check(stats.lines > 0, "kalimat dari dialogue/*.json ikut terbungkus",
        `${stats.lines} kalimat`);
  const idle = linesFor("kohane", "idle");
  const builtinIdle = idle.filter((t) => t.includes("Semoga hari ini lancar"));
  check(builtinIdle.length === 1, "kalimat bawaan TIDAK hilang saat ditambahi JSON");
  check(idle.some((t) => t.includes("Langitnya bersih")),
        "kalimat JSON untuk semua karakter (\"*\") ikut terpakai");
  const extra = TOPICS.filter((t) => t.source);
  check(extra.length === stats.topics, "topik JSON masuk ke daftar obrolan",
        `${extra.length} topik`);
  const rain = extra.find((t) => t.tag === "hujan");
  check(Boolean(rain) && rain.when("farm", "stay") && !rain.when("mine", "stay"),
        "daftar modes di JSON jadi syarat pemilihan topik");
}

/* -------- Uji 8: buku panduan tidak bisa hilang ------------------------- */
console.log("\n== Uji buku panduan: diberikan, dikembalikan, bisa dimatikan ==");
{
  const W = makeWorld({ groundY: 64 });
  const player = makePlayer(W.dimension, { id: "PB", name: "Pemain" });
  __setPlayers([player]);

  check(Boolean(makeBook()), "ItemStack buku bisa dibuat");
  check(isBook({ typeId: "vbs:guide" }), "buku dikenali dari typeId");
  check(!isBook({ typeId: "minecraft:book" }), "buku biasa tidak dianggap buku panduan");

  check(ensureBook(player), "pemain tanpa buku langsung diberi satu");
  check(hasBook(player), "bukunya benar-benar masuk kantong");
  check(!ensureBook(player), "buku tidak digandakan kalau sudah punya");

  // Mati: kantongnya kosong, lalu playerSpawn memanggil ensureBook lagi.
  for (let i = 0; i < player.container.size; i++) player.container.setItem(i, undefined);
  check(!hasBook(player), "kantong benar-benar kosong sesudah 'mati'");
  check(ensureBook(player), "buku diberikan lagi sesudah pemain mati");

  writeSettings(player.id, { keepBook: false });
  for (let i = 0; i < player.container.size; i++) player.container.setItem(i, undefined);
  check(!ensureBook(player), "saklar 'buku tidak bisa hilang' benar-benar mematikan pengembalian");
  writeSettings(player.id, { keepBook: true });
  __setPlayers([]);
}

/* -------- Uji 9: Beta API tambahan, bukan syarat ----------------------- */
console.log(`\n== Uji Beta API (${__harness().beta ? "dunia BETA" : "dunia biasa"}) ==`);
{
  const summary = betaSummary();
  const lines = betaLines();
  check(lines.length > 0, "buku panduan punya baris status Beta API");

  if (__harness().beta) {
    check(hasBeta(), "beta terdeteksi saat modul beta tersedia");
    check(summary.commands.length === 3, "tiga perintah garis miring terdaftar",
          summary.commands.join(" "));

    const W = makeWorld({ groundY: 64 });
    const player = makePlayer(W.dimension, { id: "PC", name: "Pemain" });
    const buddy = makeCompanion(W.dimension, "vbs:an", { x: 1, y: 65, z: 1 });
    buddy.setDynamicProperty("vbs:owner", "PC");
    setMode(buddy, "follow");
    __setPlayers([player]);
    setBetaHandlers({ setMode: (p, name, mode) => orderMode(p, name, mode) });

    // Perintah dipanggil persis seperti Minecraft memanggilnya: origin dulu,
    // baru argumen — tapi companion-nya tidak bisa ditemukan lewat
    // world.getDimension() tiruan, jadi yang diperiksa jalur penolakannya.
    const cmd = __harness().commands.find((c) => c.spec.name === "vbs:mode");
    check(Boolean(cmd), "perintah /vbs:mode terdaftar dengan namanya");
    const bad = cmd.run({ sourceEntity: player }, "An", "tidak_ada_mode");
    check(bad.status === 1 && /tidak dikenal/.test(bad.message ?? ""),
          "tugas karangan ditolak dengan pesan yang jelas", bad.message);
    const noPlayer = cmd.run({ sourceEntity: undefined }, "An", "farm");
    check(noPlayer.status === 1, "perintah dari bukan-pemain ditolak");
    __setPlayers([]);
  } else {
    check(!hasBeta(), "tanpa modul beta, hasBeta() false");
    check(summary.commands.length === 0, "tidak ada perintah yang didaftarkan");
    check(lines.some((l) => l.includes("tidak aktif")),
          "status di buku menyebut Beta API tidak aktif");
  }
}


/* -------- Uji 9: menjinakkan dengan bunga -------------------------------- */
console.log("\n== Uji menjinakkan: bunga, mesin gim, dan jalur cadangan ==");
{
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  const claimed = [];
  const claim = (entity, player) => claimed.push(`${entity.typeId}<-${player.name}`);

  // 1. Bunga yang ADA di tame_items: mesin gim yang menjinakkan. Script tidak
  //    boleh menghabiskan bunganya sendiri — kalau ikut mengambil, pemain
  //    kehilangan dua bunga untuk satu companion.
  const wolfish = makeCompanion(W.dimension, "vbs:kohane", { x: 0, y: 65, z: 0 });
  const player = makePlayer(W.dimension, { id: "T1", name: "Penjinak" });
  player.container.setItem(0, { typeId: "minecraft:poppy", amount: 3 });
  __setPlayers([player]);

  const offered = offerFlower(wolfish, player, { typeId: "minecraft:poppy", amount: 3 });
  check(offered, "bunga di tangan benar-benar terbaca dari event interaksi");
  check(player.container.getItem(0)?.amount === 3,
        "bunga TIDAK diambil script untuk bunga yang ditangani mesin gim",
        `sisa ${player.container.getItem(0)?.amount}`);

  // Mesin gim menyelesaikan taming-nya: vbs:on_tamed menyala.
  wolfish.triggerEvent("vbs:on_tamed");
  check(isTamed(wolfish), "penanda minecraft:is_tamed terbaca script");
  tickTaming(new Map([[wolfish.id, wolfish]]), [player], claim);
  check(wolfish.getDynamicProperty("vbs:owner") === "T1",
        "pemilik tercatat begitu mesin gim menyatakan jinak");
  check(claimed.length === 1, "bootstrap dipanggil sekali", claimed.join(", "));

  // 2. Bunga DI LUAR tame_items: script yang mengambil alih, dan bunganya
  //    memang harus habis — mesin gim tidak akan menyentuhnya.
  const other = makeCompanion(W.dimension, "vbs:an", { x: 4, y: 65, z: 4 });
  const p2 = makePlayer(W.dimension, { id: "T2", name: "Pemetik" });
  p2.container.setItem(0, { typeId: "minecraft:pink_petals", amount: 2 });
  __setPlayers([player, p2]);
  offerFlower(other, p2, { typeId: "minecraft:pink_petals", amount: 2 });
  check(p2.container.getItem(0)?.amount === 1,
        "bunga di luar tame_items dihabiskan script",
        `sisa ${p2.container.getItem(0)?.amount ?? 0}`);
  check(other.__tamed, "vbs:on_tamed dipicu script untuk bunga di luar daftar");
  tickTaming(new Map([[other.id, other]]), [player, p2], claim);
  check(other.getDynamicProperty("vbs:owner") === "T2", "pemilik jalur cadangan tercatat");

  // 3. Bunga di tangan dibaca walau event-nya tidak membawa itemStack —
  //    inilah bug lama: satu-satunya sumber dulu selectedSlotIndex.
  const p3 = makePlayer(W.dimension, { id: "T3", name: "Tanpa Event" });
  p3.container.setItem(0, { typeId: "minecraft:dandelion", amount: 1 });
  check(heldFlower(p3, undefined)?.typeId === "minecraft:dandelion",
        "bunga tetap ketemu lewat slot terpilih kalau event tidak membawanya");

  // 4. Mesin gim TIDAK menjinakkan (dunia lama, entity belum diperbarui):
  //    sesudah menunggu, script mengambil alih dan bunganya baru dihabiskan.
  const stale = makeCompanion(W.dimension, "vbs:toya", { x: 8, y: 65, z: 8 });
  const p4 = makePlayer(W.dimension, { id: "T4", name: "Dunia Lama" });
  p4.container.setItem(0, { typeId: "minecraft:poppy", amount: 1 });
  __setPlayers([p4]);
  offerFlower(stale, p4, { typeId: "minecraft:poppy", amount: 1 });
  check(p4.container.getItem(0)?.amount === 1, "bunga belum diambil selagi menunggu mesin gim");
  advance(30);
  tickTaming(new Map([[stale.id, stale]]), [p4], claim);
  check(stale.getDynamicProperty("vbs:owner") === "T4",
        "script mengambil alih kalau taming bawaan tidak juga terjadi");
  check(!p4.container.getItem(0), "bunganya baru dihabiskan saat script mengambil alih");

  // 5. Mesin gim menjinakkan TANPA event interaksi sampai ke script. Tidak ada
  //    janji bahwa playerInteractWithEntity ikut menyala untuk interaksi yang
  //    dipakai gim untuk menjinakkan — kalau tidak ada jaring pengaman,
  //    companion berdiri jinak tanpa pemilik dan tidak mau bekerja selamanya.
  const silent = makeCompanion(W.dimension, "vbs:flins", { x: 12, y: 65, z: 12 });
  const p5 = makePlayer(W.dimension, { id: "T5", name: "Tanpa Event Sama Sekali",
                                       at: { x: 13, y: 65, z: 12 } });
  __setPlayers([p5]);
  silent.triggerEvent("vbs:on_tamed");
  tickTaming(new Map([[silent.id, silent]]), [p5], claim);
  check(silent.getDynamicProperty("vbs:owner") === "T5",
        "companion yang jinak tanpa event tetap mendapat pemilik dari pemain terdekat");

  // Tapi jangan sampai companion orang lain di ujung dunia ikut diklaim.
  const faraway = makeCompanion(W.dimension, "vbs:kohane", { x: 400, y: 65, z: 400 });
  faraway.id = "test-jauh";
  faraway.triggerEvent("vbs:on_tamed");
  tickTaming(new Map([[faraway.id, faraway]]), [p5], claim);
  check(faraway.getDynamicProperty("vbs:owner") === undefined,
        "pemain yang jauh tidak ikut mengklaim companion yang kebetulan jinak");
  __setPlayers([]);
}

/* -------- Uji 10: bekerja sendiri kalau belum ada perajin/pencari -------- */
console.log("\n== Uji kerja sendiri: menebang pohon pakai tangan ==");
{
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  // Hutan rapat persis di sebelah penambang.
  for (let x = 4; x < 12; x++) {
    for (let z = -4; z < 4; z++) {
      if ((x + z) % 2) continue;
      for (let dy = 1; dy <= 5; dy++) W.put(x, 64 + dy, z, "minecraft:oak_log");
    }
  }

  const lone = makeCompanion(W.dimension, "vbs:akito", { x: 0, y: 65, z: 0 });
  lone.setDynamicProperty("vbs:owner", "S1");
  lone.setDynamicProperty("vbs:mode", "mine");
  check(!hasHelper("S1", lone),
        "tidak ada perajin maupun pencari barang -> companion kerja sendiri");

  let hand;
  for (let i = 0; i < 4000; i++) {
    const st = readState(lone);
    tickMine(lone, st, undefined);
    writeState(lone, st);
    hand = getGear(lone).mainhand;
    if (hand) break;
    advance(10);
  }
  check(Boolean(hand && hand.includes("pickaxe")),
        "companion sendirian menempa beliungnya sendiri dari kayu yang ditebangnya",
        String(hand));

  let logsLeft = 0;
  for (let x = 4; x < 12; x++) {
    for (let z = -4; z < 4; z++) {
      for (let dy = 1; dy <= 5; dy++) {
        if (W.dimension.getBlock({ x, y: 64 + dy, z }).typeId === "minecraft:oak_log") logsLeft++;
      }
    }
  }
  check(logsLeft < 160, "pohonnya benar-benar ditebang, bukan cuma diminta",
        `${logsLeft} log tersisa dari 160`);

  // Begitu ada perajin milik pemilik yang sama, rantai lama dipakai lagi dan
  // companion tidak lagi menebang sendiri.
  const helper = makeCompanion(W.dimension, "vbs:flins", { x: 2, y: 65, z: 2 });
  helper.setDynamicProperty("vbs:owner", "S1");
  helper.setDynamicProperty("vbs:mode", "crafter");
  check(hasHelper("S1", lone), "ada perajin -> permintaan bantuan dipakai lagi");
  check(!hasHelper("S1", helper),
        "perajin tidak menghitung dirinya sendiri sebagai penolongnya sendiri");

  // Bibit dari rumput: jalur yang dipakai petani kalau pemilik menjawab "ya".
  const farmer = makeCompanion(W.dimension, "vbs:kohane", { x: 40, y: 65, z: 40 });
  farmer.setDynamicProperty("vbs:owner", "S2");
  for (let x = 38; x < 44; x++) {
    for (let z = 38; z < 44; z++) W.put(x, 65, z, "minecraft:short_grass");
  }
  const box = makeContainer();
  const fs = readState(farmer);
  let seeds = 0;
  for (let i = 0; i < 400 && !seeds; i++) {
    gatherOwn(farmer, fs, "S2", "seed", box);
    seeds = summarize(box)["minecraft:wheat_seeds"] ?? 0;
    advance(10);
  }
  check(seeds > 0, "membabat rumput benar-benar menghasilkan bibit", `${seeds} bibit`);
}

/* ---- Uji 9a: Peta Patok — mematok chunk tanpa memegang item patok --------- */
//
// Keluhannya: "patok ladang belum jalan sempurna, sulit sekali mencari
// patoknya". Sebabnya patok itu ITEM berbentuk stik yang harus dibawa dan
// diklikkan ke tanah chunk yang dituju — terselip di kantong, dan chunk yang
// mau dipatok sering ada di seberang lembah. Peta Patok di Buku Panduan
// menggantikan keduanya. Formnya sendiri tidak bisa diuji di luar Minecraft,
// jadi yang diuji di sini MODELNYA: peta, penunjuk arah, dan pematokannya.
console.log("\n== Uji Peta Patok: peta 8x8, tunjuk petaknya, patok terpasang ==");
{
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  const me = makePlayer(W.dimension, { id: "M1", name: "Bagas", at: { x: 8, y: 65, z: 8 } });

  const map = chunkMap(me, 8);
  const flat = map.rows.flat();
  check(map.rows.length === 8 && map.rows.every((r) => r.length === 8),
        "peta benar-benar 8x8 chunk", `${map.rows.length} baris`);
  const standing = flat.filter((c) => c.here);
  check(standing.length === 1 && standing[0].cx === 0 && standing[0].cz === 0,
        "petak tempat pemain berdiri ditandai tepat satu kali",
        standing.map((c) => `(${c.cx}, ${c.cz})`).join(" "));
  check(map.rows[0][0].cz < map.rows[7][0].cz,
        "baris atas lebih ke utara daripada baris bawah",
        `z ${map.rows[0][0].cz} -> ${map.rows[7][0].cz}`);
  check(flat.every((c) => !c.mine),
        "pemain baru belum punya satu petak pun di petanya");

  // Menunjuk satu petak dari peta: tidak memegang item apa pun.
  const target = map.rows[2][5];
  toggleClaimAt(me, target.cx, target.cz, "farm", me.location);
  const after = chunkMap(me, 8).rows[2][5];
  check(after.kind === "farm" && after.mine,
        "menunjuk petak dari peta benar-benar memasang patok",
        `(${after.cx}, ${after.cz}) -> ${after.kind}, milikku=${after.mine}`);
  check(after.worked === false, "patok baru bertanda merah: belum digarap");

  const hint = nearestClaimHint(me, "farm");
  check(Boolean(hint) && hint.cx === target.cx && hint.cz === target.cz,
        "patok terdekat ditunjukkan arah dan jaraknya",
        hint ? `${hint.dist} blok ke ${hint.dir}` : "tidak ada");

  // Chunk (1, -2) dari (0,0): +x = timur, -z = utara -> timur laut.
  check(hint?.dir === "timur laut", "arahnya dihitung dengan kompas Minecraft (utara = -Z)",
        `chunk (${hint?.cx}, ${hint?.cz}) -> ${hint?.dir}`);

  // Menunjuk petak yang sama sekali lagi: patoknya dicabut.
  toggleClaimAt(me, target.cx, target.cz, "farm", me.location);
  check(!chunkMap(me, 8).rows[2][5].kind, "menunjuk petak yang sama lagi mencabut patoknya");

  // Patok desa dan patok ladang tetap dua hal yang berbeda.
  toggleClaimAt(me, 3, 3, "village", me.location);
  const mixed = toggleClaimAt(me, 3, 3, "farm", me.location);
  check(mixed.includes("desa"), "patok ladang menolak mencabut lahan desa", mixed);
  check(claimsNear(W.dimension, me.location, "M1", 8, "village").length === 1,
        "lahan desa tetap terdaftar sebagai desa");

  // Patok orang lain bukan milikmu.
  const other = makePlayer(W.dimension, { id: "M2", name: "Tamu", at: { x: 8, y: 65, z: 8 } });
  toggleClaimAt(me, 2, 2, "farm", me.location);
  const refused = toggleClaimAt(other, 2, 2, "farm", other.location);
  check(refused.includes("Bagas"), "patok pemain lain tidak bisa dicabut sembarangan", refused);
  const mineCell = (p) => chunkMap(p, 8).rows.flat().find((c) => c.cx === 2 && c.cz === 2);
  check(mineCell(me)?.mine === true, "dan patoknya memang masih berdiri");
  check(mineCell(other)?.kind === "farm" && mineCell(other)?.mine === false,
        "di peta pemain lain petak itu tampil sebagai milik orang",
        `pemiliknya: ${mineCell(other)?.byName}`);
}

/* ---- Uji 9b: meja kerja & tungku dipakai bersama, alat tanpa diminta ------ */
//
// Peti sudah dipakai bersama sejak v1.4.0, meja kerja belum: dua companion yang
// stasiunnya berjauhan sedikit saja masing-masing membelah empat papan untuk
// meja kerja sendiri. Dan tanpa tungku, bijih besi berhenti sebagai raw_iron —
// TOOL_TIERS besi cuma menerima iron_ingot, jadi tingkat alat besi tidak pernah
// tercapai berapa pun banyak bijih yang digali.
console.log("\n== Uji bengkel bersama: satu meja kerja, tungku, alat tanpa diminta ==");
{
  const countBlocks = (W, id, x0, x1, z0, z1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (let y = 62; y <= 68; y++) {
          if (W.dimension.getBlock({ x, y, z }).typeId === id) n++;
        }
      }
    }
    return n;
  };
  const chestAt = (W, x, y, z) =>
    W.dimension.getBlock({ x, y, z }).getComponent("minecraft:inventory").container;

  /* --- Dua perajin sepemilik, satu meja kerja --- */
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  const spots = [{ x: 2, y: 65, z: 2 }, { x: 18, y: 65, z: 18 }];
  const pair = [];
  for (const [i, at] of spots.entries()) {
    const c = makeCompanion(W.dimension, i ? "vbs:flins" : "vbs:an", { x: at.x, y: 65, z: at.z });
    c.setDynamicProperty("vbs:owner", "W1");
    c.setDynamicProperty("vbs:mode", "crafter");
    W.put(at.x, at.y, at.z, "minecraft:chest");
    patchState(c, { station: at });
    const box = chestAt(W, at.x, at.y, at.z);
    box.addItem({ typeId: "minecraft:oak_planks", amount: 64 });
    box.addItem({ typeId: "minecraft:stick", amount: 64 });
    pair.push(c);
  }
  for (let i = 0; i < 600; i++) {
    for (const c of pair) {
      const st = readState(c);
      tickCrafter(c, st, undefined);
      writeState(c, st);
    }
    advance(10);
  }
  const tables = countBlocks(W, "minecraft:crafting_table", -8, 30, -8, 30);
  check(tables === 1, "dua perajin sepemilik memakai SATU meja kerja bersama",
        `${tables} meja kerja berdiri`);

  // Tapi berbagi itu punya JARAK: yang bekerja di seberang bukit tetap membuat
  // mejanya sendiri, bukan berjalan pulang-pergi tujuh puluh blok tiap menempa.
  const far = makeCompanion(W.dimension, "vbs:kohane", { x: 70, y: 65, z: 70 });
  far.setDynamicProperty("vbs:owner", "W1");
  far.setDynamicProperty("vbs:mode", "crafter");
  W.put(70, 65, 70, "minecraft:chest");
  patchState(far, { station: { x: 70, y: 65, z: 70 } });
  const farBox = chestAt(W, 70, 65, 70);
  farBox.addItem({ typeId: "minecraft:oak_planks", amount: 64 });
  farBox.addItem({ typeId: "minecraft:stick", amount: 64 });
  for (let i = 0; i < 400; i++) {
    const st = readState(far);
    tickCrafter(far, st, undefined);
    writeState(far, st);
    advance(10);
  }
  const farTables = countBlocks(W, "minecraft:crafting_table", 60, 80, 60, 80);
  check(farTables === 1, "yang bekerja jauh tetap punya meja kerja sendiri",
        `${farTables} meja kerja di sekitarnya`);

  /* --- Tungku: bijih mentah benar-benar jadi batangan --- */
  const F = makeWorld({ groundY: 64 });
  __setDimension(F.dimension);
  const smith = makeCompanion(F.dimension, "vbs:toya", { x: 0, y: 65, z: 0 });
  smith.setDynamicProperty("vbs:owner", "W2");
  smith.setDynamicProperty("vbs:mode", "crafter");
  F.put(2, 65, 2, "minecraft:chest");
  patchState(smith, { station: { x: 2, y: 65, z: 2 } });
  const forge = chestAt(F, 2, 65, 2);
  forge.addItem({ typeId: "minecraft:oak_planks", amount: 32 });
  forge.addItem({ typeId: "minecraft:stick", amount: 32 });
  forge.addItem({ typeId: "minecraft:cobblestone", amount: 32 });
  forge.addItem({ typeId: "minecraft:coal", amount: 8 });
  forge.addItem({ typeId: "minecraft:raw_iron", amount: 6 });
  check(Boolean(pickSmelt(forge)), "bijih besi mentah di peti dikenali sebagai bahan tungku");

  for (let i = 0; i < 1200; i++) {
    const st = readState(smith);
    tickCrafter(smith, st, undefined);
    writeState(smith, st);
    advance(10);
  }
  const furnaces = countBlocks(F, "minecraft:furnace", -8, 12, -8, 12);
  check(furnaces >= 1, "perajin sadar diri memasang tungku tanpa diminta",
        `${furnaces} tungku berdiri`);
  const ingots = summarize(forge)["minecraft:iron_ingot"] ?? 0;
  check(ingots > 0, "besi mentah benar-benar dilebur jadi iron_ingot",
        `${ingots} batangan, sisa mentah ${summarize(forge)["minecraft:raw_iron"] ?? 0}`);

  /* --- Alat untuk companion lain, tanpa satu pun permintaan dipasang --- */
  const T = makeWorld({ groundY: 64 });
  __setDimension(T.dimension);
  const maker = makeCompanion(T.dimension, "vbs:kohane", { x: 0, y: 65, z: 0 });
  maker.setDynamicProperty("vbs:owner", "W3");
  maker.setDynamicProperty("vbs:mode", "crafter");
  T.put(2, 65, 2, "minecraft:chest");
  patchState(maker, { station: { x: 2, y: 65, z: 2 } });
  const shop = chestAt(T, 2, 65, 2);
  shop.addItem({ typeId: "minecraft:oak_planks", amount: 64 });
  shop.addItem({ typeId: "minecraft:stick", amount: 64 });

  // Petani ini TIDAK PERNAH di-tick, jadi dia tidak pernah memasang permintaan.
  const idle = makeCompanion(T.dimension, "vbs:akito", { x: 24, y: 65, z: 24 });
  idle.setDynamicProperty("vbs:owner", "W3");
  idle.setDynamicProperty("vbs:mode", "farm");
  T.put(26, 65, 26, "minecraft:chest");
  patchState(idle, { station: { x: 26, y: 65, z: 26 } });
  check(!readRequests("W3").length, "papan permintaan memang kosong sejak awal");

  for (let i = 0; i < 1500; i++) {
    const st = readState(maker);
    tickCrafter(maker, st, undefined);
    writeState(maker, st);
    advance(10);
  }
  const got = summarize(chestAt(T, 26, 65, 26));
  const hoes = Object.entries(got).filter(([id]) => id.includes("hoe"))
    .reduce((a, [, n]) => a + n, 0);
  check(hoes > 0, "perajin menempa cangkul untuk petani TANPA diminta",
        `isi peti petani: ${JSON.stringify(got)}`);
  check(!readRequests("W3").some((r) => r.type === "tool"),
        "dan memang tidak ada permintaan alat yang pernah dipasang");
}

/* ------- Uji 10b: sasaran kayu yang terdekat, dan tidak berganti-ganti ------ */
//
// Gejalanya di dunia asli: companion berdiri di tengah hutan sambil mengulang
// "mencari kayu sendiri", lalu berangkat ke batang yang belasan blok jauhnya —
// padahal ada pohon persis di depan muka. Sebabnya dua-duanya di gather.js:
// sapuan bloknya dilanjutkan dari titik terakhir (jadi urutan "paling dekat
// dulu" jadi percuma), dan sasarannya dipilih ULANG tiap denyut (jadi dia
// berbelok terus dan tidak pernah sampai).
console.log("\n== Uji sasaran kayu: yang terdekat, dan dipegang sampai habis ==");
{
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  for (let dy = 1; dy <= 5; dy++) W.put(2, 64 + dy, 0, "minecraft:oak_log");   // depan muka
  for (let x = 12; x < 16; x++) {                                              // hutan jauh
    for (let z = -3; z < 4; z++) {
      for (let dy = 1; dy <= 5; dy++) W.put(x, 64 + dy, z, "minecraft:acacia_log");
    }
  }

  const e = makeCompanion(W.dimension, "vbs:toya", { x: 0.5, y: 65, z: 0.5 });
  forgetGather(e.id);
  stopWalking(e.id);

  const picks = [];
  for (let i = 0; i < 12; i++) {
    picks.push(findMaterial(e, "wood"));
    advance(10);
  }
  check(picks.every((t) => t?.id === "minecraft:oak_log"),
        "pohon di depan muka menang dari hutan belasan blok jauhnya",
        picks.map((t) => (t ? t.id.replace("minecraft:", "") : "TIDAK KETEMU")).join(" "));
  check(new Set(picks.map((t) => (t ? `${t.x},${t.y},${t.z}` : "-"))).size === 1,
        "sasarannya dipegang, bukan diundi ulang tiap denyut",
        `${new Set(picks.map((t) => (t ? `${t.x},${t.y},${t.z}` : "-"))).size} sasaran berbeda`);

  // Dan buktinya di jalur yang sebenarnya dipakai: berdiri di hutan rapat,
  // kayunya harus benar-benar masuk peti — bukan cuma mondar-mandir.
  const F = makeWorld({ groundY: 64 });
  __setDimension(F.dimension);
  for (let x = -16; x <= 16; x++) {
    for (let z = -16; z <= 16; z++) {
      if ((x * 5 + z * 3) % 11) continue;
      for (let dy = 1; dy <= 5; dy++) F.put(x, 64 + dy, z, "minecraft:acacia_log");
    }
  }
  const woodman = makeCompanion(F.dimension, "vbs:akito", { x: 0.5, y: 65, z: 0.5 });
  woodman.setDynamicProperty("vbs:owner", "S3");
  forgetGather(woodman.id);
  stopWalking(woodman.id);
  const box = makeContainer();
  const ws = readState(woodman);
  for (let i = 0; i < 300; i++) {
    gatherOwn(woodman, ws, "S3", "wood", box, { search: true });
    writeState(woodman, ws);
    advance(10);
  }
  const wood = Object.values(summarize(box)).reduce((a, b) => a + b, 0);
  // Ambangnya diturunkan dari 100 sejak v1.7: membongkar blok sekarang BUTUH
  // WAKTU (dig.js), dan satu batang oak dengan tangan kosong makan tiga detik
  // persis seperti di Minecraft asli. Tiga ribu tick tangan kosong tidak
  // mungkin lagi menghasilkan seratus batang — dan memang tidak boleh.
  // Yang diuji tetap sama: kayunya benar-benar masuk peti, bukan mondar-mandir.
  check(wood >= 12, "berdiri di hutan rapat: kayunya benar-benar terkumpul",
        `${wood} kayu dalam 300 denyut`);
}

/* -------- Uji 11: companion bertanya, pemain menjawab ------------------- */
console.log("\n== Uji pertanyaan: petani soal bibit, penambang soal bijih ==");
{
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  const owner = makePlayer(W.dimension, { id: "Q1", name: "Pemilik" });
  __setPlayers([owner]);

  const farmer = makeCompanion(W.dimension, "vbs:kohane", { x: 0, y: 65, z: 0 });
  farmer.setDynamicProperty("vbs:owner", "Q1");
  const asked = askOwner(farmer, "Q1", {
    id: "seed", field: "seedSelf",
    text: "Apakah aku mencari bibit sendiri, atau kamu yang mencarikan?",
    options: [{ key: "ya", label: "Aku sendiri" }, { key: "tidak", label: "Kamu yang carikan" }],
  });
  check(asked, "pertanyaan petani benar-benar terpasang");
  check(pendingAsks("Q1").length === 1, "pertanyaannya tersimpan di papan pemilik");
  check(owner.messages.some((m) => m.includes("ya")),
        "pemain diberi tahu cara menjawabnya");
  check(!askOwner(farmer, "Q1", {
    id: "seed", field: "seedSelf", text: "sama", options: [{ key: "ya", label: "a" }],
  }), "pertanyaan yang sama tidak diulang-ulang");

  answerLatestYesNo("Q1", "ya");
  check(readState(farmer).seedSelf === "ya", "jawaban 'ya' di chat tertulis ke state petani",
        String(readState(farmer).seedSelf));
  check(pendingAsks("Q1").length === 0, "pertanyaan hilang dari papan sesudah dijawab");

  // Penambang: pertanyaannya diajukan sendiri oleh tickMine.
  const miner = makeCompanion(W.dimension, "vbs:akito", { x: 20, y: 65, z: 20 });
  miner.setDynamicProperty("vbs:owner", "Q1");
  miner.setDynamicProperty("vbs:mode", "mine");
  W.put(22, 65, 22, "minecraft:chest");
  patchState(miner, { station: { x: 22, y: 65, z: 22 } });
  const mc = W.dimension.getBlock({ x: 22, y: 65, z: 22 }).getComponent("minecraft:inventory").container;
  mc.fill("minecraft:oak_planks", 64);
  mc.fill("minecraft:stick", 64);
  for (let i = 0; i < 5; i++) {
    const st = readState(miner);
    tickMine(miner, st, undefined);
    writeState(miner, st);
    advance(10);
  }
  const mineAsk = pendingAsks("Q1").find((q) => q.field === "mineWants");
  check(Boolean(mineAsk), "penambang bertanya apa saja yang harus ditambang");
  check(Boolean(mineAsk?.multi), "pertanyaannya boleh dijawab lebih dari satu pilihan");
  check((mineAsk?.options.length ?? 0) >= 10, "semua bijih ada di daftar pilihan",
        `${mineAsk?.options.length} pilihan`);

  answerAsk("Q1", mineAsk.id, ["coal"]);
  check(JSON.stringify(readState(miner).mineWants) === '["coal"]',
        "pilihan pemain tersimpan di state penambang",
        JSON.stringify(readState(miner).mineWants));

  // Jawaban itu benar-benar mengubah perilaku: batu bara ada di y 40, jadi
  // tidak ada gunanya menggali sampai -54. Galiannya dimulai persis di atas
  // batas supaya uji ini memeriksa keputusannya, bukan menunggu dua puluh
  // menit galian yang kecepatannya bergantung arah acak.
  patchState(miner, { plan: { mine: { phase: "descend", x: 20, y: 44, z: 20, dir: 0, step: 0, branch: 0, branchSide: 1, branchStep: 0 } } });
  miner.location = { x: 20, y: 44, z: 20 };
  // Sudah pegang beliung: yang diuji di sini keputusan KEDALAMAN, bukan urutan
  // menempa alat (itu sudah punya ujinya sendiri di atas).
  setGear(miner, "mainhand", makeItem("minecraft:iron_pickaxe", 1));
  // Langkah kakinya sendiri diurus tickSteer() di main.js, yang tidak ikut
  // dijalankan di sini — jadi companion "diantar" ke titik galiannya tiap
  // denyut. Yang diuji keputusan sampai berapa dalam dia menggali, bukan
  // seberapa cepat dia berjalan ke sana.
  let deepest = 999;
  let reachedTunnel = false;
  for (let i = 0; i < 400; i++) {
    const st = readState(miner);
    tickMine(miner, st, undefined);
    writeState(miner, st);
    const plan = readState(miner).plan?.mine;
    if (plan) {
      deepest = Math.min(deepest, plan.y);
      miner.location = { x: plan.x + 0.5, y: plan.y, z: plan.z + 0.5 };
      if (plan.phase === "tunnel") { reachedTunnel = true; break; }
    }
    advance(10);
  }
  check(reachedTunnel, "penambang berhenti menurun dan mulai terowongan",
        `y terdalam ${deepest}`);
  check(deepest >= 40,
        "tidak pernah lebih dalam dari bijih yang diminta (batu bara: y 40)",
        `y terdalam ${deepest}`);

  // Pertanyaan tidak dijawab TIDAK boleh menghentikan pekerjaan.
  const stubborn = makeCompanion(W.dimension, "vbs:toya", { x: 60, y: 65, z: 60 });
  stubborn.setDynamicProperty("vbs:owner", "Q2");
  stubborn.setDynamicProperty("vbs:mode", "mine");
  W.put(62, 65, 62, "minecraft:chest");
  patchState(stubborn, { station: { x: 62, y: 65, z: 62 } });
  const sc = W.dimension.getBlock({ x: 62, y: 65, z: 62 }).getComponent("minecraft:inventory").container;
  sc.fill("minecraft:oak_planks", 64);
  sc.fill("minecraft:stick", 64);
  let status = "";
  for (let i = 0; i < 200; i++) {
    const st = readState(stubborn);
    status = tickMine(stubborn, st, undefined);
    writeState(stubborn, st);
    advance(10);
  }
  check(readState(stubborn).mineWants === null,
        "pertanyaan yang belum dijawab tetap null (artinya: tambang apa saja)");
  check(Boolean(getGear(stubborn).mainhand),
        "penambang tetap bekerja walau pertanyaannya belum dijawab", status);
  __setPlayers([]);
}

/* -------- Uji 12: buku sebagai alat ------------------------------------- */
console.log("\n== Uji buku: isi peti, aktivitas, dan halaman companion ==");
{
  const W = makeWorld({ groundY: 64 });
  __setDimension(W.dimension);
  const player = makePlayer(W.dimension, { id: "B1", name: "Pembaca" });
  __setPlayers([player]);

  const worker = makeCompanion(W.dimension, "vbs:an", { x: 3, y: 65, z: 3 });
  worker.setDynamicProperty("vbs:owner", "B1");
  worker.setDynamicProperty("vbs:mode", "farm");
  W.put(5, 65, 5, "minecraft:chest");
  patchState(worker, { station: { x: 5, y: 65, z: 5 }, bag: { "minecraft:wheat": 7 } });
  const chest = W.dimension.getBlock({ x: 5, y: 65, z: 5 }).getComponent("minecraft:inventory").container;
  chest.fill("minecraft:carrot", 12);

  setActivity(worker, "memanen gandum di petak 3,4");
  check(getActivity(worker) === "memanen gandum di petak 3,4",
        "aktivitas companion terbaca untuk halaman 'Sedang Apa'");
  const isi = summarize(chest);
  check(isi["minecraft:carrot"] === 12, "isi peti stasiun terbaca untuk halaman isi",
        JSON.stringify(isi));
  check(bagCount(readState(worker)) === 7, "isi kantong pribadi ikut terhitung",
        String(bagCount(readState(worker))));

  // Halaman bukunya sendiri: form tiruan selalu dibatalkan, jadi yang diuji
  // adalah bahwa seluruh jalurnya tertaut dan tidak melempar — persis kelas
  // kesalahan yang mematikan mesin skrip Bedrock diam-diam.
  let threw;
  try {
    await openBook(player);
  } catch (err) {
    threw = err;
  }
  check(!threw, "buku panduan terbuka tanpa melempar", threw ? String(threw) : "");
  __setPlayers([]);
  __setDimension(undefined);
}

console.log(`\nlog: ${JSON.stringify(logStats())}`);
if (failures) {
  console.log(`\n${failures} pemeriksaan GAGAL`);
  process.exit(1);
}
console.log("\nsemua pemeriksaan simulasi lolos");
