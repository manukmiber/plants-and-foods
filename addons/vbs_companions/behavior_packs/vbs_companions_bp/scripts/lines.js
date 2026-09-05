/**
 * Apa yang diucapkan companion.
 */

import { logDebug } from "./logger.js";

const TAG = "LINES";

export const LINES = {
  akito: {
    greet: ["Apa? Ada perlu?", "Ngeliatin terus. Ada yang salah?", "Yo, {owner}.", "Jangan bengong, ayo kerja."],
    idle: ["Gerah.", "Kalau mau cepat, jangan setengah-setengah.", "Aku bisa sendiri.", "Cepat sedikit napa."],
    farm: ["Nyangkul juga butuh tenaga, tahu.", "Barisnya jangan bengkok.", "Ini terakhir, habis itu istirahat."],
    mine: ["Batunya keras.", "Ada suara di bawah sana.", "Terowongannya lurus, jangan protes."],
    wander: ["Aku duluan.", "Jauh juga ternyata."],
    build: ["Kalau miring, aku bongkar lagi.", "Bahannya kurang, isi petinya."],
    attack: ["Minggir.", "Cuma segitu?", "Aku yang urus."],
    hurt: ["Sakit, bego!", "Cih.", "Belum selesai."],
    done: ["Beres.", "Sudah. Puas?"],
  },
  kohane: {
    greet: ["A-ada apa?", "Ehm... halo, {owner}.", "Aku... aku baik-baik saja.", "Ma-mau kubantu?"],
    idle: ["Semoga hari ini lancar ya.", "Aku masih belajar, maaf...", "Anginnya enak.", "Kalau ada yang salah, bilang saja."],
    farm: ["Tanahnya gembur, bagus.", "Aku tanam berbaris, biar rapi.", "Semoga tumbuh semua..."],
    mine: ["Gelap... tapi tidak apa-apa.", "Aku pasang obor dulu ya."],
    wander: ["Aku... agak takut jauh-jauh.", "Nanti aku pulang, janji."],
    build: ["Sudah lurus belum ya?", "Aku pasang pelan-pelan saja."],
    attack: ["Aku... aku akan berusaha!", "Jangan dekat-dekat {owner}!"],
    hurt: ["Aduh...", "Ma-maaf, aku kena.", "Aku masih bisa."],
    done: ["Sudah selesai!", "Semoga cukup rapi..."],
  },
  an: {
    greet: ["Yo.", "Kenapa? Ada kerjaan?", "Santai aja, {owner}.", "Lagi ngeliatin siapa nih."],
    idle: ["Enak juga di sini.", "Kalau capek bilang, jangan dipaksa.", "Nanti kita ngobrol lagi."],
    farm: ["Ladangnya makin lebar aja.", "Aku suka yang rapi begini.", "Panennya lumayan."],
    mine: ["Bawah sini adem.", "Hati-hati, ada gua."],
    wander: ["Sekalian keliling deh.", "Nemu sesuatu nih."],
    build: ["Ini kutata biar enak dilihat.", "Bahan tinggal sedikit."],
    attack: ["Ayo maju.", "Jangan sampai lewat aku."],
    hurt: ["Aw. Oke, serius nih.", "Masih kuat."],
    done: ["Kelar.", "Gampang."],
  },
  toya: {
    greet: ["Ada yang bisa kubantu?", "Selamat datang kembali, {owner}.", "Aku mendengarkan.", "Silakan."],
    idle: ["Semuanya pada tempatnya.", "Aku catat kalau ada yang kurang.", "Waktunya diatur, hasilnya beda."],
    farm: ["Jaraknya kuhitung dua blok tiap jalur.", "Airnya cukup sampai ujung.", "Panen berikutnya kira-kira sebentar lagi."],
    mine: ["Cabangnya tiap tiga blok, supaya tidak ada yang terlewat.", "Obor tiap delapan blok."],
    wander: ["Aku petakan sambil jalan.", "Koordinatnya kucatat."],
    build: ["Ukurannya sudah kupastikan.", "Kalau rancangannya diganti, bilang saja."],
    attack: ["Aku ambil yang kiri.", "Sudah kuhitung jaraknya."],
    hurt: ["Perhitunganku meleset.", "Tidak masalah."],
    done: ["Selesai, sesuai rencana.", "Sudah rapi."],
  },
  flins: {
    greet: ["Selamat bertemu.", "Ada perintah, Tuan {owner}?", "Aku siap.", "Silakan bicara."],
    idle: ["Mercusuar mengajarkan sabar.", "Malam di sini lebih tenang daripada di utara.", "Aku berjaga."],
    farm: ["Tanah yang dirawat membalas budi.", "Aku kerjakan sampai tuntas."],
    mine: ["Batu ini tua sekali.", "Di bawah sana ada yang berkilau."],
    wander: ["Aku akan kembali sebelum gelap.", "Jalannya panjang, tapi aman."],
    build: ["Batu disusun batu.", "Bangunan yang baik dimulai dari dasarnya."],
    attack: ["Berdiri di belakangku.", "Ini akan cepat."],
    hurt: ["Masih ringan.", "Aku bertahan."],
    done: ["Tugas selesai.", "Sudah kutuntaskan."],
  },
};

