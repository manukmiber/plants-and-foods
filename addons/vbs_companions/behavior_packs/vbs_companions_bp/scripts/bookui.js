/**
 * Isi Buku Panduan Companion.
 */

import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { FAMILY, MINE_TARGETS, MODES } from "./config.js";
import { getActivity } from "./activity.js";
import { answerAsk, askOf, pendingAsks } from "./ask.js";
import { BLUEPRINTS } from "./builder.js";
import { chunkMap, nearestClaimHint, toggleClaimAt } from "./claim.js";
import { betaLines } from "./beta.js";
import { readDepot } from "./depot.js";
import {
  bedLabel, clearBed, energyOf, isResting, isSleeping, needsLabel, pointBed,
  sleepOf,
} from "./energy.js";
import { bagCount } from "./bag.js";
import { dialogueStats } from "./lines.js";
import { displayName } from "./nametag.js";
import { patchState, readSettings, readState, writeSettings } from "./state.js";
import { stationContainer } from "./station.js";
import { openMenu } from "./ui.js";
import { deliver } from "./usertalk.js";
import {
  alive, allCompanions, dist2, forceShow, getMode, getOwnerId, prettyItem,
  setMode, summarize,
} from "./util.js";
import { entStr, logInfo, watchLogs } from "./logger.js";

const TAG = "BOOKUI";
const MODE_KEYS = Object.keys(MODES);

function myCompanions(player) {
  return allCompanions(FAMILY)
    .filter((c) => alive(c) && getOwnerId(c) === player.id)
    .sort((a, b) => dist2(player.location, a.location) - dist2(player.location, b.location));
}

function distanceLabel(player, entity) {
  if (player.dimension.id !== entity.dimension.id) return "dimensi lain";
  const d = Math.sqrt(dist2(player.location, entity.location));
  return `${Math.round(d)} blok`;
}

/* ------------------------------------------------------------------ *
 * Halaman utama
 * ------------------------------------------------------------------ */

