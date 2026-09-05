/**
 * Apa yang diucapkan companion.
 *
 * Dipisah dari chat.js supaya menambah dialog tidak perlu menyentuh satu baris
 * pun kode. Tiap karakter punya suaranya sendiri — Akito pendek dan ketus,
 * Kohane ragu-ragu dan sopan, An santai, Toya rapi, Flins formal — dan itu yang
 * bikin dua companion yang berdiri berdekatan terbaca sebagai dua orang, bukan
 * satu mob yang muncul dua kali.
 *
 * Penanda yang bisa dipakai di teks:
 *   {aku}    nama companion yang bicara
 *   {kamu}   nama lawan bicara (companion lain), atau nama pemilik
 *   {owner}  nama pemilik
 */

export const LINES = {
  akito: {
    greet: ["Apa? Ada perlu?", "Ngeliatin terus. Ada yang salah?",
            "Yo, {owner}.", "Jangan bengong, ayo kerja."],
    idle: ["Gerah.", "Kalau mau cepat, jangan setengah-setengah.",
           "Aku bisa sendiri.", "Cepat sedikit napa."],
    farm: ["Nyangkul juga butuh tenaga, tahu.", "Barisnya jangan bengkok.",
           "Ini terakhir, habis itu istirahat."],
    mine: ["Batunya keras.", "Ada suara di bawah sana.", "Terowongannya lurus, jangan protes."],
    wander: ["Aku duluan.", "Jauh juga ternyata."],
    build: ["Kalau miring, aku bongkar lagi.", "Bahannya kurang, isi petinya."],
    attack: ["Minggir.", "Cuma segitu?", "Aku yang urus."],
    hurt: ["Sakit, bego!", "Cih.", "Belum selesai."],
    done: ["Beres.", "Sudah. Puas?"],
  },
  kohane: {
    greet: ["A-ada apa?", "Ehm... halo, {owner}.", "Aku... aku baik-baik saja.",
            "Ma-mau kubantu?"],
    idle: ["Semoga hari ini lancar ya.", "Aku masih belajar, maaf...",
           "Anginnya enak.", "Kalau ada yang salah, bilang saja."],
    farm: ["Tanahnya gembur, bagus.", "Aku tanam berbaris, biar rapi.",
           "Semoga tumbuh semua..."],
    mine: ["Gelap... tapi tidak apa-apa.", "Aku pasang obor dulu ya."],
    wander: ["Aku... agak takut jauh-jauh.", "Nanti aku pulang, janji."],
    build: ["Sudah lurus belum ya?", "Aku pasang pelan-pelan saja."],
    attack: ["Aku... aku akan berusaha!", "Jangan dekat-dekat {owner}!"],
    hurt: ["Aduh...", "Ma-maaf, aku kena.", "Aku masih bisa."],
    done: ["Sudah selesai!", "Semoga cukup rapi..."],
  },
  an: {
    greet: ["Yo.", "Kenapa? Ada kerjaan?", "Santai aja, {owner}.",
            "Lagi ngeliatin siapa nih."],
    idle: ["Enak juga di sini.", "Kalau capek bilang, jangan dipaksa.",
           "Nanti kita ngobrol lagi."],
    farm: ["Ladangnya makin lebar aja.", "Aku suka yang rapi begini.",
           "Panennya lumayan."],
    mine: ["Bawah sini adem.", "Hati-hati, ada gua."],
    wander: ["Sekalian keliling deh.", "Nemu sesuatu nih."],
    build: ["Ini kutata biar enak dilihat.", "Bahan tinggal sedikit."],
    attack: ["Ayo maju.", "Jangan sampai lewat aku."],
    hurt: ["Aw. Oke, serius nih.", "Masih kuat."],
    done: ["Kelar.", "Gampang."],
  },
  toya: {
    greet: ["Ada yang bisa kubantu?", "Selamat datang kembali, {owner}.",
            "Aku mendengarkan.", "Silakan."],
    idle: ["Semuanya pada tempatnya.", "Aku catat kalau ada yang kurang.",
           "Waktunya diatur, hasilnya beda."],
    farm: ["Jaraknya kuhitung dua blok tiap jalur.", "Airnya cukup sampai ujung.",
           "Panen berikutnya kira-kira sebentar lagi."],
    mine: ["Cabangnya tiap tiga blok, supaya tidak ada yang terlewat.",
           "Obor tiap delapan blok."],
    wander: ["Aku petakan sambil jalan.", "Koordinatnya kucatat."],
    build: ["Ukurannya sudah kupastikan.", "Kalau rancangannya diganti, bilang saja."],
    attack: ["Aku ambil yang kiri.", "Sudah kuhitung jaraknya."],
    hurt: ["Perhitunganku meleset.", "Tidak masalah."],
    done: ["Selesai, sesuai rencana.", "Sudah rapi."],
  },
  flins: {
    greet: ["Selamat bertemu.", "Ada perintah, Tuan {owner}?",
            "Aku siap.", "Silakan bicara."],
    idle: ["Mercusuar mengajarkan sabar.", "Malam di sini lebih tenang daripada di utara.",
           "Aku berjaga."],
    farm: ["Tanah yang dirawat membalas budi.", "Aku kerjakan sampai tuntas."],
    mine: ["Batu ini tua sekali.", "Di bawah sana ada yang berkilau."],
    wander: ["Aku akan kembali sebelum gelap.", "Jalannya panjang, tapi aman."],
    build: ["Batu disusun batu.", "Bangunan yang baik dimulai dari dasarnya."],
    attack: ["Berdiri di belakangku.", "Ini akan cepat."],
    hurt: ["Masih ringan.", "Aku bertahan."],
    done: ["Tugas selesai.", "Sudah kutuntaskan."],
  },
};

