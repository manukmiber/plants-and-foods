/**
 * Angka dan teks yang dipakai bersama seluruh add-on.
 */

export const NS = "vbs";
export const FAMILY = "vbs_companion";
export const MARKER = "vbs:marker";

export const COMPANIONS = {
  "vbs:akito": { name: "Akito", color: "§6", farmRadius: 5, damage: 6, voice: "keras" },
  "vbs:kohane": { name: "Kohane", color: "§d", farmRadius: 6, damage: 4, voice: "lembut" },
  "vbs:an": { name: "An", color: "§b", farmRadius: 6, damage: 5, voice: "santai" },
  "vbs:toya": { name: "Toya", color: "§9", farmRadius: 7, damage: 5, voice: "tenang" },
  "vbs:flins": { name: "Flins", color: "§5", farmRadius: 5, damage: 7, voice: "sopan" },
};

export const MODES = {
  follow: {
    label: "Mengikuti",
    button: "§aIkuti Aku",
    hint: "Menempel ke mana pun kamu pergi",
    event: "vbs:set_follow",
    icon: "textures/items/compass_item",
    hat: 0,
  },
  farm: {
    label: "Bertani",
    button: "§6Mode Bertani",
    hint: "Membuka ladang, menanam berpola, memanen",
    event: "vbs:set_farm",
    icon: "textures/items/wheat",
    hat: 1,
  },
  attack: {
    label: "Bertarung",
    button: "§cMode Bertarung",
    hint: "Menyerang monster, pedang atau busur",
    event: "vbs:set_attack",
    icon: "textures/items/iron_sword",
    hat: 0,
  },
  stay: {
    label: "Diam di tempat",
    button: "§7Diam di Tempat",
    hint: "Berjaga di titik ini",
    event: "vbs:set_stay",
    icon: "textures/items/bone",
    hat: 0,
  },
  mine: {
    label: "Menambang",
    button: "§8Mode Menambang",
    hint: "Menggali terowongan bercabang dan mengumpulkan ore",
    event: "vbs:set_mine",
    icon: "textures/items/iron_pickaxe",
    hat: 2,
  },
  wander: {
    label: "Mengembara",
    button: "§2Mode Mengembara",
    hint: "Menjelajah, mencatat temuan, pulang membawa barang",
    event: "vbs:set_wander",
    icon: "textures/items/map_filled",
    hat: 3,
  },
  build: {
    label: "Membangun",
    button: "§eMode Membangun",
    hint: "Membangun rancangan dari bahan di peti",
    event: "vbs:set_build",
    icon: "textures/items/brick",
    hat: 0,
  },
  crafter: {
    label: "Merajin",
    button: "§bMode Merajin",
    hint: "Membuatkan alat untuk companion lain yang kehabisan",
    event: "vbs:set_crafter",
    icon: "textures/items/iron_ingot",
    hat: 0,
  },
  looter: {
    label: "Mencari Barang",
    button: "§aMode Mencari Barang",
    hint: "Menebang kayu, menggali batu, memungut barang untuk perajin & pembangun",
    event: "vbs:set_looter",
    icon: "textures/items/emerald",
    hat: 0,
  },
};

export const DEFAULT_MODE = "follow";

export const POSE = {
  normal: 0,
  harvest: 1,
  greet: 2,
  mine: 3,
  build: 4,
  guard: 5,
  aim: 6,
  talk: 7,
};

export const FACE = {
  auto: 0,
  neutral: 1,
  blink: 2,
  smile: 3,
  happy: 4,
  surprised: 5,
  hurt: 6,
  sleepy: 7,
  sing: 8,
};

export const PROP = {
  owner: "vbs:owner",
  asks: "vbs:asks",
  ownerName: "vbs:owner_name",
  mode: "vbs:mode",
  gear: "vbs:gear",
  state: "vbs:state",
  claims: "vbs:claims",
  waypoints: "vbs:waypoints",
  requests: "vbs:requests",
  villageHomes: "vbs:village_homes",
  stations: "vbs:stations",
  workshops: "vbs:workshops",
  settings: "vbs:settings",
  village: "vbs:village_offer",
};

