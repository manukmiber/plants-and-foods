# Changelog

Every Save and every Release the builder makes writes an entry here, newest
first. Entries are written at the moment of the change rather than
reconstructed afterwards, which is why the builder refuses to save without one.

## Unreleased

### VBS Companions v1.5.0

Empat tambahan yang intinya sama: **isi mod bisa ditambah tanpa menyentuh kode**,
dan pemain punya satu tempat untuk mengatur segalanya.

**Tempat menaruh rancangan bangunan baru (`addons/vbs_companions/blueprints/`):**

- Satu berkas `.json` di folder itu = satu pilihan baru di menu **Rancangan
  Bangunan**, bertanda `JSON`. Dipakai untuk memasukkan skema bangunan yang
  ditemukan di internet: suruh AI mengubahnya ke skema di `blueprints/README.md`,
  simpan, jalankan generatornya.
- Dua bentuk didukung: `layers` (denah huruf per lapis) dan `blocks` (daftar
  koordinat jarang, bentuk yang wajar keluar dari konversi schematic).
- Rancangan menyebut **peran** blok (`wall`, `floor`, `roof`, `light`, …) sehingga
  companion memakai bahan apa pun yang ada di petinya; blok tertentu tetap boleh
  dan perannya jadi cadangan kalau blok itu habis.
- Bangunan JSON dibangun **rata** — ketinggian dasarnya dikunci sekali, jadi
  menara di lereng bukit tetap menara. Rancangan bawaan tetap mengikuti kontur.
- `tools/gen_blueprints.py` menolak huruf di luar palette, peran tak dikenal,
  baris yang panjangnya berbeda, dan rancangan lebih besar dari 32×32×32 atau
  8000 langkah. `validate.py` menolak kalau JSON dan hasil generatornya tidak
  sinkron — jadi "sudah kutaruh tapi tidak muncul" ketahuan sebelum dipasang.
- Dua contoh ikut: Menara Pengawas dan Sumur Desa.

**Tempat menaruh dialog baru (`addons/vbs_companions/dialogue/`):**

- Sama pola: satu berkas `.json` berisi `lines` (kalimat per suasana) dan
  `topics` (obrolan antar companion, lengkap dengan syarat mode).
- Kalimat JSON **ditambahkan** ke suara bawaan, tidak menggantikannya — kecuali
  berkasnya menulis `"mode": "replace"`. `character: "*"` berlaku untuk semua.
- Kunci suasana karangan sendiri ditolak generator; kalau tidak, kalimat itu
  diam-diam tidak akan pernah terucap.

**Buku Panduan Companion — item baru yang tidak bisa hilang:**

- Ditempa dari **satu buku + satu bunga** (18 resep, satu per bunga, karena resep
  Bedrock tidak bisa menyebut beberapa kemungkinan untuk satu bahan).
- Isinya: **Cara Pakai** (enam bab), **Kendalikan Companion** (buka menu
  companion mana pun dari jauh, atau beri satu perintah untuk semuanya sekaligus),
  **Pengaturan Mod** (tujuh saklar per pemain), dan **Isi Tambahan & Status**.
- Tidak bisa hilang, dijaga tiga lapis: diberikan lagi sesudah mati, dipungut
  kembali kalau dibuang, dan diperiksa tiap lima detik untuk kasus lain
  (kantong penuh, `/clear`, dunia lama). Bisa dimatikan lewat saklarnya sendiri.
- Tujuh setelan per pemain yang semuanya benar-benar dibaca kode: sembunyikan
  nama pemilik, bungkam celoteh, gelembung teks, laporan jarak jauh, pesan
  petunjuk, buku tidak bisa hilang, dan kirim peringatan ke chat.
- Kalau bukunya tertinggal: `!panduan` di chat atau `/scriptevent vbs:panduan`.

**Dukungan Beta API — tambahan, bukan syarat:**

- `python3 gen_packs.py --beta` menulis varian manifest yang memakai modul beta;
  dengan toggle **Beta APIs** menyala, add-on mendapat perintah garis miring
  sungguhan: `/vbs:panduan`, `/vbs:chat <nama> <pesan>`, `/vbs:mode <nama> <tugas>`.
