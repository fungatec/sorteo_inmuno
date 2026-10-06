// Ejecutar: node tests/sorteo-util.test.mjs
import assert from "node:assert/strict";
import { enmascararNombre, textoRegistroSorteo, nombreArchivoRegistro } from "../js/sorteo-util.js";

assert.equal(enmascararNombre("Julián Ramírez Soto"), "Julián R. S.");
assert.equal(enmascararNombre("JULIÁN RAMÍREZ SOTO"), "Julián R. S.");   // lista en mayúsculas
assert.equal(enmascararNombre("María de los Ángeles Ruiz"), "María Á. R.");      // sin partículas
assert.equal(enmascararNombre("Ana López"), "Ana L.");
assert.equal(enmascararNombre("Ana"), "Ana");
assert.equal(enmascararNombre("  Ana   de la  Cruz "), "Ana C.");
assert.equal(enmascararNombre("Óscar Pérez-Gil"), "Óscar P.");
assert.equal(enmascararNombre(""), "");
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
