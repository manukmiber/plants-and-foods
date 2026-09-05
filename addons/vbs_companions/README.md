# VBS Companions

Add-on Minecraft **Bedrock** berisi lima karakter pendamping yang mengikuti pemain
ke mana pun, dan bisa disuruh **bertani, bertarung, menambang, mengembara** atau
**membangun** — perintahnya dipilih lewat UI yang muncul setelah pemain **jongkok
lalu klik/tap karakternya**.

![Kelima karakter](docs/preview/lineup.png)

Empat dari Vivid BAD SQUAD (Project SEKAI) — **Akito**, **Kohane**, **An**, **Toya** —
dan **Flins**, penjaga mercusuar Nod-Krai dari Genshin Impact. Model 3D dan
teksturnya (1024×1024) digambar dari nol untuk add-on ini.

---

## Pasang

Add-on ini dibungkus jadi **dua berkas terpisah**, satu per pack:

| Berkas | Isinya |
|---|---|
| `VBS-Companions-v1.2.0-BP.mcaddon` | Behavior pack — entity, mode, dan seluruh script |
| `VBS-Companions-v1.2.0-RP.mcaddon` | Resource pack — model, tekstur, animasi, teks |

**Keduanya harus dipasang.** Manifest keduanya saling menyebut sebagai dependensi,
jadi memasang salah satu saja akan membuat Minecraft mengeluh pasangannya tidak ada.
Urutan pemasangannya bebas.

### Di HP / PC (client)

Buka kedua berkas itu satu per satu. Minecraft memasang masing-masing ke tempatnya.
Lalu di pengaturan dunia, aktifkan **VBS Companions [Behavior]** dan **[Resource]**.

Tidak ada satu pun toggle *Experimental* yang perlu dinyalakan — script-nya memakai
API versi stabil.

### Di dedicated server (BDS)

```bash
unzip VBS-Companions-v1.2.0-BP.mcaddon -d /tmp/vbs
unzip VBS-Companions-v1.2.0-RP.mcaddon -d /tmp/vbs
cp -r /tmp/vbs/vbs_companions_bp  <server>/behavior_packs/
cp -r /tmp/vbs/vbs_companions_rp  <server>/resource_packs/
```

Lalu daftarkan ke dunianya. `<server>/worlds/<nama dunia>/world_behavior_packs.json`:

```json
[
  { "pack_id": "e980994d-a9a6-469e-af1b-a31c3e9f7838", "version": [1, 2, 0] }
]
```

`<server>/worlds/<nama dunia>/world_resource_packs.json`:

```json
[
  { "pack_id": "b5872873-2873-40c9-8d5b-424bc5592785", "version": [1, 2, 0] }
]
```

Kalau berkasnya sudah ada, tambahkan entrinya ke dalam array yang sudah ada — jangan
ditimpa. Di `server.properties`, pastikan `texturepack-required=true` supaya semua
pemain mendapat modelnya. Restart server.

Minecraft Bedrock **1.21.0 ke atas**.

---

## Main

1. **Panggil karakternya** dengan spawn egg (ada di tab Item / creative, satu untuk
   tiap karakter), atau `/summon vbs:akito`.
2. Begitu muncul, dia langsung jadi milik pemain terdekat dan mulai mengikuti.
   *(Kalau versi gimmu tidak mengizinkan pengambilan pemilik otomatis, beri dia
   roti/apel/kue sekali — sesudah itu dia milikmu.)*
3. **Jongkok, lalu klik kanan** karakternya (di layar sentuh: jongkok, lalu tekan
   tombol **Buka Menu** yang muncul). UI-nya terbuka.

### Penanda di atas kepala

Tiap companion selalu memakai penanda berformat **`[Nama, tugas, Owner]`** —

```
[Kohane, Bertani, manukmiber]
```

Itu dibuat untuk server: satu pemain bisa tahu companion siapa itu dan sedang
disuruh apa dari jauh, tanpa perlu mendekat dan membuka menunya. Kalau companion
sedang bicara, kalimatnya muncul sebagai baris di ATAS penanda, jadi penandanya
tidak pernah hilang.

