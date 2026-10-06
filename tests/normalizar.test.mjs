// Ejecutar: node tests/normalizar.test.mjs   (sin dependencias)
import assert from "node:assert/strict";
import {
  claveDeNombre, limpiarNombre, validarNombre, normalizarCorreo, esCorreoValido,
  compararConOficial, analizarLista, mensajeErrorNombre, mensajeErrorCorreo,
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
caso("caracteres no alfabéticos se eliminan (apóstrofos y dígitos)", () => {
  assert.equal(claveDeNombre("María-José O'Brien 2do."), "do-jose-maria-obrien");
});
caso("guiones se convierten en espacio: Pérez-Gil ≡ Pérez Gil", () => {
  assert.equal(claveDeNombre("Pérez-Gil"), "gil-perez");
  assert.equal(claveDeNombre("Ana Pérez-Gil"), claveDeNombre("Gil Pérez Ana"));
  assert.equal(claveDeNombre("Ana Pérez–Gil"), "ana-gil-perez"); // guion largo
});
caso("tabuladores separan palabras (no las pegan)", () => {
  assert.equal(claveDeNombre("Ana\tLópez"), "ana-lopez");
});
caso("partículas se ignoran: María de los Ángeles", () => {
  assert.equal(claveDeNombre("María de los Ángeles"), "angeles-maria");
  assert.equal(claveDeNombre("Ángeles María"), "angeles-maria");
});
caso("partículas se ignoran: De la Cruz", () => {
  assert.equal(claveDeNombre("De la Cruz"), "cruz");
  assert.equal(claveDeNombre("Ana De La Cruz"), claveDeNombre("cruz ANA"));
});
caso("partículas: del, las, y", () => {
  assert.equal(claveDeNombre("Juan y Pedro del Río"), "juan-pedro-rio");
  assert.equal(claveDeNombre("Rosa de las Nieves"), "nieves-rosa");
});
caso("no se eliminan palabras que solo contienen una partícula", () => {
  assert.equal(claveDeNombre("Delia Lago"), "delia-lago");
  assert.equal(claveDeNombre("Yolanda Deloya"), "deloya-yolanda");
});
caso("solo partículas ⇒ clave vacía y nombre inválido", () => {
  assert.equal(claveDeNombre("de la"), "");
  assert.notEqual(validarNombre("de los y las"), "");
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

caso("compararConOficial", () => {
  const k = "gomez-jonathan-peregrina";
  assert.equal(compararConOficial("Jonathan Gómez Peregrina", "Jonathan Gómez Peregrina", k), "ok");
  assert.equal(compararConOficial("jonathan  gómez peregrina", "Jonathan Gómez Peregrina", k), "ok");
  assert.equal(compararConOficial("Gomez Peregrina Jonathan", "Jonathan Gómez Peregrina", k), "difiere");
  assert.equal(compararConOficial("Pedro Troll", "Jonathan Gómez Peregrina", k), "no-corresponde");
  assert.equal(compararConOficial("Jonathan Gómez Peregrina", undefined, k), "sin-oficial");
});
caso("analizarLista: válidos, rechazados, repetidos y colisiones", () => {
  const txt = ["\uFEFFAna López", '"Gómez Peregrina, Jonathan"', "ana lópez", "Ana", "",
    "María de los Ángeles", "Ángeles María", "Pérez-Gil Luis", "Luis Pérez Gil"].join("\r\n");
  const r = analizarLista(txt);
  assert.deepEqual(r.validos.map((v) => v.clave).sort(), ["ana-lopez", "gomez-jonathan-peregrina"]);
  assert.equal(r.repetidos, 1); // "ana lópez" repite a "Ana López"
  assert.equal(r.rechazados.length, 1); // "Ana" (3 caracteres)
  assert.deepEqual(r.colisiones.map((c) => c.clave).sort(), ["angeles-maria", "gil-luis-perez"]);
});

caso("mensajes de validación en vivo", () => {
  assert.equal(mensajeErrorNombre("   "), "Escribe tu nombre completo.");
  assert.match(mensajeErrorNombre("Ana"), /entre 5 y 100/);
  assert.equal(mensajeErrorNombre("Ana López"), "");
  assert.equal(mensajeErrorCorreo(""), "Escribe tu correo institucional.");
  assert.equal(mensajeErrorCorreo("jon@gmail.com"), "El correo debe ser @alumnos.udg.mx");
  assert.equal(mensajeErrorCorreo("jon@alumnos.udg.mx.com"), "El correo debe ser @alumnos.udg.mx");
  assert.match(mensajeErrorCorreo("@alumnos.udg.mx"), /^Revisa el correo/);
  assert.equal(mensajeErrorCorreo(" Jon.Gomez4016@Alumnos.UDG.mx "), "");
});

let fallos = 0;
for (const [nombre, fn] of casos) {
  try { fn(); console.log("ok   ", nombre); }
  catch (e) { fallos++; console.log("FALLA", nombre, "\n     ", e.message); }
}
console.log(`\n${casos.length - fallos}/${casos.length} pruebas pasaron`);
process.exit(fallos ? 1 : 0);
