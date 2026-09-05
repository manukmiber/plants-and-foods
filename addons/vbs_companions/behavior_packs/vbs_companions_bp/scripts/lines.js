/**
 * Apa yang diucapkan companion.
 */

import { logDebug } from "./logger.js";

const TAG = "LINES";

export const LINES = {
  akito: {
    greet: ["Apa? Ada perlu?", "Ngeliatin terus. Ada yang salah?", "Yo, {owner}.", "Jangan bengong, ayo kerja."],
    idle: ["Gerah.", "Kalau mau cepat, jangan setengah-setengah.", "Aku bisa sendiri.", "Cepat sedikit napa.",
      "Bosan diam begini.", "Ada kerjaan lain, tidak?"],
    farm: ["Nyangkul juga butuh tenaga, tahu.", "Barisnya jangan bengkok.", "Ini terakhir, habis itu istirahat.",
      "Tanahnya sudah rata, gampang digarap."],
    mine: ["Batunya keras.", "Ada suara di bawah sana.", "Terowongannya lurus, jangan protes.",
      "Tiga blok tinggi, lega jalannya."],
    wander: ["Aku duluan.", "Jauh juga ternyata.", "Sepi banget di sini."],
    build: ["Kalau miring, aku bongkar lagi.", "Bahannya kurang, isi petinya.", "Ini gampang, tinggal susun."],
    crafter: ["Bahan numpuk, kerja terus.", "Siapa lagi yang butuh alat? Bilang saja.", "Beliung ini buat siapa tadi?"],
    looter: ["Kayunya kutebang semua.", "Batu segini cukup, kan?", "Ada barang jatuh, kuambil."],
    attack: ["Minggir.", "Cuma segitu?", "Aku yang urus."],
    hurt: ["Sakit, bego!", "Cih.", "Belum selesai.", "Kena juga aku."],
    tired: ["Capek. Istirahat dulu sebentar.", "Tenagaku habis, jangan protes."],
    rest: ["...", "Sebentar saja.", "Sudah, ayo lanjut."],
    village: ["Kalau mau bikin kampung, bilang saja aku yang atur.", "Rumahnya sudah kupasang, tidur situ malam ini."],
    reply: ["Apa.", "Ngerti. Sudah kucatat.", "Oke, terserah.", "Ya sudah, kukerjakan.", "Beres, tenang saja."],
    done: ["Beres.", "Sudah. Puas?"],
  },
  kohane: {
    greet: ["A-ada apa?", "Ehm... halo, {owner}.", "Aku... aku baik-baik saja.", "Ma-mau kubantu?"],
    idle: ["Semoga hari ini lancar ya.", "Aku masih belajar, maaf...", "Anginnya enak.", "Kalau ada yang salah, bilang saja.",
      "Aku menunggu di sini saja.", "Sepertinya semua sudah rapi..."],
    farm: ["Tanahnya gembur, bagus.", "Aku tanam berbaris, biar rapi.", "Semoga tumbuh semua...",
      "Sudah rata, tidak perlu khawatir airnya."],
    mine: ["Gelap... tapi tidak apa-apa.", "Aku pasang obor dulu ya.", "Terowongannya lega, aku tidak menunduk."],
    wander: ["Aku... agak takut jauh-jauh.", "Nanti aku pulang, janji.", "Sepi... tapi baik-baik saja kok."],
    build: ["Sudah lurus belum ya?", "Aku pasang pelan-pelan saja.", "Semoga ini cukup kuat..."],
    crafter: ["A-aku buatkan alatnya ya...", "Semoga ini cukup bagus buat dipakai.", "Kalau kurang tajam, bilang saja..."],
    looter: ["Aku pungut yang jatuh-jatuh saja...", "Kayunya... sedikit, tapi lumayan.", "Semoga ini berguna buat yang lain."],
    attack: ["Aku... aku akan berusaha!", "Jangan dekat-dekat {owner}!"],
    hurt: ["Aduh...", "Ma-maaf, aku kena.", "Aku masih bisa.", "Sakit... tapi tidak apa-apa."],
    tired: ["Ma-maaf, aku sedikit lelah...", "Boleh aku istirahat sebentar?"],
    rest: ["Hangat... enak.", "Sebentar lagi aku kembali kerja kok."],
    village: ["Rumahnya sudah jadi... semoga nyaman ditinggali.", "Kalau mau, aku bisa bantu atur kampungnya."],
    reply: ["I-iya?", "Baik, {owner}.", "Ha-hah, oke...", "Dicatat, aku ingat kok.", "Um, baiklah."],
    done: ["Sudah selesai!", "Semoga cukup rapi..."],
  },
  an: {
    greet: ["Yo.", "Kenapa? Ada kerjaan?", "Santai aja, {owner}.", "Lagi ngeliatin siapa nih."],
    idle: ["Enak juga di sini.", "Kalau capek bilang, jangan dipaksa.", "Nanti kita ngobrol lagi.",
      "Diem-diem juga oke sih.", "Ada yang seru, tidak?"],
    farm: ["Ladangnya makin lebar aja.", "Aku suka yang rapi begini.", "Panennya lumayan.", "Tanahnya rata semua, enak dikerjain."],
    mine: ["Bawah sini adem.", "Hati-hati, ada gua.", "Terowongannya lega, jalan enak."],
    wander: ["Sekalian keliling deh.", "Nemu sesuatu nih.", "Jalan-jalan mulu tapi seru."],
    build: ["Ini kutata biar enak dilihat.", "Bahan tinggal sedikit.", "Lumayan, hampir kelar."],
    crafter: ["Gampang, tinggal tempa doang.", "Nih, buat yang lagi butuh.", "Kalau kurang, bilang aja lagi."],
    looter: ["Tebang sana-sini, seru juga.", "Nemu barang jatuh, kuambil.", "Ini buat perajin sama tukang bangun."],
    attack: ["Ayo maju.", "Jangan sampai lewat aku."],
    hurt: ["Aw. Oke, serius nih.", "Masih kuat.", "Kena juga, sialan."],
    tired: ["Capek juga ternyata.", "Istirahat bentar ya, habis itu lanjut."],
    rest: ["Enak nih santai bentar.", "Oke, cukup segini istirahatnya."],
    village: ["Bikin kampung, seru tuh. Ayo mulai.", "Rumah baru udah jadi, sini tidur situ."],
    reply: ["Ha, oke.", "Sip, ngerti.", "Santai, beres kok.", "Noted.", "Ya udah, gas."],
    done: ["Kelar.", "Gampang."],
  },
  toya: {
    greet: ["Ada yang bisa kubantu?", "Selamat datang kembali, {owner}.", "Aku mendengarkan.", "Silakan."],
    idle: ["Semuanya pada tempatnya.", "Aku catat kalau ada yang kurang.", "Waktunya diatur, hasilnya beda.",
      "Menunggu instruksi berikutnya.", "Semua sudah sesuai rencana."],
    farm: ["Jaraknya kuhitung dua blok tiap jalur.", "Airnya cukup sampai ujung.", "Panen berikutnya kira-kira sebentar lagi.",
      "Ladangnya sudah rata, satu level penuh."],
    mine: ["Cabangnya tiap tiga blok, supaya tidak ada yang terlewat.", "Obor tiap delapan blok.",
      "Tinggi terowongan tiga blok, sesuai perhitungan."],
    wander: ["Aku petakan sambil jalan.", "Koordinatnya kucatat."],
    build: ["Ukurannya sudah kupastikan.", "Kalau rancangannya diganti, bilang saja."],
    crafter: ["Urutan tingkatnya kupastikan benar: kayu dulu, baru batu.", "Permintaan sudah kucatat, akan kubuatkan.",
      "Bahannya kuhitung dulu sebelum menempa."],
    looter: ["Kutebang secukupnya, tidak berlebihan.", "Barang sudah kupilah menurut jenisnya.",
      "Perajin dan tukang bangun akan kukirimi dulu."],
    attack: ["Aku ambil yang kiri.", "Sudah kuhitung jaraknya."],
    hurt: ["Perhitunganku meleset.", "Tidak masalah."],
    tired: ["Tenagaku sudah di bawah batas. Aku istirahat dulu.", "Perlu jeda sebentar untuk pulih."],
    rest: ["Pemulihan berjalan sesuai perkiraan.", "Sebentar lagi tenagaku penuh kembali."],
    village: ["Aku sudah hitung berapa rumah yang muat di sana.", "Satu chunk, satu rumah, satu ranjang — sesuai rencana."],
    reply: ["Dimengerti.", "Sudah kucatat, {owner}.", "Baik, akan kupertimbangkan.", "Diterima.", "Akan kulaksanakan."],
    done: ["Selesai, sesuai rencana.", "Sudah rapi."],
  },
  flins: {
    greet: ["Selamat bertemu.", "Ada perintah, Tuan {owner}?", "Aku siap.", "Silakan bicara."],
    idle: ["Mercusuar mengajarkan sabar.", "Malam di sini lebih tenang daripada di utara.", "Aku berjaga.",
      "Menunggu adalah bagian dari tugas.", "Semua tenang untuk saat ini."],
    farm: ["Tanah yang dirawat membalas budi.", "Aku kerjakan sampai tuntas.", "Ladang ini sudah rata, siap disemai."],
    mine: ["Batu ini tua sekali.", "Di bawah sana ada yang berkilau.", "Lorong ini cukup tinggi untuk berjalan tegak."],
    wander: ["Aku akan kembali sebelum gelap.", "Jalannya panjang, tapi aman."],
    build: ["Batu disusun batu.", "Bangunan yang baik dimulai dari dasarnya."],
    crafter: ["Akan kutempa sebaik yang kubisa.", "Siapa pun yang butuh, akan kupenuhi.", "Alat ini akan bertahan lama."],
    looter: ["Kayu dan batu sudah kukumpulkan.", "Aku antar ini ke yang membutuhkan.", "Tidak ada yang terbuang percuma."],
    attack: ["Berdiri di belakangku.", "Ini akan cepat."],
    hurt: ["Masih ringan.", "Aku bertahan."],
    tired: ["Bahkan penjaga mercusuar butuh istirahat.", "Izinkan aku memulihkan diri sejenak."],
    rest: ["Ketenangan ini menyegarkan.", "Aku siap bertugas lagi sebentar lagi."],
    village: ["Sebuah pemukiman kecil akan berdiri di sana.", "Rumah sudah selesai. Silakan beristirahat di dalamnya."],
    reply: ["Baik.", "Akan kuurus, Tuan {owner}.", "Dimengerti sepenuhnya.", "Sebagaimana diminta.", "Akan segera kulakukan."],
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
  crafter: ["Aku sedang merajin."],
  looter: ["Aku mencari barang."],
  attack: ["Awas!"],
  hurt: ["Ugh."],
  tired: ["Aku perlu istirahat."],
  rest: ["Memulihkan tenaga..."],
  village: ["Kampung sedang dibangun."],
  reply: ["Baik, {owner}."],
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
    tag: "capek",
    when: () => true,
    turns: ["Kamu kelihatan capek.", "Sedikit. Tadi tenagaku sempat habis.", "Istirahat dulu, tidak ada yang buru-buru."],
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
    tag: "rajin",
    when: (a, b) => a === "crafter" || b === "crafter",
    turns: ["Ada yang minta alat baru?", "Ada, tukang tambang kehabisan beliung.", "Sudah kubuatkan, tinggal diantar."],
  },
  {
    tag: "barang",
    when: (a, b) => a === "looter" || b === "looter",
    turns: ["Kayu sama batunya cukup?", "Cukup buat sekarang. Nanti kucari lagi kalau kurang.", "Perajin sama tukang bangun berterima kasih."],
  },
  {
    tag: "kampung",
    when: (a, b) => a === "build" || b === "build",
    turns: ["Rumah barunya sudah dibagi?", "Sudah, satu chunk satu rumah.", "Malam ini kita tidur di situ, bukan di stasiun."],
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