export async function openBook(player) {
  logInfo(TAG, `Buku panduan dibuka oleh ${player.name}.`);
  const mine = myCompanions(player);
  const asks = pendingAsks(player.id);
  const form = new ActionFormData()
    .title("§l§6Buku Panduan Companion")
    .body([
      "§7Buku ini ditempa dari satu §fbuku§7 dan satu §fbunga§7, dan tidak bisa",
      "§7hilang: kalau kamu mati atau membuangnya, buku ini kembali sendiri.",
      "",
      `§7Companion milikmu yang sedang ada di dunia: §f${mine.length}`,
      asks.length
        ? `§e${asks.length} companion sedang menunggu jawabanmu.`
        : "§8Tidak ada companion yang sedang bertanya.",
      "",
      "§8Semua yang ada di menu companion juga bisa dibuka dari sini, jadi kamu",
      "§8tidak perlu berjalan ke tempat mereka bekerja.",
    ].join("\n"))
    .button("§aCara Pakai\n§8Dari menjinakkan sampai membangun kampung", "textures/items/book_normal")
    .button(`§bKendalikan Companion\n§8${mine.length} companion milikmu`, "textures/items/name_tag")
    .button("§2Peta Patok\n§8Petak ladang & desa di sekitarmu, tinggal ditunjuk", "textures/items/map_filled")
    .button(asks.length
      ? `§6Pertanyaan Companion §c(${asks.length})\n§8Ada yang menunggu jawabanmu`
      : "§6Pertanyaan Companion\n§8Tidak ada yang menunggu jawaban", "textures/items/wheat")
    .button("§ePengaturan Mod\n§8Saklar yang berlaku untuk semua companionmu", "textures/items/redstone_dust")
    .button("§dIsi Tambahan & Status\n§8Rancangan JSON, dialog JSON, dan Beta API", "textures/items/paper")
    .button("§8Tutup");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  switch (res.selection) {
    case 0: await openHowTo(player); break;
    case 1: await openControl(player); break;
    case 2: await openStakeMap(player, "farm", () => openBook(player)); break;
    case 3: await openAsks(player); break;
    case 4: await openPrefs(player); break;
    case 5: await openStatus(player); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ *
 * 1b. Peta Patok
 * ------------------------------------------------------------------ */

const MAP_SIZE = 8;

const STAKE_KINDS = {
  farm: {
    label: "Patok Ladang", short: "ladang", color: "§c",
    icon: "textures/items/wheat",
    hint: "§7Suruh companionmu ke Mode Bertani, dia yang akan menggarapnya.",
  },
  village: {
    label: "Patok Desa", short: "desa", color: "§2",
    icon: "textures/items/bed_red",
    hint: "§7Suruh Pembangun ke Mode Membangun, dia yang akan membuat rumahnya.",
  },
};

function cellGlyph(cell) {
  const mark = cell.here ? "XX" : "##";
  if (!cell.kind) return cell.here ? "§eXX" : "§8--";
  if (!cell.mine) return `§8${mark}`;
  if (cell.kind === "village") return `§2${mark}`;
  return (cell.worked ? "§a" : "§c") + mark;
}

function cellStatus(cell) {
  if (!cell.kind) return "§8belum dipatok";
  if (!cell.mine) return `§8dipatok ${cell.byName ?? "pemain lain"}`;
  if (cell.kind === "village") return "§2lahan desa";
  return cell.worked ? "§asudah jadi ladang" : "§cdipatok, belum digarap";
}

function mapBody(player, map, kind) {
  const spec = STAKE_KINDS[kind];
  const hint = nearestClaimHint(player, kind);
  return [
    `§7Peta §f${MAP_SIZE}x${MAP_SIZE} chunk§7 di sekitarmu — ${MAP_SIZE * 16}x${MAP_SIZE * 16} blok.`,
    "§8Baris atas = utara, bawah = selatan. Kiri = barat, kanan = timur.",
    "",
    `§8x §7${map.cx0} §8.. §7${map.cx0 + MAP_SIZE - 1}`,
    ...map.rows.map((row, i) =>
      `§8z §7${String(map.cz0 + i).padStart(4)}  ${row.map(cellGlyph).join(" ")}`),
    "",
    "§c## §7dipatok, belum digarap    §a## §7sudah jadi ladang",
    "§2## §7lahan desa    §8## §7punya pemain lain    §8-- §7kosong",
    "§eXX §7petak tempat kamu berdiri sekarang",
    "",
    hint
      ? `§ePatok ${spec.short} terdekatmu: §f${hint.dist} blok §7ke §f${hint.dir}§7, chunk (${hint.cx}, ${hint.cz}).`
      : `§8Kamu belum punya satu pun patok ${spec.short}.`,
    "",
    `§7Sedang memasang: ${spec.color}${spec.label}§7. Pilih satu baris, lalu tunjuk`,
    "§7petaknya untuk memasang atau mencabut. Patoknya bukan item — tidak ada",
    "§7yang perlu dibawa, dan petak seberang lembah pun bisa ditunjuk dari sini.",
  ].join("\n");
}

export async function openStakeMap(player, kind = "farm", returnCallback) {
  const spec = STAKE_KINDS[kind] ? kind : "farm";
  const info = STAKE_KINDS[spec];
  const map = chunkMap(player, MAP_SIZE);
  const here = map.rows.flat().find((c) => c.here);
  const other = spec === "farm" ? "village" : "farm";

  const form = new ActionFormData()
    .title(`§l§2Peta Patok — ${info.label}`)
    .body(mapBody(player, map, spec));
  for (const [i, row] of map.rows.entries()) {
    form.button(`§fBaris z = ${map.cz0 + i}\n${row.map(cellGlyph).join(" ")}`);
  }
  form.button(here?.kind && here.mine
    ? `§eCabut patok tempat aku berdiri\n§8chunk (${here.cx}, ${here.cz})`
    : `§aPatok chunk tempat aku berdiri\n§8chunk (${here?.cx ?? "?"}, ${here?.cz ?? "?"})`, info.icon);
  form.button(`§7Ganti ke ${STAKE_KINDS[other].label}\n§8Peta yang sama, jenis patok yang lain`);
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const pick = res.selection;
  if (pick < MAP_SIZE) {
    await openStakeRow(player, spec, pick, returnCallback);
    return;
  }
  if (pick === MAP_SIZE) {
    if (here) player.sendMessage(toggleClaimAt(player, here.cx, here.cz, spec, player.location));
    await openStakeMap(player, spec, returnCallback);
    return;
  }
  if (pick === MAP_SIZE + 1) {
    await openStakeMap(player, other, returnCallback);
    return;
  }
  if (returnCallback) {
    await returnCallback();
  } else {
    await openBook(player);
  }
}

async function openStakeRow(player, kind, rowIndex, returnCallback) {
  const info = STAKE_KINDS[kind];
  const map = chunkMap(player, MAP_SIZE);
  const row = map.rows[rowIndex] ?? [];
  const form = new ActionFormData()
    .title(`§l§2Baris z = ${map.cz0 + rowIndex}`)
    .body([
      `§7Petak dari barat ke timur, §fz = ${map.cz0 + rowIndex}§7.`,
      "",
      `§8    ${row.map(cellGlyph).join(" ")}`,
      "",
      `§7Menunjuk satu petak akan memasang atau mencabut ${info.color}${info.label}§7.`,
      info.hint,
    ].join("\n"));
  for (const cell of row) {
    form.button(`§f(${cell.cx}, ${cell.cz})  ${cellGlyph(cell)}\n§8${cell.dist} blok — ${cellStatus(cell)}`);
  }
  form.button("§8« Kembali ke peta");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection < row.length) {
    const cell = row[res.selection];
    logInfo(TAG, `${player.name} menunjuk chunk (${cell.cx}, ${cell.cz}) dari Peta Patok.`);
    player.sendMessage(toggleClaimAt(player, cell.cx, cell.cz, kind, player.location));
  }
  await openStakeMap(player, kind, returnCallback);
}

/* ------------------------------------------------------------------ *
 * 1. Cara pakai
 * ------------------------------------------------------------------ */

const CHAPTERS = [
  {
    title: "§aMenjinakkan",
    icon: "textures/items/poppy",
    body: [
      "§71. Panggil companion dengan §fspawn egg§7 (satu untuk tiap karakter)",
      "§7   atau §f/summon vbs:akito§7.",
      "§72. Begitu muncul dia masih §cliar§7 dan belum mengikuti siapa pun.",
      "§73. Pegang §fbunga apa saja§7, lalu klik dia — jongkok atau tidak,",
      "§7   dua-duanya boleh. Bunganya habis dipakai dan dia jadi milikmu.",
      "§74. Jongkok lalu klik dia untuk membuka menunya.",
      "",
      "§8Bunga yang sama juga bahan buku ini: buku + bunga di meja kerja.",
    ],
  },
  {
    title: "§6Sembilan perintah",
    icon: "textures/items/compass_item",
    body: [
      "§7Pilih di menu companion, atau lewat buku ini di §fKendalikan Companion§7.",
      "",
      ...MODE_KEYS.map((k) => `§f${MODES[k].label}§7 — ${MODES[k].hint}`),
      "",
      "§8Perintah tersimpan: dunia ditutup lalu dibuka, tugasnya tetap.",
    ],
  },
  {
    title: "§eBertani",
    icon: "textures/items/wheat",
    body: [
      "§7Urutannya tidak pernah dibalik, dan berhenti di langkah pertama yang",
      "§7belum beres — alasannya terbaca di baris §fSekarang§7 di menu.",
      "",
      "§f1. Meratakan§7 seluruh petak berpatok ke satu ketinggian",
      "§f2. Mengairi§7 — parit digali, ember dibuat dari 3 besi, air dituang",
      "§f3. Mencangkul§7 hanya petak yang sudah kebagian air",
      "§f4. Menanam§7 berjalur, satu jenis bibit per jalur",
      "§f5. Merawat§7 — panen, tanam ulang, perbaiki pengairan, menghias",
      "",
      "§7Patok chunk langsung lewat §fBuku Panduan §7» §2Peta Patok§7 — patoknya",
      "§7bukan item, jadi tidak ada yang perlu dibawa atau dicari di kantong.",
      "§8Hasil panen selalu masuk peti companion, bukan kantongmu.",
    ],
  },
  {
    title: "§cMembangun & rancangan",
    icon: "textures/items/brick",
    body: [
      "§7Bahannya diambil dari §fpeti stasiun§7, dan rancangan menyebut §fperan§7",
      "§7blok — dinding, lantai, atap — bukan blok tertentu.",
      "",
      "§7Tandai chunk desa di §fBuku Panduan §7» §2Peta Patok Desa§7.",
      "§7Tiap chunk berpatok dibangun satu rumah lengkap ranjang, dan",
      "§7companion yang mengantuk akan tidur di sana.",
      "",
      "§8Rancangan baru bisa ditambah sebagai berkas JSON di folder",
      "§8addons/vbs_companions/blueprints/ — lihat halaman Isi Tambahan.",
    ],
  },
  {
    title: "§bMengajak bicara",
    icon: "textures/items/book_writable",
    body: [
      "§7Tiga cara, semuanya jalan tanpa Beta API:",
      "",
      "§f/scriptevent vbs:chat <nama> <pesan>",
      "§fchat <nama> <pesan>",
      "§f!<nama> <pesan>",
      "",
      "§7Nama §fsemua§7 mengirim ke seluruh companion milikmu.",
      "§7Perintah kerja yang diselipkan di dalam kalimat langsung dituruti:",
      "§8  chat Akito bertani dong    -> pindah ke Mode Bertani",
      "§8  chat Kohane lagi ngapain?  -> melaporkan pekerjaan dan tenaganya",
      "§8  chat Toya butuh apa?       -> menyebut bahan yang sedang ditunggu",
    ],
  },
  {
    title: "§6Mereka bertanya padamu",
    icon: "textures/items/wheat",
    body: [
      "§7Dua keputusan tidak ditebak sendiri oleh mereka — kamu yang ditanya:",
      "",
      "§f• Petani§7 yang kehabisan bibit bertanya apakah dia mencari bibit",
      "§7  sendiri atau kamu yang menyetok di petinya.",
      "§f• Penambang§7 bertanya bijih apa saja yang kamu cari.",
      "",
      "§7Menjawabnya dua cara:",
      "§f  ketik ya / tidak §7di chat untuk pertanyaan ya-tidak",
      "§f  buku ini » Pertanyaan Companion §7untuk semuanya",
    ],
  },
  {
    title: "§bBuku ini sebagai alat",
    icon: "textures/items/name_tag",
    body: [
      "§7Buka §fKendalikan Companion§7, pilih satu companion, dan semua ini ada",
      "§7di situ tanpa perlu berjalan ke tempat dia bekerja:",
      "",
      "§f• Sedang Apa§7 — pekerjaan, tenaga, dan bahan yang ditunggu",
      "§f• Isi Peti & Kantong§7 — semua yang dia simpan dan bawa",
      "§f• Ngobrol§7 — kirim pesan langsung dari jarak jauh",
      "§f• Peta Patok§7 — patok ladang atau desa langsung dari menu",
      "",
      "§8Semuanya jalan lintas dimensi: companion di Nether pun tetap terbaca.",
    ],
  },
  {
    title: "§6Balai kerja bersama",
    icon: "textures/items/iron_ingot",
    body: [
      "§7Semua companion milikmu sepakat memakai §fSATU halaman kerja§7: satu",
      "§7peti gudang, satu meja kerja, satu tungku. Titiknya dipilih companion",
      "§7pertama yang butuh tempat kerja, lalu dipakai bersama-sama.",
      "",
      "§7Itulah sebabnya kiriman benar-benar sampai: pencari barang menaruh",
      "§7kayunya di peti yang memang dilihat pembangun dan perajin.",
      "",
      "§f• §7Balai TIDAK pernah berdiri di dalam chunk berpatok.",
      "§f• §7Kalau kamu mematok chunk yang sudah ada gudangnya, §fpetani",
      "§7  menyuruh mereka pindah§7 — peti, isinya, meja kerja dan tungku",
      "§7  dibongkar dan dipasang lagi di balai baru. Tidak ada yang hilang.",
      "",
      "§8Koordinatnya ada di §7Kendalikan Companion » Perintah untuk Semua§8.",
    ],
  },
  {
    title: "§dTenaga, kantuk, bantuan",
    icon: "textures/items/bed_red",
    body: [
      "§7§lTenaga§r§7 terkuras karena bekerja, pulih dengan istirahat atau ngobrol.",
      "§7§lKantuk§r§7 naik seiring waktu, pulih dengan tidur di ranjang.",
      "",
      "§7§lDi ranjang yang mana?§r§7 Urutannya:",
      "§f1. Ranjang yang kamu tunjuk§7 lewat §fTunjuk Ranjang§7 — rumah buatanmu",
      "§7   sendiri, atau satu ranjang tertentu di kampung",
      "§f2. Ranjang rumah desa§7 buatan Pembangun",
      "§f3. Ranjang mana pun§7 dalam 12 blok, lalu §f4. bawah pohon",
      "",
      "§7Companion yang kehabisan bahan §fmemasang permintaan§7, bukan diam:",
      "§8  Mencari Barang -> bahan mentah -> Merajin -> alat & barang jadi",
      "",
      "§7Papan permintaan ada di menu companion » §fPermintaan Bantuan§7.",
    ],
  },
  {
    title: "§9Api, air, dan makan",
    icon: "textures/items/water_bucket",
    body: [
      "§7Companion §fmenghindari air§7 saat berjalan: selama masih ada jalan",
      "§7kering ke tujuannya, dia tidak akan menginjak permukaan danau. Parit",
      "§7irigasi selebar satu blok tetap diseberangi — itu memang harus.",
      "",
      "§7§lTerbakar§r§7 — dia berhenti bekerja dan lari ke air terdekat dalam 12",
      "§7blok, lalu nyemplung. Api padam, kerja dilanjut.",
      "",
      "§7§lTerlanjur di air dalam§r§7 — dia berenang naik ke permukaan lalu menuju",
      "§7daratan terdekat. Kalau terlalu lama terbenam, dia benar-benar",
      "§7kehabisan napas dan kamu diberi tahu lewat chat.",
      "",
      "§7§lNyawa tinggal sedikit§r§7 — dia makan sendiri dari peti atau kantongnya.",
      "§7Kalau tidak ada makanan, dia §fmemesan roti ke Perajin§7, dan Perajin",
      "§7mengantar makanan apa pun yang kebetulan sudah ada di peti.",
    ],
  },
];

async function openHowTo(player) {
  const form = new ActionFormData()
    .title("§l§aCara Pakai")
    .body("§7Pilih babnya.");
  for (const chapter of CHAPTERS) form.button(chapter.title, chapter.icon);
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection >= CHAPTERS.length) {
    await openBook(player);
    return;
  }
  const chapter = CHAPTERS[res.selection];
  const page = new ActionFormData()
    .title(`§l${chapter.title}`)
    .body(chapter.body.join("\n"))
    .button("§8« Kembali");
  await forceShow(player, page);
  await openHowTo(player);
}

