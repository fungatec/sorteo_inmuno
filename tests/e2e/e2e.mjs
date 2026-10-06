// Pruebas de extremo a extremo (navegador real + emuladores de Auth y Firestore). Usa datos ficticios.
// Sin acceso al CDN de gstatic, el SDK se empaqueta localmente y se sirve en su lugar (solo en la prueba).
//   cd tests/e2e && npm i --no-save firebase firebase-tools playwright-core esbuild
//   npx esbuild fb-entry.js --bundle --format=esm --outfile=fb.js
//   cp ../../firestore.rules . && echo '{"firestore":{"rules":"firestore.rules"}}' > firebase.json
//   (opcional, prueba de los códigos QR sin salir a internet: npm pack qrcode-generator@1.4.4, descomprimir y QR_LIB=/ruta/package/qrcode.js)
//   CHROMIUM_PATH=/ruta/a/chrome npx firebase emulators:exec --only firestore,auth --project sorteoinmuno "node e2e.mjs"
import { chromium } from "playwright-core";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import assert from "node:assert/strict";
import { SUBTITULOS } from "../../js/contenido-cientifico.js";

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
  if (process.env.QR_LIB) await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/1\.4\.4\/qrcode\.min\.js/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(process.env.QR_LIB, "utf8") }));
  await ctx.route("**/js/firebase-config.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: CONFIG_TEST }));
  const page = await ctx.newPage();
  page.errores = []; page.on("pageerror", (e) => page.errores.push(e.message));
  page.authCalls = 0; page.on("request", (q) => { if (q.url().includes(":9099") && q.url().includes("signInWithPassword")) page.authCalls++; });
  return page;
}
const DENEGADO = /avisa a la maestra/;
// Con prefers-reduced-motion cada escena dura 3 s: la tecla S las salta para no esperar ~25 s por ronda en cada prueba.
async function acelerar(pg, ms = 60000) {
  const t0 = Date.now();
  while (await pg.isHidden("#resultado") && Date.now() - t0 < ms) { await pg.keyboard.press("s"); await pg.waitForTimeout(120); }
}
// Lee la secuencia de subtítulos (#fase) hasta que aparece el resultado.
async function subtitulos(pg, ms = 60000) {
  const t0 = Date.now(), vistos = [];
  while (await pg.isHidden("#resultado") && Date.now() - t0 < ms) {
    const f = await pg.textContent("#fase"); if (f && vistos.at(-1) !== f) vistos.push(f); await pg.waitForTimeout(100);
  }
  return { vistos, seg: (Date.now() - t0) / 1000 };
}

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
    const confirmacion = await p.textContent("#listo-texto");
    assert.match(confirmacion, /ramirez soto JULIAN/);
    assert.match(confirmacion, /tu linfocito T virgen ya patrulla el ganglio linfático\. Ahora solo queda esperar a que llegue la célula dendrítica\./);
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
  // ---------------- PASO 7B: pulido del registro (360 px, mobile-first)
  await prueba("PASO 7B · registro: campos con etiqueta, ayuda, ejemplo ficticio, atributos móviles, fuente ≥ 16 px y objetivos táctiles ≥ 48 px", async () => {
    const q = await nuevaPagina({ viewport: { width: 360, height: 740 } }); await q.goto(`${BASE}/index.html?emulador`);
    await q.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto");
    const info = await q.evaluate(() => Object.fromEntries(["nombre", "correo"].map((id) => { const i = document.getElementById(id), cs = getComputedStyle(i);
      return [id, { ac: i.autocomplete, im: i.inputMode, cap: i.getAttribute("autocapitalize"), corr: i.getAttribute("autocorrect"), ph: i.placeholder, fs: parseFloat(cs.fontSize), h: i.getBoundingClientRect().height,
        etiqueta: !!document.querySelector(`label[for=${id}]`)?.textContent.trim(), ayuda: document.getElementById(id + "-ayuda").textContent.trim() }]; })));
    assert.equal(info.nombre.ac, "name"); assert.equal(info.nombre.cap, "words"); assert.equal(info.nombre.corr, "off");
    assert.equal(info.correo.ac, "email"); assert.equal(info.correo.im, "email"); assert.equal(info.correo.cap, "none"); assert.equal(info.correo.corr, "off");
    assert.match(info.nombre.ph, /^Ej\.: /); assert.match(info.correo.ph, /@alumnos\.udg\.mx$/);
    assert.match(info.nombre.ayuda, /Con ambos apellidos, como aparece en tu lista/);
    for (const k of ["nombre", "correo"]) { assert.ok(info[k].fs >= 16, `fuente ${k}: ${info[k].fs}`); assert.ok(info[k].h >= 48, `alto ${k}: ${info[k].h}`); assert.ok(info[k].etiqueta); }
    const b = await q.locator("#enviar").boundingBox(), campo = await q.locator("#nombre").boundingBox();
    assert.ok(b.height >= 48 && b.width >= campo.width - 1, `botón ancho y alto: ${b.width}×${b.height}`);
    const orden = await q.evaluate(() => ["h1", ".lead", "#nombre", "#correo", "#enviar", ".privacidad"].map((s) => document.querySelector(s).getBoundingClientRect().top));
    assert.deepEqual([...orden].sort((x, y) => x - y), orden, "jerarquía: título, frase, dos campos, botón y privacidad debajo");
    assert.equal(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await q.context().close();
  });
  await prueba("PASO 7B · registro: la validación ocurre al salir del campo y al enviar (no en cada tecla), con foco en el primer error", async () => {
    const q = await nuevaPagina(); await q.goto(`${BASE}/index.html?emulador`);
    await q.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto");
    await q.click("#correo"); await q.keyboard.type("x@gmai", { delay: 20 });
    assert.equal(await q.isHidden("#correo-error"), true, "mientras se escribe no aparece el error");
    await q.press("#correo", "Tab"); assert.equal(await q.isVisible("#correo-error"), true);
    assert.match(await q.textContent("#correo-error"), /@alumnos\.udg\.mx/);
    await q.fill("#correo", "ok@alumnos.udg.mx"); assert.equal(await q.isHidden("#correo-error"), true, "al corregirlo el error se retira");
    await q.fill("#correo", "x@gmail.com"); await q.click("#nombre"); await q.fill("#nombre", ""); await q.click("#enviar");
    assert.equal(await q.evaluate(() => document.activeElement.id), "nombre", "foco en el primer error");
    assert.equal(await q.isVisible("#nombre-error"), true); assert.equal(await q.isVisible("#correo-error"), true);
    await q.context().close();
  });
  await prueba("PASO 7B · registro: el botón muestra «Inscribiendo…», queda deshabilitado (aria-busy) y no permite doble envío", async () => {
    const q = await nuevaPagina(); await q.goto(`${BASE}/index.html?emulador`);
    await q.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto");
    await q.evaluate(() => { window.__t = []; new MutationObserver(() => window.__t.push([document.querySelector("#enviar").textContent, document.querySelector("#enviar").disabled])).observe(document.querySelector("#enviar"), { childList: true, subtree: true, attributes: true, characterData: true }); });
    await q.fill("#nombre", "Persona Inventada Prueba"); await q.fill("#correo", "inventada@alumnos.udg.mx");
    await q.dblclick("#enviar");
    await q.waitForFunction(() => /No pudimos completar/.test(document.querySelector("#aviso").textContent));
    const t = await q.evaluate(() => window.__t);
    assert.ok(t.some(([x, d]) => x === "Inscribiendo…" && d === true), JSON.stringify(t));
    assert.equal(await q.textContent("#enviar"), "Inscribir mi linfocito"); assert.equal(await q.isDisabled("#enviar"), false);
    await q.context().close();
  });
  await prueba("PASO 7B · registro: confirmación con «Ver el sorteo en vivo» como acción principal y la nota «Guarda este enlace…»", async () => {
    assert.equal(await p2.isVisible("#listo"), true);
    const a = await p2.locator("#ver-en-vivo").boundingBox();
    assert.ok(a.height >= 48 && a.width > 250, `${a.width}×${a.height}`);
    assert.match(await p2.textContent("#listo"), /Guarda este enlace para el día del sorteo\./);
    assert.ok((await p2.locator("#copiar-vivo").count()) === 1);
  });
  await prueba("PASO 7B · registro: sin conexión muestra un aviso amable y con prefers-reduced-motion se anulan las animaciones", async () => {
    const q = await nuevaPagina(); await q.emulateMedia({ reducedMotion: "reduce" }); await q.goto(`${BASE}/index.html?emulador`);
    await q.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto");
    assert.equal(await q.isHidden("#sin-conexion"), true);
    await q.context().setOffline(true);
    await q.waitForFunction(() => !document.querySelector("#sin-conexion").hidden);
    assert.match(await q.textContent("#sin-conexion"), /Sin conexión a internet\. Tus datos siguen aquí/);
    await q.context().setOffline(false); await q.waitForFunction(() => document.querySelector("#sin-conexion").hidden);
    assert.equal(await q.evaluate(() => getComputedStyle(document.querySelector("#registro")).animationName), "none");
    await q.context().close();
  });
  await prueba("PASO 7B · metaetiquetas: título por página, favicon, theme-color y Open Graph con URL absoluta e imagen PNG de 1200×630", async () => {
    const titulos = new Set();
    for (const f of ["index", "login", "panel", "sorteo", "en-vivo"]) {
      const html = readFileSync(join(REPO, `${f}.html`), "utf8");
      const t = html.match(/<title>(.+?)<\/title>/)?.[1]; assert.ok(t && t.length > 8, f); titulos.add(t);
      assert.match(html, /<link rel="icon" href="favicon\.svg"/, `${f}: favicon`); assert.match(html, /<meta name="theme-color" content="#053043">/, `${f}: theme-color`);
    }
    assert.equal(titulos.size, 5, "un título distinto por página");
    for (const f of ["index", "en-vivo"]) {
      const html = readFileSync(join(REPO, `${f}.html`), "utf8");
      assert.match(html, /<meta property="og:image" content="https:\/\/fungatec\.github\.io\/sorteo_inmuno\/img\/og\.png">/, f);
      assert.match(html, /<meta property="og:title" content="[^"]+">/); assert.match(html, /<meta property="og:description" content="[^"]+">/); assert.match(html, /<meta property="og:url" content="https:\/\/fungatec\.github\.io\/sorteo_inmuno\//);
    }
    const png = readFileSync(join(REPO, "img/og.png"));
    assert.equal(png.subarray(1, 4).toString(), "PNG"); assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
    assert.ok(existsSync(join(REPO, "favicon.svg")) && existsSync(join(REPO, "img/apple-touch-icon.png")));
  });
  await sembrar("config/estado", { registroAbierto: false });
  const p3 = await nuevaPagina(); await p3.goto(`${BASE}/index.html?emulador`);
  await prueba("registro cerrado: 'El registro está cerrado' reemplaza al formulario", async () => {
    await p3.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro cerrado");
    assert.equal(await p3.isVisible("#registro"), false); assert.match(await p3.textContent("#cerrado"), /El registro está cerrado/);
  });
  await prueba("PASO 6 · registro: «Ver el sorteo en vivo» en la tarjeta de registro cerrado y en la confirmación; el aviso de privacidad menciona la máscara", async () => {
    assert.equal(await p3.getAttribute("#cerrado a.enlace-vivo", "href"), "en-vivo.html"); assert.equal(await p3.isVisible("#cerrado a.enlace-vivo"), true);
    assert.equal(await p2.getAttribute("#listo a.enlace-vivo", "href"), "en-vivo.html"); assert.equal(await p2.isVisible("#listo a.enlace-vivo"), true);
    assert.match(await p3.textContent(".privacidad"), /solo para este sorteo y se eliminarán al terminar el evento\. La transmisión en vivo muestra, a quien tenga el enlace, la máscara del nombre del ganador/);
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
  await prueba("PASO 7 · con sesión de admin, la raíz sigue mostrando el registro (sin redirigir); «Administración» apunta a panel.html", async () => {
    const r = await p.context().newPage(); r.errores = []; r.on("pageerror", (e) => r.errores.push(e.message));
    await r.goto(`${BASE}/?emulador`);
    await r.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto");
    await r.waitForFunction(() => document.querySelector("#enlace-admin").getAttribute("href") === "panel.html");   // la sesión ya se resolvió
    await r.waitForTimeout(1500);
    assert.equal(new URL(r.url()).pathname, "/", "no hubo redirección"); assert.equal(await r.isVisible("#registro"), true);
    assert.match(await r.textContent("#enlace-admin"), /^Administración$/);
    const texto = await r.evaluate(() => document.body.innerText);
    for (const t of ["Panel", "Ir al sorteo", "Vaciar", "Lista de la clase", "Participantes", "Ensayo", "Activar otro linfocito"]) assert.ok(!texto.includes(t), `la página de estudiantes no debe mostrar «${t}»`);
    await r.click("#enlace-admin"); await r.waitForURL(/panel\.html/);
    // y sin registro abierto, aun con sesión de admin: la tarjeta de «registro cerrado», no el panel
    await sembrar("config/estado", { registroAbierto: false });
    await r.goto(`${BASE}/?emulador`); await r.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro cerrado");
    assert.equal(new URL(r.url()).pathname, "/"); assert.equal(await r.isVisible("#cerrado"), true);
    await sembrar("config/estado", { registroAbierto: true });
    assert.deepEqual(r.errores, []); await r.close();
  });
  await prueba("PASO 7 · sin sesión: la raíz muestra el registro y «Administración» apunta a login.html", async () => {
    const r = await nuevaPagina(); await r.goto(`${BASE}/?emulador`);
    await r.waitForFunction(() => document.querySelector("#estado-texto").textContent === "Registro abierto"); await r.waitForTimeout(1000);
    assert.equal(new URL(r.url()).pathname, "/"); assert.equal(await r.getAttribute("#enlace-admin", "href"), "login.html");
    assert.equal(await r.isVisible("#enlace-admin"), true);
    assert.ok((await r.locator("#enlace-admin").boundingBox()).height >= 44, "objetivo táctil suficiente");
    await r.close();
  });
  await prueba("PASO 7 · login, panel y sorteo llevan <meta name=\"robots\" content=\"noindex\">; el registro no", async () => {
    for (const f of ["login", "panel", "sorteo"]) assert.match(readFileSync(join(REPO, `${f}.html`), "utf8"), /<meta name="robots" content="noindex">/, f);
    assert.doesNotMatch(readFileSync(join(REPO, "index.html"), "utf8"), /noindex/);
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
  await prueba("PASO 7B · panel: cabecera «Registro: ABIERTO/CERRADO», «Inscritos X de Y» con barra de progreso y guía de 4 pasos con estado según los datos", async () => {
    assert.equal((await p.textContent("#estado-cabecera")).trim(), "ABIERTO");
    assert.equal(await p.textContent("#prog-x"), "3"); assert.equal(await p.textContent("#prog-y"), "3");
    assert.equal(await p.getAttribute("#progreso", "aria-valuenow"), "100"); assert.equal(await p.getAttribute("#progreso", "role"), "progressbar");
    assert.equal(await p.locator("#guia li").count(), 4);
    const est = () => p.evaluate(() => [...document.querySelectorAll("#guia li")].map((li) => li.dataset.estado));
    assert.deepEqual(await est(), ["hecho", "hecho", "pendiente", "pendiente"], "lista cargada, registro abierto con inscritos");
    p.once("dialog", (d) => d.accept());
    await p.click("#alternar"); await p.waitForFunction(() => document.querySelector("#estado-cabecera").textContent.trim() === "CERRADO");
    assert.deepEqual(await est(), ["hecho", "hecho", "actual", "pendiente"], "cerrado y sin sorteos: toca sortear");
    assert.equal(await p.textContent("#guia li:nth-child(3) .paso-estado"), "Siguiente");
    await p.click("#alternar"); await p.waitForFunction(() => document.querySelector("#estado-cabecera").textContent.trim() === "ABIERTO");
  });
  await prueba("PASO 7B · panel: «Ir al sorteo» habilitado con participantes y enlaces con «Copiado»; toasts que se cierran al tocarlos", async () => {
    assert.equal(await p.isDisabled("#ir-sorteo"), false);
    await p.click("#copiar-registro");
    await p.waitForFunction(() => document.querySelector("#copiar-registro").textContent === "Copiado ✓");
    assert.ok((await p.textContent("#aviso")).includes(`${BASE}/`) && /de registro copiado|de registro es/.test(await p.textContent("#aviso")));
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#aviso")).position), "fixed", "el aviso es un toast");
    await p.click("#aviso"); assert.equal(await p.isHidden("#aviso"), true);
    await p.click("#copiar-enlace"); await p.waitForFunction(() => document.querySelector("#copiar-enlace").textContent === "Copiado ✓");
    await p.waitForFunction(() => document.querySelector("#copiar-registro").textContent === "Copiar enlace de registro");
  });
  await prueba("PASO 7B · panel: la zona de peligro va al final, separada, con el recordatorio de descargar antes el registro del sorteo", async () => {
    const z = await p.evaluate(() => { const zona = document.querySelector(".zona-peligro"), otras = [...document.querySelectorAll("main > section.tarjeta")].filter((x) => x !== zona);
      return { ultimo: otras.every((o) => o.compareDocumentPosition(zona) & Node.DOCUMENT_POSITION_FOLLOWING), texto: zona.textContent, borde: getComputedStyle(zona).borderTopColor }; });
    assert.ok(z.ultimo); assert.match(z.texto, /Antes de vaciar, descarga el registro del sorteo/); assert.notEqual(z.borde, "rgb(211, 238, 240)");
  });
  await prueba("PASO 7B · panel (360 px): barra de acciones fija inferior y toasts por encima de ella", async () => {
    const m = await p.context().newPage(); await m.setViewportSize({ width: 360, height: 740 });
    await m.goto(`${BASE}/panel.html?emulador`); await m.waitForFunction(() => document.querySelector("#n-registrados").textContent !== "–");
    const r = await m.evaluate(() => { const b = document.querySelector("#barra-acciones").getBoundingClientRect(); return { pos: getComputedStyle(document.querySelector("#barra-acciones")).position, abajo: Math.round(innerHeight - b.bottom), ancho: Math.round(b.width), h: Math.round(b.height), sw: document.documentElement.scrollWidth <= innerWidth }; });
    assert.equal(r.pos, "fixed"); assert.ok(r.abajo <= 1 && r.ancho >= 358 && r.sw, JSON.stringify(r));
    await m.click("#copiar-registro"); await m.waitForSelector("#aviso:not([hidden])");
    const t = await m.evaluate(() => ({ toast: document.querySelector("#aviso").getBoundingClientRect().bottom, barra: document.querySelector("#barra-acciones").getBoundingClientRect().top }));
    assert.ok(t.toast <= t.barra, JSON.stringify(t));
    await m.close();
  });
  await prueba("PASO 7B · panel: códigos QR generados en el navegador (canvas con módulos oscuros) y mensaje amable si la librería no carga", async () => {
    const m = await p.context().newPage(); await m.goto(`${BASE}/panel.html?emulador`); await m.waitForFunction(() => document.querySelector("#n-registrados").textContent !== "–");
    if (process.env.QR_LIB) {
      await m.click("#alternar-qr"); await m.waitForSelector("#qr-zona:not([hidden])");
      await m.waitForFunction(() => { const c = document.querySelector("#qr-vivo"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 50) return true; return false; });
      const oscuros = await m.evaluate(() => ["#qr-registro", "#qr-vivo"].map((id) => { const c = document.querySelector(id), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 50) n++; return n; }));
      assert.ok(oscuros.every((n) => n > 2000), oscuros.join(","));
      assert.equal(await m.getAttribute("#alternar-qr", "aria-expanded"), "true");
    } else console.log("   [info] QR_LIB no definido: se omite la comprobación del dibujo del QR");
    const f = await p.context().newPage(); await f.context().route(/cdnjs\.cloudflare\.com\/.*qrcode\.min\.js/, (r) => r.abort());
    await f.goto(`${BASE}/panel.html?emulador`); await f.waitForFunction(() => document.querySelector("#n-registrados").textContent !== "–");
    await f.evaluate(() => { delete globalThis.qrcode; });
    await f.click("#alternar-qr"); await f.waitForFunction(() => !document.querySelector("#qr-aviso").hidden);
    assert.match(await f.textContent("#qr-aviso"), /No se pudo cargar el generador de códigos QR/); assert.equal(await f.isHidden("#qr-zona"), true);
    await m.close(); await f.close();
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
  await prueba("sorteo: contador = linfocitos T en el ganglio (3)", async () => {
    assert.equal(await s.textContent("#contador"), "3"); assert.equal(await s.textContent("#contador-texto"), "linfocitos T en el ganglio");
    assert.equal(await s.textContent("#sortear"), "Iniciar la respuesta inmune");
  });
  await prueba("sorteo: ensayo no guarda nada, muestra la MÁSCARA del nombre oficial y 'Mostrar nombre completo' el oficial", async () => {
    await s.check("#ensayo"); await s.click("#sortear"); await acelerar(s); await s.waitForSelector("#resultado:not([hidden])");
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
    await s.keyboard.press("Space"); await acelerar(s);
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
      assert.equal(await s.textContent("#sortear"), ronda === 1 ? "Iniciar la respuesta inmune" : "Activar otro linfocito");
      await s.click("#sortear"); await acelerar(s);
      await s.waitForFunction((r) => !document.querySelector("#resultado").hidden && /Ronda/.test(document.querySelector("#ronda").textContent) && document.querySelector("#ronda").textContent.includes(String(r)), ronda);
      ganadores.push(await s.textContent("#ganador"));
      assert.equal(await s.isVisible("#etiqueta-ensayo"), false);
      assert.match(await s.textContent("#tarjeta-tipo"), /^Linfocito T CD[48]\+ activado$/);
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
  await a.goto(`${BASE}/sorteo.html?emulador&modo=completo`); await a.waitForFunction(() => document.querySelector("#contador").textContent === "3");
  await prueba("?modo=completo: pantalla con elenco y sin «Sortear con historia completa»", async () => {
    assert.equal(await a.isVisible("#etq-elenco"), true); assert.equal(await a.isHidden("#historia-completa"), true);
    assert.equal(await a.evaluate(() => document.querySelector("#proyeccion").classList.contains("completo")), true);
  });
  await prueba("?modo=completo · animación completa: escenas E1–E6 en orden, barra de tiempo, revelación a ~30 s y resultado enmascarado", async () => {
    await a.check("#ensayo");
    assert.equal(await a.isHidden("#barra-tiempo"), true);
    await a.click("#sortear");
    await a.waitForFunction(() => !document.querySelector("#barra-tiempo").hidden);
    const { vistos, seg } = await subtitulos(a, 45000);
    assert.ok(seg >= 27 && seg <= 34, `duración hasta la revelación: ${seg.toFixed(1)} s`);
    const idx = ["E1", "E2", "E3", "E4", "E5", "E6_PROLIF"].map((k) => vistos.indexOf(SUBTITULOS[k]));
    assert.ok(idx.every((x) => x >= 0) && idx.every((x, i) => i === 0 || x > idx[i - 1]), vistos.join(" > "));
    assert.ok(!vistos.includes(SUBTITULOS.E0), "sin la casilla de elenco no hay E0");
    assert.ok(vistos.every((t) => t.split(/\s+/).length <= 18), "subtítulos de 18 palabras o menos");
    assert.equal(await a.getAttribute("#fase", "aria-live"), "polite");
    assert.ok(MASCARAS.includes(await a.textContent("#ganador")));
    assert.match(await a.textContent("#tarjeta-tipo"), /^Linfocito T CD[48]\+ activado$/);
    console.log(`   [info] revelación a los ${seg.toFixed(1)} s`);
  });
  await prueba("?modo=completo: la nueva ronda arranca en E4 (~16 s), sin E1–E3, con el subtítulo 'Una respuesta real es policlonal…'", async () => {
    await a.waitForFunction(() => !document.querySelector("#sortear").disabled);
    assert.equal(await a.textContent("#sortear"), "Activar otro linfocito");
    await a.click("#sortear");
    const { vistos, seg } = await subtitulos(a, 40000);
    assert.ok(seg >= 13 && seg <= 20, `duración de la ronda siguiente: ${seg.toFixed(1)} s`);
    assert.equal(vistos[0], SUBTITULOS.E4_RONDA); assert.match(vistos[0], /policlonal/);
    for (const k of ["E1", "E2", "E3"]) assert.ok(!vistos.includes(SUBTITULOS[k]), k);
    console.log(`   [info] ronda siguiente: revelación a los ${seg.toFixed(1)} s`);
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

  // ---------------- extras del modo inmune (movimiento reducido + tecla S) y plan B clásico
  const nuevaSorteo = async (query, reducido = true) => {
    const q = await p.context().newPage(); q.errores = []; q.on("pageerror", (e) => q.errores.push(e.message));
    if (reducido) await q.emulateMedia({ reducedMotion: "reduce" });
    await q.goto(`${BASE}/sorteo.html?emulador${query}`); await q.waitForFunction(() => document.querySelector("#contador").textContent === "3");
    return q;
  };
  for (const tipo of ["CD4", "CD8"]) await prueba(`sorteo: tipo ilustrativo ${tipo} (?tipo= solo en localhost) → tarjeta «Linfocito T ${tipo}+ activado» y subtítulo final correspondiente`, async () => {
    const q = await nuevaSorteo(`&tipo=${tipo}`);
    await q.check("#ensayo"); await q.click("#sortear");
    const t0 = Date.now(); let vistos = [];
    while (await q.isHidden("#resultado") && Date.now() - t0 < 60000) {
      const f = await q.textContent("#fase"); if (f && vistos.at(-1) !== f) vistos.push(f);
      await q.keyboard.press("s"); await q.waitForTimeout(150);
    }
    assert.equal(await q.textContent("#tarjeta-tipo"), `Linfocito T ${tipo}+ activado`);
    assert.ok(MASCARAS.includes(await q.textContent("#ganador")));
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("PASO 5 · pantalla mínima: botón principal grande, controles pequeños, ficha «i» y sin pistas de teclas (los atajos siguen activos)", async () => {
    const q = await nuevaSorteo("");
    const visibles = await q.evaluate(() => [...document.querySelectorAll("#proyeccion button")].filter((b) => !b.hidden && b.offsetParent).map((b) => b.id));
    assert.deepEqual(visibles.sort(), ["btn-ficha", "historia-completa", "pantalla-completa", "sortear"]);
    assert.equal(await q.textContent("#btn-ficha"), "i"); assert.equal(await q.getAttribute("#btn-ficha", "aria-label"), "Ficha inmunológica");
    assert.equal(await q.textContent("#historia-completa"), "Sortear con historia completa");
    const alto = (id) => q.evaluate((i) => document.querySelector(i).getBoundingClientRect().height, id);
    assert.ok(await alto("#sortear") >= 60 && await alto("#sortear") > await alto("#pantalla-completa") * 1.4, "el botón principal es el más grande");
    assert.equal(await q.locator("kbd, #atajos").count(), 0, "sin pistas de teclas");
    assert.ok(!/Espacio|atajo/i.test(await q.textContent("main")), "ningún texto menciona teclas");
    assert.equal(await q.isHidden("#etq-elenco"), true); assert.equal(await q.isHidden("#barra-tiempo"), true);
    assert.equal(await q.isVisible("#ensayo"), true);
    assert.equal(await q.locator('header a[href="panel.html"]').count(), 1); assert.equal(await q.isVisible("#salir"), true);
    await q.keyboard.press("i"); await q.waitForSelector("#ficha:not([hidden])"); await q.keyboard.press("Escape");   // los atajos siguen funcionando
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("PASO 5 · animación por defecto: tarjeta de 3 s + E4–E6, subtítulos sencillos (≤ 12 palabras), sin barra de tiempo, revelado entre 14 y 18 s", async () => {
    const q = await nuevaSorteo("", false);
    await q.check("#ensayo"); await q.click("#sortear");
    let barraVisible = false; const t0 = Date.now(), vistos = [];
    while (await q.isHidden("#resultado") && Date.now() - t0 < 30000) {
      const f = await q.textContent("#fase"); if (f && vistos.at(-1) !== f) vistos.push(f);
      if (await q.isVisible("#barra-tiempo")) barraVisible = true; await q.waitForTimeout(100);
    }
    const seg = (Date.now() - t0) / 1000;
    assert.ok(seg >= 14 && seg <= 18, `revelado a los ${seg.toFixed(1)} s`);
    assert.deepEqual(vistos, [SUBTITULOS.INTRO, SUBTITULOS.E4_S, SUBTITULOS.E5_S, SUBTITULOS.E6_S]);
    assert.ok(vistos.every((t) => t.split(/\s+/).length <= 12));
    assert.equal(barraVisible, false, "la barra de tiempo solo aparece en la historia completa");
    // Revelado: nombre enmascarado grande y verde; debajo, pequeño, el tipo de linfocito
    const g = await q.evaluate(() => { const n = document.querySelector("#ganador"), t = document.querySelector("#tarjeta-tipo");
      return { colorN: getComputedStyle(n).color, tamN: parseFloat(getComputedStyle(n).fontSize), tamT: parseFloat(getComputedStyle(t).fontSize),
        yN: n.getBoundingClientRect().top, yT: t.getBoundingClientRect().top }; });
    assert.equal(g.colorN, "rgb(69, 172, 77)"); assert.ok(g.tamN > 2 * g.tamT, `${g.tamN} vs ${g.tamT}`); assert.ok(g.yT > g.yN, "el tipo va debajo del nombre");
    assert.match(await q.textContent("#tarjeta-tipo"), /^Linfocito T CD[48]\+ activado$/);
    assert.ok(MASCARAS.includes(await q.textContent("#ganador")));
    console.log(`   [info] animación por defecto: revelado a los ${seg.toFixed(1)} s`);
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("PASO 5 · «Sortear con historia completa»: lanza la ronda con E1–E6 y la barra «minutos → horas → días»; la ronda siguiente vuelve a la animación resumida", async () => {
    const q = await nuevaSorteo("");
    await q.check("#ensayo"); await q.click("#historia-completa");
    const t0 = Date.now(), vistos = []; let barra = false;
    while (await q.isHidden("#resultado") && Date.now() - t0 < 60000) {
      const f = await q.textContent("#fase"); if (f && vistos.at(-1) !== f) vistos.push(f);
      if (await q.isVisible("#barra-tiempo")) barra = true; await q.waitForTimeout(100);
    }
    // (con movimiento reducido el revelado coincide con el cambio de E6_PROLIF al subtítulo final, que puede no alcanzar a leerse)
    assert.deepEqual(vistos.slice(0, 6), [SUBTITULOS.E1, SUBTITULOS.E2, SUBTITULOS.E3, SUBTITULOS.E4, SUBTITULOS.E5, SUBTITULOS.E6_PROLIF], vistos.join(" > "));
    assert.equal(barra, true);
    await q.waitForFunction(() => !document.querySelector("#sortear").disabled && !document.querySelector("#historia-completa").disabled);
    await q.click("#sortear");
    const v2 = []; const t1 = Date.now();
    while (await q.isHidden("#resultado") && Date.now() - t1 < 40000) { const f = await q.textContent("#fase"); if (f && v2.at(-1) !== f) v2.push(f); await q.waitForTimeout(100); }
    assert.equal(v2[0], SUBTITULOS.INTRO); assert.ok(!v2.includes(SUBTITULOS.E1)); assert.equal(await q.isHidden("#barra-tiempo"), true);
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("sorteo: tecla C oculta/muestra subtítulos; tecla I abre la ficha (diálogo modal), Espacio no sortea con ella abierta y Esc/I la cierran", async () => {
    const q = await nuevaSorteo("");
    await q.evaluate(() => document.activeElement?.blur());
    await q.keyboard.press("c"); assert.equal(await q.evaluate(() => document.querySelector("#proyeccion").classList.contains("sin-subtitulos")), true);
    await q.keyboard.press("c"); assert.equal(await q.evaluate(() => document.querySelector("#proyeccion").classList.contains("sin-subtitulos")), false);
    await q.keyboard.press("i");
    await q.waitForSelector("#ficha:not([hidden])");
    assert.equal(await q.getAttribute("#ficha", "role"), "dialog"); assert.equal(await q.getAttribute("#ficha", "aria-modal"), "true");
    assert.ok(await q.locator("#ficha .tarjeta-celula").count() >= 9, "8 células + Innata vs. adaptativa");
    assert.match(await q.textContent("#ficha"), /Innata/);
    await q.keyboard.press("Space"); await q.waitForTimeout(300);
    assert.equal(await q.isDisabled("#sortear"), false); assert.equal(await q.isHidden("#resultado"), true, "con la ficha abierta no se inicia el sorteo");
    await q.keyboard.press("Escape"); await q.waitForSelector("#ficha", { state: "hidden" });
    await q.click("#btn-ficha"); await q.waitForSelector("#ficha:not([hidden])");
    await q.keyboard.press("i"); await q.waitForSelector("#ficha", { state: "hidden" });
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("?modo=completo: casilla «elenco» antepone E0 (frotis de sangre) y la tecla S salta de escena", async () => {
    const q = await nuevaSorteo("&modo=completo");
    await q.check("#ensayo"); await q.check("#elenco"); await q.click("#sortear");
    await q.waitForFunction((t) => document.querySelector("#fase").textContent === t, SUBTITULOS.E0);
    await q.keyboard.press("s");
    await q.waitForFunction((t) => document.querySelector("#fase").textContent === t, SUBTITULOS.E1, { timeout: 4000 });
    await acelerar(q); assert.equal(await q.isVisible("#resultado"), true);
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("MODO CLÁSICO (?modo=clasico): textos y escenas de selección clonal intactos, revelación a 8–12 s, máscara y sin atajos del modo inmune", async () => {
    const q = await nuevaSorteo("&modo=clasico", false);
    assert.equal(await q.textContent("#sortear"), "Liberar el antígeno"); assert.equal(await q.textContent("#contador-texto"), "clones en el repertorio");
    assert.equal(await q.locator("kbd").count(), 0); assert.equal(await q.isHidden("#historia-completa"), true); assert.equal(await q.isHidden("#etq-elenco"), true); assert.equal(await q.isHidden("#barra-tiempo"), true);
    assert.equal(await q.evaluate(() => document.querySelector("#proyeccion").classList.contains("clasico")), true);
    await q.check("#ensayo"); await q.click("#sortear");
    const { vistos, seg } = await subtitulos(q, 30000);
    assert.ok(seg >= 8 && seg <= 12.5, `duración ${seg.toFixed(1)} s`);
    const lista = vistos.join(" > ");
    const iE = ["El repertorio", "El antígeno explora", "Reconocimiento", "Expansión clonal"].map((x) => lista.indexOf(x));
    assert.ok(iE.every((x) => x >= 0) && iE.every((x, i) => i === 0 || x > iE[i - 1]), lista);
    assert.ok(MASCARAS.includes(await q.textContent("#ganador")));
    assert.equal(await q.textContent("#tarjeta-tipo"), "El antígeno reconoció a");
    await q.waitForFunction(() => !document.querySelector("#sortear").disabled);
    assert.equal(await q.textContent("#sortear"), "Volver a sortear");
    assert.deepEqual(q.errores, []); await q.close();
  });
  await prueba("MODO CLÁSICO: una ronda real se guarda (adminUid, ronda 1) antes de revelar", async () => {
    const q = await nuevaSorteo("&modo=clasico", false);
    await q.click("#sortear");
    await q.waitForTimeout(1500);
    assert.equal((await listar("sorteos")).length, 1, "guardada mientras la animación aún corre");
    assert.equal(await q.isHidden("#resultado"), true, "aún no se ha revelado");
    await q.waitForSelector("#resultado:not([hidden])", { timeout: 20000 });
    const [d] = await listar("sorteos");
    assert.equal(d.fields.adminUid.stringValue, UID); assert.equal(Number(d.fields.ronda.integerValue), 1);
    await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: "DELETE", headers: OWNER });
    assert.deepEqual(q.errores, []); await q.close();
  });
  // ---------------- PASO 6: transmisión en vivo (dos contextos de navegador: admin y espectador sin sesión)
  const REGLAS_SIN_PUBLICO = REGLAS.replace("allow create, update: if esAdmin() && publicoSorteoValido();", "allow create, update: if false;");
  assert.notEqual(REGLAS_SIN_PUBLICO, REGLAS);
  const ganadorDeUltimoSorteo = async () => { const d = (await listar("sorteos")).at(-1); return d?.fields.ganadorClave.stringValue; };
  const limpiarSorteos = async () => { for (const d of await listar("sorteos")) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: "DELETE", headers: OWNER }); };
  await prueba("PASO 6 · panel y sorteo: «Copiar enlace de transmisión» (el enlace es en-vivo.html del mismo sitio)", async () => {
    const q = await nuevaSorteo("");
    await q.click("#copiar-enlace");
    await q.waitForFunction(() => /Enlace de la transmisión copiado|El enlace de la transmisión es/.test(document.querySelector("#aviso").textContent));
    assert.ok((await q.textContent("#aviso")).includes(`${BASE}/en-vivo.html`), await q.textContent("#aviso"));
    const w = await p.context().newPage(); await w.goto(`${BASE}/panel.html?emulador`); await w.waitForSelector("#contenido:not([hidden])");
    await w.click("#copiar-enlace");
    await w.waitForFunction(() => /transmisión/.test(document.querySelector("#aviso").textContent));
    assert.ok((await w.textContent("#aviso")).includes(`${BASE}/en-vivo.html`));
    await w.close(); await q.close();
  });
  await prueba("PASO 6 · espectador: «Esperando el sorteo…» sin documento; ronda real: no ve al ganador antes del revelado y sí después; la máscara es lo único que se publica", async () => {
    await borrar("publico/sorteo"); await limpiarSorteos();
    const v = await nuevaPagina(); await v.goto(`${BASE}/en-vivo.html?emulador`);
    await v.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "Esperando el sorteo…");
    assert.equal(await v.getAttribute(".textos-ev", "aria-live"), "polite");
    const q = await nuevaSorteo("", false);                        // admin, ronda REAL (sin «Ensayo»), movimiento normal
    assert.equal(await q.isChecked("#ensayo"), false);
    await q.click("#sortear");
    const docs = [], vistas = []; let t0 = Date.now();
    while (await q.isHidden("#resultado") && Date.now() - t0 < 30000) {
      const d = await leer("publico/sorteo"); if (d) docs.push(JSON.stringify(d.fields));
      vistas.push(await v.evaluate(() => document.body.innerText + "|" + document.querySelector("#revelado-ev").hidden)); await q.waitForTimeout(250);
    }
    const mascara = await q.textContent("#ganador"), clave = await ganadorDeUltimoSorteo();
    assert.ok(MASCARAS.includes(mascara), mascara);
    assert.ok(docs.length > 5 && docs.some((d) => d.includes("animando")), "se publicó «animando» durante la animación");
    for (const d of docs) { assert.ok(!d.includes(mascara) && !d.includes(clave) && !/ganador|revelado/.test(d), "antes del revelado el documento no contiene al ganador: " + d); }
    for (const t of vistas) { assert.ok(!t.includes(mascara), "el espectador no ve al ganador antes del revelado"); assert.ok(t.endsWith("|true"), "el panel de revelado sigue oculto"); }
    assert.ok(vistas.some((t) => t.includes("Ronda 1") && t.includes(SUBTITULOS.INTRO)), "el espectador vio la narrativa de la ronda");
    // después del revelado el espectador sí lo ve (máscara en grande, tipo debajo y la ronda)
    await v.waitForFunction((m) => document.querySelector("#mascara-ev").textContent === m, mascara, { timeout: 5000 });
    assert.match(await v.textContent("#tipo-ev"), /^Linfocito T CD[48]\+ activado$/); assert.equal(await v.textContent("#titulo-ev"), "Ronda 1");
    assert.equal(await v.evaluate(() => getComputedStyle(document.querySelector("#mascara-ev")).color), "rgb(69, 172, 77)");
    const f = (await leer("publico/sorteo")).fields;
    assert.deepEqual(Object.keys(f).sort(), ["estado", "ganadorMascara", "inicio", "modo", "ronda", "tipo"]);
    assert.equal(f.estado.stringValue, "revelado"); assert.equal(f.ganadorMascara.stringValue, mascara); assert.equal(f.modo.stringValue, "resumido");
    assert.ok(!JSON.stringify(f).includes(clave), "la clave nunca se publica");
    assert.deepEqual(v.errores, []); await v.close(); await q.close();
    await limpiarSorteos();
  });
  await prueba("PASO 6 · «Sortear con historia completa» publica modo «completo»; Ensayo no publica nada y el espectador no ve ningún cambio", async () => {
    await borrar("publico/sorteo");
    const q = await nuevaSorteo("");                               // movimiento reducido + tecla S para ir rápido
    await q.click("#historia-completa"); await acelerar(q);
    await q.waitForFunction(() => !document.querySelector("#sortear").disabled);
    await q.waitForTimeout(800);
    const antes = JSON.stringify(await leer("publico/sorteo"));
    assert.equal((await leer("publico/sorteo")).fields.modo.stringValue, "completo");
    const v = await nuevaPagina(); await v.goto(`${BASE}/en-vivo.html?emulador`);
    await v.waitForFunction(() => !document.querySelector("#revelado-ev").hidden);
    const textoAntes = await v.evaluate(() => document.body.innerText);
    await limpiarSorteos();
    await q.reload(); await q.waitForFunction(() => document.querySelector("#contador").textContent === "3");
    await q.check("#ensayo"); await q.click("#sortear"); await acelerar(q);
    await q.waitForFunction(() => !document.querySelector("#sortear").disabled); await q.waitForTimeout(1500);
    assert.equal(JSON.stringify(await leer("publico/sorteo")), antes, "con Ensayo el documento público no cambia");
    assert.equal(await v.evaluate(() => document.body.innerText), textoAntes, "el espectador no ve nada nuevo");
    assert.equal((await listar("sorteos")).length, 0);
    await v.close(); await q.close();
  });
  await prueba("PASO 6 · modo clásico: no publica nada (no cambia el documento público)", async () => {
    const antes = JSON.stringify(await leer("publico/sorteo"));
    const q = await nuevaSorteo("&modo=clasico", false);
    await q.click("#sortear"); await q.waitForSelector("#resultado:not([hidden])", { timeout: 25000 }); await q.waitForTimeout(1000);
    assert.equal(JSON.stringify(await leer("publico/sorteo")), antes);
    await limpiarSorteos(); await q.close();
  });
  await prueba("PASO 6 · publicación best-effort: con reglas sin permiso para publico/sorteo el sorteo se guarda y se revela igual; aviso discreto y console.error", async () => {
    await ponerReglas(REGLAS_SIN_PUBLICO); await new Promise((x) => setTimeout(x, 800));
    try {
    const q = await nuevaSorteo(""); const consola = []; q.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });
    await q.click("#sortear"); await acelerar(q);
    await q.waitForSelector("#resultado:not([hidden])"); assert.ok(MASCARAS.includes(await q.textContent("#ganador")));
    assert.equal((await listar("sorteos")).length, 1, "la ronda se guardó");
    await q.waitForFunction(() => !document.querySelector("#envivo-estado").hidden);
    assert.match(await q.textContent("#envivo-estado"), /Transmisión en vivo: no se pudo publicar/);
    assert.ok(consola.some((c) => c.includes("[en vivo] no se pudo publicar: permission-denied")), consola.join(" | "));
    await q.waitForFunction(() => !document.querySelector("#sortear").disabled);       // se puede seguir sorteando
    await q.close();
    } finally { await ponerReglas(REGLAS); await new Promise((x) => setTimeout(x, 800)); await limpiarSorteos(); }
  });
  await prueba("PASO 6 · espectador que llega tarde: «El sorteo está en curso…»; tras 90 s sin revelado: «El sorteo se interrumpió; espera la siguiente ronda.»", async () => {
    const hace = (ms) => new Date(Date.now() - ms);
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "animando" }, ronda: { integerValue: "2" },
      modo: { stringValue: "resumido" }, tipo: { stringValue: "CD8" }, inicio: { timestampValue: hace(10000).toISOString() } } }) });
    const v = await nuevaPagina(); await v.goto(`${BASE}/en-vivo.html?emulador`);
    await v.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "El sorteo está en curso…");
    await v.close();
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "animando" }, ronda: { integerValue: "2" },
      modo: { stringValue: "resumido" }, tipo: { stringValue: "CD8" }, inicio: { timestampValue: hace(120000).toISOString() } } }) });
    const w = await nuevaPagina(); await w.goto(`${BASE}/en-vivo.html?emulador`);
    await w.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "El sorteo se interrumpió; espera la siguiente ronda.");
    // espectador presente cuando empieza «animando»: temporizador de 90 s (reloj simulado)
    await w.clock.install(); await w.reload();
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "espera" } } }) });
    await w.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "Esperando el sorteo…");
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "animando" }, ronda: { integerValue: "3" },
      modo: { stringValue: "resumido" }, tipo: { stringValue: "CD4" }, inicio: { timestampValue: new Date().toISOString() } } }) });
    await w.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "Ronda 3");
    await w.clock.fastForward(91000);
    await w.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "El sorteo se interrumpió; espera la siguiente ronda.");
    await w.close();
  });
  await prueba("PASO 6 · espectador: sin conexión muestra aviso y al reconectar recibe el estado más reciente", async () => {
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "espera" } } }) });
    const v = await nuevaPagina(); await v.goto(`${BASE}/en-vivo.html?emulador`);
    await v.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "Esperando el sorteo…");
    await v.waitForTimeout(1000);
    await v.context().setOffline(true);
    await v.waitForFunction(() => !document.querySelector("#conexion").hidden && /Sin conexión/.test(document.querySelector("#conexion").textContent));
    assert.equal(await v.getAttribute("#conexion", "role"), "status");
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "revelado" }, ronda: { integerValue: "4" },
      modo: { stringValue: "resumido" }, tipo: { stringValue: "CD8" }, inicio: { timestampValue: new Date().toISOString() }, ganadorMascara: { stringValue: "Ana L." } } }) });
    await v.context().setOffline(false);
    await v.waitForFunction(() => document.querySelector("#mascara-ev").textContent === "Ana L." && document.querySelector("#conexion").hidden, null, { timeout: 40000 });
    assert.equal(await v.textContent("#titulo-ev"), "Ronda 4");
    await v.close();
  });
  await prueba("PASO 6 · la máscara llega como TEXTO (nunca HTML) a la pantalla del espectador", async () => {
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "revelado" }, ronda: { integerValue: "5" },
      modo: { stringValue: "resumido" }, tipo: { stringValue: "CD4" }, inicio: { timestampValue: new Date().toISOString() }, ganadorMascara: { stringValue: "<img src=x onerror=alert(1)>" } } }) });
    const v = await nuevaPagina(); const dialogos = []; v.on("dialog", (d) => { dialogos.push(d.message()); d.dismiss(); });
    await v.goto(`${BASE}/en-vivo.html?emulador`);
    await v.waitForFunction(() => document.querySelector("#mascara-ev").textContent.startsWith("<img"));
    await v.waitForTimeout(400);
    assert.equal(await v.locator("main img").count(), 0); assert.deepEqual(dialogos, []); await v.close();
  });
  await prueba("PASO 6 · 50 espectadores: lecturas y escrituras de una ronda real (clientes independientes con el SDK de Node)", async () => {
    const { initializeApp, deleteApp } = await import("firebase/app");
    const { getFirestore, connectFirestoreEmulator, doc, onSnapshot, terminate } = await import("firebase/firestore");
    await fetch(`${FS}/publico/sorteo`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { estado: { stringValue: "espera" } } }) });
    const N = 50, lecturas = new Array(N).fill(0), previo = new Array(N).fill(null), apps = [], bajas = [];
    for (let i = 0; i < N; i++) {
      const app = initializeApp({ projectId: "sorteoinmuno", apiKey: "fake-key" }, `espectador${i}`); apps.push(app);
      const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8080);
      bajas.push(onSnapshot(doc(db, "publico", "sorteo"), { includeMetadataChanges: true }, (snap) => {
        if (snap.metadata.fromCache) return;                                // lo que viene del servidor es lo que se factura
        const huella = JSON.stringify(snap.exists() ? snap.data() : null);
        if (huella !== previo[i]) { previo[i] = huella; lecturas[i]++; }     // cada documento entregado por el servidor = 1 lectura
      }));
    }
    for (let k = 0; k < 100 && lecturas.some((x) => x === 0); k++) await new Promise((x) => setTimeout(x, 100));
    assert.ok(lecturas.every((x) => x === 1), "lectura inicial: 1 por espectador");
    const q = await nuevaSorteo("", false);                          // ronda real con animación completa (~17 s)
    await q.click("#sortear");
    await q.waitForSelector("#resultado:not([hidden])", { timeout: 30000 }); await q.waitForTimeout(2500);
    const tot = lecturas.reduce((a, b) => a + b, 0);
    console.log(`   [info] 50 espectadores, 1 ronda real: ${tot} lecturas (${(tot / N).toFixed(1)} por espectador = 1 inicial + ${(tot / N - 1).toFixed(1)} cambios: «animando» y «revelado»); escrituras del admin: 1 sorteo + 2 de publico/sorteo = 3`);
    assert.ok(lecturas.every((x) => x === 3), "3 lecturas por espectador: inicial + animando + revelado: " + lecturas.join(","));
    assert.equal((await listar("sorteos")).length, 1);
    bajas.forEach((b) => b()); await Promise.all(apps.map(async (a) => { try { await terminate(getFirestore(a)); await deleteApp(a); } catch {} }));
    await limpiarSorteos(); await q.close();
  });
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
    assert.match(await w.textContent("#aviso"), /La transmisión en vivo quedó en espera/);
    // PASO 7B: sin datos, «Ir al sorteo» queda deshabilitado con explicación y la guía vuelve al primer paso
    await w.waitForFunction(() => document.querySelector("#ir-sorteo").disabled);
    assert.match(await w.textContent("#ir-sorteo-ayuda"), /se habilita cuando haya al menos un participante inscrito/);
    assert.equal(await w.getAttribute("#ir-sorteo", "aria-describedby"), "ir-sorteo-ayuda");
    assert.equal(await w.evaluate(() => [...document.querySelectorAll("#guia li")].map((li) => li.dataset.estado).join()), "actual,pendiente,pendiente,hecho");
    assert.match(await w.textContent("#participantes"), /Todavía no hay participantes inscritos/);
    await w.close();
    // PASO 6: «Vaciar datos» deja publico/sorteo en {estado:"espera"} sin ganadorMascara (y el espectador vuelve a «Esperando el sorteo…»)
    const pub = await leer("publico/sorteo");
    assert.deepEqual(Object.keys(pub.fields), ["estado"]); assert.equal(pub.fields.estado.stringValue, "espera");
    const v = await nuevaPagina(); await v.goto(`${BASE}/en-vivo.html?emulador`);
    await v.waitForFunction(() => document.querySelector("#titulo-ev").textContent === "Esperando el sorteo…");
    assert.equal(await v.evaluate(() => document.querySelector("#revelado-ev").hidden), true); await v.close();
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
  await prueba("rendimiento: 100 participantes → animación fluida (≥ 30 fps) y revelación a ~17 s (animación por defecto)", async () => {
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
    await f.waitForSelector("#resultado:not([hidden])", { timeout: 50000 });
    const dur = (Date.now() - t0) / 1000, fps = (await f.evaluate(() => window.__f)) / dur;
    console.log(`   [info] 100 participantes: revelación a los ${dur.toFixed(1)} s, ${fps.toFixed(0)} fps medios`);
    assert.ok(dur >= 14 && dur <= 18, `duración ${dur}`); assert.ok(fps >= 30, `fps ${fps}`);
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