export const ARMOR_POINTS = {
  leather: [1, 3, 2, 1],
  golden: [2, 5, 3, 1],
  chainmail: [2, 5, 4, 1],
  iron: [2, 6, 5, 2],
  diamond: [3, 8, 6, 3],
  netherite: [3, 8, 6, 3],
};

export const CROPS = {
  "minecraft:wheat": {
    state: "growth", ripe: 7, seed: "minecraft:wheat_seeds",
    drops: [["minecraft:wheat", 1, 1], ["minecraft:wheat_seeds", 0, 2]],
  },
  "minecraft:carrots": {
    state: "growth", ripe: 7, seed: "minecraft:carrot",
    drops: [["minecraft:carrot", 1, 3]],
  },
  "minecraft:potatoes": {
    state: "growth", ripe: 7, seed: "minecraft:potato",
    drops: [["minecraft:potato", 1, 3]],
  },
  "minecraft:beetroot": {
    state: "growth", ripe: 7, seed: "minecraft:beetroot_seeds",
    drops: [["minecraft:beetroot", 1, 1], ["minecraft:beetroot_seeds", 0, 2]],
  },
  "minecraft:nether_wart": {
    state: "age", ripe: 3, seed: "minecraft:nether_wart",
    drops: [["minecraft:nether_wart", 1, 3]],
  },
};

export const SEEDS = {
  "minecraft:wheat_seeds": "minecraft:wheat",
  "minecraft:carrot": "minecraft:carrots",
  "minecraft:potato": "minecraft:potatoes",
  "minecraft:beetroot_seeds": "minecraft:beetroot",
};

export const BAND_WIDTH = 2;

export const TOOL_TIERS = [
  { key: "wooden", rank: 1, name: "Kayu", material: "minecraft:planks", need: 2,
    accepts: ["minecraft:oak_planks", "minecraft:spruce_planks", "minecraft:birch_planks",
              "minecraft:jungle_planks", "minecraft:acacia_planks",
              "minecraft:dark_oak_planks", "minecraft:mangrove_planks",
              "minecraft:cherry_planks", "minecraft:bamboo_planks",
              "minecraft:crimson_planks", "minecraft:warped_planks"] },
  { key: "stone", rank: 2, name: "Batu", need: 2,
    accepts: ["minecraft:cobblestone", "minecraft:cobbled_deepslate",
              "minecraft:blackstone"] },
  { key: "iron", rank: 3, name: "Besi", need: 2, accepts: ["minecraft:iron_ingot"] },
  { key: "golden", rank: 4, name: "Emas", need: 2, accepts: ["minecraft:gold_ingot"] },
  { key: "diamond", rank: 5, name: "Intan", need: 2, accepts: ["minecraft:diamond"] },
];

export const LOGS = [
  "minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log",
  "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
  "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:crimson_stem",
  "minecraft:warped_stem",
];

export const TILLABLE = new Set([
  "minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt",
  "minecraft:rooted_dirt", "minecraft:podzol", "minecraft:moss_block",
  "minecraft:dirt_with_roots",
]);

export const WATER = new Set(["minecraft:water", "minecraft:flowing_water"]);