- Varian yang di-commit tetap **stabil**: tidak ada satu pun eksperimen yang perlu
  dinyalakan, dan `validate.py` menolak manifest beta kecuali dijalankan dengan
  `--beta`.
- `scripts/beta.js` mengimpor `@minecraft/server` sebagai namespace dan mengecek
  tiap kemampuan sebelum memakainya. Ini bukan gaya penulisan: mengimpor nama
  yang tidak ada di versi stabil adalah kegagalan penautan modul, dan Bedrock
  menjawabnya dengan mematikan seluruh mesin skrip add-on, diam-diam — persis
  akar masalah v1.3.0.

**Uji:**

- `tools/sim/run.sh` sekarang dijalankan **dua kali**, dengan dan tanpa modul
  beta, dan bertambah empat kelompok pemeriksaan: rancangan JSON benar-benar
  dibangun rata di tanah tidak rata, dialog JSON terucap tanpa menghapus bawaan,
  buku dikembalikan sesudah pemain mati, dan perintah beta menolak masukan salah.
- `validate.py` bertambah pemeriksaan sinkronisasi JSON ↔ modul hasil generator,
  peran rancangan ↔ `MATERIALS` di `builder.js`, kunci dialog ↔ `FALLBACK` di
  `lines.js`, dan resep buku ↔ daftar `FLOWERS` di `config.js`.


### VBS Companions v1.4.0

Pemeriksaan ulang seluruh pekerjaan v1.3.0 — banyak fitur yang seharusnya ada di
sana ternyata tidak pernah berjalan sama sekali. Rilis ini memperbaiki akarnya,
menambahkan uji otomatis yang menjalankan otak companion di luar Minecraft, dan
menuntaskan permintaan yang tersisa.

**Akar masalah "semuanya tidak jalan":**

- **`farming.js` meng-import `getClaim` dari `claim.js`, tapi `claim.js` tidak
  pernah meng-ekspornya.** Di Bedrock ini kegagalan *penautan modul*: Minecraft
  membatalkan seluruh mesin skrip add-on begitu dunia dibuka, tanpa pesan yang
  terlihat pemain. Jadi bukan cuma bertani yang mati — SEMUA fitur ikut mati,
  termasuk yang v1.3.0 klaim sudah diperbaiki. Sekarang di-re-export, dan ada
  uji otomatis yang menautkan semua modul supaya kesalahan sejenis ketahuan
  sebelum dipasang.
- **`getGear()` selalu mengembalikan tangan kosong.** Entity memakai
  `minecraft:equippable` dengan daftar slot kosong, jadi `getEquipment()` selalu
  `undefined` walaupun alatnya benar-benar terpasang lewat `replaceitem`. Versi
  lama tidak pernah melirik catatan di dynamic property, akibatnya `toolRank()`
  selalu 0: companion mengira dirinya belum punya alat dan menempa ulang alat
  tingkat terendah tanpa henti.
- **Semua mode kerja masih memasang `minecraft:behavior.follow_owner`.** Inilah
  sebabnya companion terus mengekor pemain alih-alih bekerja, walaupun leash
  script sudah dibatasi ke mode Ikuti Aku. `follow_owner`, `random_stroll` dan
  `move_to_block` dicabut dari seluruh component group mode kerja; gerak saat
  bekerja sepenuhnya dipegang script.

**Bertani (keluhan 1, 2, 5):**

- Ladang dikerjakan sebagai **mesin fase berurutan**: ratakan seluruh petak ke
  satu ketinggian, gali parit sepanjang kolomnya, buat/isi ember di sungai,
  tuang air, baru mencangkul, lalu menanam, lalu merawat. Versi lama mencampur
  semuanya dalam satu sapuan sehingga tanah dicangkul lebih dulu dan paritnya
  belakangan — itulah petak yang "rusak karena tidak dapat supply air".
- **Tidak ada satu petak pun dicangkul sebelum benar-benar ada air yang
  menjangkaunya** (dicek persis seperti aturan Minecraft: air dalam 4 blok
  mendatar, setinggi atau satu di atas farmland).
- **Paritnya benar-benar digali utuh**, bukan cuma dilubangi di titik sumbernya.
  Tanpa itu air terkurung di satu lubang dan baris di antaranya tetap kering.
