// Ejecutar: node tests/login-errores.test.mjs
import assert from "node:assert/strict";
import { normalizarUsuario, clasificarErrorLogin, mensajeErrorLogin } from "../js/login-errores.js";

// El usuario se normaliza (trim + minúsculas) antes de compararlo con admin123
for (const v of ["admin123", " admin123 ", "ADMIN123", "\tAdmin123\n"]) assert.equal(normalizarUsuario(v), "admin123");
assert.equal(normalizarUsuario(null), "");

// Todos los errores de credenciales dan EXACTAMENTE el mismo mensaje (no revelan si falló usuario o contraseña)
const CRED = ["app/usuario-invalido", "auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password",
  "auth/user-not-found", "auth/invalid-email", "auth/missing-password"];
const mensajesCred = new Set(CRED.map((c) => mensajeErrorLogin(c)));
assert.equal(mensajesCred.size, 1);
assert.equal([...mensajesCred][0], "Usuario o contraseña incorrectos.");

// Configuración y red: mensajes propios, claros y distintos entre sí
const casos = {
  "auth/unauthorized-domain": "dominio", "auth/unauthorized-continue-uri": "dominio", "auth/operation-not-allowed": "metodo", "auth/network-request-failed": "red",
  "auth/invalid-api-key": "clave-api", "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "clave-api",
  "auth/requests-from-referer-https://evil.example-are-blocked.": "clave-api", "auth/app-not-authorized": "clave-api",
  "auth/too-many-requests": "bloqueo", "app/no-admin": "sin-permisos", "auth/algo-raro": "otro",
};
for (const [code, tipo] of Object.entries(casos)) assert.equal(clasificarErrorLogin(code), tipo, code);
assert.equal(clasificarErrorLogin("auth/internal-error", "Requests to this API are blocked: API key not valid"), "clave-api");
const msgs = ["auth/unauthorized-domain", "auth/operation-not-allowed", "auth/network-request-failed", "auth/invalid-api-key", "auth/too-many-requests"]
  .map((c) => mensajeErrorLogin(c, { hostname: "ejemplo.github.io" }));
assert.equal(new Set(msgs).size, msgs.length, "mensajes distintos entre sí");
assert.ok(!msgs.includes(mensajeErrorLogin("auth/wrong-password")), "distintos al de credenciales");
assert.match(mensajeErrorLogin("auth/unauthorized-domain", { hostname: "ejemplo.github.io" }), /ejemplo\.github\.io/);
assert.match(mensajeErrorLogin("auth/network-request-failed"), /conexión/);
assert.match(mensajeErrorLogin("auth/operation-not-allowed"), /correo y contraseña está desactivado/);
assert.match(mensajeErrorLogin("auth/invalid-api-key"), /clave de API/);
assert.match(mensajeErrorLogin("auth/algo-raro"), /código: auth\/algo-raro/);
// Ninguno de los mensajes de configuración/red menciona "incorrecto" (no insinúan fallo de credenciales)
for (const m of msgs) assert.ok(!/incorrect/i.test(m), m);
console.log("login-errores: ok");
