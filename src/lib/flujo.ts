/** Construye el enlace de WhatsApp pre-llenado. */
export function whatsappLink(numero: string, mensaje: string) {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

/** Mensaje de WhatsApp para notificar la reserva al administrador. */
export function mensajeReservaToAdmin({
  codigo,
  espacioNombre,
  resumen,
  referencia,
}: {
  codigo: string;
  espacioNombre: string;
  resumen: string;
  referencia?: string | null;
}) {
  const lines = [
    `¡Hola! Hice una reserva y necesito que verifiquen mi pago.`,
    `Código de reserva: ${codigo}`,
    `Espacio: ${espacioNombre}`,
    `Turno: ${resumen}`,
    referencia ? `Referencia: ${referencia}` : null,
    `Por favor confírmenme el pago. Gracias.`,
  ].filter(Boolean);
  return lines.join("\n");
}
