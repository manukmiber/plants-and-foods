/**
 * Angka dan teks yang dipakai bersama seluruh add-on.
 *
 * Daftar karakter di sini harus sama dengan tools/characters.json — validate.py
 * yang mengeceknya, jadi kalau ada yang ditambah di satu tempat dan lupa di
 * tempat lain, ketahuan sebelum masuk gim.
 */

export const NS = "vbs";
export const FAMILY = "vbs_companion";

/** Karakter yang ada, beserta warna namanya di UI dan jangkauan berkebunnya. */
export const COMPANIONS = {
  "vbs:akito": { name: "Akito", color: "§6", farmRadius: 5 },
  "vbs:kohane": { name: "Kohane", color: "§d", farmRadius: 6 },
  "vbs:an": { name: "An", color: "§b", farmRadius: 6 },
  "vbs:toya": { name: "Toya", color: "§9", farmRadius: 7 },
  "vbs:flins": { name: "Flins", color: "§5", farmRadius: 5 },
};

/** Empat perintah yang bisa dipilih pemain lewat UI. */
export const MODES = {
  follow: {
    label: "Mengikuti",
    button: "§aIkuti Aku",
    hint: "Menempel ke mana pun kamu pergi",
    event: "vbs:set_follow",
    icon: "textures/items/compass_item",
  },
  farm: {
    label: "Bertani",
    button: "§6Mode Bertani",
    hint: "Panen dan tanam ulang di sekitarnya",
    event: "vbs:set_farm",
    icon: "textures/items/wheat",
  },
  attack: {
    label: "Bertarung",
    button: "§cMode Bertarung",
    hint: "Menyerang monster di dekatmu",
    event: "vbs:set_attack",
    icon: "textures/items/iron_sword",
  },
  stay: {
    label: "Diam di tempat",
    button: "§7Diam di Tempat",
    hint: "Berjaga di titik ini",
    event: "vbs:set_stay",
    icon: "textures/items/bone",
  },
};

export const DEFAULT_MODE = "follow";

/** Kunci dynamic property. */
export const PROP = {
  owner: "vbs:owner",
  ownerName: "vbs:owner_name",
  mode: "vbs:mode",
  scan: "vbs:scan",
  gear: "vbs:gear",
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
    state: "growth", ripe: 7,
    drops: [["minecraft:wheat", 1, 1], ["minecraft:wheat_seeds", 0, 2]],
  },
  "minecraft:carrots": {
    state: "growth", ripe: 7,
    drops: [["minecraft:carrot", 1, 3]],
  },
  "minecraft:potatoes": {
    state: "growth", ripe: 7,
    drops: [["minecraft:potato", 1, 3]],
  },
  "minecraft:beetroot": {
    state: "growth", ripe: 7,
    drops: [["minecraft:beetroot", 1, 1], ["minecraft:beetroot_seeds", 0, 2]],
  },
  "minecraft:nether_wart": {
    state: "age", ripe: 3,
    drops: [["minecraft:nether_wart", 1, 3]],
  },
};

/** Bibit yang bisa ditanam companion di petak kosong -> blok tanamannya. */
export const SEEDS = {
  "minecraft:wheat_seeds": "minecraft:wheat",
  "minecraft:carrot": "minecraft:carrots",
  "minecraft:potato": "minecraft:potatoes",
  "minecraft:beetroot_seeds": "minecraft:beetroot",
};

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

export const TICKS = {
  brain: 20,        // denyut mode bertani
  leash: 40,        // pengecekan jarak ke pemilik
  teleportAt: 20,   // sejauh ini dari pemilik -> ditarik pulang
};
