// Ejecutar: node tests/normalizar.test.mjs   (sin dependencias)
import assert from "node:assert/strict";
import {
  claveDeNombre, limpiarNombre, validarNombre, normalizarCorreo, esCorreoValido,
} from "../js/normalizar.js";

const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

caso("ejemplo del enunciado", () => {
  assert.equal(claveDeNombre("Jonathan Gómez Peregrina"), "gomez-jonathan-peregrina");
});
caso("distinto orden y mayúsculas dan la misma clave", () => {
  assert.equal(claveDeNombre("gomez peregrina JONATHAN"), claveDeNombre("Jonathan Gómez Peregrina"));
});
caso("acentos y diéresis", () => {
  assert.equal(claveDeNombre("Ángel Müller Ávila"), "angel-avila-muller");
});
caso("ñ se convierte en n", () => {
  assert.equal(claveDeNombre("Íñigo Peña"), "inigo-pena");
  assert.equal(claveDeNombre("Muñoz"), "munoz");
});
caso("espacios dobles, tabuladores y bordes", () => {
  assert.equal(claveDeNombre("  Ana   María \t López  "), "ana-lopez-maria");
});
caso("caracteres no alfabéticos se eliminan", () => {
  assert.equal(claveDeNombre("María-José O'Brien 2do."), "do-mariajose-obrien");
});
caso("entradas sin letras dan clave vacía", () => {
  assert.equal(claveDeNombre("  123 -- "), "");
  assert.equal(claveDeNombre(undefined), "");
});
caso("la clave cumple el patrón de las reglas", () => {
  for (const n of ["José Ñandú", "de la Cruz Pérez", "Ana"]) {
    assert.match(claveDeNombre(n), /^[a-z]+(-[a-z]+)*$/);
  }
});
caso("limpiarNombre recorta y colapsa", () => {
  assert.equal(limpiarNombre("  Ana   López "), "Ana López");
});
caso("validarNombre: longitud", () => {
  assert.notEqual(validarNombre("Ana"), "");
  assert.notEqual(validarNombre("x".repeat(101)), "");
  assert.equal(validarNombre("Ana López"), "");
  assert.notEqual(validarNombre("12345 678"), "");
});
caso("correo válido y normalización", () => {
  assert.equal(normalizarCorreo("  Jonathan.Gomez4016@Alumnos.UDG.mx "), "jonathan.gomez4016@alumnos.udg.mx");
  assert.ok(esCorreoValido("jonathan.gomez4016@alumnos.udg.mx"));
  assert.ok(esCorreoValido(" JONATHAN.GOMEZ4016@ALUMNOS.UDG.MX "));
});
caso("correos inválidos", () => {
  for (const c of ["a@gmail.com", "a@alumnos.udg.mx.evil.com", "a@udg.mx", "@alumnos.udg.mx",
                   "a@@alumnos.udg.mx", "a b@alumnos.udg.mx".replace(" ", "/"), "", null]) {
    assert.equal(esCorreoValido(c), false, String(c));
  }
});

let fallos = 0;
for (const [nombre, fn] of casos) {
  try { fn(); console.log("ok   ", nombre); }
  catch (e) { fallos++; console.log("FALLA", nombre, "\n     ", e.message); }
}
console.log(`\n${casos.length - fallos}/${casos.length} pruebas pasaron`);
process.exit(fallos ? 1 : 0);
