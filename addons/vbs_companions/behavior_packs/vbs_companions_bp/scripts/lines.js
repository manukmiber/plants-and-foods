/**
 * Apa yang diucapkan companion.
 */

import { DATA_LINES, DATA_REPLACES, DATA_TOPICS } from "./dialogue.data.js";
import { logDebug, logInfo } from "./logger.js";

const TAG = "LINES";

export const LINES = {
  akito: {
    greet: ["Apa? Ada perlu?", "Ngeliatin terus. Ada yang salah?", "Yo, {owner}.", "Jangan bengong, ayo kerja.", "Kerja lagi? Ayo.", "Jangan lama-lama ngeliatinnya."],
    idle: ["Gerah.", "Kalau mau cepat, jangan setengah-setengah.", "Aku bisa sendiri.", "Cepat sedikit napa.",
      "Bosan diam begini.", "Ada kerjaan lain, tidak?", "Kalau nganggur, aku cari kerjaan sendiri.", "Diam terus bikin pegal.", "Nanti kalau ada yang berat, panggil aku.", "Hmph.", "Angin malam lumayan."],
    farm: ["Nyangkul juga butuh tenaga, tahu.", "Barisnya jangan bengkok.", "Ini terakhir, habis itu istirahat.",
      "Tanahnya sudah rata, gampang digarap.", "Petak ini kuratakan dulu, baru kucangkul.", "Parit dulu, baru tanam. Urutannya begitu.", "Kalau airnya putus, tanahnya rusak. Aku tidak mau itu."],
    mine: ["Batunya keras.", "Ada suara di bawah sana.", "Terowongannya lurus, jangan protes.",
      "Tiga blok tinggi, lega jalannya.", "Lorong tiga blok, jangan dipersempit.", "Kalau ketemu lava, aku belok. Bukan takut."],
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
    sleepy: ["Ngantuk. Aku tidur sebentar.", "Mata sudah berat. Cukup dulu."],
    wake: ["Sudah, aku bangun.", "Ayo lanjut, jangan bengong."],
    bucket: ["Embernya sudah jadi. Sekarang paritnya.", "Tiga besi, satu ember. Beres."],
    ask: ["Oi, bahanku habis. Bantu carikan.", "Aku butuh bahan. Siapa yang senggang?"],
    thanks: ["...makasih.", "Ya sudah, kucatat utangnya."],
    morning: ["Pagi. Jangan telat.", "Matahari sudah naik, ayo."],
    night: ["Gelap. Hati-hati kalau keluar.", "Malam begini monster keluar."],
    alone: ["Sepi juga tanpa yang lain.", "Yang lain ke mana, ya."],
  },
  kohane: {
    greet: ["A-ada apa?", "Ehm... halo, {owner}.", "Aku... aku baik-baik saja.", "Ma-mau kubantu?", "A-aku di sini kok.", "Se-selamat datang..."],
    idle: ["Semoga hari ini lancar ya.", "Aku masih belajar, maaf...", "Anginnya enak.", "Kalau ada yang salah, bilang saja.",
      "Aku menunggu di sini saja.", "Sepertinya semua sudah rapi...", "Semoga tidak ada yang terluka hari ini.", "Aku... menunggu di sini saja.", "Kalau aku salah, tolong bilang ya.", "Bunganya bagus...", "Angin sore enak sekali."],
    farm: ["Tanahnya gembur, bagus.", "Aku tanam berbaris, biar rapi.", "Semoga tumbuh semua...",
      "Sudah rata, tidak perlu khawatir airnya.", "Aku ratakan tanahnya dulu, biar rapi.", "Paritnya harus ada, kalau tidak tanamannya mati...", "Aku tanam berjalur ya, biar tidak berantakan."],
    mine: ["Gelap... tapi tidak apa-apa.", "Aku pasang obor dulu ya.", "Terowongannya lega, aku tidak menunduk.", "Ge-gelap... tapi lorongnya lega kok.", "Aku pasang obor biar tidak takut."],
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
    sleepy: ["Ma-maaf, aku mengantuk sekali...", "Boleh aku tidur sebentar?"],
    wake: ["Aku sudah bangun...", "Maaf lama ya. Aku lanjut kerja."],
    bucket: ["Embernya jadi! A-aku ambil airnya ya.", "Sekarang paritnya bisa diisi..."],
    ask: ["A-ada yang bisa bantu bawakan bahan?", "Maaf... bahanku habis."],
    thanks: ["Te-terima kasih banyak!", "Kamu baik sekali..."],
    morning: ["Selamat pagi...", "Pagi ini cerah ya."],
    night: ["Sudah malam... hati-hati.", "Aku takut gelap sedikit."],
    alone: ["Sendirian ya...", "Semoga yang lain baik-baik saja."],
  },
  an: {
    greet: ["Yo.", "Kenapa? Ada kerjaan?", "Santai aja, {owner}.", "Lagi ngeliatin siapa nih.", "Yo, apa kabar.", "Butuh sesuatu?"],
    idle: ["Enak juga di sini.", "Kalau capek bilang, jangan dipaksa.", "Nanti kita ngobrol lagi.",
      "Diem-diem juga oke sih.", "Ada yang seru, tidak?", "Santai dulu bentar.", "Enak nih anginnya.", "Kalau bosan, ngobrol aja sama aku.", "Nanti kita main air di parit.", "Hmm, kayaknya bakal hujan."],
    farm: ["Ladangnya makin lebar aja.", "Aku suka yang rapi begini.", "Panennya lumayan.", "Tanahnya rata semua, enak dikerjain.", "Diratain dulu, baru dicangkul. Rapi kan?", "Parit airnya udah kugali, aman.", "Tanahnya kering? Nanti kutambah paritnya."],
    mine: ["Bawah sini adem.", "Hati-hati, ada gua.", "Terowongannya lega, jalan enak.", "Lorongnya lega, enak jalan.", "Adem di bawah sini."],
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
    sleepy: ["Ngantuk berat nih.", "Tidur bentar ya, abis itu lanjut."],
    wake: ["Seger lagi!", "Oke, gas lagi."],
    bucket: ["Ember jadi, tinggal ambil air.", "Nih embernya, gampang."],
    ask: ["Bahan habis nih, bantuin dong.", "Ada yang punya kayu lebih?"],
    thanks: ["Makasih ya!", "Sip, utang budi nih."],
    morning: ["Pagi! Udah sarapan belum?", "Cerah nih hari ini."],
    night: ["Udah malem, jangan jauh-jauh.", "Malam-malam gini enaknya tidur."],
    alone: ["Sepi amat.", "Yang lain pada ke mana sih."],
  },
  toya: {
    greet: ["Ada yang bisa kubantu?", "Selamat datang kembali, {owner}.", "Aku mendengarkan.", "Silakan.", "Ada yang perlu dicatat?", "Aku siap menerima perintah."],
    idle: ["Semuanya pada tempatnya.", "Aku catat kalau ada yang kurang.", "Waktunya diatur, hasilnya beda.",
      "Menunggu instruksi berikutnya.", "Semua sudah sesuai rencana.", "Semua sesuai jadwal.", "Aku sedang menghitung yang tersisa.", "Tidak ada penyimpangan sejauh ini.", "Menunggu, tapi tidak menganggur.", "Catatanku sudah kuperbarui."],
    farm: ["Jaraknya kuhitung dua blok tiap jalur.", "Airnya cukup sampai ujung.", "Panen berikutnya kira-kira sebentar lagi.",
      "Ladangnya sudah rata, satu level penuh.", "Urutannya: ratakan, gali parit, cangkul, tanam. Tidak boleh dibalik.", "Jarak parit delapan blok, jangkauan air empat blok. Pas.", "Semua petak sudah satu ketinggian."],
    mine: ["Cabangnya tiap tiga blok, supaya tidak ada yang terlewat.", "Obor tiap delapan blok.",
      "Tinggi terowongan tiga blok, sesuai perhitungan.", "Penampang terowongan satu kali tiga. Itu ukurannya.", "Cabang tiap tiga blok, obor tiap delapan."],
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
    sleepy: ["Kantukku sudah melewati ambang. Aku tidur.", "Istirahat malam itu bagian dari jadwal."],
    wake: ["Pemulihan selesai. Aku lanjut.", "Kantuk kembali normal."],
    bucket: ["Tiga batang besi, satu ember. Sudah kuhitung.", "Ember siap. Pengairan bisa dimulai."],
    ask: ["Persediaan bahanku habis. Aku mengajukan permintaan.", "Mohon bahan dikirim ke petiku."],
    thanks: ["Sudah kucatat. Terima kasih.", "Bantuanmu tepat waktu."],
    morning: ["Pagi. Jadwal hari ini sudah kususun.", "Waktu mulai kerja."],
    night: ["Malam. Bahaya meningkat di luar.", "Sudah waktunya beristirahat."],
    alone: ["Tidak ada orang lain di sekitar.", "Aku bekerja sendiri untuk sementara."],
  },
  flins: {
    greet: ["Selamat bertemu.", "Ada perintah, Tuan {owner}?", "Aku siap.", "Silakan bicara.", "Salam.", "Aku menunggu perintahmu."],
    idle: ["Mercusuar mengajarkan sabar.", "Malam di sini lebih tenang daripada di utara.", "Aku berjaga.",
      "Menunggu adalah bagian dari tugas.", "Semua tenang untuk saat ini.", "Sabar itu pekerjaan juga.", "Aku menjaga dari sini.", "Laut di kampungku lebih berisik dari ini.", "Semua tenang.", "Waktu berjalan, aku menunggu."],
    farm: ["Tanah yang dirawat membalas budi.", "Aku kerjakan sampai tuntas.", "Ladang ini sudah rata, siap disemai.", "Tanah diratakan dulu, baru layak ditanami.", "Air harus sampai ke setiap petak.", "Ladang yang baik dimulai dari paritnya."],
    mine: ["Batu ini tua sekali.", "Di bawah sana ada yang berkilau.", "Lorong ini cukup tinggi untuk berjalan tegak.", "Lorong ini cukup tinggi untuk berdiri tegak.", "Batu tua menyimpan banyak hal."],
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
    sleepy: ["Malam menuntut haknya. Aku tidur.", "Bahkan penjaga harus memejamkan mata."],
    wake: ["Aku sudah pulih. Lanjutkan.", "Pagi menyambut. Aku kembali bertugas."],
    bucket: ["Ember sudah selesai ditempa.", "Air akan kubawa ke parit."],
    ask: ["Persediaanku habis. Aku memohon bantuan.", "Kirimkan bahan ke petiku, tolong."],
    thanks: ["Terima kasih, sungguh.", "Kebaikanmu kuingat."],
    morning: ["Selamat pagi.", "Fajar sudah tiba."],
    night: ["Malam turun. Berhati-hatilah.", "Gelap bukan musuh, tapi jangan lengah."],
    alone: ["Sendiri pun aku tetap bekerja.", "Sunyi. Tidak apa-apa."],
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
  sleepy: ["Aku mengantuk."],
  wake: ["Aku sudah bangun."],
  bucket: ["Embernya sudah jadi."],
  ask: ["Aku butuh bahan."],
  thanks: ["Terima kasih."],
  morning: ["Selamat pagi."],
  night: ["Sudah malam."],
  alone: ["Sepi di sini."],
};

export const TOPICS = [
  {
    tag: "ember",
    when: (a, b) => a === "farm" || b === "farm",
    turns: ["Embermu sudah jadi?", "Sudah. Tiga besi, satu ember.", "Bagus. Tanpa itu paritnya tidak bisa diisi.", "Nanti aku isi dari sungai sebelah sana."],
  },
  {
    tag: "ratakan",
    when: (a, b) => a === "farm" || b === "farm",
    turns: ["Kenapa lama sekali di petak itu?", "Diratakan dulu. Kalau jomplang, airnya tidak sampai.", "Oh. Pantas yang dulu sering rusak.", "Makanya sekarang urutannya kupatuhi."],
  },
  {
    tag: "minta-tolong",
    when: (a, b) => a === "looter" || b === "looter" || a === "crafter" || b === "crafter",
    turns: ["Kayuku habis, bisa carikan?", "Bisa. Berapa yang kamu perlu?", "Enam belas saja cukup.", "Kuantar ke petimu nanti."],
  },
  {
    tag: "tingkatan",
    when: (a, b) => a === "crafter" || b === "crafter" || a === "mine" || b === "mine",
    turns: ["Aku mau langsung yang besi saja, boleh?", "Tidak boleh. Kayu dulu, baru batu, baru besi.", "Merepotkan.", "Tapi begitu aturannya. Aku buatkan yang kayu dulu."],
  },
  {
    tag: "ngantuk",
    when: () => true,
    turns: ["Kamu menguap terus dari tadi.", "Kantukku sudah tinggi. Nanti aku tidur di rumah baru.", "Ranjangnya sudah ada?", "Sudah, yang dibangun kemarin."],
  },
  {
    tag: "peti",
    when: () => true,
    turns: ["Hasil kerjamu kamu taruh di mana?", "Di petiku sendiri. Bukan di peti pemain.", "Betul. Biar tidak tercampur.", "Nanti dia ambil sendiri kalau perlu."],
  },
  {
    tag: "obor",
    when: (a, b) => a === "mine" || b === "mine",
    turns: ["Obormu masih ada?", "Tinggal sedikit. Nanti kubuat lagi dari arang.", "Jangan sampai kehabisan di bawah sana."],
  },
  {
    tag: "pemilik",
    when: () => true,
    turns: ["Namanya masih dipajang di penandamu?", "Disembunyikan. Biar orang lain tidak tahu ini punya siapa.", "Pintar juga."],
  },
  {
    tag: "makan",
    when: () => true,
    turns: ["Lapar tidak?", "Sedikit. Tapi kerjaan dulu.", "Jangan dipaksa. Istirahat itu bagian dari kerja."],
  },
  {
    tag: "cuaca-malam",
    when: () => true,
    turns: ["Sudah gelap.", "Iya. Monster mulai keluar.", "Kita masuk saja. Besok dilanjut."],
  },
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
  // Topik dari berkas JSON di addons/vbs_companions/dialogue/. Daftar mode di
  // JSON diubah jadi predikat di sini, karena JSON tidak bisa menyimpan fungsi.
  ...DATA_TOPICS.map((t) => ({
    tag: t.tag,
    source: t.source,
    when: (a, b) => !t.modes.length || t.modes.includes(a) || t.modes.includes(b),
    turns: t.turns,
  })),
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

/**
 * Kalimat tambahan dari berkas JSON di addons/vbs_companions/dialogue/.
 *
 * Yang bertanda "*" berlaku untuk semua karakter, yang bernama karakter hanya
 * untuk dia. Berkas bermode "replace" membuang kalimat bawaan khusus untuk kunci
 * yang disebutnya — itu satu-satunya cara suara bawaan bisa hilang.
 */
function extraLines(id, key) {
  const mine = DATA_LINES[id]?.[key] ?? [];
  const all = DATA_LINES["*"]?.[key] ?? [];
  return mine.length || all.length ? [...mine, ...all] : [];
}

function replaced(id, key) {
  return Boolean(DATA_REPLACES[id]?.includes(key)) ||
    Boolean(DATA_REPLACES["*"]?.includes(key));
}

export function linesFor(id, key) {
  const voice = voiceOf(id);
  const builtin = replaced(id, key) ? [] : (voice[key] ?? []);
  const extra = extraLines(id, key);
  const pool = [...(Array.isArray(builtin) ? builtin : []), ...extra];
  const valid = pool.length ? pool : (FALLBACK[key] ?? FALLBACK.idle);
  logDebug(TAG, `linesFor("${id}", "${key}") -> ${valid.length} baris ` +
    `(${extra.length} dari dialogue/*.json).`);
  return valid;
}

/** Berapa banyak yang datang dari JSON — dipakai buku panduan dan log. */
export function dialogueStats() {
  let extra = 0;
  for (const pools of Object.values(DATA_LINES)) {
    for (const pool of Object.values(pools)) extra += pool.length;
  }
  return { lines: extra, topics: DATA_TOPICS.length, total: TOPICS.length };
}

if (DATA_TOPICS.length || Object.keys(DATA_LINES).length) {
  logInfo(TAG, `Dialog tambahan dimuat: ${dialogueStats().lines} kalimat, ` +
    `${DATA_TOPICS.length} topik obrolan dari dialogue/*.json.`);
}
