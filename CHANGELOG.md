# Changelog

Every Save and every Release the builder makes writes an entry here, newest
first. Entries are written at the moment of the change rather than
reconstructed afterwards, which is why the builder refuses to save without one.

## Unreleased

### VBS Companions v2.0.0

Dua sesi bermain langsung, tiga belas keluhan, dan satu benang merah: companion
terlihat **sibuk** tapi tidak ada yang **jadi**. Blok hilang seketika, gudang
tersebar ke mana-mana, dan petani berdiri di tengah patok tanpa berbuat apa-apa.

Sesi kedua menambahkan akarnya: **patok menyimpan ketinggian yang salah**, dan
satu bug itu menjelaskan "patok ladang tidak jalan", "patok desa tidak jalan"
dan "petani diam saja" sekaligus. Sesi itu juga menambahkan tiga hal yang
memang belum pernah ada — companion yang bisa berenang, yang bisa makan, dan
yang menyapa pemain lain.

Sesi ketiga menaikkan nomornya ke **2.0.0**, dan bukan karena angkanya sudah
lama tidak berubah. Yang berubah lapisan paling bawahnya: cara companion
**berjalan** ditulis ulang dari nol, mode Bertani dirombak total, dan tiga
peran baru masuk — masing-masing menutup satu lubang di rantai kerja yang
selama ini berhenti di peti.

**Pathfinding sungguhan (`scripts/path.js`, baru):**

- A* di atas voxel, dengan tumpukan biner, heuristik Chebyshev berbobot yang
  admissible, dan cache blok per pencarian. Menggantikan langkah rakus yang
  selama ini cuma "melangkah ke arah tujuan" — dan macet di tembok pertama.
- Model biayanya menghitung air, bahaya, panjatan dan terjunan. Companion
  memilih jalur kering meski lebih panjang, tapi tetap bisa disuruh menembus
  air kalau memang itu yang diminta (`{ avoidWater: false }` dari `survival.js`
  waktu badannya terbakar).
- Jalur lurus tanpa halangan dilewatkan tanpa pencarian sama sekali, jadi
  perjalanan pendek tidak membayar ongkos A*.
- Kursor jalur maju dengan `reachedCell()` — jarak mendatar plus Y longgar.
  Uji jarak 3D yang lama tidak pernah turun di bawah ambang saat menaiki
  tanjakan dua blok, dan companion berdiri diam di kaki tanjakan selamanya.

**Mode Bertani dirombak total (`scripts/farmplan.js` baru, `farming.js` ditulis ulang):**

- Mesin fase diganti **antrean tugas**. Fase yang tidak bisa dikerjakan sekarang
  dilewati, bukan menggantung — akar keluhan "petani diam doang" yang kedua.
- Petaknya berjalur: kolom parit dihitung dari denah (`isChannelColumn`), tiap
  jalur punya bibitnya sendiri, dan tiap petak tahu sendiri apa yang kurang.
- `plotDone`, `hydrated`, `needAt` dan `roleAt` bisa diuji satuan tanpa dunia.

**Dapur perajin (`scripts/kitchen.js`, baru):**

- Perajin tidak cuma menempa alat. Daging dan ikan dipanggang di tungku, roti
  dan masakan lain dirakit di meja kerja — bahannya benar-benar habis dari peti.
- Companion yang paling terluka disuapi lebih dulu. Pemain ditawari sesudah
  stoknya cukup, lalu diantar ke tangannya.

**Peran baru — Pedagang (`scripts/trader.js`):**

- Membawa kelebihan isi peti ke villager terdekat, menukarnya jadi emerald,
  lalu membeli bahan yang sedang **diminta companion lain** di papan permintaan.
- Batas simpan per barang membuatnya tidak pernah menjual yang masih dipakai.
- Ditulis terus terang di berkasnya: script API Bedrock yang stabil tidak bisa
  membuka layar dagang villager. Villager, jarak dan waktunya nyata; yang ditiru
  cuma daftar harganya, dan barangnya benar-benar keluar dari peti.

**Peran baru — Pemancing (`scripts/fisher.js`):**

- Membuat joran sendiri, mencari perairan yang benar-benar besar (parit ladang
  sendiri tidak lolos ambangnya), berdiri di **tepi** — bukan di dalam air —
  lalu melempar kail dan **menunggu** 5 sampai 20 detik.
- Menunggu itu inti perannya. Ikan yang langsung muncul bukan memancing.
- Sesekali yang tersangkut rumput laut atau sepatu bot bekas.

**Peran baru — Peternak (`scripts/rancher.js`):**

- Memagari satu petak 9x9 di chunk berpatok desa, menggiring hewan liar masuk
  dengan dorongan pelan dari belakang, memberi makan, membiakkan sampai batas
  populasi, mencukur domba, memerah sapi, dan memungut telur.