export const ORES = {
  "minecraft:coal_ore": "minecraft:coal",
  "minecraft:deepslate_coal_ore": "minecraft:coal",
  "minecraft:iron_ore": "minecraft:raw_iron",
  "minecraft:deepslate_iron_ore": "minecraft:raw_iron",
  "minecraft:copper_ore": "minecraft:raw_copper",
  "minecraft:deepslate_copper_ore": "minecraft:raw_copper",
  "minecraft:gold_ore": "minecraft:raw_gold",
  "minecraft:deepslate_gold_ore": "minecraft:raw_gold",
  "minecraft:redstone_ore": "minecraft:redstone",
  "minecraft:lit_redstone_ore": "minecraft:redstone",
  "minecraft:deepslate_redstone_ore": "minecraft:redstone",
  "minecraft:lapis_ore": "minecraft:lapis_lazuli",
  "minecraft:deepslate_lapis_ore": "minecraft:lapis_lazuli",
  "minecraft:diamond_ore": "minecraft:diamond",
  "minecraft:deepslate_diamond_ore": "minecraft:diamond",
  "minecraft:emerald_ore": "minecraft:emerald",
  "minecraft:deepslate_emerald_ore": "minecraft:emerald",
  "minecraft:quartz_ore": "minecraft:quartz",
  "minecraft:ancient_debris": "minecraft:ancient_debris",
};

// Apa saja yang boleh diminta pemain untuk ditambang, lengkap dengan
// kedalaman yang masuk akal untuk mencarinya. Penambang bertanya sekali lewat
// chat ("Apa saja yang harus aku mine?"), pemain menjawab dengan mencentang
// baris-baris ini di Buku Panduan, dan jawabannya disimpan di state.mineWants.
//
// `depth` dipakai memilih sampai berapa dalam terowongan diturunkan: kalau yang
// diminta cuma batu bara dan besi, tidak ada gunanya menggali sampai -54.
export const MINE_TARGETS = {
  coal: { label: "Batu bara", item: "minecraft:coal", depth: 40, icon: "textures/items/coal" },
  copper: { label: "Tembaga", item: "minecraft:raw_copper", depth: 40, icon: "textures/items/copper_ingot" },
  iron: { label: "Besi", item: "minecraft:raw_iron", depth: 12, icon: "textures/items/iron_ingot" },
  gold: { label: "Emas", item: "minecraft:raw_gold", depth: -16, icon: "textures/items/gold_ingot" },
  redstone: { label: "Redstone", item: "minecraft:redstone", depth: -54, icon: "textures/items/redstone_dust" },
  lapis: { label: "Lapis", item: "minecraft:lapis_lazuli", depth: 0, icon: "textures/items/dye_powder_blue_new" },
  diamond: { label: "Intan", item: "minecraft:diamond", depth: -54, icon: "textures/items/diamond" },
  emerald: { label: "Zamrud", item: "minecraft:emerald", depth: 40, icon: "textures/items/emerald" },
  quartz: { label: "Kuarsa", item: "minecraft:quartz", depth: 14, icon: "textures/items/quartz" },
  debris: { label: "Puing Purba", item: "minecraft:ancient_debris", depth: 14, icon: "textures/items/netherite_ingot" },
  stone: { label: "Batu biasa", item: "minecraft:cobblestone", depth: 40, icon: "textures/items/stick" },
};

// Kebalikan MINE_TARGETS: dari barang hasil tambang ke kunci pilihannya.
export const MINE_KEY_OF = Object.fromEntries(
  Object.entries(MINE_TARGETS).map(([key, meta]) => [meta.item, key]));

// Rumput yang kalau dibabat tangan kosong bisa menjatuhkan bibit gandum —
// jalan companion mencari bibit sendiri kalau pemiliknya menjawab "ya" waktu
// ditanya. Nama lama dan nama baru sama-sama ditulis: dunia 1.20 memakai
// "tallgrass", 1.21 memakai "short_grass", dan keduanya masih dijumpai.
export const SEED_SOURCES = [
  "minecraft:tallgrass", "minecraft:short_grass", "minecraft:tall_grass",
  "minecraft:fern", "minecraft:large_fern", "minecraft:double_plant",
];

export const DIGGABLE = new Set([
  "minecraft:stone", "minecraft:cobblestone", "minecraft:andesite",
  "minecraft:diorite", "minecraft:granite", "minecraft:tuff",
  "minecraft:deepslate", "minecraft:cobbled_deepslate", "minecraft:dirt",
  "minecraft:gravel", "minecraft:sandstone", "minecraft:calcite",
  "minecraft:dripstone_block", "minecraft:grass_block", "minecraft:coarse_dirt",
  ...Object.keys(ORES),
]);

