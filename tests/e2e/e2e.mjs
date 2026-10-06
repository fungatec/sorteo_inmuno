// Pruebas de extremo a extremo (navegador real + emuladores de Auth y Firestore). Usa datos ficticios.
// Sin acceso al CDN de gstatic, el SDK se empaqueta localmente y se sirve en su lugar (solo en la prueba).
//   cd tests/e2e && npm i --no-save firebase firebase-tools playwright-core esbuild
//   npx esbuild fb-entry.js --bundle --format=esm --outfile=fb.js
//   cp ../../firestore.rules . && echo '{"firestore":{"rules":"firestore.rules"}}' > firebase.json
//   CHROMIUM_PATH=/ruta/a/chrome npx firebase emulators:exec --only firestore,auth --project sorteoinmuno "node e2e.mjs"
import { chromium } from "playwright-core";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import assert from "node:assert/strict";

const REPO = process.env.REPO ?? new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), PORT = 8000, BASE = `http://localhost:${PORT}`;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const FB = readFileSync(new URL("./fb.js", import.meta.url));
const server = http.createServer((req, res) => {
  const ruta = new URL(req.url, BASE).pathname;
  const cab = { "Access-Control-Allow-Origin": "*" };
  if (ruta === "/__fb.js") { res.writeHead(200, { ...cab, "Content-Type": "text/javascript" }); return res.end(FB); }
  const f = join(REPO, ruta === "/" ? "index.html" : ruta);
  if (!existsSync(f) || !f.startsWith(REPO)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { ...cab, "Content-Type": TIPOS[extname(f)] ?? "text/plain" }); res.end(readFileSync(f));
}).listen(PORT);

const CONFIG_TEST = `export const firebaseConfig = { apiKey:"fake-key", authDomain:"localhost", projectId:"sorteoinmuno", storageBucket:"x", messagingSenderId:"1", appId:"1:1:web:1" };
export const ADMIN_USUARIO = "admin123"; export const ADMIN_CORREO = "admin@admin.admin";`;

// ---- datos semilla vía REST (el token "owner" salta las reglas en el emulador)
const FS = "http://127.0.0.1:8080/v1/projects/sorteoinmuno/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const val = (v) => v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: v };
async function sembrar(ruta, datos) {
  const r = await fetch(`${FS}/${ruta}`, { method: "PATCH", headers: OWNER,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, val(v)])) }) });
  assert.ok(r.ok, `sembrar ${ruta}: ${await r.text()}`);
}
async function leer(ruta) { const r = await fetch(`${FS}/${ruta}`, { headers: OWNER }); return r.ok ? r.json() : null; }
async function listar(col) { const r = await fetch(`${FS}/${col}`, { headers: OWNER }); return (await r.json()).documents ?? []; }
await fetch("http://127.0.0.1:8080/emulator/v1/projects/sorteoinmuno/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/sorteoinmuno/accounts", { method: "DELETE" });
const reg = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key",
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@admin.admin", password: "Clave-De-Prueba-9", returnSecureToken: true }) })).json();
const UID = reg.localId; assert.ok(UID);
await sembrar(`admins/${UID}`, { activo: true });
await sembrar("config/estado", { registroAbierto: true });
await sembrar("lista/gomez-jonathan-peregrina", { nombre: "Jonathan Gómez Peregrina" });
await sembrar("lista/angeles-maria", { nombre: "María de los Ángeles Ruiz".replace(" Ruiz", "") });
await sembrar("lista/lopez-ana", { nombre: "Ana López" });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
let total = 0, fallos = 0;
const prueba = async (n, fn) => { total++; try { await fn(); console.log("ok   ", n); } catch (e) { fallos++; console.log("FALLA", n, "\n     ", String(e.message).split("\n").slice(0, 3).join("\n      ")); } };

async function nuevaPagina(ctxOpts = {}) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/www\.gstatic\.com\/firebasejs\/10\.14\.1\/.*/, (r) => r.fulfill({
    status: 200, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: `export * from "${BASE}/__fb.js";` }));
  await ctx.route("**/js/firebase-config.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: CONFIG_TEST }));
  const page = await ctx.newPage();
  page.errores = []; page.on("pageerror", (e) => page.errores.push(e.message));
  page.authCalls = 0; page.on("request", (q) => { if (q.url().includes(":9099") && q.url().includes("signInWithPassword")) page.authCalls++; });
  return page;
}
const DENEGADO = /avisa a la maestra/;