- Kelebihan populasi disembelih jadi daging — satu-satunya sumber daging di
  add-on ini, dan yang memasok dapur perajin.
- Batas per jenis itu rem sungguhan: kandang yang beranak tanpa henti adalah
  cara tercepat membuat dunia Bedrock berhenti bernapas.
- Jujur soal yang ditiru: love-mode vanilla tidak bisa dinyalakan dari script
  stabil. Yang nyata — pakannya habis, induknya harus benar-benar berdekatan,
  jedanya berjalan, anaknya lahir lewat `spawnEntity` + `minecraft:entity_born`.

**Pembangun: kampung yang benar-benar jadi kampung (`scripts/village.js`, baru):**

- **Rumah selesai sekarang BENAR-BENAR ditugaskan.** Ranjangnya ditulis ke
  `state.bed` companion penghuninya — kolom yang sama persis yang dipakai
  pemain waktu menunjuk ranjang sendiri — dan namanya dicatat di papan rumah
  desa supaya companion berikutnya tidak diberi ranjang yang sama. Sebelum ini
  "rumahmu sudah jadi" cuma satu baris chat yang tidak mengubah apa pun.
- Ranjang yang **ditunjuk pemain** tidak pernah ditimpa penugasan kampung.
- Sesudah rumah terakhir berdiri, pembangun meneruskan sendiri: **jalan**
  selebar dua blok antar rumah dan balai kerja (pohon rentang, jadi sepuluh
  rumah dapat sembilan ruas, bukan empat puluh lima), **lampu jalan** tiap enam
  langkah di tepi jalan, dan **penerangan** titik gelap kampung.
- Rumput yang diinjak jadi jalan tidak menghabiskan apa pun, persis seperti
  sekop vanilla. Yang menghabiskan bahan cuma kerikil di petak yang tanahnya
  memang bukan tanah.

**Model Akito dan Toya diganti:**

- Palet, siluet dan potongan pakaian keduanya ditulis ulang di
  `tools/characters.json` dari piksel tekstur yang diunggah. Toya ikut naik ke
  bentuk `detailed` seperti yang lain.
- Catatan jujur: berkas FBX/PMX di dalam zip **tidak bisa** diubah jadi geometry
  kubus Bedrock — dua format itu mesh segitiga, sementara `.geo.json` menuntut
  kubus ber-UV per sisi. Yang bisa dipakai dari zip itu teksturnya, dan itu yang
  dipakai.

**Versi dinaikkan ke 2.0.0.** Manifest BP dan RP, dependensi silangnya,
`build_mcaddon.py`, dan seluruh rujukan versi di README ikut naik.

**Membongkar blok sekarang butuh waktu (`scripts/dig.js`, baru):**

- Satu pohon tidak lagi lenyap dalam satu denyut. Tiap blok punya jamnya
  sendiri, memakai rumus Minecraft asli:
  `detik = kekerasan × (alatnya benar ? 1,5 : 5) ÷ kecepatan alat`.
  Batang oak dengan tangan kosong tiga detik, dengan kapak kayu satu setengah;
  batu dengan tangan kosong tujuh setengah detik, dengan beliung kayu satu detik.
- Satu companion mengerjakan **satu blok** pada satu waktu. Penambang yang dulu
  menembus enam blok batu tiap setengah detik sekarang mengayun sungguhan, dan
  kecepatannya benar-benar bergantung pada tingkat beliung yang dipegangnya.
- Kemajuan ayunan dihitung di denyut kerja, jadi `main.js` sengaja
  **membiarkan** denyut kerja jalan untuk hold beralasan `"dig"`. Tanpa itu
  companion mengayun selamanya di depan blok yang sama.
- Menebang pohon, menggali terowongan, membuka ladang, dan mencari bahan
  sendiri semuanya lewat jalur yang sama.

**Balai kerja bersama (`scripts/depot.js`, baru):**

- Keluhannya: "Builder butuh kayu, Miner tangan kosong." Rantai bahannya sudah
  ada, tapi tiap companion memasang petinya di tempat kakinya berhenti — jadi
  kiriman diantar ke peti yang tidak pernah dilihat siapa-siapa.
- Sekarang seluruh companion satu pemilik **sepakat pada satu titik**: satu peti
  gudang, satu meja kerja, satu tungku. Companion pertama yang butuh tempat
  kerja yang memilihnya, dan titik itu disimpan di tingkat dunia.
- Balai **tidak pernah** berdiri di dalam chunk berpatok. Kalau pemain mematok
  chunk yang sudah ada gudangnya, petani menyuruh mereka pindah: peti, seluruh
  isinya, papan nama, meja kerja dan tungku dibongkar dan dipasang lagi di balai
  baru. Tidak ada satu barang pun yang hilang.