/** Kalau karakternya belum punya baris untuk keadaan ini, pakai yang ini. */
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

/**
 * Percakapan antar companion.
 *
 * Tiap topik adalah giliran bicara bergantian: baris ke-0 diucapkan yang memulai,
 * ke-1 lawan bicaranya, dan seterusnya. `when` menyaring topik menurut mode yang
 * sedang dijalankan keduanya, jadi dua petani membicarakan ladang dan penambang
 * yang bertemu pengembara membicarakan perjalanan.
 */
export const TOPICS = [
  {
    tag: "kenalan",
    when: () => true,
    turns: ["Eh, {kamu}. Sudah lama di sini?",
            "Lumayan. {owner} yang memanggilku.",
            "Sama. Kita satu majikan kalau begitu."],
  },
  {
    tag: "cuaca",
    when: () => true,
    turns: ["Anginnya berubah.", "Iya. Mungkin nanti hujan.",
            "Kalau hujan, kerjanya lebih enak."],
  },
  {
    tag: "owner",
    when: () => true,
    turns: ["{owner} pergi lama sekali tadi.",
            "Dia selalu begitu. Nanti juga balik.",
            "Aku tunggu saja."],
  },
  {
    tag: "ladang",
    when: (a, b) => a === "farm" || b === "farm",
    turns: ["Barisannya sudah lurus semua?",
            "Sudah. Dua blok tiap jalur, seperti biasa.",
            "Bagus. Yang kemarin sempat bengkok di ujung.",
            "Sudah kuperbaiki."],
  },
  {
    tag: "panen",
    when: (a, b) => a === "farm" && b === "farm",
    turns: ["Kentangnya berat hari ini.",
            "Berarti tanahnya subur.",
            "Aku sisakan sebagian buat ditanam lagi."],
  },
  {
    tag: "tambang",
    when: (a, b) => a === "mine" || b === "mine",
    turns: ["Di bawah sana ada yang berkilau.",
            "Intan?", "Belum tahu. Nanti kubawa ke peti.",
            "Hati-hati, jangan sampai kena lava."],
  },
  {
    tag: "jalan",
    when: (a, b) => a === "wander" || b === "wander",
    turns: ["Aku lihat desa di sebelah sana.",
            "Jauh?", "Lumayan. Sudah kucatat koordinatnya.",
            "Bagus. Nanti kita ke sana bareng."],
  },
  {
    tag: "bangunan",
    when: (a, b) => a === "build" || b === "build",
    turns: ["Pagarnya sampai mana?",
            "Sisi utara sudah, tinggal yang timur.",
            "Bahannya masih ada di peti?",
            "Masih. Cukup sampai selesai."],
  },
  {
    tag: "jaga",
    when: (a, b) => a === "attack" || b === "attack",
    turns: ["Malam ini ramai.",
            "Aku sudah dengar. Ada dua di balik bukit.",
            "Kamu kiri, aku kanan."],
  },
  {
    tag: "istirahat",
    when: (a, b) => a === "stay" || b === "stay",
    turns: ["Tidak capek berdiri terus di situ?",
            "Ini perintahnya. Aku tidak keberatan.",
            "Kalau bosan, panggil saja aku."],
  },
];

/** Laporan pengembara. {apa} diganti nama temuan, {di} diganti koordinat. */
export const REPORTS = [
  "Aku menemukan {apa} di {di}.",
  "Ada {apa} di {di}. Sudah kucatat.",
  "{apa} — {di}. Mungkin berguna.",
];

/** Nama temuan yang bisa dilaporkan pengembara. */
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
  return LINES[id] ?? FALLBACK;
}

export function linesFor(id, key) {
  const voice = voiceOf(id);
  const list = voice[key];
  return Array.isArray(list) && list.length ? list : (FALLBACK[key] ?? FALLBACK.idle);
}
