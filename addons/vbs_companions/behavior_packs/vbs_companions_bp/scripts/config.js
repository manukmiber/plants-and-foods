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
  trader: {
    label: "Berdagang",
    button: "§dMode Berdagang",
    hint: "Menjual kelebihan panen ke villager, membeli yang diminta companion lain",
    event: "vbs:set_trader",
    icon: "textures/items/emerald",
    hat: 3,
  },
  fisher: {
    label: "Memancing",
    button: "§3Mode Memancing",
    hint: "Membuat joran, mencari perairan, memancing ikan untuk dapur",
    event: "vbs:set_fisher",
    icon: "textures/items/fishing_rod",
    hat: 3,
  },
  rancher: {
    label: "Beternak",
    button: "§aMode Beternak",
    hint: "Menggiring hewan ke kandang, memberi makan, mencukur, memerah, memanen telur",
    event: "vbs:set_rancher",
    icon: "textures/items/wheat",
    hat: 1,
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

// Bahan timbun yang boleh dipakai meratakan cekungan ladang. Semuanya bisa
// dicangkul jadi farmland, jadi petani tidak mentok cuma karena yang ada di
// peti "rumput" dan bukan "tanah" — dua-duanya sama saja untuk ladang.
export const FILL_BLOCK = "minecraft:dirt";

export const FILLS = [
  "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:grass_block",
  "minecraft:rooted_dirt", "minecraft:podzol",
];

/**
 * Apa yang tersisa di tangan sesudah memangkas satu blok saat meratakan.
 *
 * Dipakai dua arah. Ke depan: hasil pangkasan masuk peti. Ke belakang: kolom
 * yang hasil pangkasannya berupa TANAH adalah kolom yang boleh digali petani
 * untuk menambal cekungan di ladangnya sendiri (farmplan.js » borrowSpot).
 */
export const SPOIL = {
  "minecraft:grass_block": FILL_BLOCK,
  "minecraft:dirt": FILL_BLOCK,
  "minecraft:coarse_dirt": FILL_BLOCK,
  "minecraft:rooted_dirt": FILL_BLOCK,
  "minecraft:podzol": FILL_BLOCK,
  "minecraft:mycelium": FILL_BLOCK,
  "minecraft:moss_block": FILL_BLOCK,
  "minecraft:dirt_with_roots": FILL_BLOCK,
  "minecraft:farmland": FILL_BLOCK,
  "minecraft:sand": "minecraft:sand",
  "minecraft:gravel": "minecraft:gravel",
  "minecraft:stone": "minecraft:cobblestone",
  "minecraft:cobblestone": "minecraft:cobblestone",
  "minecraft:andesite": "minecraft:andesite",
  "minecraft:diorite": "minecraft:diorite",
  "minecraft:granite": "minecraft:granite",
  "minecraft:deepslate": "minecraft:cobbled_deepslate",
};

// Kolom yang boleh digali untuk bahan timbun: yang hasilnya benar-benar tanah.
export const FILL_SOURCE = new Set(
  Object.keys(SPOIL).filter((id) => SPOIL[id] === FILL_BLOCK));

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

/**
 * Apa yang TERSISA DI TANGAN sesudah satu blok galian biasa dipatahkan.
 *
 * Bukan bijih — ini batu, tanah, kerikil dan pasir yang mau tidak mau harus
 * dibongkar supaya lorongnya lewat. Dulu semuanya menguap begitu saja: satu
 * terowongan sepanjang lima puluh blok berarti ratusan blok batu yang lenyap
 * dari dunia tanpa pernah masuk peti siapa pun, sementara di permukaan petani
 * berdiri diam menunggu kiriman tanah timbun dan pembangun kehabisan batu.
 * Sekarang hasil galian dibawa pulang seperti penambang sungguhan.
 *
 * Blok yang TIDAK ada di sini memang tidak meninggalkan apa-apa yang berguna
 * (daun, rumput, sarang laba-laba) dan sengaja dibiarkan hilang.
 */
export const MINE_SPOIL = {
  "minecraft:stone": "minecraft:cobblestone",
  "minecraft:cobblestone": "minecraft:cobblestone",
  "minecraft:mossy_cobblestone": "minecraft:mossy_cobblestone",
  "minecraft:deepslate": "minecraft:cobbled_deepslate",
  "minecraft:cobbled_deepslate": "minecraft:cobbled_deepslate",
  "minecraft:andesite": "minecraft:andesite",
  "minecraft:diorite": "minecraft:diorite",
  "minecraft:granite": "minecraft:granite",
  "minecraft:tuff": "minecraft:tuff",
  "minecraft:calcite": "minecraft:calcite",
  "minecraft:dripstone_block": "minecraft:dripstone_block",
  "minecraft:smooth_basalt": "minecraft:smooth_basalt",
  "minecraft:basalt": "minecraft:basalt",
  "minecraft:blackstone": "minecraft:blackstone",
  "minecraft:netherrack": "minecraft:netherrack",
  "minecraft:end_stone": "minecraft:end_stone",
  "minecraft:sandstone": "minecraft:sandstone",
  "minecraft:red_sandstone": "minecraft:red_sandstone",
  "minecraft:terracotta": "minecraft:terracotta",
  "minecraft:stone_bricks": "minecraft:stone_bricks",
  "minecraft:dirt": "minecraft:dirt",
  "minecraft:coarse_dirt": "minecraft:coarse_dirt",
  "minecraft:rooted_dirt": "minecraft:rooted_dirt",
  "minecraft:grass_block": "minecraft:dirt",
  "minecraft:podzol": "minecraft:podzol",
  "minecraft:mycelium": "minecraft:mycelium",
  "minecraft:mud": "minecraft:mud",
  "minecraft:clay": "minecraft:clay",
  "minecraft:gravel": "minecraft:gravel",
  "minecraft:sand": "minecraft:sand",
  "minecraft:red_sand": "minecraft:red_sand",
  "minecraft:soul_sand": "minecraft:soul_sand",
  "minecraft:soul_soil": "minecraft:soul_soil",
  "minecraft:moss_block": "minecraft:moss_block",
  "minecraft:snow": "minecraft:snowball",
  "minecraft:packed_ice": "minecraft:packed_ice",
  "minecraft:blue_ice": "minecraft:blue_ice",
  "minecraft:amethyst_block": "minecraft:amethyst_block",
};

// Berapa banyak tiap JENIS hasil galian biasa yang mau dibawa pulang. Satu
// tumpuk sudah cukup: lebih dari itu, penambang menghabiskan waktunya
// bolak-balik ke peti alih-alih menggali.
export const MINE_SPOIL_CAP = 64;

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

// Daun. Dulu daun tidak ada di daftar mana pun, dan akibatnya dua hal buruk
// sekaligus: isSolid() menganggapnya lantai yang sah (peti, meja kerja dan
// papan nama jadi bisa berdiri melayang di atas tajuk pohon) sementara
// isPassable() menganggapnya dinding (companion berdiri mendorong daun dan
// tidak pernah sampai ke tujuannya). Sekarang daun punya namanya sendiri:
// tidak bisa dipijak, tidak bisa ditembus — TAPI boleh dibabat kalau dia yang
// menghalangi jalan (util.js » clearWay).
export const LEAVES = new Set([
  "minecraft:leaves", "minecraft:leaves2",
  "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves",
  "minecraft:jungle_leaves", "minecraft:acacia_leaves", "minecraft:dark_oak_leaves",
  "minecraft:mangrove_leaves", "minecraft:cherry_leaves", "minecraft:pale_oak_leaves",
  "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered",
]);

// Blok lunak yang boleh dibabat companion supaya jalannya terbuka. Semuanya
// murah dan tidak ada yang menyesal kalau hilang — daun, sulur, salju tipis,
// tanaman gua. Batang pohon TIDAK ada di sini: menebang pohon adalah pekerjaan,
// bukan efek samping berjalan kaki.
export const SOFT_PATH = new Set([
  ...LEAVES,
  "minecraft:vine", "minecraft:snow_layer", "minecraft:cave_vines",
  "minecraft:cave_vines_body_with_berries", "minecraft:cave_vines_head_with_berries",
  "minecraft:twisting_vines", "minecraft:weeping_vines", "minecraft:hanging_roots",
  "minecraft:glow_lichen", "minecraft:bamboo", "minecraft:big_dripleaf",
  "minecraft:small_dripleaf_block", "minecraft:spore_blossom",
  "minecraft:brown_mushroom_block", "minecraft:red_mushroom_block",
  "minecraft:mangrove_roots", "minecraft:moss_carpet", "minecraft:pink_petals",
]);

export const PROTECTED = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
  "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker",
  "minecraft:crafting_table", "minecraft:enchanting_table", "minecraft:anvil",
  "minecraft:bed", "minecraft:beacon", "minecraft:end_portal_frame",
  "minecraft:spawner", "minecraft:bedrock", "minecraft:obsidian",
  "minecraft:shulker_box", "minecraft:hopper", "minecraft:lodestone",
]);

