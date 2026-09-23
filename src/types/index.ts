export const RESERVA_ESTADO = ["PENDIENTE_PAGO", "CONFIRMADA", "RECHAZADA", "CANCELADA"] as const;
export type ReservaEstado = (typeof RESERVA_ESTADO)[number];

export type EstadoFranja = "LIBRE" | "OCUPADA" | "BLOQUEADA";

export interface Cancha {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  direccion: string | null;
  fotos: string[];
  precio_por_hora: number;
  monto_anticipo: number;
  numero_nequi: string;
  horario_apertura: string; // "HH:mm:ss"
  horario_cierre: string;
  duracion_turno_min: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reserva {
  id: number;
  codigo: string;
  cancha_id: number;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string;
  hora_fin: string;
  nombre_cliente: string;
  whatsapp: string;
  valor_anticipo: number;
  estado: ReservaEstado;
  comprobante_url: string | null;
  referencia_pago: string | null;
  motivo_rechazo: string | null;
  expira_en: string | null;
  created_at: string;
  updated_at: string;
}

export interface Franja {
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoFranja;
}

export interface Bloqueo {
  id: number;
  cancha_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string;
  activo: boolean;
  created_at: string;
}

export interface ReservaConCancha extends Reserva {
  cancha: Pick<Cancha, "id" | "nombre" | "slug"> | null;
}

/** Subtipo que devuelve Supabase al hacer rpc("franjas_disponibles"). */
export type FranjaRow = { hora_inicio: string; hora_fin: string; estado: EstadoFranja };