- Tuntutannya dilonggarkan bertahap kalau tidak ada titik yang lolos, dan
  companion yang tidak sampai-sampai ke balai (jurang, lautan) memasang petinya
  di tempat. Balai itu kesepakatan, bukan penjara.
- Koordinatnya ada di Buku Panduan » Kendalikan Companion » Perintah untuk
  Semua, dan ada bab barunya di Cara Pakai.

**Komunikasi antar peran:**

- Pencari barang dan perajin dulu selalu mengerjakan pesanan **paling tua**.
  Satu permintaan besi yang tidak ada bijihnya di permukaan mengunci mereka
  selamanya sementara pembangun di sebelahnya kehabisan kayu. Sekarang ada
  **giliran**: yang bahannya sudah ada didahulukan, sisanya bergantian tiap
  enam puluh detik, dan yang bahannya benar-benar terlihat di sekitar menang.
- Keberadaan satu pencari barang di dunia dulu cukup untuk membuat semua orang
  menunggu selamanya. Sekarang permintaan yang menggantung lebih dari 45 detik
  membuat pemesannya **mengerjakannya sendiri**.
- Berkeliling mencari bahan dibatasi 64 blok dari rumah: yang ditemukan seratus
  blok dari gudang tidak pernah benar-benar sampai ke pemesannya.

**Petani akhirnya bertindak:**

- Ladang tidak lagi digarap satu chunk (256 kolom) sekaligus. Petak inti 7×7 di
  tengah patok dikerjakan sampai benar-benar jadi ladang, **baru melebar**.
  Menggarap sudut chunk yang jauh dari mana pun pemain berdiri itulah yang
  selama ini terlihat seperti "petani tidak bertindak".
- Petani sekarang menggarap patok **terdekat** dalam jarak jalan kaki, bukan
  cuma chunk tempat kakinya kebetulan berdiri. Sejak gudang pindah ke balai —
  yang sengaja di luar patok — petani yang berdiri di depan petinya tidak lagi
  berdiri di atas ladangnya sendiri, dan seluruh mode bertani jatuh ke jalur
  "belum ada patok".
- Pohon di tengah ladang **ditebang, bukan dihindari**, dan batangnya disimpan
  ke peti — ladang yang dibuka di hutan menghasilkan belasan batang kayu yang
  selama ini hilang begitu saja sementara pembangun memasang permintaan kayu.
- Timbunan boleh dari tanah, tanah kasar, rumput, podzol atau tanah berakar —
  semuanya bisa dicangkul. Dulu cuma `dirt`, dan petani mentok menunggu "tanah
  timbun" padahal petinya penuh rumput.
- Pola parit dipatok ke tepi klaim, bukan tepi petak yang sedang digarap, dan
  petak inti dipaskan ke kolom paritnya. Tanpa keduanya, parit yang kemarin
  berair berhenti dianggap parit hari ini dan ladangnya rusak sendiri.
- Petak yang tetap kering sesudah paritnya dua kali diperiksa dilewati saja.
  Dulu petani berputar antara "gali parit" dan "cangkul" tanpa pernah menanam.

**Daun: tidak bisa dipijak, tidak bisa ditembus, tapi bisa disibakkan:**

- Daun dulu tidak ada di daftar mana pun, jadi `isSolid()` menganggapnya lantai
  yang sah sementara `isPassable()` menganggapnya dinding. Dua akibatnya persis
  yang terlihat di dunia: peti, meja kerja, papan nama dan **penanda patok**
  berdiri melayang di tajuk pohon, dan companion berdiri mendorong daun tanpa
  pernah sampai ke tujuannya.
- Sekarang daun punya namanya sendiri (`LEAVES`, `SOFT_PATH`). Tidak bisa
  dipijak, tidak bisa ditembus — tapi daun yang berdiri persis di jalur langkah
  **dibabat** (`clearWay`), begitu juga daun yang mengurung badan.
- `isFooting()` baru: lantai yang benar-benar sanggup menopang peti, meja kerja,
  tungku, papan nama, obor, hiasan dan penanda patok. Bukan daun, bukan setengah
  blok, bukan pasir/kerikil yang jatuh. Dipakai station, workshop, builder,
  claim, decorate, wander dan mining.

**Patok akhirnya benar-benar jalan — dan patoknya bukan item lagi:**

- Akar masalah "patok ladang dan desa masih belum berjalan": `toggleClaimAt`
  menyimpan `floor(player.y) + 1` sebagai ketinggian patok. Kaki pemain sudah
  berada satu angka di atas rumput, jadi yang tersimpan **dua blok terlalu
  tinggi**. `farming.js` membaca angka itu sebagai `flattenY` — tinggi permukaan
  yang akan dicangkul — sehingga **setiap** kolom petak terbaca "cekung":
  petani menghabiskan seluruh waktunya meminta tanah timbun yang tidak pernah
  cukup, dan dari luar dia terlihat cuma berdiri diam di samping petinya. Rumah
  desa pun berdiri melayang dua blok di atas rumput. Itu satu bug yang
  menjelaskan tiga keluhan sekaligus.
