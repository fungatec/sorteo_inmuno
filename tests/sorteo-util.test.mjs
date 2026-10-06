// Ejecutar: node tests/sorteo-util.test.mjs
import assert from "node:assert/strict";
import { enmascararNombre, formatoTitulo, textoRegistroSorteo, nombreArchivoRegistro } from "../js/sorteo-util.js";

assert.equal(enmascararNombre("Julián Ramírez Soto"), "Julián R. S.");
assert.equal(enmascararNombre("JULIÁN RAMÍREZ SOTO"), "Julián R. S.");   // lista en mayúsculas
assert.equal(enmascararNombre("María de los Ángeles Ruiz"), "María Á. R.");      // sin partículas
assert.equal(enmascararNombre("Ana López"), "Ana L.");
assert.equal(enmascararNombre("Ana"), "Ana");
assert.equal(enmascararNombre("  Ana   de la  Cruz "), "Ana C.");
assert.equal(enmascararNombre("Óscar Pérez-Gil"), "Óscar P.");
assert.equal(enmascararNombre(""), "");

// Lista oficial en MAYÚSCULAS, sin acentos, "Nombre Apellidos" (3 a 6 palabras). Nombres ficticios con la
// misma estructura que los casos reales (partículas Y / DE / DEL; la primera palabra es el nombre de pila).
assert.equal(enmascararNombre("MARTA ELENA RIOS Y VEGA SOTO"), "Marta E. R. V. S.");        // 6 palabras, "Y" omitida
assert.equal(enmascararNombre("JULIO DE BELEN ORTIZ PAZ"), "Julio B. O. P.");              // "DE" omitida
assert.equal(enmascararNombre("ROSA DEL PILAR MORA DIAZ"), "Rosa P. M. D.");               // "DEL" omitida
assert.equal(enmascararNombre("LUIS PAZ LUNA"), "Luis P. L.");                              // 3 palabras
assert.equal(enmascararNombre("ANA ELENA LUZ SOTO RIOS DIAZ"), "Ana E. L. S. R. D.");      // 6 palabras sin partículas
assert.equal(enmascararNombre("MARIA DE LA LUZ RIOS SOTO"), "Maria L. R. S.");             // "DE LA" omitidas

// Formato título del nombre completo (tecla N)
assert.equal(formatoTitulo("MARTA ELENA RIOS Y VEGA SOTO"), "Marta Elena Rios y Vega Soto");
assert.equal(formatoTitulo("JULIO DE BELEN ORTIZ PAZ"), "Julio de Belen Ortiz Paz");
assert.equal(formatoTitulo("ROSA DEL PILAR MORA DIAZ"), "Rosa del Pilar Mora Diaz");
assert.equal(formatoTitulo("  ana   PEREZ-GIL "), "Ana Perez-Gil");
assert.equal(formatoTitulo("DE LA CRUZ ANA"), "De la Cruz Ana");                            // la primera palabra siempre con mayúscula
assert.equal(formatoTitulo(""), "");
assert.ok(!/\d/.test(enmascararNombre("Julián Ramírez Soto")), "la máscara no lleva dígitos");

const txt = textoRegistroSorteo({
  generado: new Date(2026, 9, 6, 12, 0, 0),
  sorteos: [
    { ronda: 2, fecha: new Date(2026, 9, 6, 11, 5, 0), totalParticipantes: 37, ganadorClave: "b", adminUid: "UID1" },
    { ronda: 1, fecha: { toDate: () => new Date(2026, 9, 6, 11, 0, 0) }, totalParticipantes: 38, ganadorClave: "a", adminUid: "UID1" },
  ],
  nombreDe: (c) => (c === "a" ? { nombre: "Julián Ramírez Soto", oficial: true } : { nombre: "Pedro Pérez", oficial: false }),
});
assert.ok(txt.indexOf("Ronda 1") < txt.indexOf("Ronda 2"), "ordenado por ronda");
for (const frag of ["Rondas registradas: 2", "Total de participantes en la ronda: 38", "Total de participantes en la ronda: 37",
  "Ganador (nombre oficial): Julián Ramírez Soto", "Pedro Pérez [fuera de la lista oficial]", "UID del admin): UID1"])
  assert.ok(txt.includes(frag), frag);
assert.equal(nombreArchivoRegistro(new Date(2026, 9, 6)), "registro-sorteo-2026-10-06.txt");
console.log("sorteo-util: ok");