### Tujuh perintah

| Perintah | Yang dia lakukan |
|---|---|
| **Ikuti Aku** | Menempel di dekatmu ke mana pun, termasuk pindah dimensi. Ketinggalan lebih dari 24 blok? Ditarik pulang otomatis. |
| **Mode Bertani** | Membuka ladang, membuat alatnya sendiri, menanam berpola, memanen, mengairi, dan menghias. Lihat bagian tersendiri di bawah. |
| **Mode Bertarung** | Menyerang monster dalam radius 20 blok, membalas yang menyerangmu, dan ikut menyerang yang kamu pukul. Pakai pedang atau **busur** — tergantung apa yang kamu pasangkan di tangannya. |
| **Diam di Tempat** | Berjaga di titik itu. Tidak mengikuti, tidak ditarik pulang. |
| **Mode Menambang** | Menggali tangga turun sampai kedalaman intan, membuat terowongan bercabang berobor, mengumpulkan bijih, dan menyetorkannya ke peti. |
| **Mode Mengembara** | Menjelajah spiral melebar dari base, mencatat temuan beserta koordinatnya, memungut barang di jalan, dan pulang menyetor. |
| **Mode Membangun** | Membangun rancangan pilihanmu dari bahan yang ada di peti stasiun. |

Menu **Pengaturan & Perlengkapan** berisi: memakaikan zirah/senjata/alat dari
tanganmu, memberi makan, melepas perlengkapan, mengatur ladang dan patok, memilih
rancangan bangunan, membaca catatan pengembara, mematikan celotehnya, mengganti
nama panggilan, memanggilnya ke tempatmu, dan mengistirahatkannya.

Mode yang dipilih **tersimpan** — dunia ditutup lalu dibuka lagi, perintahnya tetap.

---

## Berhenti dan tersenyum saat dilihat

Kalau kamu **mengarahkan pandangan** ke seorang companion dari jarak 10 blok atau
kurang, dia **berhenti melakukan apa pun**, menoleh, tersenyum, dan melambai.
Begitu kamu memalingkan muka, dia lanjut bekerja dari titik yang sama.

Ini berlaku **tanpa kecuali**, termasuk saat dia sedang bertarung — itu memang
yang diminta, dan konsekuensinya nyata: companion yang kamu tatap di tengah
pertarungan akan membeku sambil melambai dan bisa mati konyol. Kalau ternyata
mengganggu, ubah satu baris di `behavior_packs/.../scripts/config.js`:

```js
export const LOOK = {
  stopInCombat: true,   // ganti ke false: saat bertarung dia cuma tersenyum, tidak berhenti
  ...
};
```

Tidak ada baris lain yang perlu ikut diubah.

---

## Mode bertani, lengkapnya

Mode ini yang paling banyak berubah. Urutan yang dikerjakan companion selalu sama,
dan dia berhenti di langkah pertama yang belum beres — **alasannya selalu terbaca
di baris "Sekarang" di menu utama**, jadi companion yang berdiri diam bukan misteri.

### 1. Stasiun

Companion mencari peti dalam radius 10 blok. Kalau tidak ada, dia **memasang peti
sendiri beserta papan nama** bertuliskan namanya, tugasnya, pemiliknya, dan chunk
tempatnya berdiri. Peti itu satu-satunya jalan masuk dan keluar barang.

### 2. Alat

Dia melihat isi peti, memilih **tingkat tertinggi yang bahannya ada** — kayu, batu,
besi, emas, intan — mencari **meja kerja** di dekat stasiun (memasang satu sendiri
dari papan kalau belum ada), berjalan ke sana, dan membuat cangkulnya di situ.
Menaruh satu intan di peti cukup untuk membuatnya berhenti memakai cangkul kayu.

### 3. Menanam berpola

Ladang dibagi jadi **jalur selebar dua blok**, dan jalur ke-n memakai bibit ke-n
dari isi peti. Patokannya tepi ladang, bukan posisi companion, jadi barisnya tetap
di tempat yang sama walau dunia ditutup dan dibuka lagi. Hasilnya ladang berbaris,
bukan tertanam acak.