/* ------------------------------------------------------------------ *
 * 2. Kendalikan companion
 * ------------------------------------------------------------------ */

async function openControl(player) {
  const mine = myCompanions(player);
  const form = new ActionFormData()
    .title("§l§bKendalikan Companion")
    .body(mine.length
      ? "§7Pilih satu untuk membuka menunya seperti biasa, atau pakai baris\n" +
        "§7paling bawah untuk memerintah semuanya sekaligus."
      : "§7Belum ada companion milikmu di dunia ini.\n\n" +
        "§8Panggil dengan spawn egg, lalu beri dia satu bunga untuk menjinakkannya.");
  for (const entity of mine) {
    const mode = MODES[getMode(entity)]?.label ?? "?";
    const doing = getActivity(entity);
    const asking = askOf(player.id, entity.id) ? " §c(bertanya)" : "";
    form.button(`§f${displayName(entity)}${asking}\n§8${mode} — ${doing ?? distanceLabel(player, entity)}`);
  }
  form.button("§ePerintah untuk SEMUA\n§8Satu tugas untuk seluruh companionmu");
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection < mine.length) {
    const target = mine[res.selection];
    if (!alive(target)) {
      player.sendMessage("§cCompanion itu sudah tidak ada di dunia.");
      await openControl(player);
      return;
    }
    logInfo(TAG, `${player.name} membuka halaman ${entStr(target)} lewat buku.`);
    await openCompanionHub(player, target);
    return;
  }
  if (res.selection === mine.length) {
    await openAllOrders(player, mine);
    return;
  }
  await openBook(player);
}

