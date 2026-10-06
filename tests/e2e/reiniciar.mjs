// Pruebas e2e del botón «Reiniciar sorteo» (sorteo.html). Navegador real + emuladores de Auth y Firestore; datos ficticios.
// Misma preparación que e2e.mjs (ver su cabecera). Opcional: AXE_PATH=/ruta/a/axe.min.js activa la auditoría axe-core.
//   cd tests/e2e && npm i --no-save firebase firebase-tools playwright-core esbuild axe-core
//   npx esbuild fb-entry.js --bundle --format=esm --outfile=fb.js
//   cp ../../firestore.rules . && echo '{"firestore":{"rules":"firestore.rules"}}' > firebase.json
//   AXE_PATH=node_modules/axe-core/axe.min.js CHROMIUM_PATH=/ruta/a/chrome npx firebase emulators:exec --only firestore,auth --project sorteoinmuno "node reiniciar.mjs"
import { chromium } from "playwright-core";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import assert from "node:assert/strict";

const REPO = process.env.REPO ?? new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), PORT = 8000, BASE = `http://localhost:${PORT}`;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const FB = readFileSync(new URL("./fb.js", import.meta.url));
const server = http.createServer((req, res) => {
  const ruta = new URL(req.url, BASE).pathname, cab = { "Access-Control-Allow-Origin": "*" };
  if (ruta === "/__fb.js") { res.writeHead(200, { ...cab, "Content-Type": "text/javascript" }); return res.end(FB); }
  const f = join(REPO, ruta === "/" ? "index.html" : ruta);
  if (!existsSync(f) || !f.startsWith(REPO)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { ...cab, "Content-Type": TIPOS[extname(f)] ?? "text/plain" }); res.end(readFileSync(f));
}).listen(PORT);

