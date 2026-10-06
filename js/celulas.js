// Biblioteca de células dibujadas en Canvas 2D (vectorial, sin imágenes). Unidades virtuales: 1 µm ≈ UM unidades.
// Colores de tinción tipo Wright-Giemsa SOLO en las células (la interfaz mantiene la paleta FungaTec):
//   núcleo del neutrófilo lila · gránulos del eosinófilo rojo-anaranjados · gránulos del basófilo azul-violeta oscuros.
// El verde orgánico queda reservado para el linfocito activado / ganador.
// Tamaños relativos aproximados (diámetro): linfocito 7–10 µm, neutrófilo 10–12 µm, eosinófilo y basófilo 12–15 µm,
// monocito 12–20 µm; macrófago y célula dendrítica más grandes e irregulares.
export const UM = 3;

export const COLOR = {
  petroleo: "#053043", cielo: "#25A9E0", celeste: "#A7F0F3", verde: "#45AC4D", blanco: "#ffffff",
  eritrocito: "#d98d86", eritrocitoCentro: "#efc3bd",
  lila: "#8b6bb8", lilaOscuro: "#5d4691", citoNeutro: "#efd9d2", granuloFino: "#d9c3dc",
  eosGranulo: "#e2552a", eosCito: "#f3d6c8", eosNucleo: "#6d5aa8",
  basoGranulo: "#2b2576", basoCito: "#d8c9e3", basoNucleo: "#4c3f8f",
  monoCito: "#b9c6d8", monoNucleo: "#8573b5",
  linfoCito: "#A7F0F3", linfoNucleo: "#43398a",
  macroCito: "#aa9dc9", macroNucleo: "#6e5d9f", vacuola: "#cfc6e2",
  dcCito: "#f0cf8f", dcBorde: "#b98a3d", mhc: "#4aa8e8", cd80: "#f2a03d",
  bacilo: "#d9b36c", baciloBorde: "#7a5c2e",
  epitelio: "#5f93a6", epitelioNucleo: "#2c5365", endotelio: "#bf7d98", endotelioAct: "#f0a3c0",
  tejido: "#0a3b52", linfa: "#0b3a4e",
};

const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos;

/** Contorno irregular suave (para macrófago, célula dendrítica, células infectadas). */
export function contornoIrregular(ctx, x, y, r, { n = 18, amp = 0.16, t = 0, vel = 0.0012, fase = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + amp * (sin(3 * a + fase + t * vel) * 0.6 + sin(5 * a + fase * 1.7 - t * vel * 1.3) * 0.4));
    pts.push([x + cos(a) * rr, y + sin(a) * rr]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) ctx.moveTo((pts[n - 1][0] + p[0]) / 2, (pts[n - 1][1] + p[1]) / 2);
    ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  ctx.closePath();
}

function disco(ctx, x, y, r, relleno, borde, ancho = 1.2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
  if (borde) { ctx.lineWidth = ancho; ctx.strokeStyle = borde; ctx.stroke(); }
}

/** Gránulos distribuidos de forma determinista dentro de un disco (espiral de Fibonacci). */
function granulos(ctx, x, y, r, n, rg, color, giro = 0, hueco = 0) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + giro, d = Math.sqrt((i + 0.5) / n) * r * (1 - hueco) + r * hueco * 0.0;
    ctx.beginPath(); ctx.arc(x + cos(a) * d, y + sin(a) * d, rg, 0, TAU); ctx.fill();
  }
}

export function eritrocito(ctx, x, y, r = 3.75 * UM) {
  const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
  g.addColorStop(0, COLOR.eritrocitoCentro); g.addColorStop(0.45, COLOR.eritrocito); g.addColorStop(1, "#c26f68");
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
}

/**
 * Linfocito: poco citoplasma y núcleo redondo grande. `anillo` marca CD4/CD8 (solo ilustrativo);
 * `activado` lo pinta en verde orgánico.
 */
export function linfocito(ctx, x, y, r = 4.5 * UM, { anillo = null, activado = false, alpha = 1, brillo = 0 } = {}) {
  if (alpha <= 0.003) return;
  const g = ctx.globalAlpha; ctx.globalAlpha = g * alpha;
  if (brillo > 0.01) {
    const gr = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * (1.6 + brillo));
    gr.addColorStop(0, "rgba(167,240,243,.55)"); gr.addColorStop(1, "rgba(167,240,243,0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * (1.6 + brillo), 0, TAU); ctx.fill();
  }
  disco(ctx, x, y, r, activado ? COLOR.verde : COLOR.linfoCito, null);
  disco(ctx, x - r * 0.04, y + r * 0.02, r * 0.78, activado ? "#2f7d37" : COLOR.linfoNucleo, null);
  if (anillo) { ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = anillo; ctx.stroke(); }
  ctx.globalAlpha = g;
}

