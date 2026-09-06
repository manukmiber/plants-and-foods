/**
 * Menjinakkan companion dengan satu bunga.
 *
 * Yang berubah dari versi lama, dan kenapa:
 *
 * Dulu `tame_items` di berkas entity sengaja dikosongkan dan SELURUH taming
 * diserahkan ke script — pemain mengklik, script mengambil bunganya sendiri,
 * lalu memanggil `EntityTameableComponent.tame()`. Dua hal membuat itu tidak
 * pernah bekerja di dunia sungguhan:
 *
 *   1. `tame()` tidak selalu ada di modul @minecraft/server versi stabil, jadi
 *      companion tidak pernah benar-benar jinak di mata mesin gim dan
 *      behavior.follow_owner tidak punya tuan.
 *   2. Bunga di tangan dibaca lewat `player.selectedSlotIndex` saja. Kalau
 *      properti itu tidak ada (atau isinya bukan slot yang sedang dipegang),
 *      bunganya tidak pernah ketemu dan yang muncul cuma pesan "companion ini
 *      masih liar" — persis keluhannya.
 *
 * Sekarang jalur utamanya adalah TAMING BAWAAN MESIN GIM: `tame_items` di
 * entity berisi daftar bunga (config.js TAME_ITEMS), gim yang menghabiskan
 * bunganya dan menyalakan `vbs:on_tamed`, dan event itu memasang grup
 * `vbs:tamed` yang isinya `minecraft:is_tamed`. Script cuma menunggu penanda
 * itu muncul, lalu mencatat siapa pemiliknya.
 *
 * Jalur script tetap ada sebagai CADANGAN, untuk bunga di FLOWERS yang tidak
 * ada di TAME_ITEMS (mis. pink_petals) dan untuk dunia yang entity-nya belum
 * ikut diperbarui. Bunga di tangan sekarang dicari dari tiga sumber, bukan satu.
 */

import { system } from "@minecraft/server";
import { FLOWERS, TAME_ITEMS } from "./config.js";
import { getOwnerId, particle, setOwner } from "./util.js";
import { entStr, logDebug, logInfo, logWarn } from "./logger.js";

const TAG = "TAMING";

// Berapa lama script menunggu mesin gim menyelesaikan taming-nya sendiri
// sebelum mengambil alih. 20 tick = 1 detik; taming bawaan selesai di tick
// yang sama, jadi ini kelonggaran, bukan jeda yang terasa.
const WAIT_TICKS = 20;

// entityId -> { playerId, playerName, since, vanilla }
const pending = new Map();

export function isFlowerStack(stack) {
  return Boolean(stack) && FLOWERS.has(stack.typeId);
}

/** Bunga yang sedang dipegang pemain, dicari dari tiga sumber berbeda. */
export function heldFlower(player, fromEvent) {
  // 1. Item yang ikut di dalam event interaksi — paling bisa dipercaya, karena
  //    ini persis item yang dipakai mengklik companion.
  if (isFlowerStack(fromEvent)) return fromEvent;
  // 2. Tangan utama lewat komponen equippable.
  try {
    const worn = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    if (isFlowerStack(worn)) return worn;
  } catch (e) {
    logDebug(TAG, `Tangan ${player?.name} tidak terbaca lewat equippable.`, e);
  }
  // 3. Slot terpilih di kantong. Nama propertinya berganti antar versi, jadi
  //    keduanya dicoba.
  const slot = selectedSlot(player);
  if (slot === undefined) return undefined;
  try {
    const stack = player.getComponent("minecraft:inventory")?.container?.getItem(slot);
    if (isFlowerStack(stack)) return stack;
  } catch (e) {
    logWarn(TAG, `Gagal membaca slot ${slot} di kantong ${player?.name}`, e);
  }
  return undefined;
}

function selectedSlot(player) {
  const index = player?.selectedSlotIndex ?? player?.selectedSlot;
  return typeof index === "number" ? index : undefined;
}

