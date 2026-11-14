import { describe, expect, it } from "vitest";
import { passwordStrength } from "@/domain/password-strength";

describe("passwordStrength", () => {
  it("non valuta una password vuota", () => {
    expect(passwordStrength("")).toEqual({ level: 0, label: null, hint: null });
  });

  it("segna come debole una password corta o molto comune", () => {
    expect(passwordStrength("abc")).toMatchObject({ level: 1, label: "debole", hint: "Allunga la password" });
    expect(passwordStrength("password1")).toMatchObject({ level: 1, label: "debole", hint: "Evita le password più comuni" });
    expect(passwordStrength("Password1!")).toMatchObject({ level: 1, label: "debole" });
  });

  it("sale di livello con lunghezza, maiuscole, numeri e simboli", () => {
    expect(passwordStrength("sololettere")).toMatchObject({ label: "discreta", hint: "Aggiungi un numero" });
    expect(passwordStrength("Esempio123")).toMatchObject({ label: "buona", hint: "Aggiungi un simbolo" });
    expect(passwordStrength("EsempioSicuro2026!")).toMatchObject({ level: 4, label: "ottima", hint: null });
  });

  it("penalizza ripetizioni e non blocca le password già ammesse dal server", () => {
    expect(passwordStrength("Aaaaaaaa1")).toMatchObject({ label: "debole", hint: "Evita i caratteri ripetuti" });
    // The submit rule only asks for 8 characters, a letter and a number.
    const allowed = passwordStrength("Esempio123");
    expect(allowed.level).toBeGreaterThanOrEqual(2);
  });
});
