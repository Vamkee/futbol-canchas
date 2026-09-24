import type { BookingStatus } from "@/types";

/** Bucket de almacenamiento de comprobantes de pago. */
export const BUCKET_COMPROBANTES = "payment-proofs";

/** Mensaje de reserva por defecto para el botón de WhatsApp. */
export const MENSAJE_WHATSAPP_DEFAULT = "Hola, quiero información sobre mi reserva de cancha.";

export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export const SITE_NAME = "Fútbol Reservas";

export const ESTADO_META: Record<BookingStatus, { label: string; badge: string; dot: string }> = {
  hold: {
    label: "Pendiente de pago",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  pending_review: {
    label: "En revisión",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    dot: "bg-sky-500",
  },
  pending_approval: {
    label: "Esperando aprobación",
    badge: "bg-violet-100 text-violet-800 border-violet-200",
    dot: "bg-violet-500",
  },
  confirmed: {
    label: "Confirmada",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
  },
  awaiting_closure: {
    label: "Por cerrar",
    badge: "bg-orange-100 text-orange-800 border-orange-200",
    dot: "bg-orange-500",
  },
  completed: {
    label: "Completada",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-500",
  },
  no_show: {
    label: "No llegó",
    badge: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
  },
  expired: {
    label: "Expirada",
    badge: "bg-slate-100 text-slate-500 border-slate-200",
    dot: "bg-slate-400",
  },
  cancelled: {
    label: "Cancelada",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
};

/** Estados visibles como "turno ocupado" en la agenda. */
export const ESTADOS_OCUPAN_TURNO: readonly BookingStatus[] = [
  "hold",
  "pending_review",
  "pending_approval",
  "confirmed",
  "awaiting_closure",
];

/** Códigos de error lanzados por el backend (Supabase RPC). */
export const ERROR_CODES = {
  OCUPADA: "E_OCUPADA",
  BLOQUEADA: "E_BLOQUEADA",
  EXPIRADA: "E_EXPIRADA",
  ESTADO: "E_ESTADO",
  NOTFOUND: "E_NOTFOUND",
  YA_COMPROBANTE: "E_YA_COMPROBANTE",
  HORARIO: "E_HORARIO",
  ESPACIO: "E_ESPACIO",
  SIN_TARIFA: "E_SIN_TARIFA",
  CAMBIO: "E_CAMBIO",
  PERM: "E_PERM",
} as const;

/** Mapa de errores a mensajes legibles para el cliente. */
export const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.OCUPADA]: "Esa franja horaria acaba de ser tomada. Elige otra.",
  [ERROR_CODES.BLOQUEADA]: "Esa franja está bloqueada por el establecimiento.",
  [ERROR_CODES.EXPIRADA]: "Se agotó el tiempo para pagar. La franja fue liberada; vuelve a reservar.",
  [ERROR_CODES.ESTADO]: "La reserva no permite esa operación en su estado actual.",
  [ERROR_CODES.NOTFOUND]: "No encontramos una reserva con ese código y esa clave de acceso.",
  [ERROR_CODES.YA_COMPROBANTE]: "Ya cargaste un comprobante para esta reserva. Espera la validación.",
  [ERROR_CODES.HORARIO]: "El horario elegido no está dentro de la parrilla del espacio.",
  [ERROR_CODES.ESPACIO]: "El espacio no está disponible.",
  [ERROR_CODES.SIN_TARIFA]: "No hay tarifa configurada para ese horario.",
  [ERROR_CODES.CAMBIO]: "Esta reserva ya no admite cambios.",
  [ERROR_CODES.PERM]: "No tienes permiso sobre este negocio.",
  default: "Ocurrió un error inesperado. Inténtalo de nuevo.",
};

/** Formato de hora "HH:mm". */
export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Motivos de rechazo de un comprobante (sección 7.2). */
export const MOTIVOS_RECHAZO = [
  { value: "wrong_amount", label: "Monto incorrecto" },
  { value: "unreadable", label: "Comprobante ilegible" },
  { value: "wrong_account", label: "Cuenta incorrecta" },
  { value: "not_found", label: "Transferencia no encontrada" },
  { value: "invalid", label: "Comprobante inválido" },
  { value: "duplicate", label: "Comprobante duplicado" },
] as const;
