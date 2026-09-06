// Dunia voxel tiruan: cukup untuk menjalankan otak companion di luar Minecraft.
export function makeWorld({ groundY = 64, jagged = false } = {}) {
  const blocks = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;

  function surfaceFor(x, z) {
    if (!jagged) return groundY;
    return groundY + ((Math.abs(x * 7 + z * 13) % 5) - 2);
  }

  function baseType(x, y, z) {
    const top = surfaceFor(x, z);
    if (y > top) return "minecraft:air";
    if (y === top) return "minecraft:grass_block";
    if (y > top - 4) return "minecraft:dirt";
    if (y < -60) return "minecraft:bedrock";
    return "minecraft:stone";
  }

  const state = new Map();

  function block(x, y, z) {
    const k = key(x, y, z);
    const self = {
      x, y, z,
      get typeId() { return blocks.get(k) ?? baseType(x, y, z); },
      get isAir() { return self.typeId === "minecraft:air"; },
      get isLiquid() {
        const t = self.typeId;
        return t === "minecraft:water" || t === "minecraft:lava" ||
               t === "minecraft:flowing_water" || t === "minecraft:flowing_lava";
      },
      get location() { return { x, y, z }; },
      setType(id) {
        const value = typeof id === "string" ? id : id?.type ?? String(id);
        blocks.set(k, value);
        if (value === "minecraft:water") spread(x, y, z);
      },
      get permutation() {
        return {
          getState: (name) => state.get(`${k}:${name}`) ?? 0,
          withState: (name, v) => ({ __state: [k, name, v] }),
        };
      },
      setPermutation(p) {
        if (p?.__state) state.set(`${p.__state[0]}:${p.__state[1]}`, p.__state[2]);
      },
      getComponent(id) {
        if (id === "minecraft:inventory") return { container: chestAt(k) };
        if (id === "minecraft:sign") return { setText() {} };
        return undefined;
      },
    };
    return self;
  }

  // Perambatan air sederhana: sumber mengalir mendatar sampai tujuh blok ke
  // sel udara pada ketinggian yang sama, seperti air di Minecraft.
  function spread(sx, sy, sz) {
    const seen = new Set([`${sx},${sz}`]);
    let front = [[sx, sz, 0]];
    while (front.length) {
      const next = [];
      for (const [x, z, d] of front) {
        if (d >= 7) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          const nk = `${nx},${nz}`;
          if (seen.has(nk)) continue;
          seen.add(nk);
          const cur = blocks.get(key(nx, sy, nz)) ?? baseType(nx, sy, nz);
          if (cur !== "minecraft:air") continue;
          const under = blocks.get(key(nx, sy - 1, nz)) ?? baseType(nx, sy - 1, nz);
          if (under === "minecraft:air") continue;
          blocks.set(key(nx, sy, nz), "minecraft:flowing_water");
          next.push([nx, nz, d + 1]);
        }
      }
      front = next;
    }
  }

  const chests = new Map();
  function chestAt(k) {
    const t = blocks.get(k);
    if (t !== "minecraft:chest" && t !== "minecraft:barrel") return undefined;
    if (!chests.has(k)) chests.set(k, makeContainer());
    return chests.get(k);
  }

  // Entity yang "ada" di dunia ini. Dulu getEntities() selalu mengembalikan
  // daftar kosong, jadi seluruh kode yang mencari companion LAIN
  // (allCompanions -> hasHelper, ask.js mencari si penanya) tidak pernah
  // teruji sama sekali — dan justru di situ fitur barunya bekerja.
  const entities = [];

  const dimension = {
    id: "minecraft:overworld",
    __entities: entities,
    getBlock(pos) {
      if (pos.y < -64 || pos.y > 320) return undefined;
      return block(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    },
    getEntities(options = {}) {
      return entities.filter((e) => {
        if (e.isValid === false) return false;
        if (options.type && e.typeId !== options.type) return false;
        if (options.families &&
            !options.families.some((f) => (e.__families ?? []).includes(f))) return false;
        if (options.location && options.maxDistance !== undefined) {
          const dx = e.location.x - options.location.x;
          const dy = e.location.y - options.location.y;
          const dz = e.location.z - options.location.z;
          if (Math.hypot(dx, dy, dz) > options.maxDistance) return false;
        }
        return true;
      });
    },
    spawnItem() {},
    spawnParticle() {},
    playSound() {},
  };

  return {
    dimension, blocks, chests, surfaceFor, entities,
    put: (x, y, z, id) => blocks.set(key(x, y, z), id),
  };
}

