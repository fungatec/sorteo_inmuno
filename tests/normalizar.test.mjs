// Ejecutar: node tests/normalizar.test.mjs   (sin dependencias)
import assert from "node:assert/strict";
import {
  claveDeNombre, limpiarNombre, validarNombre, normalizarCorreo, esCorreoValido,
  compararConOficial, analizarLista, limpiarLineaLista, mensajeErrorNombre, mensajeErrorCorreo,
} from "../js/normalizar.js";

const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

caso("ejemplo del enunciado", () => {
  assert.equal(claveDeNombre("Julián Ramírez Soto"), "julian-ramirez-soto");
});
caso("distinto orden y mayúsculas dan la misma clave", () => {
  assert.equal(claveDeNombre("ramirez soto JULIAN"), claveDeNombre("Julián Ramírez Soto"));
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
  assert.equal(normalizarCorreo("  Julian.Ramirez0000@Alumnos.UDG.mx "), "julian.ramirez0000@alumnos.udg.mx");
  assert.ok(esCorreoValido("julian.ramirez0000@alumnos.udg.mx"));
  assert.ok(esCorreoValido(" JULIAN.RAMIREZ0000@ALUMNOS.UDG.MX "));
});
caso("correos inválidos", () => {
  for (const c of ["a@gmail.com", "a@alumnos.udg.mx.evil.com", "a@udg.mx", "@alumnos.udg.mx",
                   "a@@alumnos.udg.mx", "a b@alumnos.udg.mx".replace(" ", "/"), "", null]) {
    assert.equal(esCorreoValido(c), false, String(c));
  }
});

caso("compararConOficial", () => {
  const k = "julian-ramirez-soto";
  assert.equal(compararConOficial("Julián Ramírez Soto", "Julián Ramírez Soto", k), "ok");
  assert.equal(compararConOficial("julián  ramírez soto", "Julián Ramírez Soto", k), "ok");
  assert.equal(compararConOficial("Ramirez Soto Julian", "Julián Ramírez Soto", k), "difiere");
  assert.equal(compararConOficial("Pedro Troll", "Julián Ramírez Soto", k), "no-corresponde");
  assert.equal(compararConOficial("Julián Ramírez Soto", undefined, k), "sin-oficial");
});
caso("analizarLista: válidos, rechazados, repetidos y colisiones", () => {
  const txt = ["\uFEFFAna López", '"Ramírez Soto, Julián"', "ana lópez", "Ana", "",
    "María de los Ángeles", "Ángeles María", "Pérez-Gil Luis", "Luis Pérez Gil"].join("\r\n");
  const r = analizarLista(txt);
  assert.deepEqual(r.validos.map((v) => v.clave).sort(), ["ana-lopez", "julian-ramirez-soto"]);
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
  assert.equal(mensajeErrorCorreo(" Jul.Ramirez0000@Alumnos.UDG.mx "), "");
});

caso("nombres con < > & o comillas se rechazan (defensa contra inyección de HTML)", () => {
  for (const malo of ["<img src=x onerror=alert(1)>", "Ana <b>López</b>", "Ana & López", 'Ana "Lola" López',
    "Ana 'Lola' López", "Ana `López`", "Ana “López” Soto", "Ana ‘López’ Soto", "Ana López >"]) {
    assert.match(validarNombre(malo), /no puede contener/, malo);
    assert.match(mensajeErrorNombre(malo), /no puede contener/, malo);
  }
  for (const bueno of ["Ana López", "MARIA DE LA LUZ RIOS SOTO", "Íñigo Peña-Gil", "Ana M. López"]) assert.equal(validarNombre(bueno), "", bueno);
});
caso("limpiarLineaLista: viñetas, asteriscos, numeración, comillas y puntos finales", () => {
  const casos = {
    "• ANA LOPEZ SOTO": "ANA LOPEZ SOTO", "* ANA LOPEZ SOTO": "ANA LOPEZ SOTO", "- ANA LOPEZ SOTO": "ANA LOPEZ SOTO",
    "– ANA LOPEZ SOTO": "ANA LOPEZ SOTO", "***ANA LOPEZ SOTO": "ANA LOPEZ SOTO", "1. ANA LOPEZ SOTO": "ANA LOPEZ SOTO",
    "12) ANA LOPEZ SOTO": "ANA LOPEZ SOTO", "ANA LOPEZ SOTO.": "ANA LOPEZ SOTO", "ANA LOPEZ SOTO...": "ANA LOPEZ SOTO",
    "ANA LOPEZ SOTO,": "ANA LOPEZ SOTO", "ANA LOPEZ SOTO;": "ANA LOPEZ SOTO", '"ANA LOPEZ SOTO"': "ANA LOPEZ SOTO",
    "  •  ANA   LOPEZ  SOTO .  ": "ANA LOPEZ SOTO", "\tANA LOPEZ SOTO\r": "ANA LOPEZ SOTO",
    "- 3. ANA LOPEZ SOTO.": "ANA LOPEZ SOTO", "ANA M. LOPEZ SOTO": "ANA M. LOPEZ SOTO",   // los puntos interiores se conservan
  };
  for (const [entrada, esperado] of Object.entries(casos)) assert.equal(limpiarLineaLista(entrada), esperado, JSON.stringify(entrada));
  assert.equal(limpiarLineaLista(null), "");
});
caso("analizarLista: total leído, limpieza al guardar y rechazo de marcado", () => {
  const r = analizarLista(["• ANA LOPEZ SOTO.", "* LUIS PAZ LUNA", "", "<img src=x onerror=alert(1)>", "3. ROSA DEL PILAR MORA DIAZ,"].join("\n"));
  assert.equal(r.total, 4);                                                   // líneas con contenido
  assert.deepEqual(r.validos.map((v) => v.nombre), ["ANA LOPEZ SOTO", "LUIS PAZ LUNA", "ROSA DEL PILAR MORA DIAZ"]);
  assert.equal(r.rechazados.length, 1); assert.match(r.rechazados[0].motivo, /no puede contener/);
});

let fallos = 0;
for (const [nombre, fn] of casos) {
  try { fn(); console.log("ok   ", nombre); }
  catch (e) { fallos++; console.log("FALLA", nombre, "\n     ", e.message); }
}
console.log(`\n${casos.length - fallos}/${casos.length} pruebas pasaron`);
process.exit(fallos ? 1 : 0);