export const FALLBACK = {
  greet: ["Halo, {owner}."],
  idle: ["..."],
  farm: ["Ladangnya kuurus."],
  mine: ["Aku menggali."],
  wander: ["Aku berkeliling."],
  build: ["Aku membangun."],
  attack: ["Awas!"],
  hurt: ["Ugh."],
  done: ["Selesai."],
};

export const TOPICS = [
  {
    tag: "kenalan",
    when: () => true,
    turns: ["Eh, {kamu}. Sudah lama di sini?", "Lumayan. {owner} yang memanggilku.", "Sama. Kita satu majikan kalau begitu."],
  },
  {
    tag: "cuaca",
    when: () => true,
    turns: ["Anginnya berubah.", "Iya. Mungkin nanti hujan.", "Kalau hujan, kerjanya lebih enak."],
  },
  {
    tag: "owner",
    when: () => true,
    turns: ["{owner} pergi lama sekali tadi.", "Dia selalu begitu. Nanti juga balik.", "Aku tunggu saja."],
  },
  {
    tag: "ladang",
    when: (a, b) => a === "farm" || b === "farm",
    turns: ["Barisannya sudah lurus semua?", "Sudah. Dua blok tiap jalur, seperti biasa.", "Bagus. Yang kemarin sempat bengkok di ujung.", "Sudah kuperbaiki."],
  },
  {
    tag: "panen",
    when: (a, b) => a === "farm" && b === "farm",
    turns: ["Kentangnya berat hari ini.", "Berarti tanahnya subur.", "Aku sisakan sebagian buat ditanam lagi."],
  },
  {
    tag: "tambang",
    when: (a, b) => a === "mine" || b === "mine",
    turns: ["Di bawah sana ada yang berkilau.", "Intan?", "Belum tahu. Nanti kubawa ke peti.", "Hati-hati, jangan sampai kena lava."],
  },
  {
    tag: "jalan",
    when: (a, b) => a === "wander" || b === "wander",
    turns: ["Aku lihat desa di sebelah sana.", "Jauh?", "Lumayan. Sudah kucatat koordinatnya.", "Bagus. Nanti kita ke sana bareng."],
  },
  {
    tag: "bangunan",
    when: (a, b) => a === "build" || b === "build",
    turns: ["Pagarnya sampai mana?", "Sisi utara sudah, tinggal yang timur.", "Bahannya masih ada di peti?", "Masih. Cukup sampai selesai."],
  },
  {
    tag: "jaga",
    when: (a, b) => a === "attack" || b === "attack",
    turns: ["Malam ini ramai.", "Aku sudah dengar. Ada dua di balik bukit.", "Kamu kiri, aku kanan."],
  },
  {
    tag: "istirahat",
    when: (a, b) => a === "stay" || b === "stay",
    turns: ["Tidak capek berdiri terus di situ?", "Ini perintahnya. Aku tidak keberatan.", "Kalau bosan, panggil saja aku."],
  },
];

export const REPORTS = [
  "Aku menemukan {apa} di {di}.",
  "Ada {apa} di {di}. Sudah kucatat.",
  "{apa} — {di}. Mungkin berguna.",
];

export const FINDS = {
  village: "desa",
  cave: "mulut gua",
  chest: "peti terbengkalai",
  lava: "danau lava",
  water: "sungai",
  ruin: "reruntuhan",
  ore: "urat bijih di permukaan",
};

export function voiceOf(id) {
  logDebug(TAG, `Mencari voice untuk karakter ID: "${id}"`);
  return LINES[id] ?? FALLBACK;
}

export function linesFor(id, key) {
  const voice = voiceOf(id);
  const list = voice[key];
  const valid = Array.isArray(list) && list.length ? list : (FALLBACK[key] ?? FALLBACK.idle);
  logDebug(TAG, `linesFor("${id}", "${key}") -> Mengembalikan ${valid.length} baris.`);
  return valid;
}