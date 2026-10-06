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
const PASS = "t-" + globalThis.crypto.randomUUID();   // cuenta de prueba efímera del emulador
const FS = "http://127.0.0.1:8080/v1/projects/sorteoinmuno/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const val = (v) => v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: v };
async function sembrar(ruta, datos) {
  const r = await fetch(`${FS}/${ruta}`, { method: "PATCH", headers: OWNER,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, val(v)])) }) });
  assert.ok(r.ok, `sembrar ${ruta}: ${await r.text()}`);
}
// Reglas publicadas en el emulador: las actuales y una versión ANTERIOR (sin adminUid) para reproducir el desajuste de producción.
const REGLAS = readFileSync(join(REPO, "firestore.rules"), "utf8");
const REGLAS_ANTIGUAS = REGLAS.replaceAll("'ronda', 'adminUid']", "'ronda']").replace(/\n\s*&& request\.resource\.data\.adminUid == request\.auth\.uid[^\n]*/, "");
assert.ok(REGLAS.includes("adminUid") && !REGLAS_ANTIGUAS.includes("adminUid"), "la versión antigua de las reglas no debe mencionar adminUid");
async function ponerReglas(contenido) {
  const r = await fetch("http://127.0.0.1:8080/emulator/v1/projects/sorteoinmuno:securityRules", { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: contenido }] } }) });
  assert.ok(r.ok, await r.text());
}
async function borrar(ruta) { await fetch(`${FS}/${ruta}`, { method: "DELETE", headers: OWNER }); }
async function leer(ruta) { const r = await fetch(`${FS}/${ruta}`, { headers: OWNER }); return r.ok ? r.json() : null; }
async function listar(col) { const r = await fetch(`${FS}/${col}`, { headers: OWNER }); return (await r.json()).documents ?? []; }
await fetch("http://127.0.0.1:8080/emulator/v1/projects/sorteoinmuno/databases/(default)/documents", { method: "DELETE" });
await fetch("http://127.0.0.1:9099/emulator/v1/projects/sorteoinmuno/accounts", { method: "DELETE" });
const reg = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key",
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@admin.admin", password: PASS, returnSecureToken: true }) })).json();
const UID = reg.localId; assert.ok(UID);
await sembrar(`admins/${UID}`, { activo: true });
await sembrar("config/estado", { registroAbierto: true });
await sembrar("lista/julian-ramirez-soto", { nombre: "Julián Ramírez Soto" });
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
  await prueba("seguridad: registrar un nombre con <img src=x onerror=alert(1)> no ejecuta nada, se rechaza y no crea datos", async () => {
    const dialogos = []; p.on("dialog", (d) => { dialogos.push(d.message()); d.dismiss(); });
    const PAYLOAD = "<img src=x onerror=alert(1)>";
    const antes = (await listar("participantes")).length;
    await p.fill("#nombre", PAYLOAD); await p.fill("#correo", "xss@alumnos.udg.mx"); await p.click("#enviar");
    await p.waitForFunction(() => /no puede contener/.test(document.querySelector("#nombre-error").textContent));
    await p.waitForTimeout(400);
    assert.deepEqual(dialogos, [], "no debe ejecutarse alert()");
    assert.equal(await p.locator("main img").count(), 0, "no debe existir ningún <img> inyectado");
    assert.equal(await p.getAttribute("#nombre", "aria-invalid"), "true");
    assert.equal(await p.inputValue("#nombre"), PAYLOAD, "el campo conserva el texto literal");
    assert.equal((await listar("participantes")).length, antes, "no se creó ningún participante");
    // Aunque el cliente lo permitiera, las reglas lo rechazan (prueba directa a Firestore con el mismo payload).
    p.removeAllListeners("dialog");
  });
  await prueba("registro: validación en vivo (correo @gmail) y se corrige sola", async () => {
    await p.fill("#nombre", "Julián Ramírez Soto");
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
    await p.fill("#nombre", "  ramirez   soto JULIAN "); await p.fill("#correo", " Julian.Ramirez0000@Alumnos.UDG.mx "); await p.click("#enviar");
    await p.waitForSelector("#listo:not([hidden])");
    assert.match(await p.textContent("#listo-texto"), /ramirez soto JULIAN/);
    const d = await leer("participantes/julian-ramirez-soto");
    assert.equal(d.fields.origen.stringValue, "registro"); assert.equal(d.fields.correo.stringValue, "julian.ramirez0000@alumnos.udg.mx");
    assert.ok(await leer("correos/julian.ramirez0000@alumnos.udg.mx"));
  });
  const p2 = await nuevaPagina(); await p2.goto(`${BASE}/index.html?emulador`);
  await prueba("registro: duplicado por nombre → mensaje único", async () => {
    await p2.fill("#nombre", "Julián Ramírez Soto"); await p2.fill("#correo", "otro@alumnos.udg.mx"); await p2.click("#enviar");
    await p2.waitForFunction(() => /No pudimos completar/.test(document.querySelector("#aviso").textContent));
  });
  await prueba("registro: duplicado por correo → mensaje único", async () => {
    await p2.fill("#nombre", "Ana López"); await p2.fill("#correo", "julian.ramirez0000@alumnos.udg.mx"); await p2.click("#enviar");
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
  await prueba("login: campos sin autocapitalizar ni autocorregir; usuario con autocomplete=username", async () => {
    for (const id of ["#usuario", "#contrasena"]) {
      assert.equal(await p.getAttribute(id, "autocapitalize"), "none", id);
      assert.equal(await p.getAttribute(id, "autocorrect"), "off", id);
      assert.equal(await p.getAttribute(id, "spellcheck"), "false", id);
    }
    assert.equal(await p.getAttribute("#usuario", "autocomplete"), "username");
  });
  await prueba("login: usuario con espacios y mayúsculas ('  ADMIN123\t') se normaliza; contraseña mala → mensaje de credenciales y código en consola", async () => {
    const errores = []; const oyente = (m) => { if (m.type() === "error") errores.push(m.text()); }; p.on("console", oyente);
    await p.fill("#usuario", "  ADMIN123\t"); await p.fill("#contrasena", "mala"); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent) && !document.querySelector("#entrar").disabled);
    p.off("console", oyente);
    assert.ok(errores.some((t) => /auth\/(invalid-credential|wrong-password)/.test(t)), "console.error con el código: " + errores.join(" | "));
    assert.ok(!errores.some((t) => t.includes("mala")), "nunca la contraseña en consola");
  });
  for (const [nombre, cuerpo, esperado] of [
    ["sin conexión (petición abortada)", null, /No pudimos conectar con el servicio de acceso/],
    ["método de acceso desactivado", { error: { code: 400, message: "OPERATION_NOT_ALLOWED" } }, /desactivado en Firebase Authentication/],
    ["dominio no autorizado", { error: { code: 400, message: "UNAUTHORIZED_DOMAIN : localhost" } }, /no está autorizado en Firebase Authentication/],
    ["clave de API inválida o bloqueada", { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", errors: [{ reason: "badRequest" }] } }, /clave de API/],
  ]) await prueba(`login: ${nombre} → mensaje propio, claro y que no revela usuario/contraseña, con el código en consola`, async () => {
    const q = await nuevaPagina(); await q.goto(`${BASE}/login.html?emulador`);
    const consola = []; q.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });
    await q.route(/accounts:signInWithPassword/, (r) => cuerpo ? r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify(cuerpo) }) : r.abort());
    await q.fill("#usuario", "admin123"); await q.fill("#contrasena", "lo-que-sea"); await q.click("#entrar");
    await q.waitForFunction(() => document.querySelector("#aviso").textContent.length > 0 && !document.querySelector("#entrar").disabled);
    const t = await q.textContent("#aviso");
    assert.match(t, esperado, t);
    assert.ok(!/incorrectos/.test(t), "no debe parecer un fallo de credenciales: " + t);
    assert.ok(consola.some((c) => /\[login\] error de Firebase: auth\//.test(c)), "console.error con el código: " + consola.join(" | "));
    console.log(`   [info] ${nombre}: «${t.slice(0, 70)}…» · consola: ${consola.find((c) => c.includes("[login]"))?.replace("[login] error de Firebase: ", "")}`);
    await q.close();
  });
  await prueba("login: usuario 'admin' (no admin123) se rechaza SIN llamar a Firebase", async () => {
    p.authCalls = 0;
    await p.fill("#usuario", "admin"); await p.fill("#contrasena", PASS); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent));
    assert.equal(p.authCalls, 0);
  });
  await prueba("login: correo directo 'admin@admin.admin' tampoco se acepta", async () => {
    p.authCalls = 0;
    await p.fill("#usuario", "admin@admin.admin"); await p.fill("#contrasena", PASS); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent));
    assert.equal(p.authCalls, 0);
  });
  await prueba("login: contraseña incorrecta → mismo mensaje (llama a Firebase)", async () => {
    p.authCalls = 0;
    await p.fill("#usuario", "admin123"); await p.fill("#contrasena", "mala"); await p.click("#entrar");
    await p.waitForFunction(() => /incorrectos/.test(document.querySelector("#aviso").textContent) && !document.querySelector("#entrar").disabled);
    assert.equal(p.authCalls, 1);
  });
  await prueba("login: cuenta sin documento en admins/ → 'Sin permisos de administrador' y sesión cerrada", async () => {
    await fetch(`${FS}/admins/${UID}`, { method: "DELETE", headers: OWNER });
    await p.fill("#usuario", "admin123"); await p.fill("#contrasena", PASS); await p.click("#entrar");
    await p.waitForFunction(() => /Sin permisos de administrador/.test(document.querySelector("#aviso").textContent));
    assert.match(p.url(), /login\.html/);
    await p.goto(`${BASE}/panel.html?emulador`); await p.waitForURL(/login\.html/);   // no quedó sesión
    await sembrar(`admins/${UID}`, { activo: true });
    await p.goto(`${BASE}/login.html?emulador`);
  });
  await prueba("login: admin123 + contraseña correcta → panel", async () => {
    await p.fill("#usuario", " Admin123 "); await p.fill("#contrasena", PASS); await p.click("#entrar");
    await p.waitForURL(/panel\.html/);
  });
  assert.deepEqual(p.errores, []);
}