/**
 * Dapur perajin (kitchen.js).
 *
 * MEALS dirakit di meja kerja; COOKABLE dibakar di tungku. Dua-duanya memakai
 * bahan yang memang dihasilkan companion sendiri: gandum dari petani, daging
 * dari peternak, ikan dari pemancing, kentang dan wortel dari ladang.
 */
export const MEALS = {
  bread: {
    id: "minecraft:bread", label: "Roti", makes: 1,
    needs: [{ any: ["minecraft:wheat"], count: 3 }],
  },
  cookie: {
    id: "minecraft:cookie", label: "Kukis", makes: 8,
    needs: [{ any: ["minecraft:wheat"], count: 2 },
            { any: ["minecraft:cocoa_beans"], count: 1 }],
  },
  beetroot_soup: {
    id: "minecraft:beetroot_soup", label: "Sup Bit", makes: 1,
    needs: [{ any: ["minecraft:beetroot"], count: 6 },
            { any: ["minecraft:bowl"], count: 1 }],
  },
  rabbit_stew: {
    id: "minecraft:mushroom_stew", label: "Sup Jamur", makes: 1,
    needs: [{ any: ["minecraft:red_mushroom"], count: 1 },
            { any: ["minecraft:brown_mushroom"], count: 1 },
            { any: ["minecraft:bowl"], count: 1 }],
  },
  pumpkin_pie: {
    id: "minecraft:pumpkin_pie", label: "Pai Labu", makes: 1,
    needs: [{ any: ["minecraft:pumpkin"], count: 1 },
            { any: ["minecraft:sugar"], count: 1 },
            { any: ["minecraft:egg"], count: 1 }],
  },
  cake: {
    id: "minecraft:cake", label: "Kue", makes: 1,
    needs: [{ any: ["minecraft:milk_bucket"], count: 3 },
            { any: ["minecraft:sugar"], count: 2 },
            { any: ["minecraft:egg"], count: 1 },
            { any: ["minecraft:wheat"], count: 3 }],
  },
};