- Sekarang yang disimpan adalah **tinggi tanahnya**, diambil dari median dua
  puluh lima kolom contoh di dalam chunk — satu lubang atau satu gundukan di
  tengah petak tidak boleh menentukan tinggi seluruh ladang.
- Patok lama **dibetulkan sendiri** (`ensureClaimHeight`) begitu companion
  pertama menggarapnya, sekali seumur patok. Patok yang sudah selesai digarap
  dibiarkan apa adanya: permukaannya memang sudah terlanjur dibentuk ke situ.
- **Item patoknya dihapus.** Dulu sebatang stik bernama, dan itu gagal dua arah:
  stik bernama tenggelam di antara stik biasa yang memang dibuat perajin
  berkarung-karung, dan chunk di seberang lembah tetap harus didatangi dulu.
  `makeStake`, `ensureStake`, `wireStake` dan dua listener `itemUseOn`
  dibuang; satu-satunya jalan sekarang **Buku Panduan » Peta Patok**, dan semua
  tombol lama ("Beri Aku Patok (Stik Fisik)", "Minta Stik Fisik", tawaran
  Pembangun) menunjuk ke halaman itu.
- Penanda patok desa akhirnya bertuliskan **"Patok Desa"**. Sebelumnya keduanya
  sama-sama "Patok Ladang", jadi chunk desa terbaca seperti ladang yang tidak
  pernah digarap siapa pun.
- Fase meratakan tidak lagi bisa mengunci seluruh ladang. Bahan timbun tetap
  diminta, tapi sesudah dua sapuan penuh ladangnya dilanjutkan tanpa kolom yang
  tidak bisa ditimbun — sama seperti petak yang tidak bisa diairi di fase
  mencangkul. Ladang yang sedikit lebih kecil tapi jadi selalu lebih baik
  daripada ladang sempurna yang tidak pernah ada.

**Api, air, tenggelam, dan makan (`scripts/survival.js`, baru):**

- Langkah kaki sekarang **selalu memilih pijakan kering** (`util.js` »
  `tryStep`). `isStandable()` menghitung air sebagai lantai — itulah sebabnya
  companion menyeberangi laut dengan santai lalu mengambang di tengahnya sampai
  ditarik pulang. Langkah basah kini cuma cadangan, dipakai kalau memang tidak
  ada satu pun jalan kering; menyeberangi parit irigasi selebar satu blok tetap
  boleh, karena di situ lantainya tanah.
- **Terbakar** — companion berhenti bekerja, lari ke air terdekat dalam 12 blok,
  dan nyemplung. Api padam, kerja dilanjut dari titik yang sama.
- **Terlanjur di air dalam** — dia berenang naik ke permukaan satu blok tiap
  denyut (bukan meloncat keluar sekaligus; itu terlihat seperti sihir), lalu
  menuju daratan terdekat dan naik ke sana. Kepala yang terlalu lama terbenam
  benar-benar kehabisan napas, dan pemiliknya diberi tahu.
- **Nyawa di bawah 60%** — dia makan sendiri dari peti atau kantongnya, sambil
  jalan, tanpa berhenti bekerja. Tidak ada makanan? Satu pesanan **roti**
  dipasang ke perajin lewat papan permintaan yang sama seperti pesanan alat
  (`ITEM_RECIPES.bread`, tiga gandum, tanpa tungku). Perajin yang menerimanya
  mengantar makanan **apa pun** yang kebetulan sudah ada di peti alih-alih
  menunggu panen — companion yang hampir tenggelam tidak sedang memilih menu.
- Keselamatan dijalankan di `workOnce` **sebelum** tenaga: companion yang
  terbakar atau terbenam tidak boleh "beristirahat" di situ.

**Penambang membawa pulang batu dan tanah:**

- Hasil galian biasa dulu menguap seluruhnya. Satu terowongan lima puluh blok
  berarti ratusan blok batu yang hilang dari dunia tanpa pernah masuk peti siapa
  pun — sementara di permukaan petani menunggu **tanah timbun** dan pembangun
  kehabisan **batu**.
- Sekarang batu, tanah, kerikil, pasir, deepslate dan sebangsanya (`MINE_SPOIL`)
  ikut disetor, sampai satu tumpuk per jenis. Muatan sekali jalan dinaikkan dari
  96 ke 192 supaya penambang tidak berubah jadi kurir bolak-balik.
