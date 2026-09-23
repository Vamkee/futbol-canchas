import { describe, expect, it } from "vitest";

import {
  calcularExpiracion,
  horasRestantesParaTurno,
  puedeReprogramar,
} from "./business-rules";

describe("RN-01: temporizador de bloqueo de 15 minutos", () => {
  it("calcula expiración exactamente 15 min después de la creación", () => {
    const creadaEn = new Date("2026-09-22T10:00:00Z");
    const expira = calcularExpiracion(creadaEn);
    expect(expira.toISOString()).toBe("2026-09-22T10:15:00.000Z");
  });

  it("acepta fechas como string ISO", () => {
    const expira = calcularExpiracion("2026-09-22T10:00:00Z");
    expect(
      (expira.getTime() - new Date("2026-09-22T10:00:00Z").getTime()) / 60000
    ).toBe(15);
  });
});

describe("RN-04: política de reprogramación > 6 horas", () => {
  const fecha = "2026-09-25";
  const horaInicio = "18:00:00";
  const turnoMs = new Date(2026, 8, 25, 18, 0, 0).getTime();

  it("permite reprogramar con más de 6 horas de margen", () => {
    expect(puedeReprogramar(fecha, horaInicio, turnoMs - 7 * 60 * 60 * 1000)).toBe(true);
  });

  it("bloquea reprogramar en el límite exacto de 6 horas", () => {
    expect(puedeReprogramar(fecha, horaInicio, turnoMs - 6 * 60 * 60 * 1000)).toBe(false);
  });

  it("bloquea reprogramar con menos de 6 horas", () => {
    expect(puedeReprogramar(fecha, horaInicio, turnoMs - 2 * 60 * 60 * 1000)).toBe(false);
  });

  it("calcular horasRestantesParaTurno", () => {
    const horas = horasRestantesParaTurno(fecha, horaInicio, turnoMs - 24 * 60 * 60 * 1000);
    expect(horas).toBe(24);
  });
});