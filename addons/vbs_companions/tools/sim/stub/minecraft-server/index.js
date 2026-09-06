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
export const system = {
  currentTick: 0,
  run(fn) { timeouts.push(fn); },
  runTimeout(fn) { timeouts.push(fn); },
  runInterval(fn, period) { intervals.push({ fn, period }); return intervals.length; },
  clearRun() {},
  afterEvents: { scriptEventReceive: { subscribe() {} } },
  beforeEvents: { watchdogTerminate: { subscribe() {} } },
};

function evt() { return { subscribe(fn) { this._fns = (this._fns ?? []).concat(fn); } }; }

const props = new Map();
export const world = {
  afterEvents: {
    entitySpawn: evt(), entityLoad: evt(), entityRemove: evt(), entityDie: evt(),
    entityHurt: evt(), playerInteractWithEntity: evt(), playerLeave: evt(),
    itemUseOn: evt(), playerInteractWithBlock: evt(), playerSpawn: evt(),
    worldLoad: evt(),
  },
  beforeEvents: { chatSend: evt() },
  getAllPlayers() { return []; },
  getDimension(id) { return makeDimension(id); },
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
  return { intervals, timeouts };
}