// Bahan mentah -> hasil bakarannya. Tungku yang mengerjakan.
export const COOKABLE = {
  "minecraft:beef": "minecraft:cooked_beef",
  "minecraft:porkchop": "minecraft:cooked_porkchop",
  "minecraft:chicken": "minecraft:cooked_chicken",
  "minecraft:mutton": "minecraft:cooked_mutton",
  "minecraft:rabbit": "minecraft:cooked_rabbit",
  "minecraft:cod": "minecraft:cooked_cod",
  "minecraft:salmon": "minecraft:cooked_salmon",
  "minecraft:potato": "minecraft:baked_potato",
};

/**
 * Mode Berdagang (trader.js).
 *
 * VILLAGERS: entity yang dianggap lawan dagang. Dunia lama memakai
 * "minecraft:villager", yang baru "minecraft:villager_v2"; dua-duanya ditulis
 * karena satu dunia bisa berisi keduanya sekaligus.
 */
export const VILLAGERS = [
  "minecraft:villager_v2", "minecraft:villager", "minecraft:wandering_trader",
];

export const TRADE = {
  searchRadius: 32,     // sejauh apa mencari villager
  haggleTicks: 60,      // lama menawar sebelum barangnya berpindah
  maxLots: 4,           // paling banyak sekian lot sekali transaksi
  keepDefault: 32,      // simpanan bawaan sebelum sesuatu dianggap kelebihan
  complainEvery: 6000,  // jeda mengeluh "tidak ada villager" (~5 menit)
};

/**
 * Daftar harga add-on ini sendiri.
 *
 * BUKAN tawaran villager sungguhan: script API Bedrock yang stabil tidak bisa
 * membaca maupun menjalankan perdagangan vanilla. Villager-nya nyata, jarak
 * dan waktunya nyata; yang ditiru cuma daftar harganya. Angkanya sengaja
 * dibuat tidak menguntungkan — berdagang harus lebih lambat daripada bekerja
 * sendiri, kalau tidak seluruh mode kerja lain jadi tidak ada gunanya.
 */
