import pino from "pino";
import type { AppConfig } from "../config/env";

export type AppLogger = pino.Logger;

export function createLogger(logLevel: AppConfig["logLevel"]): AppLogger {
  return pino({
    level: logLevel,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
