import { formatFecha, formatHora } from "./utils";

/** "2026-09-25", "18:00:00" => "jueves, 25 sep 2026 · 6:00 p. m." */
export function formatoResumen(fecha: string, horaInicio: string) {
  return `${formatFecha(fecha)} · ${formatHora(horaInicio)}`;
}

/** Construye el enlace de WhatsApp pre-llenado (RF-05). */
export function whatsappLink(numero: string, mensaje: string) {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

/** Mensaje de WhatsApp para notificar la reserva al administrador. */
export function mensajeReservaToAdmin({
  codigo,
  canchaNombre,
  resumen,
  referencia,
}: {
  codigo: string;
  canchaNombre: string;
  resumen: string;
  referencia?: string | null;
}) {
  const lines = [
    `¡Hola! Hice una reserva y necesito que verifiquen mi pago.`,
    `Código de reserva: ${codigo}`,
    `Cancha: ${canchaNombre}`,
    `Turno: ${resumen}`,
    referencia ? `Referencia Nequi: ${referencia}` : null,
    `Por favor confírmenme el pago. Gracias.`,
  ].filter(Boolean);
  return lines.join("\n");
}