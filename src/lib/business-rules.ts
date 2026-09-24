import { ERROR_CODES, ERROR_MESSAGES } from "./constants";

/** Convierte el mensaje de error de un RPC en texto legible. */
export function errorLegible(error: unknown): string {
  if (typeof error === "string") return ERROR_MESSAGES[error] ?? error;
  if (error && typeof error === "object") {
    const msg = (error as { message?: string }).message ?? "";
    // Nota: se itera sobre los VALORES de ERROR_CODES (p. ej. "E_OCUPADA"),
    // no sobre las claves ("OCUPADA"); el código anterior comparaba contra
    // las claves y nunca hacía match, así que el usuario siempre veía el
    // mensaje crudo de Postgres en vez del mensaje traducido.
    for (const code of Object.values(ERROR_CODES)) {
      if (msg.includes(`(${code})`)) return ERROR_MESSAGES[code] ?? msg;
    }
    return msg || ERROR_MESSAGES.default;
  }
  return ERROR_MESSAGES.default;
}