export const PRICES = {
  // Berapa banyak yang DISIMPAN sebelum sisanya dianggap kelebihan.
  keep: {
    "minecraft:wheat": 64,
    "minecraft:wheat_seeds": 64,
    "minecraft:cobblestone": 128,
    "minecraft:dirt": 128,
    "minecraft:oak_log": 64,
    "minecraft:coal": 32,
    "minecraft:iron_ingot": 16,
  },
  // Yang dijual: satu "lot" ditukar sekian emerald.
  sell: {
    "minecraft:wheat": { lot: 20, emeralds: 1 },
    "minecraft:potato": { lot: 26, emeralds: 1 },
    "minecraft:carrot": { lot: 22, emeralds: 1 },
    "minecraft:beetroot": { lot: 15, emeralds: 1 },
    "minecraft:pumpkin": { lot: 6, emeralds: 1 },
    "minecraft:cobblestone": { lot: 32, emeralds: 1 },
    "minecraft:coal": { lot: 15, emeralds: 1 },
    "minecraft:iron_ingot": { lot: 4, emeralds: 1 },
    "minecraft:leather": { lot: 6, emeralds: 1 },
    "minecraft:wool": { lot: 8, emeralds: 1 },
    "minecraft:cooked_beef": { lot: 10, emeralds: 1 },
    "minecraft:cod": { lot: 12, emeralds: 1 },
    "minecraft:salmon": { lot: 10, emeralds: 1 },
  },
  // Yang dibeli, memakai kunci permintaan bahan (MATERIAL_REQUESTS).
  buy: {
    iron: { id: "minecraft:iron_ingot", count: 4, emeralds: 3, label: "besi" },
    coal: { id: "minecraft:coal", count: 12, emeralds: 2, label: "arang" },
    seed: { id: "minecraft:wheat_seeds", count: 24, emeralds: 1, label: "bibit" },
    wheat: { id: "minecraft:wheat", count: 18, emeralds: 2, label: "gandum" },
    glass: { id: "minecraft:glass", count: 8, emeralds: 2, label: "kaca" },
    stone: { id: "minecraft:cobblestone", count: 32, emeralds: 1, label: "batu" },
    wood: { id: "minecraft:oak_log", count: 12, emeralds: 2, label: "kayu" },
  },
};

/**
 * Mode Memancing (fisher.js).
 *
 * `pondMin` yang membedakan danau dari genangan: petak periksa 9x9 (pondCheck
 * 4) berisi 81 kolom, dan menuntut 24 di antaranya berair menyingkirkan parit
 * irigasi ladang sendiri — yang lebarnya satu blok — tanpa menyingkirkan kolam
 * kecil di halaman.
 */
export const FISH = {
  searchRadius: 24,     // sejauh apa mencari perairan
  pondCheck: 4,         // setengah lebar petak periksa
  pondMin: 24,          // blok air minimum di petak itu
  waitMin: 100,         // tunggu tersingkat sebelum kena (5 detik)
  waitMax: 400,         // tunggu terlama (20 detik)
  haulAt: 24,           // tangkapan sebanyak ini -> pulang menyetor
  complainEvery: 6000,  // jeda mengeluh "tidak ada air" (~5 menit)
  // Daftar tangkapan berbobot. Sampah ikut masuk dengan sengaja: memancing
  // yang selalu menghasilkan ikan berhenti terasa seperti memancing.
  loot: [
    { id: "minecraft:cod", weight: 40, min: 1, max: 2 },
    { id: "minecraft:salmon", weight: 22, min: 1, max: 2 },
    { id: "minecraft:tropical_fish", weight: 6 },
    { id: "minecraft:pufferfish", weight: 5 },
    { id: "minecraft:kelp", weight: 8, min: 1, max: 3, junk: true },
    { id: "minecraft:stick", weight: 7, min: 1, max: 2, junk: true },
    { id: "minecraft:leather_boots", weight: 3, junk: true },
    { id: "minecraft:string", weight: 6, min: 1, max: 2, junk: true },
    { id: "minecraft:bone", weight: 5, min: 1, max: 2, junk: true },
    { id: "minecraft:ink_sac", weight: 4, junk: true },
  ],
};

/**
 * Mode Beternak (rancher.js).
 *
 * Kandangnya memakai patok desa yang sama dengan pembangun: peternak tidak
 * boleh memagari halaman orang, dan pemainlah yang memutuskan chunk mana yang
 * jadi kandang. Di dalam chunk itu peternak memagari satu petak `pen` blok
 * bersisi, menyisakan satu gerbang, lalu bekerja di dalamnya.
 *
 * `cap` per jenis hewan itu rem yang membuat mode ini tidak berubah jadi mesin
 * lag: sepuluh sapi cukup untuk memberi makan satu halaman, dan seratus sapi
 * membuat dunia berhenti. Begitu jumlahnya lewat `cap`, kelebihannya disembelih
 * — itu yang memasok daging ke dapur perajin.
 */
