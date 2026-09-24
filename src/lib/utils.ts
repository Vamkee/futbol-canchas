import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BOGOTA_TZ = "America/Bogota";

/** Formatea un monto en pesos colombianos. */
export function formatCOP(monto: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(monto);
}

/** ISO timestamptz -> "2:30 p. m." en hora de Colombia (RNF16). */
export function formatHoraISO(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: BOGOTA_TZ,
  });
}

/** ISO timestamptz -> "sábado, 12 jul 2026" en hora de Colombia. */
export function formatFechaISO(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BOGOTA_TZ,
  });
}

/** Rango "2:00 p. m. – 3:00 p. m." a partir de dos ISO timestamptz. */
export function formatRangoISO(startsAt: string, endsAt: string) {
  return `${formatHoraISO(startsAt)} – ${formatHoraISO(endsAt)}`;
}

/** Fecha local "YYYY-MM-DD" (hora de Colombia) para <input type="date">. */
export function hoyLocal() {
  return new Date().toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

/** Construye un ISO timestamptz a partir de "YYYY-MM-DD" y "HH:mm" en hora de Colombia. */
export function bogotaISO(fecha: string, horaHHmm: string) {
  // America/Bogota es UTC-5 fijo, sin horario de verano (R4).
  return `${fecha}T${horaHHmm}:00-05:00`;
}
