import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  HORAS_MIN_REPROGRAMACION,
  TIEMPO_BLOQUEO_MIN,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "./constants";

/**
 * RN-01: fecha límite para cargar el comprobante.
 * Se calcula sobre la fecha de creación de la reserva.
 */
export function calcularExpiracion(creadaEn: string | Date) {
  const base = typeof creadaEn === "string" ? new Date(creadaEn) : creadaEn;
  return new Date(base.getTime() + TIEMPO_BLOQUEO_MIN * 60 * 1000);
}

/**
 * Horas restantes desde "ahora" hasta el inicio del turno.
 * fecha: "YYYY-MM-DD", horaInicio: "HH:mm:ss".
 */
export function horasRestantesParaTurno(fecha: string, horaInicio: string, nowMs = Date.now()) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = horaInicio.split(":").map(Number);
  const inicio = new Date(y, m - 1, d, hh, mm).getTime();
  return (inicio - nowMs) / (60 * 60 * 1000);
}

/** RN-04: ¿faltan más de 6 horas para poder reprogramar/cancelar? */
export function puedeReprogramar(fecha: string, horaInicio: string, nowMs = Date.now()) {
  return horasRestantesParaTurno(fecha, horaInicio, nowMs) > HORAS_MIN_REPROGRAMACION;
}

/** Convierte el mensaje de error de un RPC en texto legible. */
export function errorLegible(error: unknown): string {
  if (typeof error === "string") return ERROR_MESSAGES[error] ?? error;
  if (error && typeof error === "object") {
    const msg = (error as { message?: string }).message ?? "";
    for (const [code] of Object.entries(ERROR_CODES)) {
      const token = `(${code})`;
      if (msg.includes(token)) return ERROR_MESSAGES[code] ?? msg;
    }
    return msg || ERROR_MESSAGES.default;
  }
  return ERROR_MESSAGES.default;
}

/** Nota legible para test de la regla de 6 horas. Exportada por conveniencia. */
export const REPROGRAMACION_GRACE = HORAS_MIN_REPROGRAMACION;

/** Label corto de una fecha para listados. */
export function shortDate(fecha: string, nowTs: number) {
  return format(new Date(fecha), "EEE d MMM", { locale: es });
}

/** "HH:mm:ss" -> "HH:mm" para URL query / display. */
export function horaCorta(hora: string) {
  return hora.slice(0, 5);
}