### 4. Panen yang tidak instan

Companion **tidak mencabut begitu saja**. Dia berjalan ke tanamannya, **jongkok**,
**mengayun-ayunkan tangan** selama kira-kira dua detik sambil mengeluarkan
partikel dan suara — baru kentangnya lepas, dan langsung **ditanam ulang** di
tempat yang sama. Hasilnya masuk ke kantongmu kalau kamu ada di dekat situ, dan ke
peti stasiun kalau kamu sedang jauh.

Kalau kamu menatapnya di tengah panen, dia berhenti dan tersenyum; panennya
dilanjutkan setelah kamu memalingkan muka.

### 5. Topi jerami

Companion yang sedang bertani otomatis memakai **topi jerami**. Penambang memakai
**helm berlampu**, pengembara memakai **ransel**. Warnanya sama untuk semua
karakter — supaya di server, dari jauh, langsung terbaca siapa sedang mengerjakan apa.

![Perlengkapan role](docs/preview/roles.png)

### 6. Patok chunk

Sebelum boleh melebarkan ladang, companion butuh izin, dan izin itu berbentuk
barang: begitu kamu memilih Mode Bertani, kamu **diberi sebatang `Patok Ladang`**.

Klik/tap tanah dengan patok itu, dan chunk tempat blok itu berada jadi terpatok.
Sebuah **penanda muncul di tengah chunk** dengan pancaran warna ke langit:

| Warna | Artinya |
|---|---|
| **Merah** | Sudah dipatok, tapi belum digarap jadi ladang |
| **Hijau** | Sudah jadi ladang |

Klik lagi di chunk yang sama untuk mencabut patoknya. Patok disimpan di tingkat
dunia, jadi tetap ada walau companion yang menggarapnya diistirahatkan.

**Tanpa patok**, companion hanya menggarap radius kecil di sekitar stasiun dan
tidak pernah mencangkul tanah baru — jadi dia tidak akan pernah membongkar
kebunmu sendiri tanpa diminta.

### 7. Mengairi dan melebar

Kalau di peti ada **ember** (atau **tiga besi**, yang akan ditempanya jadi ember)
**dan** ada sungai dalam 12 blok dari ladang, companion menggali **parit air tiap
delapan blok** dan mencangkul sisa chunk jadi ladang — sampai satu chunk penuh.

Petak yang kebetulan sudah dekat air alami tetap dicangkul walau tidak ada ember,
supaya fitur ini masih berguna buat base yang jauh dari sungai.

Untuk melebar **satu chunk lagi**, nyalakan izinnya di menu **Ladang & Patok**, dan
patok chunk keduanya. Tanpa izin itu, companion berhenti di chunk pertama.

### 8. Menghias

Setelah tidak ada lagi yang matang, tidak ada petak kosong, dan tidak ada tanah
yang perlu dicangkul, companion menghias sawahnya dari bahan yang ada di peti:
pagar keliling, lampu tiap lima langkah, jerami di sudut, dan **orang-orangan sawah**
(pagar + labu) di tengah. Yang tidak ada bahannya dilewati.

---

## Tiga role baru

### Menambang

Menggali **tangga turun** dari permukaan sampai Y −54 (Overworld), satu blok maju
satu blok turun, dengan **obor tiap delapan anak tangga**. Sampai di bawah, dia
menggali **terowongan utama setinggi dua blok**, dan **cabang sepanjang delapan
blok tiap tiga blok** berselang kiri dan kanan — jarak tiga blok itu yang bikin
tidak ada urat bijih yang terlewat. Bijih yang menempel di dinding ikut diambil.

Tasnya penuh? Dia **pulang menyetor ke peti stasiun**, lalu turun lagi ke tempat
terakhirnya menggali. Blok buatan pemain, peti, dan lava tidak pernah disentuh;
kalau ujung galian membentur salah satunya, arah galiannya dibelokkan.

Butuh beliung — dibuatnya sendiri dari bahan di peti, sama seperti cangkul.

### Mengembara