/** Sudah jinak di mata MESIN GIM (bukan sekadar tercatat di dynamic property)? */
export function isTamed(entity) {
  try {
    if (entity.getComponent("minecraft:is_tamed")) return true;
  } catch (e) {
    logDebug(TAG, `Komponen is_tamed tidak terbaca pada ${entStr(entity)}.`, e);
  }
  for (const id of ["minecraft:tameable", "minecraft:tamable"]) {
    try {
      const comp = entity.getComponent(id);
      if (comp?.isTamed === true) return true;
    } catch { /* komponen tidak ada di versi ini */ }
  }
  return false;
}

/** Jalur cadangan: paksa taming lewat script, sekaligus habiskan bunganya. */
function tameByScript(entity, player) {
  let tamed = false;
  for (const id of ["minecraft:tameable", "minecraft:tamable"]) {
    try {
      const comp = entity.getComponent(id);
      if (comp && typeof comp.tame === "function") {
        tamed = comp.tame(player) !== false;
        logInfo(TAG, `Taming lewat script (${id}) untuk ${entStr(entity)}: ${tamed}`);
        break;
      }
    } catch (e) {
      logWarn(TAG, `Gagal memanggil tame() pada komponen ${id}`, e);
    }
  }
  if (!tamed) {
    // Mesin gim menolak/tidak punya jalurnya: pakai event entity-nya langsung,
    // supaya grup vbs:tamed dan vbs:mode_follow tetap terpasang.
    try {
      entity.triggerEvent("vbs:on_tamed");
      logInfo(TAG, `vbs:on_tamed dipicu manual untuk ${entStr(entity)}.`);
      tamed = true;
    } catch (e) {
      logWarn(TAG, `Gagal memicu vbs:on_tamed pada ${entStr(entity)}`, e);
    }
  }
  return tamed;
}

function consumeOne(player, stack) {
  const slot = selectedSlot(player);
  try {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container || slot === undefined) return false;
    const current = container.getItem(slot);
    if (!current || current.typeId !== stack.typeId) return false;
    if (current.amount > 1) {
      current.amount -= 1;
      container.setItem(slot, current);
    } else {
      container.setItem(slot, undefined);
    }
    logDebug(TAG, `Satu ${stack.typeId} diambil dari tangan ${player.name}.`);
    return true;
  } catch (e) {
    logWarn(TAG, `Gagal mengurangi bunga dari tangan ${player?.name}`, e);
    return false;
  }
}

/**
 * Pemain mengklik companion liar sambil memegang bunga.
 *
 * Balikannya true kalau bunganya memang ada dan proses menjinakkan sudah
 * dimulai — pemanggil tidak perlu lagi menampilkan pesan petunjuk.
 * Pencatatan pemilik terjadi di tickTaming(), sesudah mesin gim selesai.
 */
export function offerFlower(entity, player, fromEvent) {
  if (getOwnerId(entity)) return false;
  const stack = heldFlower(player, fromEvent);
  if (!stack) return false;

  const vanilla = TAME_ITEMS.has(stack.typeId);
  logInfo(TAG, `${player.name} memberi ${stack.typeId} ke ${entStr(entity)} ` +
    `(taming ${vanilla ? "bawaan gim" : "lewat script"}).`);

  if (!vanilla) {
    // Bunga di luar tame_items: gim tidak akan menyentuhnya, jadi script yang
    // menghabiskan bunganya sekarang juga.
    consumeOne(player, stack);
    tameByScript(entity, player);
  }

  pending.set(entity.id, {
    playerId: player.id,
    playerName: player.name,
    since: system.currentTick,
    vanilla,
    flower: stack.typeId,
  });
  return true;
}

/**
 * Denyut cepat: mencatat pemilik begitu mesin gim menyatakan companion jinak.
 *
 * `claim` adalah fungsi dari main.js yang mengerjakan sisanya (bootstrap mode,
 * senjata, nama, sapaan) — dipisah supaya modul ini tidak perlu meng-import
 * setengah add-on cuma untuk satu panggilan.
 */
