#!/bin/bash
#
# Menjalankan otak companion DI LUAR Minecraft.
#
#   ./run.sh
#
# Minecraft tidak bisa dijalankan di mesin pengembangan, jadi API-nya ditiru
# (stub/) di atas dunia voxel kecil (world.mjs), lalu modul asli add-on
# dijalankan apa adanya di atasnya. Yang diperiksa sim.mjs:
#
#   * seluruh modul benar-benar bisa DITAUTKAN (import/export cocok) — satu
#     nama ekspor yang salah saja membuat Minecraft mematikan seluruh mesin
#     skrip dan semua fitur mati diam-diam
#   * petani meratakan lahan, menggali parit, membuat ember, mengairi, dan
#     tidak pernah mencangkul petak yang belum kebagian air
#   * penambang menggali lorong 1x3 dan menaiki tingkat alat satu per satu
#   * pencari barang dan perajin benar-benar melayani permintaan companion lain
#   * tenaga terkuras dan kantuk naik sampai companion berhenti bekerja
#   * rancangan JSON di blueprints/ benar-benar dibaca dan dibangun
#   * kalimat dan topik JSON di dialogue/ ikut terucap tanpa menghapus bawaan
#   * buku panduan diberikan, dikembalikan sesudah mati, dan bisa dimatikan
#   * Beta API: sim dijalankan DUA KALI, dengan dan tanpa modul beta
#
# Butuh Node.js 18+. Keluar dengan kode 1 kalau ada pemeriksaan yang gagal.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../../behavior_packs/vbs_companions_bp/scripts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/node_modules/@minecraft/server" "$WORK/node_modules/@minecraft/server-ui" "$WORK/scripts"
cp "$HERE/stub/minecraft-server/index.js" "$WORK/node_modules/@minecraft/server/index.js"
cp "$HERE/stub/minecraft-server-ui/index.js" "$WORK/node_modules/@minecraft/server-ui/index.js"
printf '{"name":"@minecraft/server","version":"1.11.0","type":"module","main":"index.js"}' \
  > "$WORK/node_modules/@minecraft/server/package.json"
printf '{"name":"@minecraft/server-ui","version":"1.2.0","type":"module","main":"index.js"}' \
  > "$WORK/node_modules/@minecraft/server-ui/package.json"
printf '{"name":"vbs-sim","type":"module","private":true}' > "$WORK/package.json"
cp "$SRC"/*.js "$WORK/scripts/"
cp "$HERE/world.mjs" "$HERE/sim.mjs" "$WORK/"

echo "== Menautkan seluruh modul =="
cd "$WORK"
node --input-type=module -e '
import { readdirSync } from "node:fs";
let bad = 0;
for (const f of readdirSync("./scripts").filter((n) => n.endsWith(".js")).sort()) {
  try { await import(`./scripts/${f}`); }
  catch (err) { bad++; console.log("  GAGAL " + f + " -> " + err.message); }
}
if (bad) { console.log(`${bad} modul gagal ditautkan`); process.exit(1); }
console.log("  semua modul tertaut bersih");
' 2>&1 | grep -v '^\[VBS-'

echo "== Dunia biasa (tanpa Beta API) =="
node sim.mjs

# Sekali lagi seolah pemain menyalakan toggle "Beta APIs" di pengaturan dunia.
# Keduanya HARUS lolos: beta itu tambahan, bukan syarat, dan add-on yang cuma
# jalan di salah satunya berarti ada jalur kode yang tidak pernah diuji.
echo
echo "== Dunia dengan Beta API menyala =="
VBS_SIM_BETA=1 node sim.mjs
