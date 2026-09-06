/**
 * Dukungan Beta API — tambahan, bukan syarat.
 *
 * Add-on ini tetap jalan penuh di modul @minecraft/server versi stabil. Kalau
 * pemain memasang manifest varian beta (`python3 tools/gen_packs.py --beta`) dan
 * menyalakan toggle "Beta APIs" di pengaturan dunia, berkas inilah yang
 * memanfaatkan yang tersedia — terutama PERINTAH GARIS MIRING SUNGGUHAN:
 *
 *     /vbs:panduan                    buka Buku Panduan
 *     /vbs:chat <nama> <pesan>        bicara ke companion
 *     /vbs:mode <nama> <mode>         ganti tugas companion
 *
 * Tanpa beta, ketiganya tetap ada dalam bentuk lain: buku dibuka dengan memakai
 * bukunya, dan bicara/perintah lewat "chat <nama> <pesan>" atau
 * "/scriptevent vbs:chat". Jadi menyalakan beta menambah kenyamanan, tidak
 * pernah menjadi syarat.
 *
 * DUA ATURAN yang membuat berkas ini aman dipasang di dunia tanpa beta:
 *
 *   1. Modulnya di-import sebagai NAMESPACE (`import * as mc`). Meng-import
 *      nama yang tidak ada di versi stabil — CommandPermissionLevel, misalnya —
 *      adalah kegagalan penautan modul: Minecraft mematikan SELURUH mesin skrip
 *      add-on begitu dunia dibuka, diam-diam. Lewat namespace, nama yang tidak
 *      ada cuma bernilai undefined.
 *   2. Semua yang disentuh di sini dibungkus try/catch dan dicek dulu
 *      keberadaannya. Yang tidak tersedia dicatat sebagai info, bukan error.
 */

