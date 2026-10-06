// Genera las imágenes de vista previa del sitio con la paleta FungaTec (no forma parte del sitio ni lleva dependencias en
// él: solo se ejecuta a mano cuando cambie el diseño). Usa playwright-core + el Chromium instalado:
//   npm i --no-save playwright-core && CHROMIUM_PATH=/ruta/a/chrome node tools/generar-og.mjs
// Salida: img/og.png (1200×630, Open Graph / WhatsApp) e img/apple-touch-icon.png (180×180).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const salida = (f) => fileURLToPath(new URL(`../img/${f}`, import.meta.url));
mkdirSync(fileURLToPath(new URL("../img/", import.meta.url)), { recursive: true });

const PETROLEO = "#053043", CIELO = "#25A9E0", CELESTE = "#A7F0F3", VERDE = "#45AC4D";
const LOGO = (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="${c}">${
  [0, 72, 144, 216, 288].map((r) => `<g transform="rotate(${r} 32 32)"><path d="M32 15V9" fill="none"/><circle cx="32" cy="6.8" r="2.6" stroke="none"/></g>`).join("")
}</g><circle cx="32" cy="32" r="17" fill="${CELESTE}" stroke="${CELESTE}" stroke-width="2"/><circle cx="32" cy="32" r="12.5" fill="#43398a"/></svg>`;

const og = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;width:1200px;height:630px;background:radial-gradient(circle at 78% 45%,#0d4f6b 0,${PETROLEO} 62%);color:${CELESTE};
  font-family:Montserrat,"Segoe UI",system-ui,sans-serif;display:flex;align-items:center;padding:0 90px;gap:60px;position:relative;overflow:hidden}
  .txt{flex:1} .marca{font-size:26px;font-weight:600;letter-spacing:.14em;color:${CIELO};margin:0 0 22px}
  h1{font-size:76px;line-height:1.05;margin:0 0 26px;font-weight:700;color:#fff} h1 b{color:${VERDE}}
  p{font-size:34px;line-height:1.35;margin:0;font-weight:400} .pie{position:absolute;left:90px;bottom:44px;font-size:24px;opacity:.8}
  .logo{width:330px;height:330px;flex:none;filter:drop-shadow(0 0 40px rgba(37,169,224,.45))} .c{position:absolute;border-radius:50%;background:#43398a;border:6px solid ${CELESTE};opacity:.35}
</style><div class="c" style="width:70px;height:70px;right:80px;top:70px"></div><div class="c" style="width:44px;height:44px;right:330px;bottom:80px"></div><div class="c" style="width:56px;height:56px;right:40px;bottom:150px"></div>
<div class="txt"><p class="marca">CUCBA · UdeG</p><h1>Sorteo de <b>Inmunobiología</b></h1><p>Inscribe tu linfocito T y sigue el sorteo del libro en vivo desde tu celular.</p></div>
<div class="logo">${LOGO(CIELO)}</div><div class="pie">FungaTec</div>`;
const icono = `<!doctype html><meta charset="utf-8"><style>body{margin:0;width:180px;height:180px;background:${PETROLEO};display:grid;place-items:center}svg{width:132px;height:132px}</style>${LOGO(CIELO)}`;

const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const p = await nav.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(og); await p.screenshot({ path: salida("og.png") });
await p.setViewportSize({ width: 180, height: 180 }); await p.setContent(icono); await p.screenshot({ path: salida("apple-touch-icon.png") });
await nav.close();
console.log("listo: img/og.png (1200×630) e img/apple-touch-icon.png (180×180)");
