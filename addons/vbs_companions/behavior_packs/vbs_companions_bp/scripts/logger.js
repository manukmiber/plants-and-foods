/**
 * Modul Logger Terpusat (Ultra-Verbose)
 * Mencatat segala aktivitas, eksekusi fungsi, percabangan logika, warning, dan error.
 */

import { system } from "@minecraft/server";

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export const LOG_CONFIG = {
  enabled: true,
  minLevel: LogLevel.DEBUG,
  includeTick: true,
};

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

export function logDebug(tag, message, data) {
  if (!LOG_CONFIG.enabled || LOG_CONFIG.minLevel > LogLevel.DEBUG) return;
  console.log(formatMessage("DEBUG", tag, message, data));
}

export function logInfo(tag, message, data) {
  if (!LOG_CONFIG.enabled || LOG_CONFIG.minLevel > LogLevel.INFO) return;
  console.info(formatMessage("INFO", tag, message, data));
}

export function logWarn(tag, message, data) {
  if (!LOG_CONFIG.enabled || LOG_CONFIG.minLevel > LogLevel.WARN) return;
  console.warn(formatMessage("WARN", tag, message, data));
}

export function logError(tag, message, err) {
  if (!LOG_CONFIG.enabled || LOG_CONFIG.minLevel > LogLevel.ERROR) return;
  const errDetail = err instanceof Error ? `${err.message}\nStack: ${err.stack}` : err;
  console.error(formatMessage("ERROR", tag, message, errDetail));
}

export function entStr(entity) {
  if (!entity) return "null";
  try {
    const loc = entity.location ? `${entity.location.x.toFixed(1)},${entity.location.y.toFixed(1)},${entity.location.z.toFixed(1)}` : "?";
    return `${entity.typeId}#${entity.id}@(${loc})`;
  } catch {
    return `${entity.id ?? "unknown-entity"}`;
  }
}

export function posStr(pos) {
  if (!pos) return "null";
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}