async function openAllOrders(player, mine) {
  // Titik balai ikut dipajang: itu satu-satunya cara pemain tahu ke mana
  // seluruh kru sepakat menaruh gudang, meja kerja dan tungkunya.
  const depot = readDepot(player.id);
  const yard = depot
    ? `§7Balai kerja bersama: §f${depot.x}, ${depot.y}, ${depot.z}§7 (${String(depot.dim).replace("minecraft:", "")}).`
    : "§8Balai kerja bersama belum ditentukan — companion pertama yang bekerja yang memilih titiknya.";
  const form = new ActionFormData()
    .title("§l§ePerintah untuk Semua")
    .body(`§7Berlaku untuk §f${mine.length}§7 companion milikmu, di dimensi mana pun.\n` +
          "§8Yang sedang tidur atau beristirahat tetap menerima perintahnya dan\n" +
          "§8mengerjakannya begitu bangun.\n\n" + yard);
  for (const key of MODE_KEYS) form.button(MODES[key].button, MODES[key].icon);
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection >= MODE_KEYS.length) {
    await openControl(player);
    return;
  }
  const key = MODE_KEYS[res.selection];
  let changed = 0;
  for (const entity of mine) {
    if (!alive(entity)) continue;
    if (setMode(entity, key)) changed++;
  }
  logInfo(TAG, `${player.name} menyuruh ${changed} companion ke mode "${key}" lewat buku.`);
  player.sendMessage(changed
    ? `§a${changed} companion §7» §f${MODES[key].label}`
    : "§7Tidak ada companion yang bisa diperintah sekarang.");
  await openControl(player);
}