export function tickTaming(byId, players, claim) {
  sweepUnclaimed(byId, players, claim);
  if (!pending.size) return;
  for (const [id, row] of [...pending.entries()]) {
    const entity = byId.get(id);
    if (!entity) {
      pending.delete(id);
      continue;
    }
    if (getOwnerId(entity)) {
      pending.delete(id);
      continue;
    }
    const player = players.find((p) => p.id === row.playerId);
    const waited = system.currentTick - row.since;

    if (isTamed(entity)) {
      pending.delete(id);
      if (!player) {
        logWarn(TAG, `${entStr(entity)} jinak tapi pemainnya sudah tidak ada; pemilik tidak dicatat.`);
        continue;
      }
      finish(entity, player, claim);
      continue;
    }

    if (waited < WAIT_TICKS) continue;

    // Mesin gim tidak juga menjinakkannya — biasanya karena entity di dunia ini
    // masih versi lama yang tame_items-nya kosong. Script yang mengambil alih,
    // termasuk menghabiskan bunganya (yang tadi tidak jadi diambil gim).
    pending.delete(id);
    if (!player) continue;
    logWarn(TAG, `Taming bawaan tidak terjadi untuk ${entStr(entity)} sesudah ` +
      `${waited} tick; script mengambil alih.`);
    const stack = heldFlower(player);
    if (stack) consumeOne(player, stack);
    tameByScript(entity, player);
    finish(entity, player, claim);
  }
}

/**
 * Jaring pengaman: companion yang JINAK di mata mesin gim tapi belum punya
 * pemilik tercatat.
 *
 * Ini bukan kemungkinan teoretis. Taming bawaan diselesaikan mesin gim sendiri,
 * dan tidak ada janji bahwa `playerInteractWithEntity` ikut menyala untuk
 * interaksi yang dipakai gim untuk menjinakkan. Kalau event-nya tidak sampai,
 * offerFlower() tidak pernah terpanggil, tidak ada entri pending — dan
 * companion akan berdiri jinak tanpa pemilik, tidak mau bekerja, selamanya.
 *
 * Yang diambil pemain terdekat dalam jangkauan tangan: satu-satunya orang yang
 * mungkin baru saja memberinya bunga.
 */
function sweepUnclaimed(byId, players, claim) {
  if (!players?.length) return;
  for (const entity of byId.values()) {
    if (getOwnerId(entity)) continue;
    if (pending.has(entity.id)) continue;
    if (!isTamed(entity)) continue;
    const near = nearestPlayer(entity, players);
    if (!near) continue;
    logWarn(TAG, `${entStr(entity)} jinak tanpa pemilik tercatat (event interaksi ` +
      `tidak sampai?); dicatatkan ke ${near.name}.`);
    finish(entity, near, claim);
  }
}

function nearestPlayer(entity, players, radius = 6) {
  let best = radius ** 2;
  let found;
  for (const player of players) {
    if (player.dimension?.id !== entity.dimension?.id) continue;
    const dx = player.location.x - entity.location.x;
    const dy = player.location.y - entity.location.y;
    const dz = player.location.z - entity.location.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > best) continue;
    best = d2;
    found = player;
  }
  return found;
}

function finish(entity, player, claim) {
  setOwner(entity, player);
  logInfo(TAG, `${entStr(entity)} sekarang milik ${player.name}.`);
  particle(entity.dimension, "minecraft:heart_particle", {
    x: entity.location.x, y: entity.location.y + 2.1, z: entity.location.z,
  });
  try {
    player.playSound("random.eat", { location: player.location });
  } catch { /* suara opsional */ }
  claim(entity, player);
}

export function forget(id) {
  pending.delete(id);
}

/** Dipakai uji: berapa banyak taming yang sedang ditunggu. */
export function pendingCount() {
  return pending.size;
}
