// Tiruan minimal @minecraft/server, cukup untuk memuat dan menjalankan
// sebagian jalur kode add-on di luar Minecraft.
export const EquipmentSlot = {
  Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet", Mainhand: "Mainhand",
};

export class ItemStack {
  constructor(typeId, amount = 1) {
    if (typeof typeId !== "string" || !typeId.includes(":")) {
      throw new Error(`ItemStack id tidak valid: ${typeId}`);
    }
    this.typeId = typeId;
    this.amount = amount;
  }
  setLore() {}
}

const intervals = [];
const timeouts = [];

// Mode BETA tiruan. Dinyalakan dengan VBS_SIM_BETA=1 supaya sim bisa dijalankan
// dua kali: sekali seperti dunia biasa (tanpa Beta API) dan sekali seperti dunia
// yang menyalakan toggle "Beta APIs". Keduanya harus lolos — itulah yang
// membuktikan beta benar-benar tambahan, bukan syarat.
const BETA = Boolean(globalThis.process?.env?.VBS_SIM_BETA);
const commands = [];

export const CustomCommandParamType = BETA ? { String: "String", Integer: "Integer" } : undefined;
export const CommandPermissionLevel = BETA ? { Any: 0, GameDirectors: 1, Admin: 2 } : undefined;
export const CustomCommandStatus = BETA ? { Success: 0, Failure: 1 } : undefined;

const startupEvent = {
  subscribe(fn) {
    // Bedrock memanggil startup sekali sebelum dunia dimuat; tiruan ini
    // memanggilnya langsung supaya pendaftaran perintah bisa diperiksa.
    fn({
      customCommandRegistry: {
        registerCommand(spec, run) { commands.push({ spec, run }); },
      },
    });
  },
};

export const system = {
  currentTick: 0,
  run(fn) { timeouts.push(fn); },
  runTimeout(fn) { timeouts.push(fn); },
  runInterval(fn, period) { intervals.push({ fn, period }); return intervals.length; },
  clearRun() {},
  afterEvents: { scriptEventReceive: { subscribe() {} } },
  beforeEvents: BETA
    ? { watchdogTerminate: { subscribe() {} }, startup: startupEvent }
    : { watchdogTerminate: { subscribe() {} } },
};

function evt() { return { subscribe(fn) { this._fns = (this._fns ?? []).concat(fn); } }; }

const props = new Map();
let players = [];

/** Dipakai sim.mjs: daftar pemain yang "online" di dunia tiruan. */
export function __setPlayers(list) { players = list; }

// Dimensi tiruan yang dipakai uji yang sedang berjalan. Tanpa ini,
// world.getDimension() selalu memberi dimensi kosong, jadi allCompanions()
// tidak pernah menemukan satu companion pun — dan semua kode yang mencari
// companion LAIN (selfhelp.hasHelper, ask.js) tidak akan pernah teruji.
let bound;
export function __setDimension(dimension) { bound = dimension; }

export const world = {
  afterEvents: {
    entitySpawn: evt(), entityLoad: evt(), entityRemove: evt(), entityDie: evt(),
    entityHurt: evt(), playerInteractWithEntity: evt(), playerLeave: evt(),
    itemUse: evt(), itemUseOn: evt(), playerInteractWithBlock: evt(),
    playerSpawn: evt(), worldLoad: evt(),
  },
  beforeEvents: { chatSend: evt() },
  getAllPlayers() { return players; },
  getDimension(id) {
    if (bound && id === "minecraft:overworld") return bound;
    return makeDimension(id);
  },
  getDynamicProperty(k) { return props.get(k); },
  setDynamicProperty(k, v) { props.set(k, v); },
  getTimeOfDay() { return 1000; },
  sendMessage() {},
};

function makeDimension(id) {
  return {
    id,
    getEntities() { return []; },
    getBlock() { return undefined; },
    spawnItem() {},
    spawnEntity() { throw new Error("stub"); },
    spawnParticle() {},
    playSound() {},
  };
}

export const BlockPermutation = {};
export const ItemTypes = {};
export const TicksPerSecond = 20;

export function __harness() {
  return { intervals, timeouts, commands, beta: BETA };
}