/* ------------------------------------------------------------------ *
 * 2b. Satu companion
 * ------------------------------------------------------------------ */

function hubBody(player, entity) {
  const state = readState(entity);
  const doing = getActivity(entity);
  const mode = MODES[getMode(entity)]?.label ?? "?";
  const condition = isSleeping(state) ? "tidur"
    : isResting(state) ? "beristirahat" : needsLabel(state);
  return [
    `§7Tugas     §f${mode}`,
    doing ? `§7Sekarang  §a${doing}` : "§7Sekarang  §8belum ada yang dikerjakan",
    `§7Kondisi   §f${condition}`,
    `§eTenaga    §f${Math.round(energyOf(state))}§7   §bKantuk §f${Math.round(sleepOf(state))}`,
    `§7Jarak     §f${distanceLabel(player, entity)}`,
    state.station
      ? `§7Stasiun   §f${state.station.x}, ${state.station.y}, ${state.station.z}`
      : "§7Stasiun   §8belum ada",
  ].join("\n");
}

async function openCompanionHub(player, entity) {
  const question = askOf(player.id, entity.id);
  const mode = getMode(entity);
  const form = new ActionFormData()
    .title(`§l§b${displayName(entity)}`)
    .body(hubBody(player, entity))
    .button("§aSedang Apa\n§8Laporan lengkap pekerjaannya sekarang", "textures/items/clock_item")
    .button("§eIsi Peti & Kantong\n§8Apa yang dia bawa dan simpan", "textures/items/chest")
    .button("§bNgobrol\n§8Kirim pesan tanpa perlu mendekat", "textures/items/book_writable");
  if (question) {
    form.button(`§6Jawab Pertanyaannya\n§8${question.text.slice(0, 40)}...`, "textures/items/wheat");
  }
  if (mode === "mine") {
    form.button("§7Apa yang Ditambang\n§8Pilih bijih yang dia cari", "textures/items/iron_pickaxe");
  }
  if (mode === "farm") {
    form.button("§2Peta Patok Ladang\n§8Tunjuk chunk ladang di peta", "textures/items/map_filled");
  }
  if (mode === "build") {
    form.button("§2Peta Patok Desa\n§8Tunjuk chunk desa di peta", "textures/items/map_filled");
  }
  form
    .button("§dTunjuk Ranjang\n§8Di mana dia tidur kalau mengantuk", "textures/items/bed_red")
    .button("§dMenu Lengkap\n§8Perintah, perlengkapan, ladang, rancangan", "textures/items/name_tag")
    .button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;

  const buttons = ["doing", "bag", "talk"];
  if (question) buttons.push("ask");
  if (mode === "mine") buttons.push("mine");
  if (mode === "farm") buttons.push("farm_map");
  if (mode === "build") buttons.push("build_map");
  buttons.push("bed", "menu", "back");

  switch (buttons[res.selection]) {
    case "doing": await openDoing(player, entity); break;
    case "bag": await openBag(player, entity); break;
    case "talk": await openTalk(player, entity); break;
    case "ask": await openAsks(player, entity); break;
    case "mine": await openMineTargets(player, entity); break;
    case "farm_map": await openStakeMap(player, "farm", () => openCompanionHub(player, entity)); break;
    case "build_map": await openStakeMap(player, "village", () => openCompanionHub(player, entity)); break;
    case "bed": await openBedPage(player, entity); break;
    case "menu": await openMenu(player, entity); break;
    default: await openControl(player); break;
  }
}