- Saklarnya ada di **Buku Panduan » Apa yang Ditambang**; dimatikan, dia kembali
  cuma membawa bijih.

**Menyapa pemain lain yang menatap:**

- Tatapan pemilik tetap seperti dulu (berhenti, pose menyapa, kalimat `greet`).
  Tatapan **orang asing** sekarang dijawab: companion menyapa orang itu dengan
  namanya lewat pool dialog baru `hail`, dan **memberi tahu pemiliknya** lewat
  chat bahwa ada orang di dekat companionnya, lengkap dengan koordinat.
- Sapaannya dijeda 30 detik per orang, laporan ke pemiliknya dua menit — pemain
  yang berdiri lama di dekat ladang tidak berubah jadi banjir pesan.
- `chat.js` » `fill()` sekarang bisa menyebut nama **pemain**, bukan cuma nama
  companion; `{kamu}` yang berisi pemain dulu jadi "?".

**Menunjuk ranjang:**

- Ranjang di rumah buatan pemain sendiri dulu cuma kebetulan terpakai kalau
  jaraknya di bawah 12 blok saat companion mengantuk. Sekarang pemain bisa
  bilang "yang ini": berdiri di dekatnya, lihat ke ranjangnya, lalu tekan
  **Tunjuk Ranjang** — di menu companion atau di Buku Panduan. Kalau tatapannya
  meleset, ranjang terdekat dalam 12 blok yang dipakai.
- Ranjang tertunjuk **menang atas segalanya**, termasuk rumah desa. Lewat buku,
  yang ditunjuk adalah ranjang di dekat **pemain**, jadi rumah yang baru selesai
  dibangun bisa langsung ditugaskan walau companionnya bekerja jauh.
- Ranjang yang dibongkar dilewati diam-diam dan companion kembali ke urutan
  biasa — tidak mogok, tidak berjalan ke titik yang sudah kosong.
- `BED_IDS` sekarang juga menyebut `minecraft:bed`, id lawas Bedrock yang
  warnanya berupa block state. Tanpa itu, dunia yang memakainya membuat
  companion tidur di bawah pohon padahal ranjangnya jelas ada.

**Dialog dan uji:**

- Empat kunci suasana baru — `swim`, `burn`, `eat`, `hail` — lengkap untuk
  kelima karakter, plus `FALLBACK` dan daftar kunci di `gen_dialogue.py` serta
  `dialogue/README.md` (validator menolak kalau ketiganya melenceng).
- Lima uji baru di `tools/sim/sim.mjs`: tinggi patok (baru, lama yang
  dibetulkan, dan yang sudah jadi dibiarkan), menghindari air, berenang ke
  darat, terbakar, makan sendiri dan memesan roti, penambang yang membawa pulang
  batu, sapaan ke pemain lain, dan ranjang yang ditunjuk mengalahkan rumah desa.
- Stub simulasi ikut tumbuh: nyawa yang bisa berubah, komponen `onfire`,
  `extinguishFire`, dan mata pemain (`getHeadLocation`, `getViewDirection`,
  `getBlockFromViewDirection`) — tanpa itu jalur-jalur baru tidak pernah sekali
  pun benar-benar dijalankan uji.

**Kinerja:**

- Papan klaim, daftar stasiun dan daftar bengkel di-cache. Sebelumnya JSON yang
  sama di-parse ratusan kali per detik — pemilihan titik balai saja membacanya
  sembilan kali per kandidat.


### VBS Companions v1.6.0

Tiga hal: **menjinakkan yang benar-benar bekerja**, companion yang **tidak lagi
mentok menunggu bantuan yang tidak akan datang**, dan **buku yang berubah dari
bacaan menjadi alat**.

**Menjinakkan dikembalikan ke mesin gim:**

- Akar masalahnya: `tame_items` di berkas entity ditulis **kosong**, dan seluruh
  taming diserahkan ke script lewat `EntityTameableComponent.tame()`. Nama itu
  tidak selalu ada di modul `@minecraft/server` versi stabil, jadi companion
  tidak pernah benar-benar jinak di mata mesin gim — dan `behavior.follow_owner`
  tidak punya tuan.
- Sekarang `tame_items` berisi **19 bunga** (`red_flower` — nama lawas yang
  terbukti bekerja — plus 18 nama bunga versi baru, sama persis dengan bahan
  resep buku panduan). Gim sendiri yang menghabiskan bunganya dan menyalakan
  `vbs:on_tamed`, persis cara serigala dijinakkan dengan tulang.
- `vbs:on_tamed` sekarang memasang grup baru **`vbs:tamed`** yang isinya
  `minecraft:is_tamed`. Itu penandanya: mesin gim tidak memasangnya sendiri, dan
  tanpa penanda itu script tidak punya cara mengetahui taming sudah terjadi,
  jadi pemilik tidak akan pernah tercatat.
