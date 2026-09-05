/**
 * Kantong pribadi companion, dibungkus supaya bentuknya sama persis dengan
 * `Container` peti Minecraft (size / getItem / setItem / addItem).
 *
 * Gunanya: sekarang peti stasiun TIDAK lagi muncul dari udara — companion
 * harus punya delapan papan dulu untuk merakitnya. Selama petinya belum ada,
 * semua kode yang sudah menerima sebuah `container` (menempa alat, menyimpan
 * panen, menghitung bahan) tetap jalan apa adanya dengan kantong ini sebagai
 * gantinya. Begitu peti berdiri, isi kantong dipindahkan ke sana.
 *
 * Isi kantong hidup di `state.bag` — dynamic property yang sudah ikut disimpan
 * bersama state companion, jadi tidak hilang saat dunia ditutup.
 */

import { makeItem } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "BAG";
const STACK = 64;
const SLOTS = 36;

function slotsFrom(bag) {
  const out = [];
  for (const [id, amount] of Object.entries(bag)) {
    let left = amount;
    while (left > 0) {
      const take = Math.min(STACK, left);
      out.push({ id, amount: take });
      left -= take;
    }
  }
  return out;
}

function bagFrom(slots) {
  const out = {};
  for (const slot of slots) {
    if (!slot || slot.amount <= 0) continue;
    out[slot.id] = (out[slot.id] ?? 0) + slot.amount;
  }
  return out;
}

class BagContainer {
  constructor(state, label) {
    if (!state.bag || typeof state.bag !== "object") state.bag = {};
    this.state = state;
    this.label = label;
    this.slots = slotsFrom(state.bag);
    this.isBag = true;
  }

  get size() {
    return SLOTS;
  }

  get emptySlotsCount() {
    return Math.max(0, SLOTS - this.slots.length);
  }

  sync() {
    this.state.bag = bagFrom(this.slots);
  }

  getItem(index) {
    const slot = this.slots[index];
    if (!slot || slot.amount <= 0) return undefined;
    return makeItem(slot.id, slot.amount);
  }

  // Indeks slot TIDAK pernah bergeser saat diubah — util.takeFrom() menyapu
  // container sambil menulis balik, jadi memadatkan array di tengah sapuan
  // akan membuat sebagian isi kantong terlewat.
  setItem(index, stack) {
    if (index < 0 || index >= SLOTS) {
      logWarn(TAG, `setItem di luar jangkauan kantong: index ${index}`);
      return;
    }
    this.slots[index] = stack ? { id: stack.typeId, amount: stack.amount } : undefined;
    this.sync();
  }

  addItem(stack) {
    if (!stack) return undefined;
    let left = stack.amount;
    for (let i = 0; i < SLOTS && left > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === stack.typeId && slot.amount < STACK) {
        const room = Math.min(STACK - slot.amount, left);
        slot.amount += room;
        left -= room;
      } else if (!slot) {
        const room = Math.min(STACK, left);
        this.slots[i] = { id: stack.typeId, amount: room };
        left -= room;
      }
    }
    this.sync();
    if (left > 0) {
      logWarn(TAG, `Kantong ${this.label} penuh, sisa ${left}x ${stack.typeId} tidak muat.`);
      return makeItem(stack.typeId, left);
    }
    logDebug(TAG, `Kantong ${this.label}: +${stack.amount} ${stack.typeId}`);
    return undefined;
  }

  count() {
    return this.slots.reduce((a, s) => a + (s?.amount ?? 0), 0);
  }
}

/** Kantong pribadi companion sebagai container. */
export function bagContainer(entity, state) {
  return new BagContainer(state, entStr(entity));
}

export function bagCount(state) {
  return Object.values(state.bag ?? {}).reduce((a, b) => a + b, 0);
}

/**
 * Pindahkan seluruh isi kantong ke peti sungguhan. Dipanggil begitu peti
 * stasiun akhirnya berdiri, supaya bahan yang sudah dikumpulkan tidak
 * tertinggal di kantong dan tidak terlihat pemain.
 */
export function emptyBagInto(entity, state, container, where) {
  const bag = state.bag ?? {};
  const ids = Object.keys(bag);
  if (!ids.length || !container) return 0;
  let moved = 0;
  for (const id of ids) {
    let left = bag[id];
    while (left > 0) {
      const take = Math.min(STACK, left);
      const item = makeItem(id, take);
      if (!item) break;
      const rest = container.addItem(item);
      if (rest) {
        try {
          entity.dimension.spawnItem(rest, where ?? entity.location);
        } catch (e) {
          logWarn(TAG, `Gagal menjatuhkan sisa ${id} dari kantong`, e);
        }
      }
      left -= take;
      moved += take;
    }
    delete bag[id];
  }
  state.bag = bag;
  logInfo(TAG, `${entStr(entity)} memindahkan ${moved} barang dari kantong ke peti.`);
  return moved;
}
