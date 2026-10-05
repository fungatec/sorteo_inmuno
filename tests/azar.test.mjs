// Ejecutar: node tests/azar.test.mjs
import assert from "node:assert/strict";
import { enteroAleatorio } from "../js/azar.js";

assert.equal(enteroAleatorio(1), 0);
for (const n of [2, 7, 100, 4294967296]) for (let i = 0; i < 200; i++) {
  const x = enteroAleatorio(n); assert.ok(Number.isInteger(x) && x >= 0 && x < n);
}
for (const malo of [0, -1, 1.5, NaN, 2 ** 32 + 1]) assert.throws(() => enteroAleatorio(malo), RangeError);

// Muestreo por rechazo: con n = 3, el valor 2^32-1 está en la zona sesgada y debe descartarse.
const secuencia = [4294967295, 5];
const falso = { getRandomValues(b) { b[0] = secuencia.shift(); return b; } };
assert.equal(enteroAleatorio(3, falso), 2); // 5 % 3
assert.equal(secuencia.length, 0);

// Uniformidad gruesa (n = 7, 70 000 sorteos): cada cubeta dentro de ±8 % de lo esperado.
const cubetas = new Array(7).fill(0);
for (let i = 0; i < 70000; i++) cubetas[enteroAleatorio(7)]++;
for (const c of cubetas) assert.ok(Math.abs(c - 10000) < 800, `cubeta ${c}`);
console.log("azar: ok", cubetas.join(" "));