import * as mc from "@minecraft/server";
import { guard, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "BETA";

// Diisi main.js lewat setBetaHandlers(). Sengaja tidak di-import dari sini:
// beta.js dipanggil bookui.js untuk baris statusnya, jadi meng-import bookui.js
// balik akan membuat lingkaran import.
const handlers = {
  openBook: undefined,
  talk: undefined,
  setMode: undefined,
};

export function setBetaHandlers(next) {
  Object.assign(handlers, next);
  logDebug(TAG, `Penangan perintah beta dipasang: ${Object.keys(next).join(", ")}.`);
}

/* ------------------------------------------------------------------ *
 * Deteksi kemampuan
 * ------------------------------------------------------------------ */

function probe(what, fn) {
  try {
    return Boolean(fn());
  } catch (e) {
    logDebug(TAG, `Probe "${what}" gagal; dianggap tidak tersedia.`, e);
    return false;
  }
}

export const CAPABILITIES = {
  // Perintah garis miring buatan add-on (Beta API).
  customCommands: probe("customCommands", () => mc.system?.beforeEvents?.startup),
  // Komponen kustom untuk item dan blok (Beta API).
  itemComponents: probe("itemComponents", () => mc.CustomComponentParameters),
  // Menyimpan dan menempel structure lewat script.
  structures: probe("structures", () => mc.world?.structureManager),
  // Enum perintah — ada hanya kalau modul beta benar-benar termuat.
  commandEnums: probe("commandEnums", () => mc.CustomCommandParamType),
};

export function hasBeta() {
  return CAPABILITIES.customCommands && CAPABILITIES.commandEnums;
}

/** Baris status yang dipajang Buku Panduan. */
export function betaLines() {
  const mark = (on) => (on ? "§atersedia" : "§8tidak aktif");
  return [
    `§7Perintah garis miring: ${mark(hasBeta())}` +
      (registered.length ? ` §8(${registered.join(", ")})` : ""),
    `§7Structure API: ${mark(CAPABILITIES.structures)}`,
    `§7Komponen kustom: ${mark(CAPABILITIES.itemComponents)}`,
    hasBeta()
      ? "§8Beta API menyala — perintah di atas bisa langsung diketik."
      : "§8Tanpa Beta API semua fitur tetap jalan; pakai buku ini, menu companion,",
    hasBeta() ? "" : "§8atau \"chat <nama> <pesan>\" di kotak chat.",
  ].filter((line) => line !== "");
}

/* ------------------------------------------------------------------ *
 * Perintah garis miring
 * ------------------------------------------------------------------ */

const registered = [];

function playerOf(origin) {
  const source = origin?.sourceEntity;
  return source && source.typeId === "minecraft:player" ? source : undefined;
}

function ok(message) {
  const status = mc.CustomCommandStatus?.Success ?? 0;
  return message ? { status, message } : { status };
}

function fail(message) {
  return { status: mc.CustomCommandStatus?.Failure ?? 1, message };
}

function definitions() {
  const str = mc.CustomCommandParamType?.String;
  const anyone = mc.CommandPermissionLevel?.Any ?? 0;
  return [
    {
      spec: {
        name: "vbs:panduan",
        description: "Buka Buku Panduan Companion.",
        permissionLevel: anyone,
      },
      run: (origin) => {
        const player = playerOf(origin);
        if (!player) return fail("Perintah ini harus dijalankan oleh pemain.");
        if (!handlers.openBook) return fail("Buku panduan belum siap.");
        mc.system.run(guard(TAG, "cmd panduan", async () => {
          await handlers.openBook(player);
        }));
        return ok("Membuka buku panduan...");
      },
    },
    {
      spec: {
        name: "vbs:chat",
        description: "Bicara ke companion milikmu. Nama \"semua\" untuk semuanya.",
        permissionLevel: anyone,
        mandatoryParameters: [
          { type: str, name: "nama" },
          { type: str, name: "pesan" },
        ],
      },
      run: (origin, name, message) => {
        const player = playerOf(origin);
        if (!player) return fail("Perintah ini harus dijalankan oleh pemain.");
        if (!handlers.talk) return fail("Obrolan belum siap.");
        mc.system.run(guard(TAG, "cmd chat", () => handlers.talk(player, name, message)));
        return ok();
      },
    },
    {
      spec: {
        name: "vbs:mode",
        description: "Ganti tugas companion (farm, mine, build, ...).",
        permissionLevel: anyone,
        mandatoryParameters: [
          { type: str, name: "nama" },
          { type: str, name: "tugas" },
        ],
      },
      run: (origin, name, mode) => {
        const player = playerOf(origin);
        if (!player) return fail("Perintah ini harus dijalankan oleh pemain.");
        if (!handlers.setMode) return fail("Perintah tugas belum siap.");
        const result = handlers.setMode(player, name, mode);
        return result.ok ? ok(result.message) : fail(result.message);
      },
    },
  ];
}

function registerCommands(registry) {
  for (const { spec, run } of definitions()) {
    try {
      registry.registerCommand(spec, run);
      registered.push(`/${spec.name}`);
      logInfo(TAG, `Perintah "/${spec.name}" terdaftar.`);
    } catch (e) {
      logWarn(TAG, `Gagal mendaftarkan perintah "/${spec.name}"`, e);
    }
  }
}

/**
 * Pendaftaran perintah HARUS terjadi di event startup, sebelum dunia dimuat —
 * tidak ada kesempatan kedua sesudahnya. Karena itu berkas ini berlangganan
 * begitu di-import, bukan lewat fungsi yang dipanggil belakangan.
 */
function wireStartup() {
  if (!CAPABILITIES.customCommands) {
    logInfo(TAG, "Beta API tidak aktif; perintah garis miring dilewati. " +
      "Semua fitur tetap tersedia lewat buku panduan, menu companion, " +
      "\"chat <nama> <pesan>\" dan /scriptevent vbs:chat.");
    return;
  }
  try {
    mc.system.beforeEvents.startup.subscribe(guard(TAG, "startup", (ev) => {
      const registry = ev.customCommandRegistry;
      if (!registry) {
        logWarn(TAG, "Event startup ada, tapi customCommandRegistry tidak. " +
          "Versi beta ini belum mendukung perintah kustom.");
        return;
      }
      registerCommands(registry);
    }));
    logDebug(TAG, "Berlangganan system.beforeEvents.startup.");
  } catch (e) {
    logWarn(TAG, "Gagal berlangganan startup; perintah garis miring dilewati.", e);
  }
}

wireStartup();

logInfo(TAG, "Kemampuan terdeteksi: " +
  Object.entries(CAPABILITIES).map(([k, v]) => `${k}=${v}`).join(", "));

/** Dipakai log dan uji: ringkasan singkat dalam satu objek. */
export function betaSummary() {
  return {
    beta: hasBeta(),
    commands: [...registered],
    capabilities: { ...CAPABILITIES },
  };
}