// Blok yang ikut dijumpai saat menggali terowongan tapi dulu tidak ada di
// DIGGABLE — akibatnya satu blok asing di ketinggian kepala membuat penambang
// membatalkan seluruh kolom galian dan membelok, jadi terowongannya tidak
// pernah benar-benar setinggi tiga blok.
export const DIGGABLE_EXTRA = new Set([
  "minecraft:sand", "minecraft:red_sand", "minecraft:clay", "minecraft:mud",
  "minecraft:smooth_basalt", "minecraft:basalt", "minecraft:blackstone",
  "minecraft:netherrack", "minecraft:soul_sand", "minecraft:soul_soil",
  "minecraft:magma", "minecraft:end_stone", "minecraft:packed_ice",
  "minecraft:blue_ice", "minecraft:ice", "minecraft:snow", "minecraft:moss_block",
  "minecraft:rooted_dirt", "minecraft:podzol", "minecraft:mycelium",
  "minecraft:terracotta", "minecraft:amethyst_block", "minecraft:tuff_bricks",
  "minecraft:deepslate_bricks", "minecraft:deepslate_tiles", "minecraft:sculk",
  "minecraft:mossy_cobblestone", "minecraft:infested_stone",
  "minecraft:stone_bricks", "minecraft:cracked_stone_bricks",
  "minecraft:mossy_stone_bricks", "minecraft:chiseled_stone_bricks",
  "minecraft:suspicious_sand", "minecraft:suspicious_gravel",
  "minecraft:raw_iron_block", "minecraft:raw_copper_block",
]);

export const PROTECTED = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
  "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker",
  "minecraft:crafting_table", "minecraft:enchanting_table", "minecraft:anvil",
  "minecraft:bed", "minecraft:beacon", "minecraft:end_portal_frame",
  "minecraft:spawner", "minecraft:bedrock", "minecraft:obsidian",
  "minecraft:shulker_box", "minecraft:hopper", "minecraft:lodestone",
]);

export const FOOD_HEAL = {
  "minecraft:bread": 6,
  "minecraft:cooked_beef": 8,
  "minecraft:cooked_porkchop": 8,
  "minecraft:golden_apple": 20,
  "minecraft:apple": 4,
  "minecraft:cookie": 3,
  "minecraft:cake": 10,
  "minecraft:sweet_berries": 2,
};

// Resep barang non-alat yang benar-benar harus punya bahannya dulu sebelum
// boleh dipasang. Sebelum ini peti stasiun, papan nama dan meja kerja muncul
// begitu saja dari udara — sekarang semuanya ditempa dari isi peti, dan kalau
// bahannya tidak ada, permintaan bantuan dipasang ke perajin/pencari barang.
export const ITEM_RECIPES = {
  bucket: {
    id: "minecraft:bucket", label: "Ember", makes: 1, needsTable: true,
    needs: [{ any: ["minecraft:iron_ingot"], count: 3 }],
    ask: "iron",
  },
  chest: {
    id: "minecraft:chest", label: "Peti", makes: 1, needsTable: true,
    needs: [{ any: "planks", count: 8 }],
    ask: "wood",
  },
  sign: {
    id: "minecraft:oak_sign", label: "Papan Nama", makes: 3, needsTable: true,
    needs: [{ any: "planks", count: 6 }, { any: ["minecraft:stick"], count: 1 }],
    ask: "wood",
  },
  crafting_table: {
    id: "minecraft:crafting_table", label: "Meja Kerja", makes: 1, needsTable: false,
    needs: [{ any: "planks", count: 4 }],
    ask: "wood",
  },
  torch: {
    id: "minecraft:torch", label: "Obor", makes: 4, needsTable: false,
    needs: [{ any: ["minecraft:stick"], count: 1 },
            { any: ["minecraft:coal", "minecraft:charcoal"], count: 1 }],
    ask: "coal",
  },
  // Tanpa tungku, bijih besi yang digali penambang berhenti sebagai
  // "raw_iron" dan tingkat alat besi TIDAK PERNAH bisa dicapai — TOOL_TIERS
  // besi cuma menerima iron_ingot. Tungku itu mata rantai yang hilang, bukan
  // hiasan halaman.
  furnace: {
    id: "minecraft:furnace", label: "Tungku", makes: 1, needsTable: true,
    needs: [{ any: "cobble", count: 8 }],
    ask: "stone",
  },
};