Satu-satunya mode yang sengaja **tidak** mengikuti pemilik: tugasnya menjauh.
Jalurnya **spiral melebar** dari stasiun, sampai jari-jari 190 blok, lalu pulang.

Sepanjang jalan dia **mencatat temuan** — desa, mulut gua, peti terbengkalai,
danau lava, reruntuhan — beserta koordinatnya, dan **melaporkannya lewat chat**.
Catatan itu disimpan di tingkat dunia dan bisa dibaca lagi kapan saja lewat menu
**Catatan Pengembara**. Barang yang tergeletak di jalannya dipungut dan dibawa
pulang ke peti.

### Membangun

Pilih rancangan di menu **Rancangan Bangunan**:

| Rancangan | Isinya |
|---|---|
| Pagar keliling ladang | Pagar satu blok keliling petak, lampu tiap lima langkah |
| Tembok keliling | Tembok tiga blok mengelilingi petak |
| Tiang lampu | Tiang berlampu tiap enam blok di dalam petak |
| Jalan setapak ke pemilik | Jalan lurus dari stasiun ke tempatmu berdiri |
| Jembatan | Jembatan berpagar 24 blok ke arah hadap companion |
| Gubuk 5×5 | Lantai, dinding, jendela, pintu, atap, satu lampu |
| Gudang 7×5 | Seperti gubuk, lebih besar, lengkap dengan peti di dalam |

Bahannya diambil dari peti stasiun, dan rancangan **menyebut peran blok** —
"dinding", "lantai", "atap", "lampu" — bukan blok tertentu. Jadi gubuk yang sama
jadi gubuk kayu kalau petimu berisi papan, dan gubuk batu kalau berisi batu bulat.
Yang tidak ada bahannya dilewati, dan alasannya muncul di baris "Sekarang".

---

## Companion yang bicara

Dua jalan sekaligus, dipilih dari jarak: pemain **dekat** melihat **gelembung teks**
di atas kepala companion, pemain **jauh** membaca **baris chat** biasa. Satu kalimat
tidak pernah sampai dua kali ke orang yang sama, jadi di server chat tidak
kebanjiran celoteh companion orang lain.

Companion berkomentar tentang pekerjaannya sesekali, menyapa waktu kamu menatapnya,
mengeluh waktu kena pukul, dan **melaporkan temuan** dengan koordinat.

### Ngobrol satu sama lain

Dua companion yang berdiri berdekatan cukup lama akan **berhenti, saling
menghadap, dan bertukar beberapa kalimat**. Topiknya dipilih dari mode yang sedang
mereka jalankan — dua petani membicarakan barisan tanaman, penambang yang bertemu
pengembara membicarakan perjalanan — jadi obrolannya nyambung dengan apa yang
sedang terjadi.

Kalau kamu menatap salah satunya di tengah obrolan, obrolannya dibatalkan: kamu
lebih penting. Celoteh bisa dimatikan per companion lewat menu.

Tiap karakter punya suaranya sendiri. Akito pendek dan ketus, Kohane ragu-ragu dan
sopan, An santai, Toya rapi dan menghitung, Flins formal. Semua dialognya ada di
satu berkas, `behavior_packs/.../scripts/lines.js`, jadi menambahnya tidak perlu
menyentuh kode.

---

### Kelima karakter

| Karakter | Nyawa | Damage | Kecepatan | Radius tani | |
|---|---|---|---|---|---|
| **Akito** Shinonome | 28 | 6 | 0.33 | 5 | Paling kuat berkelahi |
| **Kohane** Azusawa | 24 | 4 | 0.32 | 6 | Paling ringan, cepat lincah |
| **An** Shiraishi | 30 | 5 | 0.34 | 6 | Paling tahan pukulan |
| **Toya** Aoyagi | 26 | 5 | 0.32 | 7 | Radius tani terluas |
| **Flins** | 32 | 7 | 0.33 | 5 | Nyawa dan damage tertinggi |

Companion **tidak bisa dilukai pemain**, jadi pukulan nyasar tidak akan membunuhnya.

### Akito dan Kohane memakai model yang lebih detail