- **Embernya benar-benar dibuat** dari tiga batang besi di meja kerja, lalu
  dibawa ke sungai untuk diisi dan dituang ke parit. Kalau besinya tidak ada,
  petani memasang permintaan ke perajin dan pencari barang.
- **Tanah galian disimpan, tidak dibuang.** Gundukan yang dipangkas jadi bahan
  menimbun cekungan di petak sebelah, jadi ladang bisa rata tanpa kiriman tanah.
- Hasil panen tetap masuk **peti companion sendiri**, tidak pernah ke kantong
  pemain — dan peti itu sekarang benar-benar miliknya (lihat di bawah).

**Menambang (keluhan 3, 4):**

- Terowongan **1×3 sungguhan**. Versi lama membatalkan SELURUH kolom galian
  kalau satu sel saja berisi blok di luar daftar putih `DIGGABLE` — satu blok
  basalt setinggi kepala sudah cukup membuat lorongnya menyempit dan berkelok.
  Sekarang tiap sel diurus sendiri-sendiri dan yang boleh ditolak hanya blok
  terlindungi dan lava.
- **Naik tingkat alat satu per satu, tanpa terkecuali.** Beliung berikutnya
  selalu TEPAT satu tingkat di atas yang dipegang; kalau bahannya belum ada,
  companion meminta bahan itu alih-alih melompat ke besi yang kebetulan ada di
  peti. Alat tingkat tinggi yang nyasar ke peti sengaja dilewati.

**Peran baru dan rantai bantuan (keluhan 7, 8, 10):**

- Papan permintaan digeneralkan jadi tiga jenis: `tool` (alat), `item` (ember,
  peti, papan nama, meja kerja, obor) dan `material` (kayu, batu, besi, tanah,
  arang, bibit). Perajin melayani dua yang pertama, **pencari barang** melayani
  yang ketiga dan mengantar hasilnya langsung ke peti pemesan.
- **Peti, papan nama, meja kerja dan ember tidak lagi muncul dari udara.**
  Semuanya butuh bahannya dulu — peti delapan papan, papan nama enam papan dan
  satu stik, meja kerja empat papan, ember tiga besi. Selama petinya belum
  mampu dibuat, companion bekerja memakai **kantong pribadi** yang bentuknya
  sama persis dengan peti (`bag.js`), dan isinya dipindahkan begitu peti berdiri.
- Companion tidak lagi menyerobot peti pemain yang kebetulan ada di dekat situ.
  Yang boleh dipakai bersama hanya peti yang terdaftar sebagai stasiun companion
  milik pemilik yang sama.

**Hidup dan suara (keluhan 9, 12, 15):**

- **Tenaga dan kantuk berjalan terpisah.** Tenaga terkuras karena bekerja dan
  pulih dengan beristirahat (di stasiun, di bawah pohon, atau sambil mengobrol);
  kantuk naik karena waktu berjalan dan memuncak di malam hari, dan hanya reda
  dengan tidur di ranjang rumah desa, di bawah pohon, atau di stasiun.
- **Jauh lebih banyak obrolan**: puluhan baris baru per karakter, sepuluh topik
  obrolan baru, sapaan pagi dan malam, dan jeda celoteh dipangkas dari 1400 ke
  420 tick.
- **Ngobrol dua arah.** Pemain bisa memakai perintah garis miring sungguhan
  `/scriptevent vbs:chat <nama> <pesan>`, atau mengetik biasa `chat <nama>
  <pesan>` / `!<nama> <pesan>` kalau tidak punya izin operator. Nama `semua`
  mengirim ke seluruh companion. Perintah kerja yang diselipkan di kalimat
  ("ikut", "bertani", "istirahat") langsung dituruti.

**Kampung dan pengaturan (keluhan 11, 14):**

- **Pembangun mengajukan kampung sendiri** ke pemiliknya: dia menyapa lewat chat
  lalu menaruh Patok Desa di kantong pemain, dan sesudah rumahnya berdiri dia
  mengumumkan letak ranjangnya supaya companion lain tidur di sana.
