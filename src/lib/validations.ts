import { z } from "zod";

import { HORA_REGEX } from "./constants";

/** Validación PHONE: formato "+573001234567" sin espacios. */
const whatsappSchema = z
  .string()
  .min(7, "El número debe tener al menos 7 dígitos.")
  .max(15, "Número demasiado largo.")
  .regex(/^\+?[0-9]{7,15}$/, "Ingresa un número válido, ej. 573001234567");

export const crearReservaSchema = z.object({
  slug: z.string().min(1, "Cancha requerida."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  hora_inicio: z.string().regex(HORA_REGEX, "Hora inválida."),
  nombre_cliente: z
    .string()
    .trim()
    .min(3, "Ingresa tu nombre completo (mínimo 3 caracteres).")
    .max(80, "El nombre es demasiado largo."),
  whatsapp: whatsappSchema,
});

export const adjuntarComprobanteSchema = z.object({
  codigo: z.string().min(8).max(8),
  comprobante_url: z.string().url("El comprobante no es válido."),
  referencia_pago: z
    .string()
    .trim()
    .max(40, "La referencia es demasiado larga.")
    .optional()
    .or(z.literal("")),
});

export const consultaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .min(8, "El código tiene 8 caracteres.")
    .max(8, "El código tiene 8 caracteres."),
});

export const loginSchema = z.object({
  email: z.string().email("Correo inválido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export const reprogramarSchema = z.object({
  codigo: z.string().min(8).max(8),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  hora_inicio: z.string().regex(HORA_REGEX, "Hora inválida."),
});

export type CrearReservaInput = z.infer<typeof crearReservaSchema>;
export type AdjuntarComprobanteInput = z.infer<typeof adjuntarComprobanteSchema>;
export type LoginInput = z.infer<typeof loginSchema>;