export const RANCH = {
  pen: 9,               // sisi petak kandang (blok)
  searchRadius: 28,     // sejauh apa mencari hewan liar untuk digiring
  herdReach: 2.4,       // sedekat apa harus berdiri sebelum bisa mendorong
  nudge: 0.42,          // kuat dorongan menggiring (blok/denyut)
  workReach: 2.6,       // jarak kerja: memberi makan, mencukur, memerah
  feedEvery: 200,       // jeda memberi makan satu hewan
  breedEvery: 1200,     // jeda beranak per jenis (~1 menit)
  milkEvery: 2400,      // jeda memerah satu sapi (~2 menit)
  shearEvery: 1200,     // jeda mencukur satu domba
  eggRadius: 12,        // radius memungut telur yang tergeletak
  cullBelow: 3,         // tidak pernah menyembelih sampai tersisa kurang dari ini
  complainEvery: 6000,  // jeda mengeluh "belum ada patok desa" (~5 menit)
  fence: "minecraft:oak_fence",
  gate: "minecraft:oak_fence_gate",
  // Hewan yang diurus. `feed` itu pakan yang benar-benar diambil dari peti,
  // `cap` batas populasi per jenis di dalam kandang.
  kinds: {
    "minecraft:cow": {
      label: "sapi", cap: 8,
      feed: ["minecraft:wheat"], drops: ["minecraft:beef", "minecraft:leather"],
      milk: true,
    },
    "minecraft:sheep": {
      label: "domba", cap: 8,
      feed: ["minecraft:wheat"], drops: ["minecraft:mutton", "minecraft:wool"],
      shear: true,
    },
    "minecraft:pig": {
      label: "babi", cap: 8,
      feed: ["minecraft:carrot", "minecraft:potato", "minecraft:beetroot"],
      drops: ["minecraft:porkchop"],
    },
    "minecraft:chicken": {
      label: "ayam", cap: 10,
      feed: ["minecraft:wheat_seeds", "minecraft:beetroot_seeds"],
      drops: ["minecraft:chicken", "minecraft:feather"],
      eggs: true,
    },
  },
};

export const KITCHEN = {
  cookTicks: 40,        // lama merakit satu masakan di meja kerja
  roastTicks: 60,       // lama membakar satu bahan di tungku
  stock: 16,            // stok porsi yang dituju; lebih dari ini berhenti masak
  offerAt: 6,           // sebanyak ini baru pemain diberi tahu
  offerEvery: 6000,     // jeda memberi tahu pemain (~5 menit)
  deliver: 4,           // porsi yang diantar sekali jalan ke pemain
  feedBelow: 0.7,       // companion di bawah 70% nyawa dianggap butuh makan
};

export const FOOD_HEAL = {
  "minecraft:golden_apple": 20,
  "minecraft:cake": 10,
  "minecraft:cooked_beef": 8,
  "minecraft:cooked_porkchop": 8,
  "minecraft:cooked_mutton": 7,
  "minecraft:cooked_salmon": 7,
  "minecraft:cooked_chicken": 6,
  "minecraft:cooked_rabbit": 6,
  "minecraft:cooked_cod": 6,
  "minecraft:bread": 6,
  "minecraft:pumpkin_pie": 6,
  "minecraft:baked_potato": 6,
  "minecraft:beetroot_soup": 6,
  "minecraft:mushroom_stew": 6,
  "minecraft:apple": 4,
  "minecraft:cookie": 3,
  "minecraft:sweet_berries": 2,
};