- **Saklar nama pemilik** punya dua tingkat: khusus satu companion, dan
  menyeluruh untuk semua companion milik pemain itu. Kalau dimatikan, nama
  pemilik hilang dari penanda kepala DAN dari papan stasiun, jadi tidak ada
  pemain lain di server yang bisa tahu itu punya siapa.

**Ketahanan dan pencatatan (keluhan 16):**

- Setiap listener event dan setiap denyut interval dibungkus `guard()`. Satu
  callback yang melempar tanpa ditangkap membuat Minecraft mematikan seluruh
  mesin skrip; sekarang error-nya tercatat lengkap dengan nama jalurnya dan
  sisanya tetap jalan.
- Log disimpan di ring buffer dan bisa dibaca **dari dalam game** (Pengaturan »
  Catatan Kejadian), lengkap dengan saklar untuk mengirim setiap WARN/ERROR ke
  chat — content log Minecraft tidak selalu bisa dibaca pemain di HP dan server.
- **Companion tidak bisa lagi terkubur atau mentok selamanya.** Ada pengangkat
  otomatis kalau kakinya tertimbun, deteksi kemacetan kalau langkahnya tidak
  maju, dan air dangkal sekarang boleh diarungi — tanpa itu petani terkurung di
  balik parit irigasi yang baru saja dia gali sendiri.
- Sapuan pencarian pencari barang dipotong per denyut (dari >10.000 pembacaan
  blok tiap setengah detik jadi 700) supaya dunia tidak tersendat.

**Uji otomatis baru:** `addons/vbs_companions/tools/sim/run.sh` menjalankan
seluruh modul add-on di atas API Minecraft tiruan dan dunia voxel kecil, lalu
memeriksa hasil kerjanya — 22 pemeriksaan, termasuk "tidak ada farmland yang
kering", "lorong benar-benar 1×3", dan "beliung pertama harus kayu".

### VBS Companions v1.3.0

Rombakan besar berdasarkan 16 keluhan/permintaan pemain: bug bertani dan
menambang, dua role bantuan baru, taming ulang, energi, dan chat dua arah.

**Perbaikan perilaku:**

- **Ladang diratakan dulu sebelum dicangkul.** Sebelumnya companion mencangkul
  kontur tanah asli apa adanya, jadi farmland-nya berundak dan sebagian petak
  tidak kebagian air. Sekarang seluruh chunk berpatok diratakan ke satu Y acuan
  (rata-rata tempat pemain mematok) — kelebihan tanah dibongkar gratis,
  kekurangannya ditimbun tanah dari peti kalau ada.
- **Hasil panen selalu masuk peti stasiun**, bukan lagi langsung ke kantong
  pemain kalau kebetulan sedang dekat — supaya companion lain bisa memakainya
  dan hasilnya kelihatan menumpuk.
- **Terowongan tambang jadi 1×3** (lebar×tinggi), naik dari 1×2, plus deteksi
  bijih di langit-langit ikut disesuaikan.
- **Alat dibuat tier demi tier.** `bestTier()` dulu langsung memilih tingkat
  terbaik yang bahannya ada (kalau ada besi, langsung besi walau kayu juga
  ada) — sekarang naik satu tingkat setiap panggilan, sama seperti pemain
  sungguhan naik dari kayu ke batu ke besi.
- **Leash cuma menarik companion mode Ikuti Aku.** Sebelumnya farm/build/attack
  juga ikut ditarik paksa ke pemilik tiap beberapa detik kalau lebih dari 24
  blok — itu membuat mereka tidak pernah selesai kerja di lokasi jauh.

**Fitur baru:**

- **Taming pakai bunga.** Companion sekarang **liar (untamed)** begitu muncul —
  tidak ada lagi pengambilan pemilik otomatis dari pemain terdekat. Beri satu
  bunga (apa saja) sambil berdiri (tidak jongkok) untuk menjinakkannya.
  `minecraft:tameable.tame_items` dikosongkan supaya taming sepenuhnya
  dikendalikan script, bukan mesin taming bawaan.
- **Dua role baru: Merajin dan Mencari Barang.** Petani/penambang yang
  kehabisan bahan alat memasang permintaan bantuan; Merajin membacanya,
  menempa dari peti sendiri, dan mengantarnya. Mencari Barang menebang kayu,
  menggali batu permukaan, dan memungut barang untuk Merajin/Pembangun.
