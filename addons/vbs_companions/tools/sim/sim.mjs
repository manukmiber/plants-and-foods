// Simulasi otak companion di luar Minecraft.
import { system, world } from "@minecraft/server";
import { makeWorld, makeContainer, makeCompanion } from "./world.mjs";
import { LOG_CONFIG, LogLevel, logStats } from "./scripts/logger.js";
import { readState, writeState, patchState } from "./scripts/state.js";
import { setClaim } from "./scripts/state.js";
import { tickFarm } from "./scripts/farming.js";
import { tickMine } from "./scripts/mining.js";
import { tickCrafter } from "./scripts/crafter.js";
import { tickLooter } from "./scripts/looter.js";
import { tickEnergy } from "./scripts/energy.js";
import { readRequests } from "./scripts/requests.js";
import { getGear } from "./scripts/util.js";

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

  // Lahan harus rata di satu ketinggian. Kolom yang ditempati perabot
  // companion (peti, meja kerja, papan, pagar hias) sengaja dikecualikan —
  // itu memang tidak boleh dibongkar.
  const FURNITURE = new Set(["minecraft:chest", "minecraft:crafting_table",
    "minecraft:standing_sign", "minecraft:barrel", "minecraft:torch"]);
  let uneven = 0;
  const samples = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
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
  check(uneven === 0, "permukaan ladang rata di satu ketinggian",
        `${uneven} kolom menyimpang ${samples.join(" ")}`);
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

console.log(`\nlog: ${JSON.stringify(logStats())}`);
if (failures) {
  console.log(`\n${failures} pemeriksaan GAGAL`);
  process.exit(1);
}
console.log("\nsemua pemeriksaan simulasi lolos");