/** Neutrófilo: núcleo de 3–5 lóbulos (lila) y gránulos finos pálidos. `forma` deforma el cuerpo al migrar. */
export function neutrofilo(ctx, x, y, r = 5.5 * UM, { lobulos = 4, rot = 0, t = 0, alargado = 0, alpha = 1 } = {}) {
  const g = ctx.globalAlpha; ctx.globalAlpha = g * alpha;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1 + alargado, 1 - alargado * 0.55);
  contornoIrregular(ctx, 0, 0, r, { n: 14, amp: 0.05, t, vel: 0.002 });
  ctx.fillStyle = COLOR.citoNeutro; ctx.fill();
  granulos(ctx, 0, 0, r * 0.9, 22, r * 0.045, COLOR.granuloFino);
  ctx.lineCap = "round";
  const pts = [];                                            // lóbulos repartidos en un arco para que se distingan (3–5)
  for (let i = 0; i < lobulos; i++) { const a = 2.45 + (i / Math.max(1, lobulos - 1)) * 2.2; pts.push([cos(a) * r * 0.5, sin(a) * r * 0.5]); }
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.lineWidth = r * 0.07; ctx.strokeStyle = COLOR.lilaOscuro; ctx.stroke();
  for (const p of pts) disco(ctx, p[0], p[1], r * 0.21, COLOR.lila, COLOR.lilaOscuro, 1);
  ctx.restore(); ctx.globalAlpha = g;
}

/** Eosinófilo: núcleo bilobulado y gránulos grandes rojo-anaranjados. */
export function eosinofilo(ctx, x, y, r = 6.5 * UM, { rot = 0 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  disco(ctx, 0, 0, r, COLOR.eosCito, null);
  disco(ctx, -r * 0.3, -r * 0.05, r * 0.3, COLOR.eosNucleo, "#463a80", 1); disco(ctx, r * 0.3, r * 0.08, r * 0.3, COLOR.eosNucleo, "#463a80", 1);
  ctx.strokeStyle = "#463a80"; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.02); ctx.lineTo(r * 0.1, r * 0.04); ctx.stroke();
  granulos(ctx, 0, 0, r * 0.92, 34, r * 0.1, COLOR.eosGranulo, 0.6);
  ctx.restore();
}

/** Basófilo: núcleo bilobulado tapado por gránulos azul-violeta oscuros. */
export function basofilo(ctx, x, y, r = 6.5 * UM, { rot = 0 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  disco(ctx, 0, 0, r, COLOR.basoCito, null);
  disco(ctx, -r * 0.3, 0, r * 0.34, COLOR.basoNucleo, null); disco(ctx, r * 0.3, r * 0.06, r * 0.34, COLOR.basoNucleo, null);
  granulos(ctx, 0, 0, r * 0.93, 38, r * 0.13, COLOR.basoGranulo, 1.1);
  ctx.restore();
}

/** Monocito: grande, núcleo en herradura y citoplasma gris-azulado con alguna vacuola. */
export function monocito(ctx, x, y, r = 8 * UM) {
  contornoIrregular(ctx, x, y, r, { n: 14, amp: 0.05, t: 0 }); ctx.fillStyle = COLOR.monoCito; ctx.fill();
  ctx.lineCap = "round"; ctx.strokeStyle = COLOR.monoNucleo; ctx.lineWidth = r * 0.5;
  ctx.beginPath(); ctx.arc(x + r * 0.08, y, r * 0.42, 0.7, 5.4); ctx.stroke();
  for (const [dx, dy, rr] of [[0.5, -0.45, 0.1], [-0.55, 0.35, 0.08], [0.35, 0.55, 0.07]]) disco(ctx, x + dx * r, y + dy * r, rr * r, COLOR.vacuola, null);
}

/** Macrófago: grande e irregular, con vacuolas; `activado` añade el halo de activación por IFN-γ. */
export function macrofago(ctx, x, y, r = 10 * UM, { t = 0, activado = 0, fase = 0, alpha = 1, bacilos = 0 } = {}) {
  const g = ctx.globalAlpha; ctx.globalAlpha = g * alpha;
  if (activado > 0.01) {
    const gr = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.7);
    gr.addColorStop(0, `rgba(37,169,224,${0.5 * activado})`); gr.addColorStop(1, "rgba(37,169,224,0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, TAU); ctx.fill();
  }
  contornoIrregular(ctx, x, y, r, { n: 20, amp: 0.2, t, fase });
  ctx.fillStyle = COLOR.macroCito; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = activado > 0.3 ? COLOR.cielo : "#8979ad"; ctx.stroke();
  ctx.save(); ctx.translate(x - r * 0.18, y - r * 0.1); ctx.rotate(0.5 + fase);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.34, r * 0.24, 0, 0, TAU); ctx.fillStyle = COLOR.macroNucleo; ctx.fill(); ctx.restore();
  for (let i = 0; i < 6; i++) { const a = i * 1.1 + fase; disco(ctx, x + cos(a) * r * 0.55, y + sin(a) * r * 0.5, r * (0.07 + (i % 3) * 0.025), COLOR.vacuola, null); }
  ctx.globalAlpha = g;
}

