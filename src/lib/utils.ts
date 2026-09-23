import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea un monto en pesos colombianos. */
export function formatCOP(monto: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(monto);
}

/** "14:30:00" -> "2:30 p. m.". */
export function formatHora(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  const period = h >= 12 ? "p. m." : "a. m.";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "YYYY-MM-DD" -> "sábado, 12 jul 2026". */
export function formatFecha(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Fecha local "YYYY-MM-DD" para <input type="date">. */
export function hoyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compara "HH:mm:ss" devolviendo -1 | 0 | 1. */
export function compareHora(a: string, b: string) {
  return a.localeCompare(b);
}

/** Convierte "HH:mm:ss" a minutos desde medianoche. */
export function horaAMinutos(hora: string) {
  const [h, m, s] = hora.split(":").map(Number);
  return h * 60 + m + (s ?? 0) / 60;
}

/** Devuelve true si el turno (fecha + hora local) aún no ha comenzado. */
export function esTurnoFuturo(fecha: string, horaInicio: string, nowMs: number): boolean {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = horaInicio.split(":").map(Number);
  const inicio = new Date(y, m - 1, d, hh, mm).getTime();
  return inicio - nowMs > 5 * 60 * 1000;
}