// Bahan mentah yang boleh diminta ke pencari barang (looter). Nilainya adalah
// daftar item yang dianggap memenuhi permintaan itu.
export const MATERIAL_REQUESTS = {
  wood: { label: "kayu", ids: "logs", want: 16 },
  planks: { label: "papan", ids: "planks", want: 16 },
  stone: { label: "batu", ids: ["minecraft:cobblestone", "minecraft:stone", "minecraft:cobbled_deepslate"], want: 16 },
  iron: { label: "besi", ids: ["minecraft:iron_ingot", "minecraft:raw_iron"], want: 3 },
  dirt: { label: "tanah timbun", ids: ["minecraft:dirt", "minecraft:coarse_dirt"], want: 32 },
  coal: { label: "arang", ids: ["minecraft:coal", "minecraft:charcoal"], want: 8 },
  seed: { label: "bibit", ids: ["minecraft:wheat_seeds", "minecraft:carrot", "minecraft:potato", "minecraft:beetroot_seeds"], want: 16 },
};

export const CHEST_IDS = [
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
];

export const SIGN_IDS = [
  "minecraft:oak_sign", "minecraft:spruce_sign", "minecraft:birch_sign",
  "minecraft:jungle_sign", "minecraft:acacia_sign", "minecraft:dark_oak_sign",
];

export const BED_IDS = [
  "minecraft:red_bed", "minecraft:white_bed", "minecraft:blue_bed",
  "minecraft:green_bed", "minecraft:brown_bed", "minecraft:black_bed",
  "minecraft:gray_bed", "minecraft:light_gray_bed", "minecraft:cyan_bed",
  "minecraft:purple_bed", "minecraft:magenta_bed", "minecraft:pink_bed",
  "minecraft:lime_bed", "minecraft:yellow_bed", "minecraft:orange_bed",
  "minecraft:light_blue_bed",
];

export const STAKE_NAME = "§ePatok Ladang";
export const STAKE_ITEM = "minecraft:stick";

export const VILLAGE_STAKE_NAME = "§2Patok Desa";
export const VILLAGE_STAKE_ITEM = "minecraft:stick";

// Bunga apa saja bisa dipakai untuk menjinakkan companion — secara default dia
// liar (untamed) begitu muncul, dan baru menempel ke pemain sesudah diberi satu
// bunga (item ini langsung habis dipakai, sama seperti taming kucing pakai ikan).
export const FLOWERS = new Set([
  "minecraft:yellow_flower","minecraft:red_flower","minecraft:double_plant",
  "minecraft:poppy", "minecraft:dandelion", "minecraft:blue_orchid",
  "minecraft:allium", "minecraft:azure_bluet", "minecraft:red_tulip",
  "minecraft:orange_tulip", "minecraft:white_tulip", "minecraft:pink_tulip",
  "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
  "minecraft:wither_rose", "minecraft:sunflower", "minecraft:lilac",
  "minecraft:rose_bush", "minecraft:peony", "minecraft:torchflower",
  "minecraft:wildflowers", "minecraft:pink_petals", "minecraft:closed_eyeblossom",
  "minecraft:open_eyeblossom",
]);

