import type { ReservaEstado } from "@/types";

/** RN-01: tiempo máximo (minutos) para cargar el comprobante Nequi. */
export const TIEMPO_BLOQUEO_MIN = 15;

/** RN-04: horas mínimas restantes para poder reprogramar/cancelar. */
export const HORAS_MIN_REPROGRAMACION = 6;

/** Bucket de almacenamiento de comprobantes Nequi. */
export const BUCKET_COMPROBANTES = "comprobantes";

/** Mensaje de reserva por defecto para el botón de WhatsApp (RF-05). */
export const MENSAJE_WHATSAPP_DEFAULT =
  "Hola, quiero información sobre mi reserva de cancha.";

export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export const SITE_NAME = "Fútbol Reservas";

export const ESTADO_META: Record<
  ReservaEstado,
  { label: string; badge: string; dot: string }
> = {
  PENDIENTE_PAGO: {
    label: "Pendiente de pago",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  CONFIRMADA: {
    label: "Confirmada",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
  },
  RECHAZADA: {
    label: "Rechazada",
    badge: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
  },
  CANCELADA: {
    label: "Cancelada",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
};

/** Estados visibles como "turno ocupado" en el calendario. */
export const ESTADOS_OCUPAN_TURNO: readonly ReservaEstado[] = [
  "PENDIENTE_PAGO",
  "CONFIRMADA",
];

/** Códigos de error lanzados por el backend (Supabase RPC). */
export const ERROR_CODES = {
  OCUPADA: "E_OCUPADA",
  BLOQUEADA: "E_BLOQUEADA",
  EXPIRADA: "E_EXPIRADA",
  REPROGRAMAR_6H: "E_REPROGRAMAR_6H",
  ESTADO: "E_ESTADO",
  NOTFOUND: "E_NOTFOUND",
  YA_COMPROBANTE: "E_YA_COMPROBANTE",
  HORARIO: "E_HORARIO",
  CANCHA: "E_CANCHA",
} as const;

/** Mapa de errores a mensajes legibles para el cliente. */
export const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.OCUPADA]: "Esa franja horaria acaba de ser tomada. Elige otra.",
  [ERROR_CODES.BLOQUEADA]: "Esa franja está bloqueada por el establecimiento.",
  [ERROR_CODES.EXPIRADA]:
    "Se agotaron los 15 minutos. La franja fue liberada; vuelve a reservar.",
  [ERROR_CODES.REPROGRAMAR_6H]:
    "Solo puedes reprogramar o cancelar si faltan más de 6 horas para el turno.",
  [ERROR_CODES.ESTADO]: "La reserva no permite esa operación en su estado actual.",
  [ERROR_CODES.NOTFOUND]: "No encontramos una reserva con ese código.",
  [ERROR_CODES.YA_COMPROBANTE]:
    "Ya cargaste un comprobante para esta reserva. Espera la validación.",
  [ERROR_CODES.HORARIO]: "El horario elegido no está dentro de la parrilla.",
  [ERROR_CODES.CANCHA]: "La cancha no está disponible.",
  default: "Ocurrió un error inesperado. Inténtalo de nuevo.",
};

/** Formato de hora de la parrilla (HH:mm). */
export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;