- **Energi, kelelahan, dan istirahat.** Mode kerja menguras tenaga; begitu
  habis, companion mencari rumah desa → stasiun sendiri → pohon terdekat untuk
  beristirahat sebelum lanjut kerja. Ngobrol dengan companion lain juga
  memulihkan sedikit tenaga.
- **Membangun kampung.** Pembangun bisa diminta membuat rumah (lengkap
  ranjang) di tiap chunk yang dipatok pemain lewat `Patok Desa` — dikerjakan
  lebih dulu sebelum rancangan blueprint biasa. Posisi ranjangnya jadi tujuan
  istirahat companion lain.
- **Toggle nama pemilik di penanda.** Menu Pengaturan punya saklar
  sembunyikan/tampilkan segmen pemilik di nametag, per companion.
- **Chat dua arah.** Mengetik `chat <nama> <pesan>` (tanpa garis miring — custom
  command butuh Beta APIs eksperimental yang sengaja dihindari add-on ini)
  mengirim pesan ke companion tertentu dan mendapat balasan sesuai konteks
  (status kerja, sapaan, ucapan terima kasih, dst).
- **Lebih banyak obrolan** di semua role dan karakter: baris idle/greet/hurt
  baru, plus baris khusus untuk merajin, mencari barang, kampung, dan
  kelelahan.
- **Logging tetap ultra-verbose** di semua modul baru, mengikuti pola
  `logger.js` yang sudah ada di rilis sebelumnya.

### VBS Companions v1.2.0

Rilis terbesar sejauh ini: tiga role baru, sistem bertani yang benar-benar
berbentuk pekerjaan, dan companion yang bicara satu sama lain.

**Mode bertarung akhirnya bekerja.** Penyebabnya dua, dan dua-duanya tidak
memunculkan galat apa pun. Pertama, `owner_hurt_by_target`, `owner_hurt_target`
dan `hurt_by_target` semuanya memakai priority 1 — Bedrock diam-diam memilih satu
goal dan mengabaikan sisanya. Kedua, `minecraft:angry` dengan `duration: -1` dan
`calm_event` yang menyalakan `vbs:set_follow`: begitu amarahnya reda, companion
menendang dirinya sendiri keluar dari mode bertarung. Sekarang seluruh angka
priority ditulis di satu tabel di `gen_packs.py`, `minecraft:angry` dibuang, dan
`validate.py` menolak build yang punya priority kembar di kombinasi grup mana pun.

- **Pemanah.** Memasangkan busur ke tangan companion memasang grup senjata
  `vbs:weapon_bow` (`minecraft:shooter` + `behavior.ranged_attack`); senjata lain
  memasang `vbs:weapon_melee`. Ada juga jaring pengaman: kalau satu monster
  menempel tiga detik dan nyawanya tidak berkurang sama sekali, script yang
  memukul — seketat itu supaya dalam keadaan normal tidak pernah aktif.
- **Tiga role baru.** *Menambang*: tangga turun ke Y −54, terowongan utama dua
  blok, cabang delapan blok tiap tiga blok, obor tiap delapan langkah, pulang
  menyetor kalau tas penuh. *Mengembara*: spiral melebar sampai 190 blok, mencatat
  desa/gua/peti/lava/reruntuhan beserta koordinatnya dan melaporkannya lewat chat,
  memungut barang di jalan, pulang menyetor. *Membangun*: tujuh rancangan yang
  dipilih lewat menu, dibangun dari bahan di peti; rancangan menyebut peran blok
  ("dinding", "atap", "lampu"), jadi gubuk yang sama jadi gubuk kayu atau gubuk
  batu tergantung isi petimu.
- **Bertani dirombak habis.** Companion memasang stasiun (peti + papan bernama),
  memilih tingkat alat tertinggi yang bahannya ada di peti, mencari atau memasang
  meja kerja, berjalan ke sana dan membuat cangkulnya di situ. Menanamnya berpola —
  ladang dibagi jalur selebar dua blok, jalur ke-n memakai bibit ke-n — dengan
  patokan tepi ladang, bukan posisi companion, jadi barisnya tetap walau dunia
  ditutup. Panennya tidak instan lagi: berjalan ke tanamannya, jongkok, mengayun
  tangan dua detik dengan partikel dan suara, baru hasilnya lepas dan bibitnya
  ditanam ulang.