const CONFIG_TEST = `export const firebaseConfig = { apiKey:"fake-key", authDomain:"localhost", projectId:"sorteoinmuno", storageBucket:"x", messagingSenderId:"1", appId:"1:1:web:1" };
export const ADMIN_USUARIO = "admin123"; export const ADMIN_CORREO = "admin@admin.admin";`;
const PASS = "t-" + globalThis.crypto.randomUUID();
const FS = "http://127.0.0.1:8080/v1/projects/sorteoinmuno/databases/(default)/documents", OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const val = (v) => v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: v };
async function sembrar(ruta, datos) {
  const r = await fetch(`${FS}/${ruta}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, val(v)])) }) });
  assert.ok(r.ok, `sembrar ${ruta}: ${await r.text()}`);
}
async function leer(ruta) { const r = await fetch(`${FS}/${ruta}`, { headers: OWNER }); return r.ok ? r.json() : null; }
async function listar(col) { const r = await fetch(`${FS}/${col}`, { headers: OWNER }); return (await r.json()).documents ?? []; }
async function ponerReglas(contenido) {
  const r = await fetch("http://127.0.0.1:8080/emulator/v1/projects/sorteoinmuno:securityRules", { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: contenido }] } }) });
  assert.ok(r.ok, await r.text());
}
const REGLAS = readFileSync(join(REPO, "firestore.rules"), "utf8");
const REGLAS_SIN_PUBLICO = REGLAS.replace("allow create, update: if esAdmin() && publicoSorteoValido();", "allow create, update: if false;");
assert.notEqual(REGLAS, REGLAS_SIN_PUBLICO, "la variante de reglas sin escritura en publico/sorteo debe diferir");

await fetch("http://127.0.0.1:9099/emulator/v1/projects/sorteoinmuno/accounts", { method: "DELETE" });
const reg = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key",
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@admin.admin", password: PASS, returnSecureToken: true }) })).json();
assert.ok(reg.localId);
await sembrar(`admins/${reg.localId}`, { activo: true });
await sembrar("config/estado", { registroAbierto: true });
const NOMBRES = { "lopez-ana": "Ana López", "ruiz-luis": "Luis Ruiz", "soto-marta": "Marta Soto" };   // ficticios
for (const [k, nombre] of Object.entries(NOMBRES)) {
  const c = `${k}@alumnos.udg.mx`;
  await sembrar(`lista/${k}`, { nombre }); await sembrar(`participantes/${k}`, { nombre, clave: k, correo: c, origen: "registro", creadoEn: new Date() }); await sembrar(`correos/${c}`, { clave: k });
}
const conteos = async () => ({ participantes: (await listar("participantes")).length, correos: (await listar("correos")).length, lista: (await listar("lista")).length,
  registro: (await leer("config/estado")).fields.registroAbierto.booleanValue });
const INTACTOS = { participantes: 3, correos: 3, lista: 3, registro: true };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
let total = 0, fallos = 0;
const prueba = async (n, fn) => { total++; try { await fn(); console.log("ok   ", n); } catch (e) { fallos++; console.log("FALLA", n, "\n     ", String(e.message).split("\n").slice(0, 4).join("\n      ")); } };

const ctx = await browser.newContext({ acceptDownloads: true, reducedMotion: "reduce" });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await ctx.route(/www\.gstatic\.com\/firebasejs\/10\.14\.1\/.*/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: `export * from "${BASE}/__fb.js";` }));
await ctx.route("**/js/firebase-config.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: CONFIG_TEST }));
const s = await ctx.newPage(); s.errores = []; s.on("pageerror", (e) => s.errores.push(e.message));
await s.goto(`${BASE}/login.html?emulador`); await s.fill("#usuario", "admin123"); await s.fill("#contrasena", PASS); await s.click("#entrar"); await s.waitForURL(/panel\.html/);
await s.goto(`${BASE}/sorteo.html?emulador`); await s.waitForSelector("#contenido:not([hidden])");
await s.waitForFunction(() => document.querySelector("#contador").textContent === "3");

const reposo = (pg = s) => pg.waitForFunction(() => !document.querySelector("#sortear").disabled && !document.querySelector("#resultado").hidden && !document.querySelector("#reiniciar").disabled, null, { timeout: 60000 });
async function acelerar(pg, ms = 60000) { const t0 = Date.now(); while (await pg.isHidden("#resultado") && Date.now() - t0 < ms) { await pg.keyboard.press("s"); await pg.waitForTimeout(120); } }
async function rondaReal() { await s.click("#sortear"); await acelerar(s); await reposo(); }
const confirmarReinicio = async (texto = "REINICIAR") => { await s.fill("#reiniciar-texto", texto); await s.click("#reiniciar-confirmar"); };

await prueba("el botón «Reiniciar sorteo» está en los controles secundarios, con estilo de peligro, fuera del botón principal y de la escena", async () => {
  assert.equal(await s.textContent("#reiniciar"), "Reiniciar sorteo");
  assert.equal(await s.evaluate(() => document.querySelector("#reiniciar").closest(".opciones") !== null && document.querySelector("#reiniciar").closest("#proyeccion") === null), true);
  assert.equal(await s.evaluate(() => getComputedStyle(document.querySelector("#reiniciar")).color), "rgb(255, 154, 146)");
});

await prueba("ENSAYO: reinicia solo el estado local (ronda/ganadores de ensayo/escena), sin diálogo, sin descarga y sin borrar nada", async () => {
  await s.check("#ensayo"); await s.click("#sortear"); await acelerar(s); await reposo();
  assert.equal(await s.textContent("#sortear"), "Activar otro linfocito");
  let descargas = 0; const od = () => descargas++; s.on("download", od);
  await s.click("#reiniciar");
  await s.waitForFunction(() => /Ensayo reiniciado/.test(document.querySelector("#aviso").textContent));
  assert.equal(await s.evaluate(() => document.querySelector("#dlg-reiniciar").open), false, "sin diálogo");
  assert.equal(await s.textContent("#contador"), "3"); assert.equal(await s.textContent("#sortear"), "Iniciar la respuesta inmune");
  assert.equal(await s.isHidden("#resultado"), true); assert.equal(await s.textContent("#ronda"), "Ensayo");
  assert.equal(descargas, 0); s.off("download", od);
  assert.equal((await listar("sorteos")).length, 0); assert.deepEqual(await conteos(), INTACTOS);
  await s.uncheck("#ensayo");
});

await prueba("con 0 rondas guardadas (sorteo real): solo reinicia lo local y lo confirma; no hay diálogo ni descarga", async () => {
  let descargas = 0; const od = () => descargas++; s.on("download", od);
  await s.click("#reiniciar");
  await s.waitForFunction(() => /No había rondas guardadas/.test(document.querySelector("#aviso").textContent));
  assert.equal(await s.evaluate(() => document.querySelector("#dlg-reiniciar").open), false); assert.equal(descargas, 0); s.off("download", od);
  assert.equal(await s.textContent("#ronda"), "Ronda 1");
});

await prueba("el botón se deshabilita mientras corre la animación y se guarda/publica la ronda, y vuelve a habilitarse después", async () => {
  await s.click("#sortear");
  assert.equal(await s.isDisabled("#reiniciar"), true, "durante el guardado/animación");
  await s.waitForTimeout(1500); assert.equal(await s.isDisabled("#reiniciar"), true, "durante la animación");
  await s.click("#reiniciar", { force: true, timeout: 1000 }).catch(() => {});
  assert.equal(await s.evaluate(() => document.querySelector("#dlg-reiniciar").open), false, "no abre diálogo");
  await acelerar(s); await reposo();
  assert.equal(await s.isDisabled("#reiniciar"), false);
  assert.equal((await listar("sorteos")).length, 1);
});

await prueba("sorteo real con 2 rondas: el diálogo indica cuántas se borrarán; una confirmación incorrecta no borra; Cancelar y Esc tampoco", async () => {
  await rondaReal();
  assert.equal((await listar("sorteos")).length, 2);
  await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]");
  assert.match(await s.textContent("#reiniciar-detalle"), /Se borrarán 2 rondas guardadas/);
  assert.equal(await s.isDisabled("#reiniciar-confirmar"), true);
  for (const mal of ["reiniciar", "REINICIA", "BORRAR", ""]) { await s.fill("#reiniciar-texto", mal); assert.equal(await s.isDisabled("#reiniciar-confirmar"), true, mal); }
  await s.fill("#reiniciar-texto", "REINICIA");
  await s.evaluate(() => document.querySelector("#form-reiniciar").requestSubmit());      // ni forzando el envío
  await s.waitForTimeout(600); assert.equal((await listar("sorteos")).length, 2);
  assert.equal(await s.evaluate(() => document.querySelector("#dlg-reiniciar").open), true, "sigue abierto");
  await s.click("#reiniciar-cancelar"); await s.waitForTimeout(300); assert.equal((await listar("sorteos")).length, 2);
  await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]"); await s.keyboard.press("Escape");
  await s.waitForFunction(() => !document.querySelector("#dlg-reiniciar").open); assert.equal((await listar("sorteos")).length, 2);
  await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]"); await s.keyboard.press("Space");   // Espacio con el diálogo abierto no sortea
  await s.waitForTimeout(400); assert.equal(await s.evaluate(() => document.querySelector("#sortear").disabled), false); assert.equal((await listar("sorteos")).length, 2);
  await s.click("#reiniciar-cancelar");
});

await prueba("descarga fallida: aborta, no borra nada, no toca publico/sorteo y avisa", async () => {
  const antes = JSON.stringify(await leer("publico/sorteo"));
  await s.evaluate(() => { window.__crear = URL.createObjectURL; URL.createObjectURL = () => { throw new Error("descarga bloqueada"); }; });
  await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]"); await confirmarReinicio();
  await s.waitForFunction(() => /No se pudo descargar el registro/.test(document.querySelector("#aviso").textContent));
  await s.evaluate(() => { URL.createObjectURL = window.__crear; });
  assert.equal((await listar("sorteos")).length, 2, "no se borró nada"); assert.equal(JSON.stringify(await leer("publico/sorteo")), antes);
  assert.equal(await s.evaluate(() => document.querySelector("#dlg-reiniciar").open), false);
  assert.equal(await s.isDisabled("#reiniciar"), false, "se puede reintentar"); assert.equal(await s.textContent("#ronda"), "Ronda 2", "la pantalla no cambió");
  assert.deepEqual(await conteos(), INTACTOS);
});

await prueba("sorteo real confirmado: descarga el .txt y LUEGO borra; ronda 1; todos elegibles otra vez; publico/sorteo = espera; el espectador lo ve; nada más cambia", async () => {
  const v = await ctx.newPage(); await v.goto(`${BASE}/en-vivo.html?emulador`);
  await v.waitForFunction(() => document.querySelector("#mascara-ev") && document.querySelector("#mascara-ev").textContent.length > 0, null, { timeout: 20000 });   // ve la máscara del último ganador
  const ganadoresAntes = (await listar("sorteos")).map((d) => d.fields.ganadorClave.stringValue);
  assert.equal(await s.textContent("#contador"), "2", "antes del reinicio: la ronda 2 se sorteó entre 2");
  await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]");
  const [descarga] = await Promise.all([s.waitForEvent("download"), confirmarReinicio()]);
  const archivo = readFileSync(await descarga.path(), "utf8");
  assert.match(descarga.suggestedFilename(), /^registro-sorteo-\d{4}-\d{2}-\d{2}\.txt$/);
  assert.match(archivo, /Rondas registradas: 2/); assert.match(archivo, /Ronda 1/); assert.match(archivo, /Ronda 2/);
  assert.ok(ganadoresAntes.every((k) => archivo.includes(NOMBRES[k])), "la constancia incluye a los ganadores oficiales");
  await s.waitForFunction(() => /Sorteo reiniciado: se descargó el registro y se borraron 2 rondas/.test(document.querySelector("#aviso").textContent));
  assert.equal((await listar("sorteos")).length, 0);
  assert.equal(await s.textContent("#ronda"), "Ronda 1"); assert.equal(await s.textContent("#contador"), "3", "los ganadores anteriores vuelven a ser elegibles");
  assert.equal(await s.textContent("#sortear"), "Iniciar la respuesta inmune"); assert.equal(await s.isHidden("#resultado"), true); assert.equal(await s.isHidden("#previos"), true);
  await s.waitForFunction(() => !document.querySelector("#reiniciar").disabled);
  const pub = await leer("publico/sorteo"); assert.deepEqual(Object.keys(pub.fields), ["estado"]); assert.equal(pub.fields.estado.stringValue, "espera");
  await v.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "Esperando el sorteo…", null, { timeout: 10000 });
  assert.equal(await v.evaluate(() => document.querySelector("#revelado-ev").hidden), true, "el espectador ya no ve la máscara");
  assert.deepEqual(await conteos(), INTACTOS); await v.close();
  assert.equal(await s.locator("#lista-previos li").count(), 0);
});

await prueba("tras el reinicio la siguiente ronda real se guarda como ronda 1 (y el ganador anterior pudo volver a salir)", async () => {
  await s.click("#sortear"); await acelerar(s); await reposo();
  const docs = await listar("sorteos"); assert.equal(docs.length, 1); assert.equal(docs[0].fields.ronda.integerValue, "1"); assert.equal(docs[0].fields.totalParticipantes.integerValue, "3");
});

await prueba("si no se puede limpiar la transmisión: el reinicio sí se hace y aparece un aviso discreto", async () => {
  await ponerReglas(REGLAS_SIN_PUBLICO); await s.waitForTimeout(800);
  await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]");
  const [d] = await Promise.all([s.waitForEvent("download"), confirmarReinicio()]);
  assert.match(readFileSync(await d.path(), "utf8"), /Rondas registradas: 1/);
  await s.waitForFunction(() => !document.querySelector("#envivo-estado").hidden, null, { timeout: 20000 });
  assert.match(await s.textContent("#envivo-estado"), /no se pudo limpiar/);
  assert.equal((await listar("sorteos")).length, 0); assert.equal(await s.textContent("#ronda"), "Ronda 1");
  await ponerReglas(REGLAS); await s.waitForTimeout(800);
});

if (process.env.AXE_PATH) {
  for (const [nombre, w, h] of [["360 px", 360, 740], ["1080p", 1920, 1080]]) {
    await prueba(`axe-core (WCAG 2.x A/AA) a ${nombre}: sin violaciones con el botón y con el diálogo abierto`, async () => {
      await s.setViewportSize({ width: w, height: h }); await s.waitForTimeout(300);
      await s.addScriptTag({ path: process.env.AXE_PATH }).catch(() => {});
      const auditar = () => s.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target).join(" ")}`));
      assert.deepEqual(await auditar(), [], "página en reposo");
      await rondaReal();   // con una ronda guardada, para abrir el diálogo
      await s.click("#reiniciar"); await s.waitForSelector("#dlg-reiniciar[open]");
      assert.deepEqual(await auditar(), [], "diálogo abierto"); await s.click("#reiniciar-cancelar");
    });
  }
}
assert.deepEqual(s.errores, [], "errores JS: " + s.errores);
await browser.close(); server.close();
console.log(`\n${total - fallos}/${total} pruebas e2e del reinicio pasaron`);
process.exit(fallos ? 1 : 0);
