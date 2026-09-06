/**
 * Isi Buku Panduan Companion.
 *
 * Tiga hal yang diminta ada di dalamnya, dan ketiganya benar-benar dikerjakan
 * dari sini, bukan sekadar teks:
 *
 *   1. CARA PAKAI          panduan bertahap, dibagi per bab
 *   2. KENDALI COMPANION   daftar companion milik pemain, menunya, dan perintah
 *                          untuk semuanya sekaligus tanpa perlu mendekat
 *   3. PENGATURAN MOD      saklar per pemain, tersimpan di tingkat dunia
 *
 * Semua layar memakai ActionFormData, termasuk halaman pengaturan. Itu disengaja:
 * bentuk parameter ModalFormData.toggle() berubah antara versi stabil dan beta
 * @minecraft/server-ui, dan halaman pengaturan yang menampilkan nilai bawaan yang
 * salah lebih buruk daripada satu tombol per saklar.
 */

import { ActionFormData } from "@minecraft/server-ui";
import { FAMILY, MODES } from "./config.js";
import { BLUEPRINTS } from "./builder.js";
import { betaLines } from "./beta.js";
import { dialogueStats } from "./lines.js";
import { displayName } from "./nametag.js";
import { readSettings, writeSettings } from "./state.js";
import { openMenu } from "./ui.js";
import {
  alive, allCompanions, dist2, forceShow, getMode, getOwnerId, setMode,
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
  const form = new ActionFormData()
    .title("§l§6Buku Panduan Companion")
    .body([
      "§7Buku ini ditempa dari satu §fbuku§7 dan satu §fbunga§7, dan tidak bisa",
      "§7hilang: kalau kamu mati atau membuangnya, buku ini kembali sendiri.",
      "",
      `§7Companion milikmu yang sedang ada di dunia: §f${mine.length}`,
      "",
      "§8Semua yang ada di menu companion juga bisa dibuka dari sini, jadi kamu",
      "§8tidak perlu berjalan ke tempat mereka bekerja.",
    ].join("\n"))
    .button("§aCara Pakai\n§8Dari menjinakkan sampai membangun kampung", "textures/items/book_normal")
    .button(`§bKendalikan Companion\n§8${mine.length} companion milikmu`, "textures/items/name_tag")
    .button("§ePengaturan Mod\n§8Saklar yang berlaku untuk semua companionmu", "textures/items/redstone_dust")
    .button("§dIsi Tambahan & Status\n§8Rancangan JSON, dialog JSON, dan Beta API", "textures/items/paper")
    .button("§8Tutup");

  const res = await forceShow(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  switch (res.selection) {
    case 0: await openHowTo(player); break;
    case 1: await openControl(player); break;
    case 2: await openPrefs(player); break;
    case 3: await openStatus(player); break;
    default: break;
  }
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
      "§73. Pegang §fbunga apa saja§7, berdiri (jangan jongkok), lalu klik dia.",
      "§7   Bunganya habis dipakai dan dia jadi milikmu.",
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
      "§7Patok chunk dengan §fPatok Ladang§7 supaya dia boleh menggarap lebih luas.",
      "§8Hasil panen selalu masuk peti companion, bukan kantongmu.",
    ],
  },
  {
    title: "§cMembangun & rancangan",
    icon: "textures/items/brick",
    body: [
      "§7Bahannya diambil dari §fpeti stasiun§7, dan rancangan menyebut §fperan§7",
      "§7blok — dinding, lantai, atap — bukan blok tertentu. Jadi rumah yang sama",
      "§7jadi rumah kayu kalau petimu berisi papan, rumah batu kalau berisi batu.",
      "",
      "§7Ambil §fPatok Desa§7 di menu Rancangan Bangunan untuk mematok chunk yang",
      "§7boleh dibangun rumah. Tiap chunk berpatok dibangun satu rumah lengkap",
      "§7ranjang, dan companion yang mengantuk akan tidur di sana.",
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
    title: "§dTenaga, kantuk, bantuan",
    icon: "textures/items/bed_red",
    body: [
      "§7§lTenaga§r§7 terkuras karena bekerja, pulih dengan istirahat atau ngobrol.",
      "§7§lKantuk§r§7 naik seiring waktu, memuncak malam hari, pulih dengan tidur",
      "§7di ranjang rumah desa.",
      "",
      "§7Companion yang kehabisan bahan §fmemasang permintaan§7, bukan diam:",
      "§8  Mencari Barang -> bahan mentah -> Merajin -> alat & barang jadi",
      "",
      "§7Papan permintaan ada di menu companion » §fPermintaan Bantuan§7.",
      "§7Kalau ada yang mandek, pastikan ada companion bermode §fMerajin§7 dan",
      "§f§7Mencari Barang§7 di dekat mereka.",
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
    form.button(`§f${displayName(entity)}\n§8${mode} — ${distanceLabel(player, entity)}`);
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
    logInfo(TAG, `${player.name} membuka menu ${entStr(target)} lewat buku.`);
    await openMenu(player, target);
    return;
  }
  if (res.selection === mine.length) {
    await openAllOrders(player, mine);
    return;
  }
  await openBook(player);
}

async function openAllOrders(player, mine) {
  const form = new ActionFormData()
    .title("§l§ePerintah untuk Semua")
    .body(`§7Berlaku untuk §f${mine.length}§7 companion milikmu, di dimensi mana pun.\n` +
          "§8Yang sedang tidur atau beristirahat tetap menerima perintahnya dan\n" +
          "§8mengerjakannya begitu bangun.");
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
  // Dua saklar punya akibat langsung di luar penyimpanan setelan.
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