- Bunga di tangan dibaca dari **tiga sumber** (item di dalam event interaksi,
  komponen equippable, lalu slot terpilih), bukan cuma `selectedSlotIndex`.
  Satu-satunya sumber lama itulah sebab pesan "companion ini masih liar" muncul
  padahal bunganya jelas dipegang.
- Bunga **di luar** `tame_items` (mis. *pink petals*) tetap bisa dipakai: script
  yang mengambil alih, menghabiskan bunganya, dan memicu `vbs:on_tamed` sendiri.
  Jalur yang sama juga menyelamatkan dunia lama yang entity-nya belum diperbarui
  — sesudah menunggu satu detik tanpa taming bawaan, script mengambil alih.
- Bunganya boleh diberikan sambil jongkok atau tidak. Menuntut pemain berdiri
  tegak cuma menambah satu sebab lagi untuk "kok tidak jinak-jinak".
- `validate.py` menolak kalau tiga tempat ini melenceng: `tame_items` di entity,
  `TAME_ITEMS` di `gen_packs.py`, dan `TAME_ITEMS` di `config.js` — plus setiap
  bunga penjinak wajib ada di `FLOWERS`.

**Bekerja sendiri kalau belum ada perajin/pencari barang:**

- Rantai bantuan v1.4.0 punya titik patah yang besar: petani, penambang dan
  pembangun **tidak pernah mencari bahannya sendiri**. Mereka memasang permintaan
  lalu menunggu — dan kalau pemain baru punya satu companion, atau belum
  menyuruh satu pun ke mode Merajin/Mencari Barang, permintaan itu tidak ada yang
  membacanya. Companion berdiri diam selamanya.
- Sekarang companion memeriksa dulu apakah ada companion **lain** milik pemilik
  yang sama yang bermode Merajin atau Mencari Barang. Kalau tidak ada, dia
  mengerjakannya sendiri: **menebang pohon dengan tangan kosong**, menggali batu,
  membabat rumput — lalu merakit meja kerja, peti, papan nama dan alatnya dari
  situ. Begitu ada penolong, rantai permintaan dipakai lagi.
- Kemampuan mencari dan membongkar blok dipindah dari `looter.js` ke modul baru
  `gather.js` dan dipakai bersama, bukan disalin — pencari barang tetap bekerja
  persis seperti sebelumnya.
- Berkeliling mencari bahan cuma dilakukan kalau pekerjaannya memang **mentok**
  tanpa bahan itu. Versi pertama yang selalu berkeliling membuat penambang yang
  kehabisan obor berjalan ke arah acak tiap setengah detik sambil "mencari
  arang", dan terowongannya tidak pernah jadi.
- Permintaan bahan `seed` akhirnya punya sasaran: `HUNT.seed` dulu daftar kosong,
  jadi pencari barang tidak pernah bisa memenuhi satu pun pesanan bibit.

**Kayu di depan muka tidak lagi terlewat (`gather.js`):**

- Gejalanya: companion berdiri di tengah hutan sambil mengulang *"mencari kayu
  sendiri"*, lalu berangkat ke batang belasan blok jauhnya — padahal ada pohon
  persis di depan muka. Sesudah itu dia mondar-mandir dan petinya tidak pernah
  jadi karena papannya tidak pernah cukup.
- Sebab pertama: sapuan bloknya **dilanjutkan dari titik terakhir** lintas
  denyut. Daftar sasarannya memang diurutkan dari yang paling dekat, tapi karena
  penunjuknya tidak pernah kembali ke awal, urutan itu jadi percuma: sesudah satu
  kali ketemu, pencarian berikutnya mulai dari titik yang sudah jauh dan
  berputar keluar terus. Sekarang **lingkaran lima blok di sekitar companion
  disapu habis lebih dulu, tiap kali** — apa pun yang berdiri di situ selalu
  menang. Sisanya yang jauh tetap disapu sepotong-sepotong seperti dulu, dari
  titik awal yang tetap supaya tidak ada blok yang terlewat, dan penunjuknya
  dikembalikan ke awal begitu sasarannya ketemu.
- Sebab kedua: sasarannya **dipilih ulang tiap denyut**. Pilihannya berbeda-beda,
  jadi companion melangkah setengah langkah ke satu pohon lalu berbelok ke pohon
  lain — dari luar persis seperti kebingungan. Sekarang sasaran yang sudah
  dipilih **dipegang sampai habis**, dan baru dilepas kalau bloknya memang sudah
  hilang, kalau jalannya terhalang, atau kalau sudah dua puluh detik belum sampai
  juga. Yang terbukti tidak bisa dicapai tidak dipilih lagi untuk sementara.