- **Patok chunk.** Pemain diberi sebatang `Patok Ladang` begitu memilih mode
  bertani. Klik tanah, chunk itu terpatok, dan sebuah entity penanda muncul di
  tengahnya dengan pancaran partikel: merah untuk yang belum digarap, hijau untuk
  yang sudah. Tanpa patok, companion tidak pernah mencangkul tanah baru — jadi
  tidak ada kebun pemain yang dibongkar tanpa diminta. Perluasan sampai satu chunk
  penuh butuh ember (atau tiga besi) di peti dan sungai dalam 12 blok; chunk kedua
  butuh izin terpisah di menu.
- **Menghias sawah.** Setelah tidak ada lagi yang bisa dikerjakan, companion
  memasang pagar keliling, lampu tiap lima langkah, jerami di sudut, dan
  orang-orangan sawah di tengah — semuanya dari bahan di peti, yang tidak ada
  dilewati.
- **Penanda `[Nama, tugas, Owner]`** selalu tampil di atas kepala, dibuat untuk
  server. Kalau companion sedang bicara, kalimatnya jadi baris di atasnya, jadi
  penandanya tidak pernah hilang.
- **Companion bicara.** Yang dekat melihat gelembung teks, yang jauh membaca chat,
  dan satu kalimat tidak pernah sampai dua kali ke orang yang sama. Dua companion
  yang berdekatan berhenti, saling menghadap, dan bertukar beberapa kalimat dengan
  topik yang dipilih dari mode yang sedang mereka jalankan. Tiap karakter punya
  suaranya sendiri; seluruh dialognya ada di `lines.js`.
- **Berhenti dan tersenyum saat dilihat.** Pandangan pemain dalam kerucut 15
  derajat dan radius 10 blok membuat companion berhenti melakukan apa pun,
  menoleh, tersenyum dan melambai. Berlaku tanpa kecuali, termasuk saat bertarung —
  itu yang diminta, dan saklarnya ada di `LOOK.stopInCombat` kalau ternyata
  mengganggu.
- **Akito pindah ke build detailed, dengan perawakan laki-laki.** Bahu selebar
  model vanilla, poni runcing yang gerigi potongannya menembus sampai sisi dan
  belakang, hoodie bertudung yang ikut berayun, celana panjang, sepatu rendah, dan
  delapan ekspresi wajah. Perawakan dipilih lewat `style.figure`, jadi kemampuannya
  berlaku untuk semua karakter.
- **Wajah Kohane diperbaiki.** Bulu matanya dulu setebal tiga texel dan kelopaknya
  turun 0,105 — akibatnya kedelapan ekspresinya terbaca mengantuk, termasuk yang
  seharusnya senyum. Sekarang bulu matanya satu garis tipis, kelopaknya turun
  setengahnya, irisnya lebih besar dengan dua kilau, alisnya keluar dari balik
  poni, dan mulutnya cukup besar untuk terbaca sebagai mulut.
- **Perlengkapan role terlihat di model.** Topi jerami untuk petani, helm berlampu
  untuk penambang, ransel untuk pengembara — bone sungguhan di geometry semua
  karakter, disembunyikan `part_visibility` menurut entity property `vbs:hat`.
  Warnanya sengaja tidak ikut palet karakter supaya terbaca dari jauh di server.
- **Enam animasi pose baru**: memanen (jongkok + ayun tangan), menambang (ayunan
  beliung), membangun, kuda-kuda pedang, membidik busur, dan mengobrol — semuanya
  dinyalakan entity property `vbs:pose`, bukan `query.is_angry` seperti dulu.
- `uvmap.py` tidak lagi memakai koordinat tulis tangan: tabelnya cukup menyebut
  ukuran, dan penyusun rak yang menghitung letaknya. Menambah slot baru tidak lagi
  berarti menghitung ulang seluruh tabel.
- Langkah jalan untuk pekerjaan yang tujuannya sebuah titik (meja kerja, ujung
  terowongan, blok berikutnya) digerakkan script, karena pathfinding bawaan hanya
  bisa disuruh menuju blok bertipe tertentu. Bisa menyusur sumbu kalau garis
  lurusnya tertutup — itu yang membuat penambang bisa membelok masuk ke cabang.
