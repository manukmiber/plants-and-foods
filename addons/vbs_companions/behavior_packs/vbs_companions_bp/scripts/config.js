/**
 * Angka dan teks yang dipakai bersama seluruh add-on.
 *
 * Daftar karakter dan daftar mode di sini harus sama dengan tools/characters.json
 * dan tools/gen_packs.py — validate.py yang mengeceknya, jadi kalau ada yang
 * ditambah di satu tempat dan lupa di tempat lain, ketahuan sebelum masuk gim.
 */

export const NS = "vbs";
export const FAMILY = "vbs_companion";
export const MARKER = "vbs:marker";

/** Karakter yang ada, beserta warna namanya di UI dan jangkauan berkebunnya. */
export const COMPANIONS = {
  "vbs:akito": { name: "Akito", color: "§6", farmRadius: 5, damage: 6, voice: "keras" },
  "vbs:kohane": { name: "Kohane", color: "§d", farmRadius: 6, damage: 4, voice: "lembut" },
  "vbs:an": { name: "An", color: "§b", farmRadius: 6, damage: 5, voice: "santai" },
  "vbs:toya": { name: "Toya", color: "§9", farmRadius: 7, damage: 5, voice: "tenang" },
  "vbs:flins": { name: "Flins", color: "§5", farmRadius: 5, damage: 7, voice: "sopan" },
};

/**
 * Tujuh perintah yang bisa dipilih pemain lewat UI.
 *
 * `hat` adalah nilai entity property vbs:hat yang dipasang saat mode ini aktif —
 * itulah yang bikin petani memakai topi jerami dan penambang memakai helm tanpa
 * satu pun blok kode tambahan di tempat lain.
 */
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
};

export const DEFAULT_MODE = "follow";

/** Nilai entity property vbs:pose. Harus sama dengan POSE di gen_packs.py. */
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

/**
 * Nilai entity property vbs:face. 0 berarti "biarkan Molang yang memilih";
 * 1..8 memaksa satu ekspresi. Urutannya harus sama dengan model.FACES.
 */
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

/** Kunci dynamic property. */
export const PROP = {
  owner: "vbs:owner",
  ownerName: "vbs:owner_name",
  mode: "vbs:mode",
  gear: "vbs:gear",
  state: "vbs:state",       // satu blob JSON: stasiun, pekerjaan, catatan role
  claims: "vbs:claims",     // dunia: chunk yang dipatok
  waypoints: "vbs:waypoints", // dunia: temuan pengembara
};

/** Titik armor tiap bagian, dipakai untuk baris "Armor" di UI. */
export const ARMOR_POINTS = {
  leather: [1, 3, 2, 1],
  golden: [2, 5, 3, 1],
  chainmail: [2, 5, 4, 1],
  iron: [2, 6, 5, 2],
  diamond: [3, 8, 6, 3],
  netherite: [3, 8, 6, 3],
};

/** Tanaman yang dikenali mode bertani: state umur, umur matang, dan hasilnya. */
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

/**
 * Bibit -> blok tanamannya. Urutan kunci di sini adalah urutan PITA TANAM:
 * petak ladang dibagi jadi jalur-jalur selebar dua blok, dan jalur ke-n memakai
 * bibit ke-n dari daftar ini. Itu sebabnya ladang hasil companion kelihatan
 * berbaris rapi, bukan tertanam acak.
 */
export const SEEDS = {
  "minecraft:wheat_seeds": "minecraft:wheat",
  "minecraft:carrot": "minecraft:carrots",
  "minecraft:potato": "minecraft:potatoes",
  "minecraft:beetroot_seeds": "minecraft:beetroot",
};

export const BAND_WIDTH = 2;

/**
 * Bahan -> tingkat alat. Companion memilih tingkat TERTINGGI yang bahannya ada
 * di peti stasiun; kalau tidak ada satu pun, dia tidak bertani sampai pemain
 * mengisi peti.
 */
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

/** Kayu gelondongan -> papan, supaya companion bisa memakai kayu mentah juga. */
export const LOGS = [
  "minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log",
  "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
  "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:crimson_stem",
  "minecraft:warped_stem",
];

/** Blok yang boleh dicangkul jadi ladang. */
export const TILLABLE = new Set([
  "minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt",
  "minecraft:rooted_dirt", "minecraft:podzol", "minecraft:moss_block",
  "minecraft:dirt_with_roots",
]);

/** Yang dianggap air mengalir/tenang saat mencari sungai. */
export const WATER = new Set(["minecraft:water", "minecraft:flowing_water"]);

/** Ore yang dikumpulkan penambang, beserta hasil jatuhannya. */
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

/** Batu yang boleh ditembus penambang saat menggali terowongan. */
export const DIGGABLE = new Set([
  "minecraft:stone", "minecraft:cobblestone", "minecraft:andesite",
  "minecraft:diorite", "minecraft:granite", "minecraft:tuff",
  "minecraft:deepslate", "minecraft:cobbled_deepslate", "minecraft:dirt",
  "minecraft:gravel", "minecraft:sandstone", "minecraft:calcite",
  "minecraft:dripstone_block", "minecraft:grass_block", "minecraft:coarse_dirt",
  ...Object.keys(ORES),
]);

/** Yang tidak boleh disentuh siapa pun: bangunan pemain dan barang berharga. */
export const PROTECTED = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
  "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker",
  "minecraft:crafting_table", "minecraft:enchanting_table", "minecraft:anvil",
  "minecraft:bed", "minecraft:beacon", "minecraft:end_portal_frame",
  "minecraft:spawner", "minecraft:bedrock", "minecraft:obsidian",
  "minecraft:shulker_box", "minecraft:hopper", "minecraft:lodestone",
]);

/** Makanan yang memulihkan nyawa lewat tombol "Beri Makan". */
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

/** Nama item patok. Stick biasa yang diberi nama — tidak perlu item kustom. */
export const STAKE_NAME = "§ePatok Ladang";
export const STAKE_ITEM = "minecraft:stick";

/**
 * Berhenti dan tersenyum saat dilihat pemain.
 *
 * `stopInCombat` sengaja true: itu yang diminta — dilihat berarti berhenti
 * melakukan apa pun, tanpa kecuali. Ubah ke false kalau companion terlalu
 * sering mati karena membeku di tengah pertarungan; tidak ada baris lain yang
 * perlu ikut diubah.
 */
export const LOOK = {
  enabled: true,
  stopInCombat: true,
  radius: 10,          // sejauh ini pandangan pemain masih dihitung
  cone: 0.965,         // dot product arah pandang; 0.965 kira-kira 15 derajat
  holdTicks: 12,       // masih dianggap dilihat selama ini setelah palingkan muka
  waveEvery: 90,       // sesekali menyapa lewat gelembung teks
};

/** Jarak gelembung teks. Lebih jauh dari ini, pesannya lewat chat dunia. */
export const CHAT = {
  bubbleRadius: 18,
  bubbleTicks: 90,
  chatRadius: 64,
};

export const TICKS = {
  brain: 10,        // denyut kerja tiap mode
  fast: 4,          // denyut pose, gelembung, dan tatapan
  leash: 40,        // pengecekan jarak ke pemilik
  social: 140,      // peluang dua companion mengobrol
  teleportAt: 24,   // sejauh ini dari pemilik -> ditarik pulang
};