- `roam()` juga berhenti mengundi arah baru tiap denyut. Langkahnya cuma 0,35
  blok, jadi arah yang selalu berubah membuat companion bergetar di tempat alih-
  alih benar-benar pindah mencari. Arahnya sekarang dipegang sekitar lima detik.
- Hasilnya di simulasi, 300 denyut berdiri di hutan rapat: **25 kayu menjadi 275**.
  Ujinya ada di `tools/sim/sim.mjs` dan gagal pada kode lama.

**Peta Patok: mematok chunk dari buku, tanpa item dan tanpa berjalan ke sana:**

- Keluhannya: *"patok ladang belum jalan sempurna, sulit sekali mencari
  patoknya"*. Memang: patok itu ITEM berbentuk sebatang stik yang harus dibawa
  dan diklikkan ke tanah chunk yang dituju — gampang terselip di antara isi
  kantong, dan chunk yang mau dipatok sering ada di seberang lembah.
- Halaman baru **Buku Panduan » Peta Patok** menggambar **8×8 chunk** di
  sekitar pemain (128×128 blok) sekaligus, lengkap dengan statusnya: kosong,
  dipatok belum digarap, sudah jadi ladang, lahan desa, punya pemain lain, dan
  petak tempat pemain berdiri sekarang. Pilih barisnya, tunjuk petaknya —
  patok terpasang atau tercabut di tempat.
- Satu ketukan untuk **mematok chunk tempat kamu berdiri**, dan satu tombol
  untuk berganti antara **Patok Ladang** dan **Patok Desa** tanpa menukar item.
  Item patoknya tetap ada dan tetap bekerja seperti dulu — ini jalan masuk
  kedua, bukan penggantinya.