// Bunga yang disebut komponen minecraft:tameable di berkas entity. Untuk yang
// ada di daftar ini, MESIN GIM yang menjinakkan: bunganya dihabiskan gim,
// vbs:on_tamed menyala, dan script tinggal mencatat pemiliknya (taming.js).
// Bunga di FLOWERS yang TIDAK ada di sini tetap bisa menjinakkan, tapi lewat
// jalur script — bunga diambil sendiri dari tangan pemain.
//
// Isinya harus sama persis dengan TAME_ITEMS di tools/gen_packs.py; validate.py
// menolak kalau keduanya melenceng, karena daftar yang diam-diam berbeda
// artinya bunga yang katanya bisa dipakai ternyata tidak menjinakkan apa pun.
export const TAME_ITEMS = new Set([
  "minecraft:red_flower", "minecraft:poppy", "minecraft:dandelion",
  "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet",
  "minecraft:red_tulip", "minecraft:orange_tulip", "minecraft:white_tulip",
  "minecraft:pink_tulip", "minecraft:oxeye_daisy", "minecraft:cornflower",
  "minecraft:lily_of_the_valley", "minecraft:wither_rose", "minecraft:sunflower",
  "minecraft:lilac", "minecraft:rose_bush", "minecraft:peony",
  "minecraft:torchflower",
]);

// Energi terkuras selama mode kerja (bukan follow/stay/greet) dan pulih lagi
// selama beristirahat. Angka dalam poin per denyut kerja (TICKS.brain = 10 tick
// game = 0.5 detik), jadi ~660 denyut kerja (±5,5 menit kerja terus-menerus)
// menghabiskan energi penuh, dan istirahat penuh (20 -> 100) makan ±16 detik.
export const ENERGY = {
  max: 100,
  start: 100,
  drainPerWork: 0.15,
  restPerTick: 5,
  tiredAt: 35,
  exhaustedAt: 15,
  chatRestGain: 2,
  minRestTicks: 100,
};

// Mode yang benar-benar dianggap "kerja" dan menguras energi. Follow, stay dan
// diam saat disapa tidak menguras — companion cuma capek kalau benar bekerja.
export const WORK_MODES = new Set([
  "farm", "mine", "wander", "build", "attack", "crafter", "looter",
]);

export const LOOK = {
  enabled: true,
  stopInCombat: true,
  radius: 10,
  cone: 0.965,
  holdTicks: 12,
  waveEvery: 90,
};

export const CHAT = {
  bubbleRadius: 18,
  bubbleTicks: 90,
  chatRadius: 64,
};

export const TICKS = {
  brain: 10,
  fast: 4,
  leash: 40,
  social: 140,
  teleportAt: 24,
};
// Daftar papan kayu dipakai di banyak berkas (crafting, stasiun, pembangun).
// Diambil dari tier pertama TOOL_TIERS supaya tidak ada dua daftar yang bisa
// berbeda isi.
export const PLANKS = TOOL_TIERS[0].accepts;

// Batu bulat dan sebangsanya, dari tier kedua — bahan tungku. Alasannya
// sama: satu daftar saja supaya tidak ada dua yang bisa berbeda isi.
export const COBBLE = TOOL_TIERS[1].accepts;

// Rasa kantuk terpisah dari energi. Energi habis karena BEKERJA; kantuk naik
// karena WAKTU berjalan dan memuncak di malam hari. Companion yang mengantuk
// akan mencari ranjang di rumah desa; kalau tidak ada ranjang, dia tidur di
// bawah pohon atau di stasiunnya sendiri.
export const SLEEP = {
  max: 100,
  gainPerTick: 0.06,        // per denyut kerja (TICKS.brain)
  gainAtNight: 0.30,        // tambahan saat malam
  sleepyAt: 60,             // mulai menguap, wajah sleepy
  mustSleepAt: 85,          // wajib cari tempat tidur
  recoverPerTick: 2.2,      // pemulihan saat tidur
  wakeBelow: 10,
  nightFrom: 13000,         // waktu dunia (tick) mulai malam
  nightTo: 23000,
  minSleepTicks: 120,
};

// Label mode yang dipakai di laporan dan obrolan.
export const MODE_LABEL = Object.fromEntries(
  Object.entries(MODES).map(([key, meta]) => [key, meta.label]));