/** Célula dendrítica: cuerpo irregular con dendritas largas. `madurez` 0→1 alarga las dendritas y muestra marcadores. */
export function celulaDendritica(ctx, x, y, r = 9 * UM, { t = 0, madurez = 0, fase = 0, alpha = 1 } = {}) {
  const g = ctx.globalAlpha; ctx.globalAlpha = g * alpha;
  const n = 9, largo = r * (0.9 + 1.1 * madurez);
  ctx.lineCap = "round"; ctx.strokeStyle = COLOR.dcCito;
  const puntas = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + fase + 0.25 * sin(t * 0.0009 + i * 2.1);
    const L = largo * (0.75 + 0.3 * sin(i * 3.7 + fase));
    const bx = x + cos(a) * r * 0.7, by = y + sin(a) * r * 0.7;
    const cx = x + cos(a + 0.35) * (r + L * 0.55), cy = y + sin(a + 0.35) * (r + L * 0.55);
    const tx = x + cos(a + 0.15 * sin(t * 0.001 + i)) * (r + L), ty = y + sin(a + 0.15 * sin(t * 0.001 + i)) * (r + L);
    ctx.lineWidth = r * 0.3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, (cx + tx) / 2, (cy + ty) / 2); ctx.stroke();
    ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo((cx + tx) / 2, (cy + ty) / 2); ctx.lineTo(tx, ty); ctx.stroke();
    puntas.push([tx, ty, a]);
  }
  contornoIrregular(ctx, x, y, r, { n: 16, amp: 0.1, t, fase });
  ctx.fillStyle = COLOR.dcCito; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = COLOR.dcBorde; ctx.stroke();
  disco(ctx, x + r * 0.1, y - r * 0.05, r * 0.34, "#b9894a", null);
  if (madurez > 0.35) {                                     // marcadores de maduración: MHC (azul) y CD80/CD86 (naranja)
    const k = clamp((madurez - 0.35) / 0.65);
    puntas.forEach(([tx, ty], i) => disco(ctx, tx, ty, r * 0.1 * k + 0.5, i % 2 ? COLOR.mhc : COLOR.cd80, null));
    for (let i = 0; i < 10; i++) { const a = i * 0.63 + fase; disco(ctx, x + cos(a) * r * 0.92, y + sin(a) * r * 0.92, r * 0.07 * k, i % 2 ? COLOR.mhc : COLOR.cd80, null); }
  }
  ctx.globalAlpha = g;
}

/** Bacilo (≈1–2 µm; exagerado ×1.6 para que se vea desde lejos). */
export function bacilo(ctx, x, y, ang = 0, esc = 1, alpha = 1) {
  if (alpha <= 0.003) return;
  const L = 1.5 * UM * 1.6 * esc, A = 0.55 * UM * 1.6 * esc, g = ctx.globalAlpha; ctx.globalAlpha = g * alpha;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.roundRect(-L / 2, -A / 2, L, A, A / 2); ctx.fillStyle = COLOR.bacilo; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = COLOR.baciloBorde; ctx.stroke();
  ctx.restore(); ctx.globalAlpha = g;
}

/** Célula epitelial columnar (tejido). */
export function celulaEpitelial(ctx, x, y, ancho = 54, alto = 70, { rot = 0, alpha = 1 } = {}) {
  const g = ctx.globalAlpha; ctx.globalAlpha = g * alpha;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.roundRect(-ancho / 2, -alto / 2, ancho, alto, 9); ctx.fillStyle = COLOR.epitelio; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "#3e6f82"; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, alto * 0.12, ancho * 0.28, alto * 0.2, 0, 0, TAU); ctx.fillStyle = COLOR.epitelioNucleo; ctx.fill();
  ctx.restore(); ctx.globalAlpha = g;
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const suave = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const cubica = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/** PRNG determinista (mulberry32). La semilla del sorteo sale de crypto; nunca se usa Math.random. */
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
