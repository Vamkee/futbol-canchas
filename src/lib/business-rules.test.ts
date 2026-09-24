import { describe, expect, it } from "vitest";

import { errorLegible } from "./business-rules";

describe("errorLegible", () => {
  it("traduce un código de error conocido embebido en el mensaje del RPC", () => {
    expect(errorLegible({ message: "Franja horaria ocupada (E_OCUPADA)" })).toBe(
      "Esa franja horaria acaba de ser tomada. Elige otra."
    );
  });

  it("traduce E_ESTADO sin confundirlo con otro código que lo contenga como substring", () => {
    expect(errorLegible({ message: "algo (E_ESTADO)" })).toBe(
      "La reserva no permite esa operación en su estado actual."
    );
  });

  it("devuelve el mensaje crudo si no reconoce ningún código", () => {
    expect(errorLegible({ message: "fallo desconocido" })).toBe("fallo desconocido");
  });

  it("devuelve el mensaje por defecto si el error no trae mensaje", () => {
    expect(errorLegible({})).toBe("Ocurrió un error inesperado. Inténtalo de nuevo.");
    expect(errorLegible(null)).toBe("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });

  it("acepta un string directo como código", () => {
    expect(errorLegible("E_NOTFOUND")).toBe("No encontramos una reserva con ese código y esa clave de acceso.");
  });
});