- Di bawah peta ada **arah dan jarak ke patok terdekatmu** (mis. *"36 blok ke
  timur laut, chunk (1, -2)"*), dihitung dengan kompas Minecraft yang benar
  (utara = −Z). Itu jawaban langsung untuk "patokku yang kemarin di mana".
- **Penanda chunk yang hilang dipasang ulang sendiri.** Penanda patok itu
  entity, dan entity hilang bersama chunk yang tidak dimuat — jadi sesudah
  dunia ditutup dan dibuka lagi, patok yang kemarin terlihat jelas bisa tidak
  ada penandanya sama sekali. Sekarang selama pemain berdiri cukup dekat,
  penandanya dipasang ulang (percobaannya dijeda supaya chunk yang memang belum
  dimuat tidak dicoba tiap denyut).
- **Patok pemain lain tidak bisa dicabut lagi**, lewat peta maupun lewat item.
  Sebelum ini siapa pun di server bisa mencabut ladang pemain lain hanya dengan
  sebatang stik.

**Satu bengkel dipakai bersama, dan tungku yang membuka alat besi:**

- Peti stasiun sudah dipakai bersama sejak v1.4.0, **meja kerja belum**. Dua
  companion yang stasiunnya berjauhan dua puluh blok saja masing-masing
  membelah empat papan untuk meja kerja sendiri — halaman penuh meja kerja,
  sementara alat yang jadi tidak bertambah.
- Modul baru `workshop.js` **mendaftarkan setiap meja kerja dan tungku** yang
  dipasang companion ke tingkat dunia, persis seperti peti stasiun. Yang sudah
  ada milik pemilik yang sama dalam **radius 32 blok** akan dipakai bersama.
  Meja kerja **buatan pemain** juga ikut terpakai: begitu ketemu sekali lewat
  sapuan blok, tempatnya ikut didaftarkan supaya tidak ada yang menyapu dua
  kali. Yang bekerja di seberang bukit tetap punya bengkelnya sendiri.
- **Tungku, dan alat besi yang akhirnya bisa dicapai.** Selama ini tidak ada
  satu pun companion yang pernah memegang alat besi, berapa pun banyak bijih
  yang digali. Sebabnya sepele dan tersembunyi: penambang menggali `iron_ore`,
  yang jatuh `raw_iron`, dan `TOOL_TIERS` tingkat besi cuma menerima
  `iron_ingot`. Bijihnya menumpuk di peti sampai dunia ditutup.
- Modul baru `smelting.js` menutup mata rantai itu: bijih mentah jadi batangan,
  daging dan ikan jadi masakan, dan batang pohon jadi **arang** — yang terakhir
  hanya kalau memang tidak ada batu bara sama sekali dan kayunya berlebih.
  Bahan bakarnya dipilih dari yang paling boleh dibakar: arang dan batu bara
  dulu, kayu paling akhir. Kentang dan wortel sengaja TIDAK ikut dibakar
  walaupun bisa — petani memakainya sebagai bibit.
- Perajin yang mejanya sudah berdiri **memasang tungku sendiri** dari delapan
  batu bulat tanpa perlu diminta, lalu membakar apa pun yang menumpuk. Companion
  yang bekerja sendirian juga memakainya: kalau yang ditunggu besi dan di
  petinya sudah ada bijih mentah, dia membakarnya alih-alih berkeliling mencari
  bijih baru yang ujungnya sama-sama tidak terpakai.
- **Perajin menempa untuk yang lain tanpa diminta.** Papan permintaan punya
  celah: permintaan alat baru dipasang kalau petani/penambang kebetulan sedang
  memeriksa alatnya, punya jeda sepuluh detik, dan hangus sesudah dua puluh
  menit — jadi perajin sering menganggur di samping mejanya sementara petani di
  seberang halaman masih menggaruk tanah dengan tangan. Sekarang perajin yang
  papan pesanannya kosong memeriksa sendiri siapa yang alatnya bisa naik satu
  tingkat, membuatkannya, dan mengantarnya. Urutan kayu → batu → besi tetap
  berlaku, dan alat yang sudah menunggu di peti tidak ditempa dua kali.
- Urutan kerja perajin yang menganggur disusun supaya tidak pernah mentok:
  membakar dulu, lalu menempa alat untuk yang lain, dan tungku untuk persiapan
  paling belakang. Versi pertama memasang tungku paling depan, dan perajin yang
  kebetulan tidak punya batu berdiri menunggu batu selamanya sambil membiarkan
  petani bekerja bertangan kosong.

**Companion bertanya, pemain menjawab (`ask.js`):**

- **Petani** yang petinya kehabisan bibit bertanya: *"Apakah aku mencari bibit
  sendiri, atau kamu yang mencarikan?"* — dijawab **ya** (membabat rumput sendiri)
  atau **tidak** (menunggu kiriman).
- **Penambang** bertanya *"Apa saja yang harus aku mine?"*, dijawab dengan
  mencentang bijih di buku. Jawabannya bukan sekadar penyaring: **kedalaman
  galian ikut menyesuaikan** — batu bara dan besi saja berarti berhenti di y 40,
  bukan menggali sampai y −54.
- Bijih yang tidak dicentang tidak dikejar ke dinding terowongan. Yang kebetulan
  berdiri di jalur galian tetap dipungut — bloknya memang harus dibongkar supaya
  lorongnya lewat, dan meninggalkannya sama saja dengan membuangnya.
- Dua cara menjawab: ketik **`ya`/`tidak`** di chat, atau lewat **Buku Panduan »
  Pertanyaan Companion**. Kata "ya" cuma ditangkap add-on kalau memang ada
  pertanyaan yang menggantung untuk pemain itu — kalau tidak, kalimatnya lewat ke
  chat seperti seharusnya.
- Pertanyaan yang belum dijawab **tidak pernah menghentikan pekerjaan**, dan yang
  sama tidak diulang lebih cepat dari lima menit sekali. Jawabannya disimpan per
  pemilik di dynamic property dunia, jadi selamat dari dunia ditutup.

**Buku Panduan jadi alat, bukan bacaan:**

- Memilih satu companion di **Kendalikan Companion** sekarang membuka halamannya
  sendiri, bukan langsung menu biasa. Isinya: **Sedang Apa** (pekerjaan detik ini,
  tenaga, kantuk, bahan yang ditunggu), **Isi Peti & Kantong**, **Ngobrol** (kotak
  teks — jawabannya masuk chat), **Jawab Pertanyaannya**, **Apa yang Ditambang**
  (khusus penambang), dan **Menu Lengkap** yang lama.
- Isi **kantong pribadi** ikut ditampilkan bersama isi peti. Selama peti belum
  berdiri semua hasil kerja companion hidup di kantong, dan pemain yang cuma
  melihat peti kosong akan mengira companion tidak bekerja.
- Daftar companion di buku sekarang menyebut **apa yang sedang dikerjakan**, bukan
  cuma jaraknya, dan menandai siapa yang sedang bertanya.
- Dua bab baru di Cara Pakai: *Mereka bertanya padamu* dan *Buku ini sebagai alat*.

**Uji:**

- `tools/sim/` bertambah empat kelompok pemeriksaan: menjinakkan (empat jalur,
  termasuk bahwa bunga TIDAK ikut diambil script untuk bunga yang ditangani mesin
  gim), companion sendirian yang benar-benar menebang pohon dan menempa
  beliungnya, pertanyaan yang dijawab lewat chat dan lewat buku, dan halaman buku
  yang terbuka tanpa melempar.
- Dunia tiruan akhirnya punya **daftar entity**: `getEntities()` dulu selalu
  kosong, jadi seluruh kode yang mencari companion LAIN tidak pernah teruji sama
  sekali — dan justru di situ fitur "kerja sendiri" bekerja.


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