// ------------------------------------------------------------------ REGISTRO
{
  const p = await nuevaPagina();
  await p.goto(`${BASE}/index.html?emulador`);
  await prueba("registro: muestra 'Registro abierto'", async () => { await p.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto"); });
  await prueba("registro: aviso de privacidad de una línea", async () => {
    assert.match(await p.textContent(".privacidad"), /solo para este sorteo y se eliminarán al terminar el evento/);
  });
  await prueba("registro: validación en vivo (correo @gmail) y se corrige sola", async () => {
    await p.fill("#nombre", "Jonathan Gómez Peregrina");
    await p.fill("#correo", "jon@gmail.com"); await p.press("#correo", "Tab");
    assert.equal(await p.textContent("#correo-error"), "El correo debe ser @alumnos.udg.mx");
    assert.equal(await p.getAttribute("#correo", "aria-invalid"), "true");
    await p.click("#enviar");                                   // no envía
    assert.equal(await p.locator("#listo:not([hidden])").count(), 0);
    await p.fill("#correo", "jon@alumnos.udg.mx");
    assert.equal(await p.isHidden("#correo-error"), true);
  });
  await prueba("registro: nombre muy corto muestra mensaje en vivo", async () => {
    await p.fill("#nombre", "Ana"); await p.press("#nombre", "Tab");
    assert.match(await p.textContent("#nombre-error"), /entre 5 y 100/);
  });
  await prueba("registro: sin desbordamiento horizontal a 360 px", async () => {
    await p.setViewportSize({ width: 360, height: 740 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await p.setViewportSize({ width: 1280, height: 720 });
  });
  await prueba("registro: nombre fuera de lista → mensaje único con las 3 causas", async () => {
    await p.fill("#nombre", "Pedro Desconocido Pérez"); await p.fill("#correo", "pedro@alumnos.udg.mx"); await p.click("#enviar");
    await p.waitForFunction(() => /No pudimos completar/.test(document.querySelector("#aviso").textContent));
    const t = await p.textContent("#aviso");
    assert.match(t, DENEGADO); assert.match(t, /no coincide con la lista/); assert.match(t, /ya te habías registrado/); assert.match(t, /correo ya se usó/);
    assert.equal(await p.isDisabled("#enviar"), false);
  });
  await prueba("registro válido con otro orden, acentos, mayúsculas y espacios dobles", async () => {
    await p.fill("#nombre", "  gomez   peregrina JONATHAN "); await p.fill("#correo", " Jonathan.Gomez4016@Alumnos.UDG.mx "); await p.click("#enviar");
    await p.waitForSelector("#listo:not([hidden])");
    assert.match(await p.textContent("#listo-texto"), /gomez peregrina JONATHAN/);
    const d = await leer("participantes/gomez-jonathan-peregrina");
    assert.equal(d.fields.origen.stringValue, "registro"); assert.equal(d.fields.correo.stringValue, "jonathan.gomez4016@alumnos.udg.mx");
    assert.ok(await leer("correos/jonathan.gomez4016@alumnos.udg.mx"));
  });
  const p2 = await nuevaPagina(); await p2.goto(`${BASE}/index.html?emulador`);
  await prueba("registro: duplicado por nombre → mensaje único", async () => {
    await p2.fill("#nombre", "Jonathan Gómez Peregrina"); await p2.fill("#correo", "otro@alumnos.udg.mx"); await p2.click("#enviar");
    await p2.waitForFunction(() => /No pudimos completar/.test(document.querySelector("#aviso").textContent));
  });
  await prueba("registro: duplicado por correo → mensaje único", async () => {
    await p2.fill("#nombre", "Ana López"); await p2.fill("#correo", "jonathan.gomez4016@alumnos.udg.mx"); await p2.click("#enviar");
    await p2.waitForFunction(() => /No pudimos completar/.test(document.querySelector("#aviso").textContent));
    assert.equal(await leer("participantes/lopez-ana"), null);
  });
  await prueba("registro: partículas — 'María Ángeles' coincide con 'María de los Ángeles'", async () => {
    await p2.fill("#nombre", "Ángeles María"); await p2.fill("#correo", "maria.angeles@alumnos.udg.mx"); await p2.click("#enviar");
    await p2.waitForSelector("#listo:not([hidden])");
  });
  await sembrar("config/estado", { registroAbierto: false });
  const p3 = await nuevaPagina(); await p3.goto(`${BASE}/index.html?emulador`);
  await prueba("registro cerrado: 'El registro está cerrado' reemplaza al formulario", async () => {
    await p3.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro cerrado");
    assert.equal(await p3.isVisible("#registro"), false); assert.match(await p3.textContent("#cerrado"), /El registro está cerrado/);
  });
  await sembrar("config/estado", { registroAbierto: true });
  for (const pg of [p, p2, p3]) assert.deepEqual(pg.errores, [], "errores JS: " + pg.errores);
}

// ------------------------------------------------------------------ LOGIN
{
  const p = await nuevaPagina(); await p.goto(`${BASE}/login.html?emulador`);
  await prueba("login: usuario 'admin' (no admin123) se rechaza SIN llamar a Firebase", async () => {
    await p.fill("#usuario", "admin"); await p.fill("#contrasena", "Clave-De-Prueba-9"); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent));
    assert.equal(p.authCalls, 0);
  });
  await prueba("login: correo directo 'admin@admin.admin' tampoco se acepta", async () => {
    await p.fill("#usuario", "admin@admin.admin"); await p.fill("#contrasena", "Clave-De-Prueba-9"); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent));
    assert.equal(p.authCalls, 0);
  });
  await prueba("login: contraseña incorrecta → mismo mensaje (llama a Firebase)", async () => {
    await p.fill("#usuario", "admin123"); await p.fill("#contrasena", "mala"); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent) && !document.querySelector("#entrar").disabled);
    assert.equal(p.authCalls, 1);
  });
  await prueba("login: cuenta sin documento en admins/ → 'Sin permisos de administrador' y sesión cerrada", async () => {
    await fetch(`${FS}/admins/${UID}`, { method: "DELETE", headers: OWNER });
    await p.fill("#usuario", "admin123"); await p.fill("#contrasena", "Clave-De-Prueba-9"); await p.click("#entrar");
    await p.waitForFunction(() => /Sin permisos de administrador/.test(document.querySelector("#aviso").textContent));
    assert.match(p.url(), /login\.html/);
    await p.goto(`${BASE}/panel.html?emulador`); await p.waitForURL(/login\.html/);   // no quedó sesión
    await sembrar(`admins/${UID}`, { activo: true });
    await p.goto(`${BASE}/login.html?emulador`);
  });
  await prueba("login: admin123 + contraseña correcta → panel", async () => {
    await p.fill("#usuario", " Admin123 "); await p.fill("#contrasena", "Clave-De-Prueba-9"); await p.click("#entrar");
    await p.waitForURL(/panel\.html/);
  });
  assert.deepEqual(p.errores, []);
}