/**
 * Menunjuk ranjang dari dalam buku.
 *
 * Bedanya dengan tombol yang sama di menu companion cuma satu, dan itu yang
 * penting: buku bisa dibuka DI MANA SAJA. Jadi ranjang yang ditunjuk dari sini
 * adalah ranjang di dekat KAMU — rumah yang baru kamu bangun sendiri, atau
 * ranjang di kampung tempat kamu sedang berdiri — sementara companionnya
 * mungkin sedang bekerja di seberang bukit.
 */
async function openBedPage(player, entity) {
  const bed = bedLabel(entity, readState(entity));
  const form = new ActionFormData()
    .title(`§l§dRanjang ${displayName(entity)}`)
    .body([
      "§7Berdiri di dekat ranjangnya, §flihat ke ranjang itu§7, lalu tekan tombol",
      "§7di bawah. Kalau tatapanmu meleset, ranjang terdekat dalam 12 blok dari",
      "§7tempatmu berdiri yang dipakai.",
      "",
      bed
        ? (bed.gone
          ? `§cRanjang tertunjuk di (${bed.x}, ${bed.y}, ${bed.z}) sudah tidak ada di situ.`
          : `§aRanjangnya: §f(${bed.x}, ${bed.y}, ${bed.z})§a.`)
        : "§8Belum ada ranjang yang ditunjuk untuk dia.",
      "",
      "§7Urutan tempat tidurnya:",
      "§f1. Ranjang yang kamu tunjuk§7 — rumahmu sendiri, atau rumah di kampung",
      "§f2. Ranjang rumah desa§7 yang dibangun Pembangun di chunk berpatok desa",
      "§f3. Ranjang mana pun§7 dalam 12 blok dari tempatnya mengantuk",
      "§f4. Bawah pohon§7 atau stasiunnya sendiri kalau memang tidak ada ranjang",
    ].join("\n"))
    .button("§aTunjuk Ranjang yang Kulihat\n§8Atau ranjang terdekat dalam 12 blok", "textures/items/bed_red")
    .button(bed ? "§cLupakan Ranjang Ini\n§8Kembali ke urutan biasa" : "§8Belum ada yang bisa dilupakan")
    .button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection === 0) {
    const spot = pointBed(player, entity);
    player.sendMessage(spot
      ? `§a${displayName(entity)} akan tidur di ranjang (${spot.x}, ${spot.y}, ${spot.z}).`
      : "§cTidak ada ranjang yang terlihat maupun dalam 12 blok dari tempatmu berdiri.");
    await openBedPage(player, entity);
    return;
  }
  if (res.selection === 1 && bed) {
    clearBed(entity);
    player.sendMessage(`§7${displayName(entity)} kembali memakai urutan tempat tidur biasa.`);
    await openBedPage(player, entity);
    return;
  }
  await openCompanionHub(player, entity);
}

async function openDoing(player, entity) {
  const state = readState(entity);
  const doing = getActivity(entity);
  const form = new ActionFormData()
    .title(`§l§a${displayName(entity)} sekarang`)
    .body([
      doing ? `§a${doing}` : "§8Belum ada pekerjaan yang tercatat setengah menit ini.",
      "",
      hubBody(player, entity),
      "",
      state.craft ? `§7Sedang menempa: §f${state.craft.tier} ${state.craft.kind}` : "",
      Object.keys(state.needs ?? {}).length
        ? `§7Masih kurang: §f${Object.keys(state.needs).join(", ")}`
        : "§8Tidak ada bahan yang sedang ditunggu.",
      "",
      "§8Baris ini sama persis dengan yang dijawab companion kalau kamu",
      `§8mengetik §7chat ${displayName(entity)} lagi ngapain?`,
    ].filter(Boolean).join("\n"))
    .button("§8« Kembali");
  await forceShow(player, form);
  await openCompanionHub(player, entity);
}

async function openBag(player, entity) {
  const state = readState(entity);
  const container = stationContainer(entity, state);
  const chest = summarize(container);
  const rows = (counts) => {
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return list.length
      ? list.map(([id, n]) => `§7• §f${prettyItem(id)} §7x${n}`)
      : ["§8kosong"];
  };

  const form = new ActionFormData()
    .title(`§l§e Isi milik ${displayName(entity)}`)
    .body([
      state.station
        ? `§7§lPeti stasiun§r §8(${state.station.x}, ${state.station.y}, ${state.station.z})`
        : "§7§lPeti stasiun§r §8belum berdiri",
      ...rows(chest),
      "",
      `§7§lKantong pribadi§r §8(${bagCount(state)} barang)`,
      ...rows(state.bag ?? {}),
      "",
      "§8Hasil kerja companion selalu masuk ke sini, bukan ke kantongmu.",
    ].join("\n"))
    .button("§8« Kembali");
  await forceShow(player, form);
  await openCompanionHub(player, entity);
}