- Dua bug yang ditemukan lewat uji dunia palsu dan pasti akan terjadi di gim:
  pemindai ladang mengembalikan blok tanamannya sendiri sebagai "permukaan"
  sehingga yang matang tidak pernah terlihat, dan penambang menggali lantai anak
  tangga yang sedang dipijaknya. Ditambah satu lagi: obor yang dipasang penambang
  tidak ada di daftar blok yang bisa dilewati, jadi dia terkurung oleh obornya
  sendiri.
- **Paketnya dipecah dua**, `-BP.mcaddon` dan `-RP.mcaddon`, satu per pack. Di
  server keduanya memang masuk ke folder yang berbeda dan didaftarkan di berkas
  yang berbeda, dan pemain yang cuma butuh modelnya cukup diberi yang RP. Keduanya
  tetap harus dipasang bersama; manifestnya saling menyebut sebagai dependensi.
- `validate.py` naik ke 2183 pemeriksaan: priority kembar, entity property yang
  dipakai Molang tapi tidak dideklarasikan atau tidak `client_sync`, bone
  perlengkapan yang tidak disebut `part_visibility`, berkas dan animasi patok, dan
  daftar mode serta pose di `config.js` yang melenceng dari `gen_packs.py`.

### VBS Companions v1.1.0

- **Model Kohane diganti seluruhnya.** Bentuk badan baru "detailed" di
  `addons/vbs_companions/`: rambut berlapis dengan poni yang benar-benar dipotong
  tembus supaya wajah kelihatan di baliknya, jurai samping, ekor rambut dua ruas
  yang ujungnya tertinggal sepersekian detik dari kepala, rok empat panel yang
  berayun sendiri-sendiri, sepatu tinggi, dan jepit rambut. 44 kubus, naik dari 16.
  Teksturnya tetap 1024x1024 — 8 texel per satuan model — dan sekarang benar-benar
  terpakai untuk detail sekecil helai poni dan tali sepatu.
- **Delapan ekspresi wajah.** Delapan bidang bertumpuk di tempat yang sama; satu
  baris Molang di `scripts.pre_animation` memilih indeksnya dan `part_visibility`
  di render controller menyembunyikan sisanya. Dia berkedip tiap ~4,6 detik,
  meringis saat kena pukul, waspada saat bertarung, nyengir saat berjalan, mangap
  saat berlari, dan mengantuk kalau lama diam. Semuanya jalan di klien: nol tick
  server, dan nol biaya saat tak ada yang melihat.
- **Rok dan ekor rambut bergerak sendiri.** Animasi `detail` baru menggerakkan
  keempat panel rok dan kedua ujung ekor rambut, sehingga rambut terasa punya
  berat alih-alih ikut kepala persis.
- Keempat karakter lain tidak berubah sedikit pun. Bentuk badan dipilih lewat
  `style.build` di `characters.json`, jadi ini kemampuan baru untuk semua, bukan
  perlakuan khusus untuk satu karakter.
- `uvmap.py` sekarang punya dua tabel UV yang boleh menempati koordinat sama,
  karena tiap karakter punya PNG sendiri dan hanya menggambar slot build-nya.
  `render_preview.py` akhirnya menghormati rotasi bone — tanpa itu preview
  menggambar rok yang lurus padahal di gim mengembang.
- `validate.py` naik ke 1241 pemeriksaan: tiap bone wajah harus punya barisnya di
  `part_visibility`, dan variabel yang dipakainya harus benar-benar dihitung di
  `pre_animation`.

### Preset inbox

- **`preset/kohane-companion.json`** — Kohane, a tameable companion. Tame her
  with a cookie, and she follows you, sits when you interact, defends you and
  heals from cake. She has eight facial expressions that react to what is
  happening to her, and she arrives with her skin and a painted spawn egg rather
  than as an untextured mannequin — the builder now lets a preset carry the
  artwork it ships with.

  Apply it from the **Preset inbox** panel. Needs a builder new enough to know
  the `companion` body preset and temperament; an older one applies the entity
  but falls back to a plain cube.
