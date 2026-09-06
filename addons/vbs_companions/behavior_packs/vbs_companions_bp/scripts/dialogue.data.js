// DIBUAT OTOMATIS oleh tools/gen_dialogue.py — jangan diubah dengan tangan.
//
// Sumbernya berkas JSON di addons/vbs_companions/dialogue/. Tambah satu berkas di
// sana, jalankan `python3 tools/gen_dialogue.py`, dan kalimatnya ikut terucap
// tanpa menyentuh kode. Skemanya: dialogue/README.md.

// Kalimat tambahan per karakter. "*" berlaku untuk semua karakter.
export const DATA_LINES = {
  "*": {
    "idle": ["Langitnya bersih hari ini.", "Kalau hujan, kerjaannya lebih adem.", "Aku dengar air dari sebelah sana."],
    "morning": ["Embunnya belum kering, {owner}."],
    "night": ["Bintangnya banyak malam ini."],
  },
};

// Kunci yang MENGGANTIKAN kalimat bawaan, bukan menambahinya.
export const DATA_REPLACES = {
};

// Obrolan antar companion. modes kosong = topik bisa dipilih kapan saja.
export const DATA_TOPICS = [
  {
    tag: "hasil-kerja",
    modes: [],
    source: "cuaca.json",
    turns: [
      "Petimu sudah penuh belum?",
      "Belum. Masih muat beberapa tumpuk lagi.",
      "Kalau penuh, bilang. Aku bantu angkut.",
    ],
  },
  {
    tag: "hujan",
    modes: ["farm", "wander", "looter"],
    source: "cuaca.json",
    turns: [
      "Awannya menebal dari tadi.",
      "Mungkin hujan. Tanamannya kebagian air kalau begitu.",
      "Aku tetap kerja, cuma basah sedikit.",
      "Jangan sampai sakit. {owner} nanti repot.",
    ],
  },
];