// ------------------------------------------------------------------ PANEL + SORTEO (misma sesión)
{
  const ctxPage = await nuevaPagina();
  const p = ctxPage; await p.goto(`${BASE}/login.html?emulador`);
  await p.fill("#usuario", "admin123"); await p.fill("#contrasena", "Clave-De-Prueba-9"); await p.click("#entrar");
  await p.waitForURL(/panel\.html/); await p.waitForSelector("#contenido:not([hidden])");
  // participante manipulado: clave de Ana López con nombre arbitrario (lo siembra 'owner', como lo haría un cliente malicioso)
  await sembrar("participantes/lopez-ana", { nombre: "Troll Cualquiera", clave: "lopez-ana", correo: "troll@alumnos.udg.mx", origen: "registro", creadoEn: new Date() });
  await sembrar("correos/troll@alumnos.udg.mx", { clave: "lopez-ana" });
  await p.reload(); await p.waitForSelector("#contenido:not([hidden])");
  await p.waitForFunction(() => document.querySelector("#n-registrados").textContent !== "–", null, { timeout: 8000 }).catch(async () => {
    console.log("   [debug] url", p.url(), "aviso:", await p.textContent("#aviso"), "errores:", p.errores);
    throw new Error("panel sin datos");
  });

  await prueba("panel: contadores", async () => {
    assert.equal(await p.textContent("#n-lista"), "3"); assert.equal(await p.textContent("#n-registrados"), "3");
  });
  await prueba("panel: muestra nombre OFICIAL y advierte 'escrito distinto'", async () => {
    const t = await p.textContent("#participantes");
    assert.match(t, /Jonathan Gómez Peregrina/); assert.match(t, /escrito distinto/); assert.match(t, /Tecleó: «gomez peregrina JONATHAN»/);
  });
  await prueba("panel: advertencia fuerte 'no corresponde' (nombre manipulado)", async () => {
    const t = await p.textContent("#participantes");
    assert.match(t, /Ana López/); assert.match(t, /no corresponde/); assert.match(t, /Troll Cualquiera/);
  });
  await prueba("panel: cerrar y abrir el registro", async () => {
    p.once("dialog", (d) => d.accept());
    await p.click("#alternar"); await p.waitForFunction(() => document.querySelector("#etq-alternar").textContent === "Registro cerrado");
    assert.equal((await leer("config/estado")).fields.registroAbierto.booleanValue, false);
    await p.click("#alternar"); await p.waitForFunction(() => document.querySelector("#etq-alternar").textContent === "Registro abierto");
    assert.equal(await p.getAttribute("#alternar", "aria-checked"), "true");
  });
  await prueba("panel: cargar lista (colisión, rechazada, repetida) y guardar", async () => {
    await p.click("#tab-b-lista");
    await p.fill("#texto-lista", ["Luis Pérez-Gil", "Pérez Gil Luis", "Rosa de las Nieves", "Rosa Nieves", "Ana", "Carlos Ruiz", "carlos ruiz"].join("\n"));
    await p.click("#analizar");
    const t = await p.textContent("#vista-previa");
    assert.match(t, /1 nombres listos/); assert.match(t, /2 colisión/); assert.match(t, /Rosa de las Nieves {1,3}↔ {1,3}Rosa Nieves/); assert.match(t, /Ana/); assert.match(t, /1 línea\(s\) repetida/);
    // Luis Pérez-Gil y Pérez Gil Luis son el MISMO nombre escrito distinto → colisión (nombres distintos, misma clave)
    await p.click("#guardar-lista"); await p.waitForSelector("#vista-previa", { state: "hidden" });
  });
  await prueba("panel: lista guardada en Firestore y reflejada", async () => {
    assert.ok(await leer("lista/carlos-ruiz")); assert.equal(await leer("lista/gil-luis-perez"), null);
    await p.waitForFunction(() => /Carlos Ruiz/.test(document.querySelector("#lista-actual").textContent));
  });
  await prueba("panel: alta manual (origen admin) y duplicado rechazado", async () => {
    await p.click("#tab-b-alta");
    await p.fill("#alta-nombre", "Pedro Fuera De Lista"); await p.fill("#alta-correo", "pedro.fuera@alumnos.udg.mx"); await p.click("#alta-enviar");
    await p.waitForFunction(() => /Agregado/.test(document.querySelector("#aviso").textContent));
    assert.equal((await leer("participantes/fuera-lista-pedro")).fields.origen.stringValue, "admin");
    await p.fill("#alta-nombre", "pedro lista fuera"); await p.fill("#alta-correo", "x@alumnos.udg.mx"); await p.click("#alta-enviar");
    await p.waitForFunction(() => /ya está inscrita/.test(document.querySelector("#aviso").textContent));
  });
  await prueba("panel: filtro 'solo advertencias' (excluye al alta manual sin advertencia de texto)", async () => {
    await p.click("#tab-b-participantes");
    assert.equal(await p.locator("#participantes tr").count(), 4);
    await p.check("#solo-alertas");
    assert.equal(await p.locator("#participantes tr").count(), 3);
    await p.uncheck("#solo-alertas");
  });
  await prueba("panel: búsqueda sin acentos ni mayúsculas, con contador", async () => {
    await p.fill("#buscar", "GOMEZ");
    assert.equal(await p.locator("#participantes tr").count(), 1);
    assert.match(await p.textContent("#contador-tabla"), /Mostrando 1 de 4/);
    await p.fill("#buscar", "alumnos.udg"); assert.equal(await p.locator("#participantes tr").count(), 4);
    await p.fill("#buscar", "zzzz"); assert.match(await p.textContent("#participantes"), /Ningún participante coincide/);
    await p.fill("#buscar", "");
  });
  await prueba("panel: pestañas operables con teclado (→, Fin, ←)", async () => {
    await p.focus("#tab-b-participantes"); await p.keyboard.press("ArrowRight");
    assert.equal(await p.getAttribute("#tab-b-lista", "aria-selected"), "true"); assert.equal(await p.isVisible("#tab-lista"), true);
    await p.keyboard.press("End"); assert.equal(await p.getAttribute("#tab-b-alta", "aria-selected"), "true");
    await p.keyboard.press("Home"); assert.equal(await p.getAttribute("#tab-b-participantes", "aria-selected"), "true");
  });
  await prueba("panel: alta manual valida en vivo (correo @gmail)", async () => {
    await p.click("#tab-b-alta"); await p.fill("#alta-correo", "x@gmail.com"); await p.press("#alta-correo", "Tab");
    assert.equal(await p.textContent("#alta-correo-error"), "El correo debe ser @alumnos.udg.mx");
    await p.fill("#alta-correo", ""); await p.click("#tab-b-participantes");
  });
  await prueba("panel: eliminar participante borra también el índice de correo", async () => {
    await p.click("#tab-b-participantes");
    p.once("dialog", (d) => d.accept());
    await p.locator("#participantes tr", { hasText: "Pedro Fuera" }).locator("button").click();
    await p.waitForFunction(() => !/Pedro Fuera/.test(document.querySelector("#participantes").textContent));
    assert.equal(await leer("participantes/fuera-lista-pedro"), null); assert.equal(await leer("correos/pedro.fuera@alumnos.udg.mx"), null);
  });
  assert.deepEqual(p.errores, [], "errores JS en panel: " + p.errores);

  // ---------------- SORTEO (movimiento reducido para ir rápido) + una corrida con animación completa
  const s = await p.context().newPage(); s.errores = []; s.on("pageerror", (e) => s.errores.push(e.message));
  await s.emulateMedia({ reducedMotion: "reduce" });
  await s.goto(`${BASE}/sorteo.html?emulador`); await s.waitForSelector("#contenido:not([hidden])");
  await s.waitForFunction(() => document.querySelector("#contador").textContent !== "–");
  await prueba("sorteo: contador = clones inscritos (3)", async () => { assert.equal(await s.textContent("#contador"), "3"); });
  await prueba("sorteo: ensayo no guarda nada y muestra nombre OFICIAL", async () => {
    await s.check("#ensayo"); await s.click("#sortear"); await s.waitForSelector("#resultado:not([hidden])");
    const nombre = await s.textContent("#ganador");
    assert.ok(["Jonathan Gómez Peregrina", "María de los Ángeles", "Ana López"].includes(nombre), nombre);
    assert.notEqual(nombre, "Troll Cualquiera");
    assert.equal((await listar("sorteos")).length, 0);
    assert.equal(await s.isVisible("#etiqueta-ensayo"), true);
  });
  const ganadores = [];
  await prueba("sorteo real: guarda ronda 1, excluye ganadores en rondas siguientes y nunca repite", async () => {
    await s.uncheck("#ensayo");
    for (let ronda = 1; ronda <= 3; ronda++) {
      if ((await s.textContent("#sortear")) === "Otra ronda") { await s.click("#sortear"); await s.waitForSelector("#resultado", { state: "hidden" }); }
      assert.equal(await s.textContent("#sortear"), "Liberar el antígeno");
      await s.click("#sortear");
      await s.waitForSelector("#resultado:not([hidden])");
      ganadores.push(await s.textContent("#ganador"));
      assert.equal(await s.isVisible("#etiqueta-ensayo"), false);
    }
    await s.click("#sortear"); await s.waitForSelector("#resultado", { state: "hidden" });
    assert.equal(new Set(ganadores).size, 3, ganadores.join(" | "));
    const docs = await listar("sorteos");
    assert.equal(docs.length, 3);
    const rondas = docs.map((d) => Number(d.fields.ronda.integerValue)).sort();
    assert.deepEqual(rondas, [1, 2, 3]);
    const totales = docs.map((d) => Number(d.fields.totalParticipantes.integerValue)).sort();
    assert.deepEqual(totales, [1, 2, 3]);
    assert.equal(await s.isDisabled("#sortear"), true); // sin elegibles
  });
  assert.deepEqual(s.errores, [], "errores JS en sorteo: " + s.errores);

  // corrida con animación completa (sin reduced-motion)
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/sorteoinmuno/databases/(default)/documents/sorteos", { method: "DELETE" }).catch(() => {});
  for (const d of await listar("sorteos")) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: "DELETE", headers: OWNER });
  const a = await p.context().newPage(); a.errores = []; a.on("pageerror", (e) => a.errores.push(e.message));
  await a.goto(`${BASE}/sorteo.html?emulador`); await a.waitForFunction(() => document.querySelector("#contador").textContent === "3");
  await prueba("sorteo con animación completa: fases en orden y revela a un clon", async () => {
    await a.check("#ensayo"); await a.click("#sortear");
    const fases = new Set();
    const t0 = Date.now();
    while (await a.isHidden("#resultado") && Date.now() - t0 < 30000) { fases.add(await a.textContent("#fase")); await a.waitForTimeout(150); }
    const lista = [...fases].join(" > ");
    assert.match(lista, /antígeno se acerca/); assert.match(lista, /Reconocimiento/); assert.match(lista, /prolifera/);
    assert.equal(await a.locator("#expansion i").count(), 14);
    assert.equal(await a.locator(".clon.ganador").count(), 1);
    assert.equal(await a.locator(".clon.apagado").count(), 2);
  });
  assert.deepEqual(a.errores, []);
  await s.close(); await a.close(); // Chromium limita las conexiones simultáneas por host
  await prueba("panel y sorteo: sin desbordamiento horizontal a 360 px", async () => {
    const m = await p.context().newPage(); await m.setViewportSize({ width: 360, height: 740 });
    for (const pagina of ["panel", "sorteo"]) {
      await m.goto(`${BASE}/${pagina}.html?emulador`); await m.waitForSelector("#contenido:not([hidden])"); await m.waitForTimeout(500);
      assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, pagina);
    }
    await m.close();
  });
  await prueba("vaciar datos: exige escribir BORRAR; cancelar no borra; confirmar deja todo vacío y el registro cerrado", async () => {
    const w = await p.context().newPage(); await w.goto(`${BASE}/panel.html?emulador`);
    await w.waitForFunction(() => document.querySelector("#n-registrados").textContent !== "–");
    await w.click("#abrir-vaciar"); await w.waitForSelector("#dlg-vaciar[open]");
    assert.equal(await w.isDisabled("#confirmar-vaciar"), true);
    await w.fill("#confirmar-texto", "borrar"); assert.equal(await w.isDisabled("#confirmar-vaciar"), true);
    await w.click("#cancelar-vaciar");
    assert.ok((await listar("participantes")).length > 0 && (await listar("lista")).length > 0, "cancelar no debe borrar");
    await w.click("#abrir-vaciar"); await w.fill("#confirmar-texto", "BORRAR");
    assert.equal(await w.isDisabled("#confirmar-vaciar"), false);
    await w.click("#confirmar-vaciar");
    await w.waitForFunction(() => /Datos eliminados/.test(document.querySelector("#aviso").textContent));
    for (const c of ["participantes", "correos", "sorteos", "lista"]) assert.equal((await listar(c)).length, 0, c);
    assert.equal((await leer("config/estado")).fields.registroAbierto.booleanValue, false);
    assert.ok(await leer(`admins/${UID}`), "admins no se toca");
    await w.close();
  });
  // cerrar sesión
  await prueba("salir: vuelve a login y las páginas de admin redirigen", async () => {
    await p.click("#salir"); await p.waitForURL(/login\.html/);
    const r = await p.context().newPage(); await r.goto(`${BASE}/panel.html?emulador`); await r.waitForURL(/login\.html/);
  });
}

// ------------------------------------------------------------------ sin sesión: panel/sorteo redirigen
{
  const p = await nuevaPagina();
  await prueba("sin sesión: sorteo.html redirige a login", async () => { await p.goto(`${BASE}/sorteo.html?emulador`); await p.waitForURL(/login\.html/); });
}
await browser.close(); server.close();
console.log(`\n${total - fallos}/${total} pruebas e2e pasaron`);
process.exit(fallos ? 1 : 0);
