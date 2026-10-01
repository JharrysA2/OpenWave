import { describe, it, expect } from "vitest";
import {
  DEFAULT_ERROR_CODE,
  ERROR_CODES,
  describeError,
  codeForHttp,
  codeFromReason,
  formatErrorCode,
} from "./errorCodes";

describe("errorCodes — catálogo", () => {
  // ── Estructura ────────────────────────────────────────────────────────────

  it("todos los códigos tienen texto en es y en", () => {
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      expect(code, `${code} debe empezar por E-`).toMatch(/^E-[A-Z]+-\d{2}$/);
      expect(entry.es.title, `${code} es.title`).toBeTruthy();
      expect(entry.es.message, `${code} es.message`).toBeTruthy();
      expect(entry.en.title, `${code} en.title`).toBeTruthy();
      expect(entry.en.message, `${code} en.message`).toBeTruthy();
    }
  });

  it("el código por defecto existe en el catálogo", () => {
    expect(ERROR_CODES[DEFAULT_ERROR_CODE]).toBeTruthy();
    expect(DEFAULT_ERROR_CODE).toBe("E-UI-00");
  });

  // ── describeError ─────────────────────────────────────────────────────────

  it("describeError devuelve textos del código pedido", () => {
    const info = describeError("E-CNX-01");
    expect(info.code).toBe("E-CNX-01");
    expect(info.title).toBe(ERROR_CODES["E-CNX-01"].es.title);
    expect(info.message).toBe(ERROR_CODES["E-CNX-01"].es.message);
  });

  it("describeError soporta idioma en", () => {
    const info = describeError("E-YTM-01", "en");
    expect(info.title).toBe(ERROR_CODES["E-YTM-01"].en.title);
  });

  it("describeError con código desconocido devuelve el texto por defecto", () => {
    const info = describeError("E-XXX-99");
    expect(info.title).toBe(ERROR_CODES[DEFAULT_ERROR_CODE].es.title);
    // …pero conserva el código recibido para poder reportarlo
    expect(info.code).toBe("E-XXX-99");
  });

  it("describeError sin código usa E-UI-00", () => {
    expect(describeError(null).code).toBe(DEFAULT_ERROR_CODE);
    expect(describeError(undefined).code).toBe(DEFAULT_ERROR_CODE);
  });

  // ── codeForHttp ───────────────────────────────────────────────────────────

  it("codeForHttp: 5xx interno salvo que el cuerpo hable de YTMusic", () => {
    expect(codeForHttp(500)).toBe("E-INT-00");
    expect(codeForHttp(502, "bad gateway")).toBe("E-INT-00");
    expect(codeForHttp(503, "YTMusic no disponible")).toBe("E-YTM-01");
    expect(codeForHttp(404)).toBe("E-CNX-03");
    expect(codeForHttp(429, "rate limited")).toBe("E-CNX-03");
  });

  // ── codeFromReason ────────────────────────────────────────────────────────

  it("codeFromReason deriva de motivo legible", () => {
    expect(codeFromReason("Timeout")).toBe("E-CNX-02");
    expect(codeFromReason("HTTP 503")).toBe("E-INT-00");
    expect(codeFromReason("HTTP 503 YTMusic caído")).toBe("E-YTM-01");
    expect(codeFromReason("HTTP 404")).toBe("E-CNX-03");
    expect(codeFromReason("ECONNREFUSED")).toBe("E-CNX-01");
    expect(codeFromReason()).toBe("E-CNX-01");
  });

  // ── formatErrorCode ───────────────────────────────────────────────────────

  it("formatErrorCode envuelve el código entre paréntesis", () => {
    expect(formatErrorCode("E-CNX-01")).toBe("(E-CNX-01)");
    expect(formatErrorCode(null)).toBe("");
    expect(formatErrorCode(undefined)).toBe("");
  });
});
