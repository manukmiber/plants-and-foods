/**
 * Modul Logger Terpusat (Ultra-Verbose).
 *
 * Aturan di add-on ini: TIDAK ADA jalur kode yang boleh diam. Setiap event,
 * setiap langkah kerja, setiap percabangan logika, setiap kegagalan API
 * Minecraft harus lewat sini. Selain menulis ke console (terlihat di
 * content log Minecraft), semua baris disimpan di ring buffer supaya bisa
 * ditarik lagi dari dalam game lewat menu companion — di HP dan di server
 * dedicated, content log tidak selalu bisa dibaca pemain.
 */

import { system, world } from "@minecraft/server";

export const LogLevel = {
  TRACE: -1,
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export const LOG_CONFIG = {
  enabled: true,
  minLevel: LogLevel.DEBUG,
  includeTick: true,
  // Kalau dihidupkan, tiap baris WARN/ERROR juga dikirim ke chat operator
  // yang menyalakannya — supaya error kelihatan tanpa membuka content log.
  echoToPlayers: false,
  bufferSize: 400,
};

const buffer = [];
const watchers = new Set(); // playerId yang minta log dikirim ke chat
const counters = { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };

function remember(line, levelStr) {
  counters[levelStr] = (counters[levelStr] ?? 0) + 1;
  buffer.push(line);
  while (buffer.length > LOG_CONFIG.bufferSize) buffer.shift();
}

function formatMessage(levelStr, tag, message, data) {
  const tickStr = LOG_CONFIG.includeTick ? `[T:${system.currentTick}]` : "";
  let extra = "";
  if (data !== undefined) {
    try {
      extra = typeof data === "object" ? ` | Data: ${JSON.stringify(data)}` : ` | Data: ${data}`;
    } catch {
      extra = " | Data: [Unserializable Object]";
    }
  }
  return `[VBS-${levelStr}]${tickStr}[${tag}] ${message}${extra}`;
}

function echo(line, levelStr) {
  if (!LOG_CONFIG.echoToPlayers || !watchers.size) return;
  if (levelStr !== "WARN" && levelStr !== "ERROR") return;
  const color = levelStr === "ERROR" ? "§c" : "§6";
  try {
    for (const player of world.getAllPlayers()) {
      if (watchers.has(player.id)) player.sendMessage(`${color}${line}`);
    }
  } catch {
    /* dunia belum siap, biarkan */
  }
}

function emit(levelStr, level, tag, message, data, sink) {
  if (!LOG_CONFIG.enabled || LOG_CONFIG.minLevel > level) return;
  const line = formatMessage(levelStr, tag, message, data);
  remember(line, levelStr);
  try {
    sink(line);
  } catch {
    /* console tidak tersedia di konteks ini */
  }
  echo(line, levelStr);
}

export function logTrace(tag, message, data) {
  emit("TRACE", LogLevel.TRACE, tag, message, data, (l) => console.log(l));
}

export function logDebug(tag, message, data) {
  emit("DEBUG", LogLevel.DEBUG, tag, message, data, (l) => console.log(l));
}

export function logInfo(tag, message, data) {
  emit("INFO", LogLevel.INFO, tag, message, data, (l) => console.info(l));
}

export function logWarn(tag, message, data) {
  emit("WARN", LogLevel.WARN, tag, message, data, (l) => console.warn(l));
}

export function logError(tag, message, err) {
  const detail = err instanceof Error ? `${err.message}\nStack: ${err.stack}` : err;
  emit("ERROR", LogLevel.ERROR, tag, message, detail, (l) => console.error(l));
}

/**
 * Pembungkus wajib untuk setiap callback event dan setiap denyut interval.
 * Tidak ada satu pun listener yang boleh dipasang tanpa lewat sini — kalau
 * satu listener melempar tanpa ditangkap, Minecraft mematikan seluruh mesin
 * skrip dan add-on mati diam-diam. Dengan guard() error-nya tercatat lengkap
 * beserta nama jalurnya, dan sisa sistem tetap jalan.
 */
export function guard(tag, what, fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      logError(tag, `Exception tidak tertangkap di "${what}"`, err);
      return undefined;
    }
  };
}

/** Menjalankan satu blok sekali, dengan pencatatan masuk/keluar dan error. */
export function attempt(tag, what, fn, fallback) {
  logTrace(tag, `-> masuk ${what}`);
  try {
    const out = fn();
    logTrace(tag, `<- keluar ${what}`);
    return out;
  } catch (err) {
    logError(tag, `Gagal menjalankan "${what}"`, err);
    return fallback;
  }
}

export function logEvent(tag, name, detail) {
  logInfo(tag, `EVENT ${name}`, detail);
}

export function recentLogs(limit = 30) {
  return buffer.slice(-limit);
}

export function logStats() {
  return { ...counters, buffered: buffer.length };
}

export function watchLogs(playerId, on) {
  if (on) {
    watchers.add(playerId);
    LOG_CONFIG.echoToPlayers = true;
  } else {
    watchers.delete(playerId);
    if (!watchers.size) LOG_CONFIG.echoToPlayers = false;
  }
  logInfo("LOGGER", `Pemantauan log untuk pemain ${playerId}: ${on ? "HIDUP" : "MATI"}`);
  return on;
}

export function isWatching(playerId) {
  return watchers.has(playerId);
}

export function setLogLevel(level) {
  LOG_CONFIG.minLevel = level;
  logInfo("LOGGER", `Level log minimum diubah ke: ${level}`);
}

export function entStr(entity) {
  if (!entity) return "null";
  try {
    const loc = entity.location
      ? `${entity.location.x.toFixed(1)},${entity.location.y.toFixed(1)},${entity.location.z.toFixed(1)}`
      : "?";
    return `${entity.typeId}#${entity.id}@(${loc})`;
  } catch {
    return `${entity.id ?? "unknown-entity"}`;
  }
}

export function posStr(pos) {
  if (!pos) return "null";
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}