Keduanya memakai bentuk badan **"detailed"**: rambut berlapis dengan poni yang
benar-benar dipotong tembus supaya wajah kelihatan di baliknya, dan **delapan
ekspresi wajah**.

Bedanya dua **perawakan**. Kohane memakai perawakan perempuan — jurai samping,
ekor rambut dua ruas yang ujungnya tertinggal sepersekian detik dari kepala, rok
empat panel yang berayun sendiri-sendiri, kaus kaki selutut, sepatu tinggi.
Akito memakai perawakan laki-laki — bahu selebar model vanilla, poni runcing yang
gerigi potongannya menembus sampai sisi dan belakang, hoodie dengan tudung yang
ikut berayun, celana panjang, dan sepatu rendah. Matanya juga digambar berbeda:
lebih pendek, sudutnya lebih tajam, alisnya lebih tebal, ronanya jauh lebih tipis.

![Ekspresi Kohane](docs/preview/kohane-faces.png)
![Ekspresi Akito](docs/preview/akito-faces.png)

Wajahnya dipilih tiap frame dari apa yang sedang terjadi padanya:

| Kapan | Wajah |
|---|---|
| baru kena pukul | hurt |
| sedang bertarung atau membidik | surprised |
| sedang di udara | surprised |
| sedang memanen, menambang, atau membangun | happy |
| kira-kira tiap 4,6 detik, sekejap | blink |
| berlari | sing |
| berjalan | happy |
| diam lama | sleepy |
| diam, sesekali | smile |
| selebihnya | neutral |

Semuanya jalan **di klien** — tidak ada satu pun tick server yang dipakai untuk
ini, dan tidak ada apa pun yang jalan saat tidak ada yang melihat. Script hanya
ikut campur waktu satu ekspresi perlu dipaksa, misalnya senyum waktu disapa.

Keempat karakter lain memakai bentuk **"classic"**. Bentuk badan dan perawakan
dipilih lewat `style.build` dan `style.figure` di `characters.json`, jadi karakter
mana pun bisa dipindah tanpa menyentuh kode.

---

## Yang perlu diketahui

- **Zirah bekerja, tapi tidak terlihat di badannya.** Titik armornya nyata dan
  mengurangi damage yang masuk, dan angkanya ada di UI — tapi modelnya kustom, dan
  Bedrock hanya menggambar zirah di atas kerangka model vanilla. Perlengkapan role
  (topi jerami, helm, ransel) adalah bagian dari model, jadi yang itu terlihat.
- **Berjalan dijamin dua lapis.** Pathfinding bawaan gim hanya bisa disuruh menuju
  blok bertipe tertentu, bukan menuju koordinat — padahal pekerjaan seperti
  "berjalan ke meja kerja" atau "ke ujung terowongan" tujuannya sebuah titik. Jadi
  langkah untuk pekerjaan itu digerakkan script, 0,32 blok tiap denyut cepat,
  hanya kalau petak tujuannya benar-benar bisa dipijak, dan bisa menyusur sumbu
  kalau garis lurusnya tertutup — itu yang membuat companion bisa membelok di
  tikungan lorong tambang.
- **Mode bertani tidak butuh bibit** untuk menanam ulang yang baru dipanen; bibit
  di peti hanya dipakai untuk menanami petak yang kosong.
- **Companion tidak menyentuh bangunanmu.** Peti, meja kerja, tungku, ranjang,
  beacon, spawner dan sejenisnya ada di daftar lindung dan tidak pernah digali,
  ditimpa, atau dicangkul — di mode mana pun.
- Karya penggemar. Semua tekstur dan model digambar sendiri untuk add-on ini —
  interpretasi pixel-art, bukan aset dari Project SEKAI maupun Genshin Impact, dan
  tidak berafiliasi dengan SEGA/Colorful Palette maupun HoYoverse.

---

## Untuk yang mau mengubah

Semua yang terlihat lahir dari satu berkas data, `tools/characters.json` — palet
warna, perawakan, gaya rambut, potongan baju, dan statistik tiap karakter. Ganti
satu warna di sana, jalankan ulang generatornya, dan model, tekstur, entity,
preview, semuanya ikut berubah.