// ------------------------------------------------------------------ PANEL + SORTEO (misma sesión)
{
  const ctxPage = await nuevaPagina();
  const p = ctxPage; await p.goto(`${BASE}/login.html?emulador`);
  await p.fill("#usuario", "admin123"); await p.fill("#contrasena", PASS); await p.click("#entrar");
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
    assert.match(t, /Julián Ramírez Soto/); assert.match(t, /escrito distinto/); assert.match(t, /Tecleó: «ramirez soto JULIAN»/);
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
    assert.match(t, /Se leyeron 7 nombres/); assert.match(t, /1 listos para guardar/);
    assert.equal(await p.locator("#muestra-lista li").count(), 1);
    assert.match(await p.textContent("#muestra-lista"), /Carlos R\..*se guardará como «Carlos Ruiz»/); assert.match(t, /2 colisión/); assert.match(t, /Rosa de las Nieves {1,3}↔ {1,3}Rosa Nieves/); assert.match(t, /Ana/); assert.match(t, /1 línea\(s\) repetida/);
    // Luis Pérez-Gil y Pérez Gil Luis son el MISMO nombre escrito distinto → colisión (nombres distintos, misma clave)
    await p.click("#guardar-lista"); await p.waitForSelector("#vista-previa", { state: "hidden" });
  });
  await prueba("panel: lista guardada en Firestore y reflejada", async () => {
    assert.ok(await leer("lista/carlos-ruiz")); assert.equal(await leer("lista/gil-luis-perez"), null);
    await p.waitForFunction(() => /Carlos Ruiz/.test(document.querySelector("#lista-actual").textContent));
  });
  await prueba("panel: lista pegada con viñetas, asteriscos, numeración y puntos finales se guarda LIMPIA; vista previa con máscara de los 3 primeros", async () => {
    await p.click("#tab-b-lista");
    await p.fill("#texto-lista", ["• SARA NIETO LUNA.", "* LEO RIOS PAZ,", "3. MARTA ELENA RIOS Y VEGA SOTO.", "- ROSA DEL PILAR MORA DIAZ", "<b>MALO NOMBRE</b>"].join("\n"));
    await p.click("#analizar");
    const t = await p.textContent("#vista-previa");
    assert.match(t, /Se leyeron 5 nombres/); assert.match(t, /4 listos para guardar/); assert.match(t, /no puede contener/);
    assert.equal(await p.locator("#muestra-lista li").count(), 3, "solo los 3 primeros");
    const muestra = await p.textContent("#muestra-lista");
    for (const f of ["Sara N. L.", "Leo R. P.", "Marta E. R. V. S.", "«SARA NIETO LUNA»", "«LEO RIOS PAZ»"]) assert.ok(muestra.includes(f), f + " ⊄ " + muestra);
    assert.ok(!muestra.includes("Rosa"), "la 4.ª no aparece en la muestra");
    await p.click("#guardar-lista"); await p.waitForSelector("#vista-previa", { state: "hidden" });
    assert.equal((await leer("lista/luna-nieto-sara")).fields.nombre.stringValue, "SARA NIETO LUNA");
    assert.equal((await leer("lista/leo-paz-rios")).fields.nombre.stringValue, "LEO RIOS PAZ");
    assert.equal((await leer("lista/diaz-mora-pilar-rosa")).fields.nombre.stringValue, "ROSA DEL PILAR MORA DIAZ");
    assert.equal((await leer("lista/elena-marta-rios-soto-vega")).fields.nombre.stringValue, "MARTA ELENA RIOS Y VEGA SOTO");
    await borrar("lista/luna-nieto-sara"); await borrar("lista/leo-paz-rios"); await borrar("lista/diaz-mora-pilar-rosa"); await borrar("lista/elena-marta-rios-soto-vega");
    await p.click("#tab-b-participantes");
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
    await p.fill("#buscar", "RAMIREZ");
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
  await prueba("panel: 'Descargar registro del sorteo' sin sorteos guardados explica que el modo Ensayo no guarda y no descarga", async () => {
    await p.click("#descargar-registro");
    await p.waitForFunction(() => /Aún no hay sorteos guardados \(el modo Ensayo no guarda\)/.test(document.querySelector("#aviso").textContent));
  });
  const s = await p.context().newPage(); s.errores = []; s.on("pageerror", (e) => s.errores.push(e.message));
  await s.emulateMedia({ reducedMotion: "reduce" });
  await s.goto(`${BASE}/sorteo.html?emulador`); await s.waitForSelector("#contenido:not([hidden])");
  await s.waitForFunction(() => document.querySelector("#contador").textContent !== "–");
  const MASCARAS = ["Julián R. S.", "María Á.", "Ana L."];                 // de los 3 nombres OFICIALES de la lista
  await prueba("sorteo: contador = clones inscritos (3)", async () => { assert.equal(await s.textContent("#contador"), "3"); });
  await prueba("sorteo: ensayo no guarda nada, muestra la MÁSCARA del nombre oficial y 'Mostrar nombre completo' el oficial", async () => {
    await s.check("#ensayo"); await s.click("#sortear"); await s.waitForSelector("#resultado:not([hidden])");
    const mascara = await s.textContent("#ganador");
    assert.ok(MASCARAS.includes(mascara), mascara);
    assert.ok(!/Troll/.test(await s.textContent("#proyeccion")), "nunca el nombre tecleado");
    assert.ok(!/\d{3}/.test(mascara), "la máscara no lleva dígitos");
    assert.equal((await listar("sorteos")).length, 0);
    assert.equal(await s.isVisible("#etiqueta-ensayo"), true);
    await s.click("#nombre-completo");
    const completo = await s.textContent("#ganador");
    assert.ok(["Julián Ramírez Soto", "María de los Ángeles", "Ana López"].includes(completo), completo);
    await s.click("#nombre-completo"); assert.equal(await s.textContent("#ganador"), mascara);
  });
  await prueba("sorteo: el atajo Espacio sortea de nuevo (ensayo) y la tecla N alterna el nombre completo", async () => {
    await s.waitForFunction(() => !document.querySelector("#sortear").disabled);
    await s.evaluate(() => document.activeElement?.blur());
    await s.keyboard.press("Space");
    await s.waitForFunction(() => !document.querySelector("#sortear").disabled && !document.querySelector("#resultado").hidden);
    await s.keyboard.press("n"); assert.equal(await s.getAttribute("#nombre-completo", "aria-pressed"), "true");
    await s.keyboard.press("n"); assert.equal(await s.getAttribute("#nombre-completo", "aria-pressed"), "false");
  });
  await prueba("ETAPA 0 · reglas publicadas ANTIGUAS (sin adminUid): mensaje exacto de reglas, código en consola, nada guardado ni revelado", async () => {
    const consola = []; const oyente = (m) => { if (m.type() === "error") consola.push(m.text()); }; s.on("console", oyente);
    await s.uncheck("#ensayo"); await ponerReglas(REGLAS_ANTIGUAS); await s.waitForTimeout(800);
    await s.waitForFunction(() => !document.querySelector("#sortear").disabled);
    await s.click("#sortear");
    await s.waitForFunction(() => document.querySelector("#aviso").textContent.length > 0);
    assert.equal(await s.textContent("#aviso"), "Las reglas de Firestore publicadas no coinciden con esta versión de la app. Republica firestore.rules.");
    assert.ok(consola.some((c) => c.includes("[sorteo] no se pudo guardar la ronda: permission-denied")), "console.error con el código: " + consola.join(" | "));
    assert.equal((await listar("sorteos")).length, 0, "no se guardó nada");
    assert.equal(await s.isHidden("#resultado"), true, "no se reveló a nadie");
    assert.equal(await s.isDisabled("#sortear"), false, "se puede reintentar");
    s.off("console", oyente);
    await ponerReglas(REGLAS); await s.waitForTimeout(800);
  });
  await prueba("ETAPA 0 · sin conexión: mensaje de conexión (no de reglas), falla rápido y no deja escrituras en cola", async () => {
    const consola = []; const oyente = (m) => { if (m.type() === "error") consola.push(m.text()); }; s.on("console", oyente);
    await s.waitForFunction(() => !document.querySelector("#sortear").disabled);
    await s.context().setOffline(true);
    const t0 = Date.now(); await s.click("#sortear");
    await s.waitForFunction(() => document.querySelector("#aviso").textContent.length > 0, null, { timeout: 20000 });
    const seg = (Date.now() - t0) / 1000;
    const t = await s.textContent("#aviso");
    assert.match(t, /No hay conexión con el servidor/); assert.ok(!/reglas/i.test(t), t);
    assert.ok(seg < 15, `debe fallar rápido, tardó ${seg} s`);
    assert.ok(consola.some((c) => /\[sorteo\] no se pudo guardar la ronda: (unavailable|deadline-exceeded|cancelled|failed-precondition)/.test(c)), consola.join(" | "));
    assert.equal(await s.isHidden("#resultado"), true);
    await s.context().setOffline(false); await s.waitForTimeout(4000);
    assert.equal((await listar("sorteos")).length, 0, "nada quedó en cola para aplicarse después");
    s.off("console", oyente);
    await s.waitForFunction(() => !document.querySelector("#sortear").disabled);
  });
  const ganadores = [];
  await prueba("sorteo real: guarda ronda, adminUid, excluye previos con 'Volver a sortear' y nunca repite", async () => {
    await s.uncheck("#ensayo");
    for (let ronda = 1; ronda <= 3; ronda++) {
      await s.waitForFunction(() => !document.querySelector("#sortear").disabled);
      assert.equal(await s.textContent("#sortear"), ronda === 1 ? "Liberar el antígeno" : "Volver a sortear");
      await s.click("#sortear");
      await s.waitForFunction((r) => !document.querySelector("#resultado").hidden && /Ronda/.test(document.querySelector("#ronda").textContent) && document.querySelector("#ronda").textContent.includes(String(r)), ronda);
      ganadores.push(await s.textContent("#ganador"));
      assert.equal(await s.isVisible("#etiqueta-ensayo"), false);
      await s.waitForFunction(() => document.querySelector("#fase").textContent === "Clon seleccionado.");
    }
    assert.equal(new Set(ganadores).size, 3, ganadores.join(" | "));
    const docs = await listar("sorteos");
    assert.equal(docs.length, 3);
    assert.deepEqual(docs.map((d) => Number(d.fields.ronda.integerValue)).sort(), [1, 2, 3]);
    assert.deepEqual(docs.map((d) => Number(d.fields.totalParticipantes.integerValue)).sort(), [1, 2, 3]);
    for (const d of docs) assert.equal(d.fields.adminUid.stringValue, UID, "adminUid = UID de la sesión");
    // Contrato documento ↔ reglas: los campos escritos por la app son EXACTAMENTE los de hasOnly/hasAll de firestore.rules
    const bloque = REGLAS.slice(REGLAS.indexOf("match /sorteos/{id}"));
    const permitidos = [...bloque.matchAll(/hasOnly\(\[([^\]]+)\]\)/g)][0][1].split(",").map((x) => x.trim().replace(/'/g, "")).sort();
    const exigidos = [...bloque.matchAll(/hasAll\(\[([^\]]+)\]\)/g)][0][1].split(",").map((x) => x.trim().replace(/'/g, "")).sort();
    assert.deepEqual(permitidos, exigidos);
    for (const d of docs) assert.deepEqual(Object.keys(d.fields).sort(), permitidos, "campos del documento = campos de las reglas");
    for (const d of docs) assert.ok(d.fields.fecha.timestampValue && await leer(`participantes/${d.fields.ganadorClave.stringValue}`), "fecha del servidor y ganador existente");
    assert.equal(await s.isDisabled("#sortear"), true); // sin elegibles
  });
  await prueba("panel: 'Descargar registro del sorteo' genera el archivo con fecha, ronda, total y nombre OFICIAL", async () => {
    const [descarga] = await Promise.all([p.waitForEvent("download"), p.click("#descargar-registro")]);
    assert.match(descarga.suggestedFilename(), /^registro-sorteo-\d{4}-\d{2}-\d{2}\.txt$/);
    const { readFile } = await import("node:fs/promises");
    const txt = await readFile(await descarga.path(), "utf8");
    for (const f of ["Rondas registradas: 3", "Ronda 1", "Ronda 2", "Ronda 3", "Fecha:", "Total de participantes en la ronda: 3",
      "Total de participantes en la ronda: 1", `UID del admin): ${UID}`]) assert.ok(txt.includes(f), f);
    const oficiales = ["Julián Ramírez Soto", "María de los Ángeles", "Ana López"];
    for (const o of oficiales) assert.ok(txt.includes(`Ganador (nombre oficial): ${o}`), o);
    assert.ok(!txt.includes("Troll"), "nunca el nombre tecleado");
  });
  assert.deepEqual(s.errores, [], "errores JS en sorteo: " + s.errores);

  // corrida con animación completa (sin reduced-motion)
  for (const d of await listar("sorteos")) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: "DELETE", headers: OWNER });
  const a = await p.context().newPage(); a.errores = []; a.on("pageerror", (e) => a.errores.push(e.message));
  await a.goto(`${BASE}/sorteo.html?emulador`); await a.waitForFunction(() => document.querySelector("#contador").textContent === "3");
  await prueba("sorteo con animación completa: 4 escenas en orden, revelación entre 8 y 12 s y resultado enmascarado", async () => {
    await a.check("#ensayo");
    const t0 = Date.now(); await a.click("#sortear");
    const fases = [];
    while (await a.isHidden("#resultado") && Date.now() - t0 < 30000) {
      const f = await a.textContent("#fase"); if (fases.at(-1) !== f) fases.push(f); await a.waitForTimeout(100);
    }
    const dur = (Date.now() - t0) / 1000;
    assert.ok(dur >= 8 && dur <= 12.5, `duración hasta la revelación: ${dur.toFixed(1)} s`);
    const lista = fases.join(" > ");
    const iE = ["El repertorio", "El antígeno explora", "Reconocimiento", "Expansión clonal"].map((x) => lista.indexOf(x));
    assert.ok(iE.every((x) => x >= 0) && iE.every((x, i) => i === 0 || x > iE[i - 1]), lista);
    assert.ok(MASCARAS.includes(await a.textContent("#ganador")));
    console.log(`   [info] revelación a los ${dur.toFixed(1)} s`);
  });
  await prueba("sorteo: el botón 'Pantalla completa' activa el modo proyección y los mandos se ocultan por inactividad", async () => {
    await a.waitForFunction(() => !document.querySelector("#sortear").disabled);
    await a.click("#pantalla-completa");
    await a.waitForFunction(() => document.fullscreenElement?.id === "proyeccion");
    await a.mouse.move(10, 10); await a.waitForTimeout(3400);
    assert.equal(await a.evaluate(() => document.querySelector("#proyeccion").classList.contains("inactivo")), true);
    await a.mouse.move(40, 40);
    assert.equal(await a.evaluate(() => document.querySelector("#proyeccion").classList.contains("inactivo")), false);
    await a.keyboard.press("f"); await a.waitForFunction(() => !document.fullscreenElement);
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
  await prueba("seguridad: datos YA guardados con <img src=x onerror=alert(1)> (nombre, nombre oficial, correo) se muestran como texto en panel y sorteo", async () => {
    const PAYLOAD = "<img src=x onerror=alert(1)>", TECLEADO = PAYLOAD + " de", OFICIAL = "<IMG src=x onerror=alert(1)>", CORREO = "<img src=x onerror=alert(1)>@alumnos.udg.mx";
    const { claveDeNombre } = await import(`${REPO}/js/normalizar.js`);
    const k = claveDeNombre(PAYLOAD);
    assert.equal(k, claveDeNombre(OFICIAL));
    // Escritos con el token "owner" (se saltan las reglas), como datos antiguos o escritos desde la consola.
    await sembrar(`lista/${k}`, { nombre: OFICIAL });
    await sembrar(`participantes/${k}`, { nombre: TECLEADO, clave: k, correo: CORREO, origen: "registro", creadoEn: new Date() });
    await sembrar(`correos/${encodeURIComponent(CORREO)}`, { clave: k });
    const x = await p.context().newPage(); const dialogos = [];
    x.on("dialog", (d) => { dialogos.push(d.message()); d.dismiss(); }); x.errores = []; x.on("pageerror", (e) => x.errores.push(e.message));
    await x.goto(`${BASE}/panel.html?emulador`); await x.waitForFunction(() => document.querySelector("#n-registrados").textContent === "1");
    await x.click("#tab-b-lista");
    for (const [zona, esperado] of [["#participantes", OFICIAL], ["#participantes", CORREO], ["#participantes", `Tecleó: «${TECLEADO}»`], ["#lista-actual", OFICIAL]])
      assert.ok((await x.textContent(zona)).includes(esperado), `${zona} debe mostrar como TEXTO: ${esperado}`);
    assert.equal(await x.locator("#participantes img, #lista-actual img, main img").count(), 0, "ningún <img> en el panel");
    assert.equal(await x.getAttribute("#participantes button", "aria-label"), `Eliminar a ${OFICIAL}`);
    // Sorteo: pool de 1 → gana el único; la máscara y el nombre completo (tecla N) se muestran como texto.
    await x.goto(`${BASE}/sorteo.html?emulador`); await x.waitForFunction(() => document.querySelector("#contador").textContent === "1");
    await x.emulateMedia({ reducedMotion: "reduce" }); await x.reload(); await x.waitForFunction(() => document.querySelector("#contador").textContent === "1");
    await x.check("#ensayo"); await x.click("#sortear"); await x.waitForSelector("#resultado:not([hidden])");
    assert.match(await x.textContent("#ganador"), /^<img /, "la máscara se muestra literal");
    await x.keyboard.press("n");
    assert.ok((await x.textContent("#ganador")).includes("<img "), "el nombre completo se muestra literal");
    assert.equal(await x.locator("#proyeccion img, main img").count(), 0, "ningún <img> en el sorteo");
    await x.waitForTimeout(500);
    assert.deepEqual(dialogos, [], "no debe ejecutarse alert()"); assert.deepEqual(x.errores, []);
    await x.close();
    await borrar(`lista/${k}`); await borrar(`participantes/${k}`); await borrar(`correos/${encodeURIComponent(CORREO)}`);
  });
  await prueba("rendimiento: 100 participantes → animación fluida (≥ 30 fps) y revelación entre 8 y 12 s", async () => {
    const { claveDeNombre } = await import(`${REPO}/js/normalizar.js`);
    const N = ["Ana", "Luis", "Marta", "Pedro", "Sofia", "Diego", "Elena", "Raul", "Irene", "Hugo"];
    const A = ["Lopez", "Garcia", "Ruiz", "Soto", "Vega", "Mora", "Rios", "Cruz", "Paz", "Luna"];
    const B = ["Alba", "Bravo", "Campos", "Duran", "Ibarra", "Lara", "Nava", "Ortiz", "Pena", "Rey"];
    await sembrar("config/estado", { registroAbierto: false });
    for (let i = 0; i < 100; i++) {
      const nombre = `${N[i % 10]} ${A[Math.floor(i / 10) % 10]} ${B[(i * 7 + Math.floor(i / 10)) % 10]}`, k = claveDeNombre(nombre), c = `p${i}@alumnos.udg.mx`;
      await sembrar(`lista/${k}`, { nombre }); await sembrar(`participantes/${k}`, { nombre, clave: k, correo: c, origen: "registro", creadoEn: new Date() }); await sembrar(`correos/${c}`, { clave: k });
    }
    const f = await p.context().newPage(); f.errores = []; f.on("pageerror", (e) => f.errores.push(e.message));
    await f.goto(`${BASE}/sorteo.html?emulador`); await f.waitForFunction(() => document.querySelector("#contador").textContent === "100");
    await f.check("#ensayo");
    await f.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
    const t0 = Date.now(); await f.click("#sortear");
    await f.waitForSelector("#resultado:not([hidden])", { timeout: 20000 });
    const dur = (Date.now() - t0) / 1000, fps = (await f.evaluate(() => window.__f)) / dur;
    console.log(`   [info] 100 participantes: revelación a los ${dur.toFixed(1)} s, ${fps.toFixed(0)} fps medios`);
    assert.ok(dur >= 8 && dur <= 12.5, `duración ${dur}`); assert.ok(fps >= 30, `fps ${fps}`);
    assert.deepEqual(f.errores, []); await f.close();
  });
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