async function openTalk(player, entity) {
  const form = new ModalFormData()
    .title(`§lNgobrol dengan ${displayName(entity)}`)
    .textField(
      `§7Apa yang mau kamu katakan ke ${displayName(entity)}?\n` +
      "§8Perintah kerja yang diselipkan langsung dituruti, mis. \"bertani dong\".",
      "halo, lagi ngapain?");

  const res = await forceShow(player, form);
  if (!res || res.canceled) {
    await openCompanionHub(player, entity);
    return;
  }
  const message = String(res.formValues?.[0] ?? "").trim();
  if (!message) {
    await openCompanionHub(player, entity);
    return;
  }
  logInfo(TAG, `${player.name} mengirim pesan lewat buku ke ${entStr(entity)}: "${message}"`);
  deliver(player, displayName(entity), message);
  await openCompanionHub(player, entity);
}

/* --- pertanyaan companion --- */

async function openAsks(player, entity) {
  const all = pendingAsks(player.id);
  const list = entity ? all.filter((q) => q.from === entity.id) : all;
  if (!list.length) {
    const empty = new ActionFormData()
      .title("§l§6Pertanyaan Companion")
      .body("§7Tidak ada pertanyaan yang menunggu jawaban sekarang.\n\n" +
            "§8Companion bertanya kalau ada keputusan yang memang milikmu —\n" +
            "§8mis. petani yang kehabisan bibit, atau penambang yang belum tahu\n" +
            "§8bijih apa yang kamu cari.")
      .button("§8« Kembali");
    await forceShow(player, empty);
    if (entity) await openCompanionHub(player, entity);
    else await openBook(player);
    return;
  }

  const question = list[0];
  const form = new ActionFormData()
    .title(`§l§6${question.fromName} bertanya`)
    .body(`§f${question.text}\n\n§8Jawabanmu tersimpan dan dituruti seterusnya —\n` +
          "§8bisa diubah lagi kapan saja lewat halaman ini.");
  if (question.multi) {
    form.button("§aPilih jawabannya\n§8Boleh lebih dari satu");
  } else {
    for (const option of question.options) form.button(`§f${option.label}`);
  }
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;

  const target = entity ?? myCompanions(player).find((c) => c.id === question.from);
  if (question.multi) {
    if (res.selection === 0 && target) await openMineTargets(player, target);
    else await openBook(player);
    return;
  }
  if (res.selection < question.options.length) {
    answerAsk(player.id, question.id, question.options[res.selection].key);
    player.sendMessage(`§a${question.fromName} §7» §f${question.options[res.selection].label}`);
  }
  if (entity) await openCompanionHub(player, entity);
  else await openAsks(player);
}

async function openMineTargets(player, entity) {
  const state = readState(entity);
  const wants = Array.isArray(state.mineWants) ? state.mineWants : [];
  const keys = Object.keys(MINE_TARGETS);
  const deepest = wants.length
    ? Math.min(...wants.map((k) => MINE_TARGETS[k]?.depth ?? -54))
    : -54;

  const haul = state.mineHaul !== false;

  const form = new ActionFormData()
    .title(`§l§7Tambangan ${displayName(entity)}`)
    .body([
      "§7Centang bijih yang kamu mau. Yang tidak dicentang tidak dikejar ke",
      "§7dinding terowongan — yang kebetulan ada di jalur galian tetap dipungut,",
      "§7karena bloknya memang harus dibongkar supaya lorongnya lewat.",
      "",
      wants.length
        ? `§7Sekarang: §f${wants.map((k) => MINE_TARGETS[k]?.label ?? k).join(", ")}`
        : "§7Sekarang: §fapa saja §8(belum dipilih)",
      `§7Terowongan akan turun sampai §fy ${deepest}§7.`,
      "",
      `§7Bawa pulang batu & tanah galian: ${haul ? "§ahidup" : "§cmati"}`,
      "§8Kalau hidup, batu, tanah, kerikil dan pasir yang terpaksa dibongkar",
      "§8ikut disetor ke peti — bahan timbun petani dan batu pembangun datang",
      "§8dari sana. Kalau dimatikan, cuma bijih yang dibawa pulang.",
    ].join("\n"));
  for (const key of keys) {
    const on = wants.includes(key);
    form.button(`${on ? "§a✔ " : "§8✘ "}${MINE_TARGETS[key].label}\n§8sampai y ${MINE_TARGETS[key].depth}`,
                MINE_TARGETS[key].icon);
  }
  form.button(haul
    ? "§cJangan bawa pulang batu & tanah\n§8Cuma bijih yang disetor ke peti"
    : "§aBawa pulang batu & tanah galian\n§8Batu, tanah, kerikil ikut disetor", "textures/items/dirt");
  form.button("§eSelesai — apa saja boleh\n§8Kosongkan pilihan, tambang semuanya");
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;

  if (res.selection < keys.length) {
    const key = keys[res.selection];
    const next = wants.includes(key) ? wants.filter((k) => k !== key) : [...wants, key];
    patchState(entity, { mineWants: next });
    answerAskIfAny(player, entity, next);
    await openMineTargets(player, entity);
    return;
  }
  if (res.selection === keys.length) {
    patchState(entity, { mineHaul: !haul });
    player.sendMessage(haul
      ? `§7${displayName(entity)} cuma membawa pulang bijih sekarang.`
      : `§a${displayName(entity)} akan membawa pulang batu dan tanah galian juga.`);
    await openMineTargets(player, entity);
    return;
  }
  if (res.selection === keys.length + 1) {
    patchState(entity, { mineWants: [] });
    answerAskIfAny(player, entity, []);
    player.sendMessage(`§7${displayName(entity)} akan menambang apa saja.`);
    await openCompanionHub(player, entity);
    return;
  }
  await openCompanionHub(player, entity);
}