// Resep barang non-alat yang benar-benar harus punya bahannya dulu sebelum
// boleh dipasang. Sebelum ini peti stasiun, papan nama dan meja kerja muncul
// begitu saja dari udara — sekarang semuanya ditempa dari isi peti, dan kalau
// bahannya tidak ada, permintaan bantuan dipasang ke perajin/pencari barang.
export const ITEM_RECIPES = {
  // Pagar dan gerbang kandang peternak. Dibuat sendiri dari papan dan stik,
  // persis seperti resep vanilla-nya, supaya kandang tidak muncul dari udara.
  fence: {
    id: "minecraft:oak_fence", label: "Pagar", makes: 3, needsTable: true,
    needs: [{ any: "planks", count: 4 }, { any: ["minecraft:stick"], count: 2 }],
    ask: "wood",
  },
  fence_gate: {
    id: "minecraft:oak_fence_gate", label: "Gerbang", makes: 1, needsTable: true,
    needs: [{ any: "planks", count: 2 }, { any: ["minecraft:stick"], count: 4 }],
    ask: "wood",
  },
  shears: {
    id: "minecraft:shears", label: "Gunting", makes: 1, needsTable: true,
    needs: [{ any: ["minecraft:iron_ingot"], count: 2 }],
    ask: "iron",
  },
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
  // Companion yang baru tersedak air atau baru pulang dari perkelahian
  // memesan ini ke perajin. Roti sengaja dipilih: tiga gandum dari ladang
  // sendiri, tidak perlu tungku, dan companion mana pun bisa memakannya
  // (FOOD_HEAL). Kalau di peti kebetulan sudah ada makanan lain, perajin
  // mengantar yang itu alih-alih menempa roti baru — lihat crafter.js.
  fishing_rod: {
    id: "minecraft:fishing_rod", label: "Joran", makes: 1, needsTable: true,
    needs: [{ any: ["minecraft:stick"], count: 3 },
            { any: ["minecraft:string"], count: 2 }],
    ask: "string",
  },
  bread: {
    id: "minecraft:bread", label: "Roti", makes: 1, needsTable: false,
    needs: [{ any: ["minecraft:wheat"], count: 3 }],
    ask: "wheat",
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
  // Gandum tidak ada di HUNT (gather.js) dengan sengaja: satu-satunya gandum
  // di dunia ini tumbuh di ladang companion sendiri, dan pencari barang yang
  // "mencarikan gandum" berarti pencari barang yang membabat panen kawannya.
  // Permintaannya tetap sah supaya muncul di papan bantuan — dan pemainlah
  // yang membacanya lalu menaruh gandum di peti.
  wheat: { label: "gandum", ids: ["minecraft:wheat"], want: 6 },
  // Kaca tidak tumbuh di ladang dan tidak ada di tambang: satu-satunya jalan
  // adalah melebur pasir atau MEMBELINYA. Itu yang membuat Pedagang punya
  // guna, bukan sekadar cara lain menghabiskan hasil panen.
  glass: { label: "kaca", ids: ["minecraft:glass", "minecraft:glass_pane"], want: 8 },
  // Benang datang dari laba-laba, dari memancing, atau dari sarang laba-laba
  // yang dibabat pencari barang — tiga jalur yang semuanya sudah ada.
  string: { label: "benang", ids: ["minecraft:string"], want: 4 },
};

export const CHEST_IDS = [
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
];

export const SIGN_IDS = [
  "minecraft:oak_sign", "minecraft:spruce_sign", "minecraft:birch_sign",
  "minecraft:jungle_sign", "minecraft:acacia_sign", "minecraft:dark_oak_sign",
];

/**
 * Pekerjaan umum kampung (village.js).
 *
 * `lampEvery` dan `lightStep` yang menentukan padatnya obor. Angkanya dipilih
 * dari jangkauan cahaya vanilla: obor menerangi sekitar tujuh blok sebelum
 * gelap cukup untuk monster, jadi enam blok itu rapat yang masih aman tanpa
 * berubah jadi lautan obor.
 */
export const VILLAGE = {
  roadMax: 64,          // ruas jalan lebih panjang dari ini dilewati
  lampEvery: 6,         // satu lampu tiap sekian langkah jalan
  lightStep: 6,         // jarak antar obor saat menerangi kampung
  lightRadius: 24,      // sejauh apa kampung diperiksa gelapnya
  road: "minecraft:dirt_path",
  roadFallback: "minecraft:gravel",
  lamp: "minecraft:torch",
  workEvery: 200,       // jeda antar pekerjaan umum, supaya tidak rakus denyut
};

export const LIGHT_IDS = [
  "minecraft:torch", "minecraft:lantern", "minecraft:soul_torch",
  "minecraft:soul_lantern", "minecraft:glowstone", "minecraft:sea_lantern",
  "minecraft:shroomlight", "minecraft:jack_o_lantern", "minecraft:campfire",
  "minecraft:redstone_torch",
];

export const BED_IDS = [
  // Bedrock lama memakai satu id "minecraft:bed" dengan warna sebagai state,
  // yang baru memecahnya per warna. Dua-duanya ditulis: daftar ini dipakai
  // untuk MENGENALI ranjang di dunia (energy.js) sekaligus untuk MENCARI
  // ranjang di peti (builder.js), dan dunia yang salah satunya tidak dikenali
  // berarti companion tidur di bawah pohon padahal ranjangnya ada.
  "minecraft:bed",
  "minecraft:red_bed", "minecraft:white_bed", "minecraft:blue_bed",
  "minecraft:green_bed", "minecraft:brown_bed", "minecraft:black_bed",
  "minecraft:gray_bed", "minecraft:light_gray_bed", "minecraft:cyan_bed",
  "minecraft:purple_bed", "minecraft:magenta_bed", "minecraft:pink_bed",
  "minecraft:lime_bed", "minecraft:yellow_bed", "minecraft:orange_bed",
  "minecraft:light_blue_bed",
];

// Patok ladang dan patok desa TIDAK lagi berbentuk item.
//
// Dulu keduanya sebatang stik yang diberi nama, dan itu dua masalah sekaligus:
// stik bernama tercampur dengan stik biasa yang memang dibawa companion ke
// mana-mana (perajin membuatnya berkarung-karung), dan mematok satu chunk
// berarti berjalan ke chunk itu sambil memegang stik yang benar. Sekarang
// satu-satunya jalan memasang patok adalah Peta Patok di Buku Panduan —
// claim.js » toggleClaimAt, yang tidak butuh item apa pun dan bisa menunjuk
// petak di seberang lembah.
export const STAKE_NAME = "§ePatok Ladang";
export const VILLAGE_STAKE_NAME = "§2Patok Desa";

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
  "trader", "fisher", "rancher",
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

// Balai kerja bersama — satu titik yang DISEPAKATI seluruh companion satu
// pemilik sebagai tempat peti gudang, meja kerja dan tungku berdiri. Sebelum
// ini tiap companion memasang petinya di mana pun kakinya kebetulan berhenti,
// jadi pembangun yang butuh kayu dan pencari barang yang membawa kayu bisa
// berdiri di dua peti berbeda yang berjarak lima puluh blok.
export const DEPOT = {
  // Sejauh apa peti/meja/tungku boleh berdiri dari titik balai.
  radius: 12,
  // Companion sedekat ini dianggap "sudah sampai" dan boleh mulai memasang.
  arrive: 7,
  // Sejauh ini dari balai, companion berjalan ke sana dulu sebelum bekerja.
  travel: 10,
  // Jarak aman minimum dari tepi chunk berpatok ladang saat memilih titik baru.
  clearOfClaim: 6,
  // Sampai berapa jauh titik baru boleh dicari dari usulan pertama.
  search: 48,
  // Sabar berjalan ke balai. Lewat ini — atau kalau langkahnya mentok —
  // companion memasang petinya di tempat dia berdiri. Balai itu kesepakatan,
  // bukan penjara: lebih baik gudang di tempat yang salah daripada companion
  // yang berjalan ke tujuan yang tidak bisa dicapai selamanya.
  giveUp: 600,
};

// Ladang tidak digarap sekaligus satu chunk penuh. Petak inti dikerjakan dulu
// sampai benar-benar jadi ladang, baru melebar. Menggarap 16x16 sekaligus itu
// yang membuat petani terlihat "tidak bertindak": dia menghabiskan menit-menit
// pertama meratakan sudut chunk yang jauh dari mana pun pemain melihat.
/**
 * Mode bertani (farmplan.js + farming.js).
 *
 * Angka pola parit yang harus dibaca bersama: air Minecraft mengalir tujuh
 * blok dan membasahi farmland dalam radius empat blok mendatar. Parit tiap
 * DELAPAN kolom dengan offset TIGA berarti tidak ada satu petak pun yang lebih
 * dari empat blok dari paritnya — pas, tanpa parit yang mubazir.
 */
export const FARM = {
  channelEvery: 8,      // satu kolom parit tiap sekian kolom
  channelOffset: 3,     // letak paritnya di dalam pola itu
  sourceEvery: 6,       // sumber air tiap sekian blok sepanjang parit
  clearHeight: 12,      // setinggi apa di atas ladang yang harus dibersihkan
  canopyMax: 5,         // daun/batang lebih tinggi dari ini dibiarkan gugur sendiri
  scanPerTick: 96,      // kolom yang diperiksa mencari tugas berikutnya
  riverRadius: 20,      // sejauh apa mencari air untuk mengisi ember
  plotStart: 7,         // sisi petak inti pertama
  plotGrow: 4,          // pelebaran tiap kali petak sebelumnya tuntas
  // Jangkauan tangan petani TIDAK lagi diatur di sini: satu angka untuk semua
  // mode kerja, diukur dari mata seperti pemain, ada di WORK.reach di bawah.
  giveUpAfter: 3,       // gagal sekian kali -> petak itu ditandai mustahil
  harvestTicks: 30,     // lama satu ayunan panen
  tillPerTick: 3,       // petak yang boleh dicangkul dalam satu denyut
  plantPerTick: 3,      // petak yang boleh ditanami dalam satu denyut
  borrowRadius: 24,     // sejauh apa mencari tanah galian untuk menambal
  borrowDepth: 2,       // sedalam apa boleh menggali di bawah permukaan ladang
  sinkPerBreak: 16,     // batang pohon yang melorot tiap satu batang ditebang
  asideFor: 2400,       // lama satu petak yang belum terjangkau dilewati (~2 menit)
};

export const PLOT = {
  start: 7,      // sisi petak inti pertama
  grow: 4,       // pelebaran tiap kali petak sebelumnya tuntas
  clearHeight: 12,   // setinggi apa di atas ladang yang harus dibersihkan
};

/**
 * Menjangkau blok kerja (work.js).
 *
 * Angka `reach` diukur dari MATA ke tengah blok, persis seperti jangkauan
 * pemain di Minecraft. Sebelum ada berkas ini, tiap mode kerja memakai jarak
 * dari KAKI ke titik blok, dan itu dua kesalahan sekaligus: blok setinggi dada
 * terhitung jauh, dan — jauh lebih parah — mode kerja menyuruh companion
 * BERJALAN KE DALAM blok yang mau dibongkar. Blok di ketinggian lima meter
 * tidak punya lantai; companion berjalan ke bawahnya, mendorong udara, dan
 * berdiri di situ selamanya sambil melaporkan dirinya "sedang berjalan".
 */
export const WORK = {
  reach: 4.2,          // jarak mata ke tengah blok yang masih bisa disentuh
  standRadius: 3,      // sejauh apa mencari tempat berdiri di sekitar blok
  standLevels: [0, 1, -1, 2, -2, 3, -3, 4, -4],   // beda tinggi yang dicoba
  keepSpot: 200,       // umur tempat berdiri yang sudah dipilih (tick)
  stepReach: 0.75,     // sedekat ini tempat berdirinya dianggap tercapai
  // Sisa jangkauan yang disisihkan waktu MEMILIH tempat berdiri. Kaki
  // companion berhenti di mana saja di dalam petak, bukan tepat di tengahnya,
  // jadi tempat berdiri yang cuma pas-pasan terjangkau dari titik tengah bisa
  // saja tidak terjangkau dari tempat kakinya benar-benar berhenti — dan
  // companion berdiri di petak yang benar sambil menyatakan petaknya mustahil.
  slack: 1,
};

/**
 * Pathfinding (path.js). Angka jarak dalam blok, waktu dalam tick game.
 *
 * `budget` yang membuat "tidak ada jalan" jadi jawaban yang datang dalam satu
 * denyut alih-alih satu detik penuh yang terasa: dunia Minecraft tidak
 * berhingga, dan tujuan di seberang gunung tanpa jalan akan membuat A*
 * memeriksa seluruh lereng sebelum menyerah.
 */
export const PATH = {
  budget: 600,          // simpul maksimum yang diperiksa satu pencarian
  range: 48,            // sejauh apa dari titik awal pencarian boleh melebar
  straightMax: 24,      // sejauh apa jalan lurus diuji sebelum A* dijalankan
  replanEvery: 400,     // umur jalur sebelum dihitung ulang (~20 detik)
  stuckTicks: 30,       // tidak maju selama ini -> sibakkan / rencanakan ulang
  reach: 1.6,           // sedekat ini dianggap sudah sampai
  step: 0.32,           // panjang satu langkah kaki
  waterCost: 6,         // air bisa dilewati, tapi mahal — memutar lebih murah
  hazardCost: 40,       // lava, api, kaktus: praktis terlarang, bukan mustahil
  climbCost: 2.5,       // memanjat lebih dari satu blok
  dropCost: 1.2,        // turun lebih dari satu blok (naik lagi itu mahal)
  goalRadius: 3,        // sejauh apa mencari petak berpijak di sekitar tujuan
  giveUpAfter: 3,       // jalur habis / mentok sekian kali -> tujuan mustahil
  retryBlocked: 200,    // jeda sebelum tujuan mustahil dicoba sekali lagi
  partialMax: 3,        // "paling mendekat" masih berguna kalau melesetnya segini
  cursorStall: 40,      // kursor jalur tidak maju selama ini -> jalurnya habis
  hazards: new Set([
    "minecraft:lava", "minecraft:flowing_lava", "minecraft:fire",
    "minecraft:soul_fire", "minecraft:magma", "minecraft:cactus",
    "minecraft:powder_snow", "minecraft:sweet_berry_bush", "minecraft:wither_rose",
    "minecraft:campfire", "minecraft:soul_campfire",
  ]),
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
// Api, air, dan tenggelam. Angka waktunya dalam DENYUT KERJA (TICKS.brain =
// 10 tick game = setengah detik), kecuali yang jelas-jelas jarak dalam blok.
export const SWIM = {
  fireSearch: 12,     // sejauh apa mencari air waktu badan terbakar
  shoreSearch: 16,    // sejauh apa mencari daratan waktu berenang
  shoreEvery: 100,    // jeda sebelum daratan tujuan dipilih ulang (tick)
  riseStep: 1,        // berapa blok naik ke permukaan tiap denyut kerja
  drownAfter: 20,     // ~10 detik terbenam sebelum dianggap tenggelam
  eatBelow: 0.6,      // makan kalau nyawa tinggal di bawah 60%
  askEvery: 600,      // jeda memesan makanan ke perajin (tick)
};

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