export function makeContainer(size = 27) {
  const slots = new Array(size).fill(undefined);
  return {
    size,
    getItem(i) {
      const s = slots[i];
      return s ? { typeId: s.typeId, amount: s.amount } : undefined;
    },
    setItem(i, stack) {
      slots[i] = stack ? { typeId: stack.typeId, amount: stack.amount } : undefined;
    },
    addItem(stack) {
      for (let i = 0; i < size; i++) {
        if (slots[i] && slots[i].typeId === stack.typeId && slots[i].amount < 64) {
          const room = Math.min(64 - slots[i].amount, stack.amount);
          slots[i].amount += room;
          if (room === stack.amount) return undefined;
          stack = { typeId: stack.typeId, amount: stack.amount - room };
        }
      }
      for (let i = 0; i < size; i++) {
        if (!slots[i]) { slots[i] = { typeId: stack.typeId, amount: stack.amount }; return undefined; }
      }
      return stack;
    },
    fill(id, amount) { this.addItem({ typeId: id, amount }); return this; },
  };
}

export function makeCompanion(dimension, typeId, at) {
  const props = new Map();
  const entity = {
    id: `test-${typeId}`,
    typeId,
    __families: ["vbs_companion", "mob"],
    // Ditinjau minecraft:tameable bawaan: false sampai vbs:on_tamed menyala
    // (atau sampai uji menyalakannya sendiri, meniru mesin gim yang menerima
    // bunga dari tangan pemain).
    __tamed: false,
    isValid: true,
    dimension,
    location: { ...at },
    nameTag: "",
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => props.set(k, v),
    getProperty: () => 0,
    setProperty: () => {},
    getComponent(id) {
      if (id === "minecraft:health") return { currentValue: 20, effectiveMax: 20 };
      if (id === "minecraft:is_tamed") return entity.__tamed ? {} : undefined;
      if (id === "minecraft:tameable") return { isTamed: entity.__tamed };
      return undefined;
    },
    triggerEvent(event) {
      if (event === "vbs:on_tamed") entity.__tamed = true;
    },
    runCommand(cmd) {
      const m = /replaceitem entity @s slot\.weapon\.mainhand 0 (\S+)/.exec(cmd);
      if (m) entity.__hand = m[1];
      return { successCount: 1 };
    },
    teleport(pos) {
      entity.location = { x: pos.x, y: pos.y, z: pos.z };
    },
    getViewDirection() { return { x: 1, y: 0, z: 0 }; },
    remove() { entity.isValid = false; },
  };
  if (Array.isArray(dimension?.__entities)) dimension.__entities.push(entity);
  return entity;
}

/**
 * Pemain tiruan: cukup untuk menguji buku panduan (kantong, pesan chat) dan
 * perintah beta. Tidak meniru apa pun yang tidak dipakai add-on ini.
 */
export function makePlayer(dimension, { id = "P1", name = "Pemain", at = { x: 0, y: 65, z: 0 } } = {}) {
  const container = makeContainer(36);
  const messages = [];
  const player = {
    id,
    name,
    typeId: "minecraft:player",
    isValid: true,
    dimension,
    location: { ...at },
    isSneaking: false,
    selectedSlotIndex: 0,
    messages,
    container,
    getComponent(cid) {
      if (cid === "minecraft:inventory") return { container };
      if (cid === "minecraft:equippable") {
        return { getEquipment: () => player.__hand, setEquipment: (slot, item) => { player.__hand = item; } };
      }
      return undefined;
    },
    sendMessage(text) { messages.push(text); },
    playSound() {},
    teleport(pos) { player.location = { x: pos.x, y: pos.y, z: pos.z }; },
  };
  return player;
}