```bash
cd tools
python3 gen_geometry.py      # -> models/entity/vbs_companions.geo.json
python3 gen_textures.py      # -> semua PNG (tekstur 1024x1024, spawn egg, patok, pack icon)
python3 gen_packs.py         # -> manifest, entity behavior + resource, render controller, lang
python3 render_preview.py    # -> docs/preview/*.png
python3 validate.py          # periksa semua kaitan antar berkas
python3 build_mcaddon.py     # -> VBS-Companions-v1.2.0-BP.mcaddon dan -RP.mcaddon
```

Butuh Python 3 dan Pillow (`pip install pillow`). Hasil generatornya ikut di-commit,
jadi orang yang cuma mau memasang add-on ini tidak perlu Python sama sekali.

| Berkas | Isinya |
|---|---|
| `tools/characters.json` | Satu-satunya sumber kebenaran: palet, perawakan, gaya, statistik |
| `tools/uvmap.py` | Peta UV 1024×1024, 8 texel per satuan model — koordinatnya disusun otomatis dari daftar ukuran |
| `tools/model.py` | Bentuk tiap karakter: bone dan kubusnya, dua build, dua perawakan, plus bone perlengkapan role |
| `tools/paint.py` | Kuas dasar: satu Face = satu sisi kubus, koordinat pecahan |
| `tools/detailed.py` | Penggambar build detailed: delapan wajah, dua perawakan, dan perlengkapan role |
| `tools/gen_packs.py` | Entity, entity property, priority goal, render controller, manifest |
| `tools/render_preview.py` | Renderer ortografis + z-buffer, untuk gambar preview |
| `tools/validate.py` | 2100+ pemeriksaan kaitan antar berkas |

`validate.py` memeriksa hal-hal yang biasanya baru ketahuan setelah add-on dipasang:
identifier entity behavior vs resource vs script vs teks, bone yang disebut animasi
tapi tidak ada di geometry, UV yang keluar tekstur, component group yang dipanggil
event tapi tidak didefinisikan, tekstur yang ditunjuk tapi tidak ada, entity
property yang dipakai Molang tapi tidak dideklarasikan atau tidak `client_sync`,
daftar mode dan pose di `config.js` yang melenceng dari `gen_packs.py`, dan —
yang paling menolong — **priority goal yang kembar**. Priority kembar tidak
memunculkan galat apa pun; Bedrock diam-diam memilih satu goal dan mengabaikan
sisanya, dan itulah yang dulu membuat mode bertarung tidak melakukan apa-apa.

### Script behavior pack

| Berkas | Isinya |
|---|---|
| `config.js` | Semua angka dan teks bersama: mode, pose, tanaman, bahan alat, saklar |
| `lines.js` | Seluruh dialog dan topik obrolan |
| `util.js` | Pembantu: perlengkapan, entity property, langkah jalan, isi peti |
| `state.js` | Ingatan yang selamat dari dunia ditutup: stasiun, pekerjaan, patok, catatan |
| `hold.js` | Menahan companion di tempat (disapa, memanen, mengobrol) |
| `nametag.js` | Penanda `[Nama, tugas, Owner]` dan gelembung teks |
| `chat.js` | Gelembung untuk yang dekat, chat untuk yang jauh |
| `look.js` | Berhenti dan tersenyum saat dilihat |
| `station.js` | Peti dan papan stasiun |
| `crafting.js` | Membuat alat di meja kerja dari bahan di peti |
| `claim.js` | Patok ladang, penanda chunk, pancaran merah/hijau |
| `farming.js` | Mode bertani |
| `decorate.js` | Menghias sawah |
| `mining.js` | Mode menambang |
| `wander.js` | Mode mengembara |
| `builder.js` | Mode membangun dan rancangannya |
| `combat.js` | Mode bertarung, pemilihan senjata, pose |
| `social.js` | Obrolan antar companion |
| `activity.js` | Keterangan "sedang apa" yang tampil di menu |
| `ui.js` | Semua layar |
| `main.js` | Denyut dan penyaluran; tidak berisi logika kerja apa pun |