function answerAskIfAny(player, entity, value) {
  const question = askOf(player.id, entity.id);
  if (question && question.field === "mineWants") {
    answerAsk(player.id, question.id, value);
  }
}

/* ------------------------------------------------------------------ *
 * 3. Pengaturan mod, per pemain
 * ------------------------------------------------------------------ */

const SWITCHES = [
  {
    key: "hideOwner",
    label: "Sembunyikan nama pemilik",
    hint: "Namamu hilang dari penanda kepala dan papan stasiun semua companionmu",
    icon: "textures/items/paper",
  },
  {
    key: "quiet",
    label: "Bungkam semua celoteh",
    hint: "Companion tetap bekerja, cuma tidak bersuara sama sekali",
    icon: "textures/items/book_normal",
  },
  {
    key: "bubbles",
    label: "Gelembung teks di atas kepala",
    hint: "Kalau dimatikan, kalimatnya masuk chat biasa",
    icon: "textures/items/name_tag",
  },
  {
    key: "reports",
    label: "Laporan jarak jauh masuk chat",
    hint: "Panen selesai, minta bahan, tawaran membangun kampung",
    icon: "textures/items/emerald",
  },
  {
    key: "hints",
    label: "Pesan petunjuk",
    hint: 'Yang muncul saat mengklik companion ("jongkok dulu", "beri bunga")',
    icon: "textures/items/compass_item",
  },
  {
    key: "keepBook",
    label: "Buku ini tidak bisa hilang",
    hint: "Dikembalikan sesudah mati atau dibuang. Matikan kalau mau membuangnya",
    icon: "textures/items/book_writable",
  },
  {
    key: "logToChat",
    label: "Kirim peringatan & error ke chat",
    hint: "Untuk melacak masalah saat kejadian, bukan sesudah curiga",
    icon: "textures/items/book_writable",
  },
];

function onOff(value) {
  return value ? "§ahidup" : "§cmati";
}

async function openPrefs(player) {
  const prefs = readSettings(player.id);
  const form = new ActionFormData()
    .title("§l§ePengaturan Mod")
    .body([
      "§7Setelan ini milik §fkamu§7, bukan milik satu companion: berlaku untuk",
      "§7seluruh companionmu dan tetap tersimpan sesudah dunia ditutup.",
      "",
      "§8Klik satu baris untuk membalik saklarnya.",
    ].join("\n"));
  for (const sw of SWITCHES) {
    form.button(`§f${sw.label}: ${onOff(prefs[sw.key])}\n§8${sw.hint}`, sw.icon);
  }
  form.button("§8« Kembali");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection >= SWITCHES.length) {
    await openBook(player);
    return;
  }
  const sw = SWITCHES[res.selection];
  const next = !prefs[sw.key];
  writeSettings(player.id, { [sw.key]: next });
  if (sw.key === "logToChat") watchLogs(player.id, next);
  if (sw.key === "keepBook" && next) {
    player.sendMessage("§7Buku akan dikembalikan lagi kalau hilang.");
  }
  logInfo(TAG, `${player.name} menyetel "${sw.key}" = ${next}.`);
  player.sendMessage(`§7${sw.label}: ${onOff(next)}`);
  await openPrefs(player);
}

/* ------------------------------------------------------------------ *
 * 4. Isi tambahan & status
 * ------------------------------------------------------------------ */

async function openStatus(player) {
  const data = Object.entries(BLUEPRINTS).filter(([, bp]) => bp.source);
  const dialogue = dialogueStats();
  const form = new ActionFormData()
    .title("§l§dIsi Tambahan & Status")
    .body([
      "§7Isi mod ini bisa ditambah tanpa menyentuh kode: taruh berkas JSON di",
      "§7folder add-on, jalankan generatornya, pasang ulang packnya.",
      "",
      `§eRancangan dari JSON: §f${data.length}`,
      ...(data.length
        ? data.map(([key, bp]) => `§8  • ${bp.label} §7(${key}, ${bp.source})`)
        : ["§8  belum ada — taruh berkas di blueprints/"]),
      "",
      `§bKalimat dialog dari JSON: §f${dialogue.lines}`,
      `§bTopik obrolan dari JSON: §f${dialogue.topics}§7 dari total §f${dialogue.total}`,
      "",
      "§7§lBeta API",
      ...betaLines(),
    ].join("\n"))
    .button("§8« Kembali");
  await forceShow(player, form);
  await openBook(player);
}