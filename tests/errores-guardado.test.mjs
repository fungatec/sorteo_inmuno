// Ejecutar: node tests/errores-guardado.test.mjs
import assert from "node:assert/strict";
import { clasificarErrorGuardado, mensajeErrorGuardado } from "../js/errores-guardado.js";

assert.equal(mensajeErrorGuardado("permission-denied"),
  "Las reglas de Firestore publicadas no coinciden con esta versión de la app. Republica firestore.rules.");
for (const c of ["unavailable", "deadline-exceeded", "cancelled", "network-request-failed", "firestore/unavailable"])
  assert.equal(clasificarErrorGuardado(c), "red", c);
assert.equal(clasificarErrorGuardado("failed-precondition", "Failed to get document because the client is offline."), "red");
assert.match(mensajeErrorGuardado("unavailable"), /conexión/);
assert.equal(clasificarErrorGuardado("unauthenticated"), "sesion");
assert.equal(clasificarErrorGuardado("resource-exhausted"), "cuota");
assert.match(mensajeErrorGuardado("aborted"), /código: aborted/);
assert.match(mensajeErrorGuardado(undefined), /código: desconocido/);
// Los cuatro tipos dan mensajes distintos entre sí y solo el de red habla de conexión
const todos = ["permission-denied", "unavailable", "unauthenticated", "resource-exhausted", "otra-cosa"].map((c) => mensajeErrorGuardado(c));
assert.equal(new Set(todos).size, 5);
assert.ok(!/conexión/.test(mensajeErrorGuardado("permission-denied")), "un desajuste de reglas NO debe parecer un problema de red");
console.log("errores-guardado: ok");
