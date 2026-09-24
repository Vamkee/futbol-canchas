import { z } from "zod";

import { HORA_REGEX } from "./constants";

const whatsappSchema = z
  .string()
  .min(7, "El número debe tener al menos 7 dígitos.")
  .max(15, "Número demasiado largo.")
  .regex(/^\+?[0-9]{7,15}$/, "Ingresa un número válido, ej. 573001234567");

export const crearReservaSchema = z.object({
  venueId: z.string().uuid("Sede inválida."),
  modalityCode: z.string().min(1, "Modalidad requerida."),
  spaceSlug: z.string().optional().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  horaInicio: z.string().regex(HORA_REGEX, "Hora inválida."),
  duracionMin: z.coerce.number().int().min(30).max(480),
  nombreCliente: z
    .string()
    .trim()
    .min(3, "Ingresa tu nombre completo (mínimo 3 caracteres).")
    .max(80, "El nombre es demasiado largo."),
  whatsapp: whatsappSchema,
});

export const submitPaymentSchema = z.object({
  codigo: z.string().min(6).max(6),
  token: z.string().min(10, "Falta la clave de acceso."),
  metodo: z.enum(["bank_transfer", "nequi", "daviplata", "cash", "other"]),
  monto: z.coerce.number().int().min(1, "Ingresa el monto transferido."),
  referencia: z.string().trim().max(40, "La referencia es demasiado larga.").optional().or(z.literal("")),
});

export const consultaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, "El código tiene 6 caracteres.")
    .max(6, "El código tiene 6 caracteres."),
  token: z.string().trim().min(10, "Pega la clave de acceso completa del link que recibiste."),
});

export const loginSchema = z.object({
  email: z.string().email("Correo inválido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export type CrearReservaInput = z.infer<typeof crearReservaSchema>;
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
