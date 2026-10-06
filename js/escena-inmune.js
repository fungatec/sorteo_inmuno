// Escena de proyección v2: respuesta inmune a una bacteria intracelular (modelo: Listeria monocytogenes).
// Cada participante es un linfocito T virgen que patrulla un ganglio linfático; una célula dendrítica llega desde
// el tejido infectado y el sorteo ocurre en su encuentro. La selección (quién gana) YA se hizo en sorteo.js con
// crypto.getRandomValues; aquí solo se dibuja. Todo el azar visual sale de un PRNG con semilla criptográfica
// (nunca Math.random). Canvas 2D vectorial, sin librerías ni imágenes.
//
// Exactitud (criterios de aceptación):
//  - Los linfocitos no elegidos NO mueren ni se desvanecen: siguen patrullando (recirculan por la linfa eferente).
//  - El tipo CD4/CD8 de cada participante se asigna por sorteo 2:1 SOLO para la ilustración, de forma independiente
//    del sorteo del ganador (recurso didáctico; el ganador tiene la misma probabilidad de ser CD4 o CD8 que cualquiera).
//  - Tamaños relativos aproximados y tinciones tipo Wright-Giemsa solo en las células (ver celulas.js).
import {
  UM, COLOR as C, clamp, lerp, suave, cubica, mulberry32, linfocito, neutrofilo, eosinofilo, basofilo, monocito, eritrocito,
  macrofago, celulaDendritica, bacilo, celulaEpitelial, contornoIrregular,
} from "./celulas.js";
import { SUBTITULOS, ESCENAS, etiquetaTiempo } from "./contenido-cientifico.js";

export const VW = 1600, VH = 900;                 // escenario virtual (se ajusta al lienzo conservando la proporción)
const MAX_T = 150;                                // tope visual de linfocitos dibujados (el sorteo usa a todos)
const TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos;
const FUNDIDO = 450;                              // ms de fundido entre escenas
const FOCO = { x: 800, y: 450 };                  // donde se detiene el ganador (E5)
const ep = (a, b, u) => clamp((u - a) / (b - a)); // progreso del tramo [a,b] dentro de u

// Geometría del tejido (E1–E3 y final de E6)
const EPI_Y = 150, HUECO = [735, 865];
const VASO = { y: 640, alto: 96 };
const MAC0 = { x: 470, y: 430, r: 10 * UM };      // macrófago residente
const DC0 = { x: 1010, y: 400, r: 9 * UM };       // célula dendrítica del tejido
const LINFA_AFERENTE = [[1180, 330], [1330, 250], [1450, 150], [1580, 60]];

export function crearEscenaInmune(canvas, { semilla = 1, forzarTipo = null } = {}) {
  const ctx = canvas.getContext("2d");
  let W = 1, H = 1, dpr = 1, K = 1, OX = 0, OY = 0;
  let n = 0, T = [], gs = 1, tipos = [], llamadas = 0;
  let ambiente = [], red = null, bac = [];
  let reducido = false, anim = null, raf = 0;
  let cbFase = () => {}, cbRevelar = () => {}, cbProgreso = () => {};
  let claveFase = null, ultimoProg = -1;

  // ------------------------------------------------------------------ distribución de la población
  function distribuir() {
    const rnd = mulberry32(semilla);
    const total = Math.min(n, MAX_T);
    const x0 = 170, x1 = 1430, y0 = 150, y1 = 690;
    const cols = Math.max(1, Math.ceil(Math.sqrt((total * (x1 - x0)) / (y1 - y0)))), filas = Math.max(1, Math.ceil(total / cols));
    const cw = (x1 - x0) / cols, ch = (y1 - y0) / filas;
    const huecos = Array.from({ length: cols * filas }, (_, i) => i);
    for (let i = huecos.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [huecos[i], huecos[j]] = [huecos[j], huecos[i]]; }
    gs = clamp(Math.sqrt(30 / Math.max(1, total)), 1, 2);             // pocos participantes → células más grandes (solo legibilidad)
    const amp = Math.min(cw, ch) * 0.42;
    T = Array.from({ length: total }, (_, i) => {
      const h = huecos[i];
      return {
        bx: x0 + ((h % cols) + 0.5 + (rnd() - 0.5) * 0.4) * cw, by: y0 + (Math.floor(h / cols) + 0.5 + (rnd() - 0.5) * 0.4) * ch,
        amp: clamp(amp, 14, 52), w1: 0.0004 + rnd() * 0.0005, w2: 0.0009 + rnd() * 0.0006, w3: 0.00045 + rnd() * 0.0005, w4: 0.001 + rnd() * 0.0006,
        p1: rnd() * TAU, p2: rnd() * TAU, p3: rnd() * TAU, p4: rnd() * TAU,
      };
    });
    ambiente = Array.from({ length: 40 }, () => ({ x: 80 + rnd() * 1440, y: 90 + rnd() * 720, r: 6 + rnd() * 6, f: 0.0003 + rnd() * 0.0004, p: rnd() * TAU }));
    // red reticular: nodos y aristas a los 2 vecinos más cercanos
    const nodos = Array.from({ length: 34 }, () => [60 + rnd() * 1480, 60 + rnd() * 780]);
    const aristas = [];
    nodos.forEach((a, i) => {
      const cerca = nodos.map((b, j) => [j, Math.hypot(a[0] - b[0], a[1] - b[1])]).filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).slice(0, 2);
      cerca.forEach(([j]) => aristas.push([a, nodos[j], (rnd() - 0.5) * 60]));
    });
    red = { nodos, aristas };
    // bacilos que entran por la brecha del epitelio. `por` = quién se ocupa de ellos: 0–4 neutrófilos, 5 la DC, 6 quedan libres
    bac = Array.from({ length: 26 }, (_, i) => {
      const por = i % 7, cerca = por < 5 ? TJ(por) : por === 5 ? DC0 : { x: 800 + (rnd() - 0.5) * 520, y: 330 + rnd() * 120 };
      return { te: 0.04 + rnd() * 0.5, x0: 800 + (rnd() - 0.5) * 110, dx: cerca.x + (rnd() - 0.5) * 100, dy: cerca.y + (rnd() - 0.5) * 90, a: rnd() * TAU, w: rnd() * TAU, por };
    });
  }

  function asignarTipos(total) {
    const rt = mulberry32((semilla + 7919 * ++llamadas) >>> 0);       // independiente del PRNG de la distribución y del sorteo
    const cd4 = Math.round((total * 2) / 3);
    tipos = Array.from({ length: total }, (_, i) => (i < cd4 ? "CD4" : "CD8"));
    for (let i = tipos.length - 1; i > 0; i--) { const j = Math.floor(rt() * (i + 1)); [tipos[i], tipos[j]] = [tipos[j], tipos[i]]; }
    if (forzarTipo === "CD4" || forzarTipo === "CD8") tipos = tipos.map(() => forzarTipo);   // solo pruebas locales
  }

  function medir() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    K = Math.min(W / VW, H / VH); OX = (W - VW * K) / 2; OY = (H - VH * K) / 2;
    distribuir();
  }

  const rT = () => 4.5 * UM * gs;
  function pos(i, t, amortiguar = 0) {
    const c = T[i], A = reducido ? 0 : c.amp * (1 - amortiguar);
    return { x: c.bx + A * (sin(c.w1 * t + c.p1) + 0.5 * sin(c.w2 * t + c.p2)), y: c.by + A * (cos(c.w3 * t + c.p3) + 0.5 * sin(c.w4 * t + c.p4)) };
  }
  const anillo = (i) => (tipos[i] === "CD4" ? C.cielo : C.blanco);

  // ------------------------------------------------------------------ utilidades de dibujo
  function texto(s, x, y, { tam = 24, color = C.celeste, ancla = "center", alpha = 1, peso = 600 } = {}) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${peso} ${tam}px Montserrat, system-ui, sans-serif`;
    ctx.textAlign = ancla; ctx.textBaseline = "middle"; ctx.fillStyle = color;
    ctx.shadowColor = "rgba(3,28,40,.95)"; ctx.shadowBlur = 7; ctx.fillText(s, x, y); ctx.restore();
  }
  function guia(x1, y1, x2, y2, alpha = 1) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha * 0.8; ctx.strokeStyle = C.celeste; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  function resplandor(x, y, r, color = "167,240,243", a = 0.5) {
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function catmull(p0, p1, p2, p3, u) {
    const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }
  /** Camino por puntos con tiempo: p = [{x,y,tau}], pasa por cada punto exactamente en su `tau` (0..1). */
  function caminoTiempo(p, u) {
    let j = 0; while (j < p.length - 2 && u > p[j + 1].tau) j++;
    const a = p[j], b = p[j + 1], l = clamp((u - a.tau) / Math.max(1e-6, b.tau - a.tau));
    return catmull(p[Math.max(0, j - 1)], a, b, p[Math.min(p.length - 1, j + 2)], l);
  }

  // ------------------------------------------------------------------ fondos
  function fondoPlano(color1, color2) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, 80, VW / 2, VH / 2, 1100);
    g.addColorStop(0, color1); g.addColorStop(1, color2);
    ctx.fillStyle = g; ctx.fillRect(-600, -400, VW + 1200, VH + 800);
  }

  function fondoGanglio(t, { etiquetas = false, alpha = 1 } = {}) {
    fondoPlano("#0e4a63", "#052638");
    ctx.save(); ctx.lineWidth = 1.4;
    for (const [a, b, c] of red.aristas) {                    // red reticular de fibroblastos (FRC)
      ctx.strokeStyle = "rgba(167,240,243,.13)"; ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + b[0]) / 2 + c, (a[1] + b[1]) / 2 - c, b[0], b[1]); ctx.stroke();
    }
    ctx.fillStyle = "rgba(167,240,243,.1)";
    for (const [x, y] of red.nodos) { ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); }
    ctx.restore();
    for (const a of ambiente) {                                // células de ambientación (otras células del ganglio, tenues)
      const x = a.x + 14 * sin(t * a.f + a.p), y = a.y + 14 * cos(t * a.f * 1.3 + a.p);
      ctx.fillStyle = "rgba(139,173,196,.22)"; ctx.beginPath(); ctx.arc(x, y, a.r, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(100,120,170,.25)"; ctx.beginPath(); ctx.arc(x, y, a.r * 0.6, 0, TAU); ctx.fill();
    }
    // vénula de endotelio alto (izquierda): por aquí entran los linfocitos T vírgenes desde la sangre
    ctx.save(); ctx.fillStyle = "rgba(120,40,50,.35)"; ctx.beginPath(); ctx.roundRect(18, 110, 78, 600, 30); ctx.fill();
    ctx.fillStyle = C.endotelio;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.roundRect(88, 120 + i * 72, 26, 56, 8); ctx.fill(); ctx.beginPath(); ctx.roundRect(4, 120 + i * 72, 26, 56, 8); ctx.fill(); }
    ctx.restore();
    // linfa eferente (derecha) y aferente (arriba a la derecha)
    ctx.save(); ctx.fillStyle = "rgba(167,240,243,.07)"; ctx.strokeStyle = "rgba(167,240,243,.28)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(1500, 470, 120, 150, 24); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(1440, -20, 120, 120, 24); ctx.fill(); ctx.stroke(); ctx.restore();
    if (etiquetas) {
      texto("Vénula de endotelio alto", 20, 730, { tam: 18, ancla: "left", alpha });
      texto("Linfa eferente", 1548, 645, { tam: 18, alpha });
      texto("Linfa aferente", 1430, 118, { tam: 18, ancla: "right", alpha });
      texto("Ganglio linfático · paracorteza", 800, 38, { tam: 24, alpha: alpha * 0.9 });
    }
  }

  function fondoTejido(t, { vasoActivo = 0, vasoVisible = true } = {}) {
    fondoPlano("#0a4258", "#04202e");
    ctx.save(); ctx.strokeStyle = "rgba(167,240,243,.07)"; ctx.lineWidth = 2;        // fibras de tejido conectivo
    for (let i = 0; i < 26; i++) { const y = 230 + i * 21; ctx.beginPath(); ctx.moveTo(-20, y); ctx.bezierCurveTo(400, y + 30 * sin(i), 1100, y - 30 * cos(i), 1620, y + 10 * sin(i * 2)); ctx.stroke(); }
    ctx.restore();
    // epitelio con una brecha (barrera rota)
    for (let x = -30; x < VW + 60; x += 58) {
      if (x > HUECO[0] - 28 && x < HUECO[1] + 28) {
        if (Math.abs(x - HUECO[0]) < 40 || Math.abs(x - HUECO[1]) < 40) celulaEpitelial(ctx, x, EPI_Y + 8, 50, 62, { rot: x < 800 ? -0.32 : 0.32, alpha: 0.9 });
        continue;
      }
      celulaEpitelial(ctx, x, EPI_Y, 54, 70);
    }
    if (vasoVisible) {
      const y0 = VASO.y - VASO.alto / 2, y1 = VASO.y + VASO.alto / 2;
      ctx.fillStyle = "rgba(140,45,55,.55)"; ctx.fillRect(-20, y0, VW + 40, VASO.alto);              // luz con sangre
      for (let i = 0; i < 9; i++) eritrocito(ctx, ((i * 190 + t * 0.06) % (VW + 120)) - 60, VASO.y + 22 * sin(i * 2.3 + t * 0.001), 12);
      for (let x = -20; x < VW + 60; x += 78) {                                                       // endotelio (pared)
        for (const y of [y0, y1]) {
          ctx.beginPath(); ctx.ellipse(x, y, 40, 11, 0, 0, TAU);
          ctx.fillStyle = y === y0 ? mezcla(C.endotelio, C.endotelioAct, vasoActivo) : C.endotelio; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = "#8e4a63"; ctx.stroke();
          if (y === y0 && vasoActivo > 0.05) {                                                       // selectinas expresadas hacia la luz
            ctx.strokeStyle = C.endotelioAct; ctx.lineWidth = 1.8;
            for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 16, y + 9); ctx.lineTo(x + k * 16, y + 9 + 11 * vasoActivo); ctx.stroke(); ctx.beginPath(); ctx.arc(x + k * 16, y + 10 + 11 * vasoActivo, 2.6, 0, TAU); ctx.fillStyle = C.endotelioAct; ctx.fill(); }
          }
        }
      }
    }
  }
  function mezcla(a, b, k) {
    const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(k)))).join(",")})`;
  }

  // ------------------------------------------------------------------ población del ganglio
  /** Dibuja los linfocitos T. `omitir` = índice(s) que se dibujan aparte (ganador y su clon). */
  function dibujarPoblacion(t, { omitir = -1, marcarContacto = null, leyenda = false, alpha = 1, repeler = null } = {}) {
    const r = rT();
    for (let i = 0; i < T.length; i++) {
      if (i === omitir) continue;
      const p = pos(i, t);
      if (repeler && repeler.k > 0) {                       // despeja el foco para que se vea el par DC–linfocito (solo visual)
        const dx = p.x - repeler.x, dy = p.y - repeler.y, d = Math.hypot(dx, dy) || 1;
        if (d < repeler.r) { const f = (repeler.r - d) * repeler.k; p.x += (dx / d) * f; p.y += (dy / d) * f; }
      }
      const contacto = marcarContacto?.(i) ?? 0;
      linfocito(ctx, p.x, p.y, r, { anillo: anillo(i), alpha, brillo: contacto });
    }
    if (leyenda) {
      const x = 570, y = 112;
      ctx.save(); ctx.globalAlpha *= alpha;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = C.cielo; ctx.stroke();
      texto("CD4 (≈ 2/3)", x + 18, y, { tam: 18, ancla: "left" });
      ctx.beginPath(); ctx.arc(x + 170, y, 8, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = C.blanco; ctx.stroke();
      texto("CD8 (≈ 1/3) · solo ilustrativo", x + 188, y, { tam: 18, ancla: "left" });
      ctx.restore();
    }
  }

  /** Ruta de la célula dendrítica por el ganglio (E4): pasa por varios linfocitos y termina en el ganador. */
  function rutaDC(S) {
    const { anim: A } = S;
    const w = A.ganador, ini = A.inicio.E4, dur = A.dur.E4;
    const tAbs = (tau) => A.base + ini + tau * dur;
    const r = rT(), off = { x: -(r + 28 * gs) * 0.95, y: -6 * gs };
    const finW = pos(w, tAbs(1));
    const pts = [{ x: 1500, y: 60, tau: 0 }];
    A.visitados.forEach((c, j) => { const tau = 0.14 + j * 0.15, p = pos(c, tAbs(tau)); pts.push({ x: p.x, y: p.y, tau }); });
    pts.push({ x: finW.x + off.x, y: finW.y + off.y, tau: 1 });
    return { pts, off, tAbs };
  }

  // ================================================================== ESCENAS E4–E6
  function escenaE4(S) {                                      // El ganglio: paracorteza, la DC recorre y contacta
    const { u, reloj, anim: A } = S;
    fondoGanglio(reloj, { etiquetas: true });
    const ruta = rutaDC(S);
    const dc = caminoTiempo(ruta.pts, u);
    const r = rT();
    const contacto = (i) => {                                  // contactos breves con linfocitos que NO reconocen (no hay activación)
      const j = A.visitados.indexOf(i);
      if (j < 0) return 0;
      const tau = 0.14 + j * 0.15; return Math.max(0, 1 - Math.abs(u - tau) / 0.05);
    };
    dibujarPoblacion(reloj, { omitir: A.ganador, marcarContacto: contacto, leyenda: true });
    const pw = pos(A.ganador, reloj);
    linfocito(ctx, pw.x, pw.y, r, { anillo: anillo(A.ganador), brillo: Math.max(0, (u - 0.9) * 8) });
    celulaDendritica(ctx, dc.x, dc.y, 9 * UM * gs, { t: reloj, madurez: 1, fase: 0.4 });
    texto("Célula dendrítica madura", dc.x, dc.y - 9 * UM * gs * 2.4, { tam: 20, alpha: ep(0.05, 0.25, u) * (1 - ep(0.7, 0.95, u)) });
    texto("Linfocitos T vírgenes (participantes)", 800, 76, { tam: 20, alpha: ep(0.1, 0.3, u) * (1 - ep(0.8, 1, u)) });
  }

  /** Cámara de E5/E6: acerca el par DC–linfocito y deja la derecha libre para los iconos. */
  function camara(z, sx, fx) {
    ctx.translate(sx, FOCO.y); ctx.scale(z, z); ctx.translate(-fx, -FOCO.y);
  }

  function parE5(S, e) {                                      // posiciones del ganador y la DC durante E5/E6 (e = 0 → como al final de E4)
    const { anim: A, reloj } = S, r = rT(), off = { x: -(r + 28 * gs) * 0.95, y: -6 * gs };
    const pw0 = pos(A.ganador, reloj, 0);
    const pw = { x: lerp(pw0.x, FOCO.x, e), y: lerp(pw0.y, FOCO.y, e) };
    const pdc = { x: pw.x + lerp(off.x, -(r + 30 * gs), e), y: pw.y + lerp(off.y, -4, e) };
    return { pw, pdc, off };
  }

  function insignia(x, y, ancho, titulo, sub, encendido, glifo) {
    ctx.save(); ctx.globalAlpha *= 0.35 + 0.65 * encendido;
    ctx.beginPath(); ctx.roundRect(x, y, ancho, 84, 16);
    ctx.fillStyle = `rgba(5,48,67,${0.9 + 0.08 * encendido})`; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = encendido > 0.5 ? C.celeste : "rgba(167,240,243,.35)"; ctx.stroke();
    glifo(x + 44, y + 42, encendido);
    texto(titulo, x + 96, y + 30, { tam: 21, ancla: "left", color: encendido > 0.5 ? C.blanco : C.celeste });
    texto(sub, x + 96, y + 60, { tam: 17, ancla: "left", peso: 400 });
    if (encendido > 0.5) { ctx.beginPath(); ctx.arc(x + ancho - 30, y + 42, 15, 0, TAU); ctx.fillStyle = C.verde; ctx.fill(); ctx.strokeStyle = C.petroleo; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x + ancho - 37, y + 42); ctx.lineTo(x + ancho - 31, y + 48); ctx.lineTo(x + ancho - 22, y + 36); ctx.stroke(); }
    ctx.restore();
  }
  const glifoTCR = (x, y, e) => {                                   // TCR (T) + péptido en el surco del MHC (DC)
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = C.celeste; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 24, y + 12); ctx.lineTo(x - 24, y - 4); ctx.stroke(); ctx.beginPath(); ctx.arc(x - 24, y - 9, 6, 0, TAU); ctx.fillStyle = C.celeste; ctx.fill();
    ctx.strokeStyle = C.mhc; ctx.beginPath(); ctx.moveTo(x + 8, y + 14); ctx.lineTo(x + 8, y + 2); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 6, y + 2); ctx.lineTo(x + 22, y + 2); ctx.lineTo(x + 22, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 8, y - 8, 4.5, 0, TAU); ctx.fillStyle = e > 0.5 ? C.verde : C.cd80; ctx.fill(); ctx.restore();
  };
  const glifoCD28 = (x, y) => {                                      // CD28 (T) con CD80/86 (DC)
    ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = 4;
    ctx.strokeStyle = C.celeste; ctx.beginPath(); ctx.moveTo(x - 20, y + 14); ctx.lineTo(x - 20, y - 4); ctx.stroke(); ctx.beginPath(); ctx.arc(x - 20, y - 9, 6, 0, TAU); ctx.fillStyle = C.celeste; ctx.fill();
    ctx.strokeStyle = C.cd80; ctx.beginPath(); ctx.moveTo(x + 8, y + 14); ctx.lineTo(x + 8, y - 4); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 8, y - 9, 6, 0, TAU); ctx.fillStyle = C.cd80; ctx.fill(); ctx.restore();
  };
  const glifoCitocinas = (x, y, e) => {
    ctx.save(); ctx.fillStyle = C.celeste;
    for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); ctx.arc(x + cos(a) * 16, y + sin(a) * 14 + 2 * sin(e * 6 + i), 4.2, 0, TAU); ctx.fill(); } ctx.restore();
  };

  function escenaE5(S) {                                      // Tres señales: el ganador se detiene y se activa
    const { u, reloj, anim: A } = S;
    const e = cubica(ep(0, 0.3, u));
    const z = lerp(1, 2.6, e), sx = lerp(800, 500, e), fx = lerp(800, FOCO.x - 36, e);
    fondoGanglio(reloj, { etiquetas: false });
    ctx.save(); camara(z, sx, fx);
    dibujarPoblacion(reloj, { omitir: A.ganador, repeler: { x: FOCO.x - 36, y: FOCO.y, r: 150 + 40 * gs, k: e } });   // los demás reanudan su patrulla (no se desvanecen)
    const { pw, pdc } = parE5(S, e);
    const r = rT(), act = suave(ep(0.78, 1, u));
    // sinapsis inmunológica: interfaz brillante entre la DC y el linfocito
    const sy = ep(0.1, 0.4, u);
    celulaDendritica(ctx, pdc.x, pdc.y, 9 * UM * gs, { t: reloj, madurez: 1, fase: 0.4 });
    if (sy > 0) { resplandor((pw.x + pdc.x) / 2 + 10, (pw.y + pdc.y) / 2, 40 * gs, "167,240,243", 0.55 * sy + 0.25 * sin(reloj * 0.006) * sy); }
    linfocito(ctx, pw.x, pw.y, r, { anillo: act > 0.5 ? null : anillo(A.ganador), brillo: sy * 0.6 });
    if (act > 0) linfocito(ctx, pw.x, pw.y, r, { activado: true, alpha: act, brillo: act });
    ctx.restore();
    // iconos de las tres señales (en coordenadas de pantalla)
    const mhc = A.tipo === "CD4" ? "MHC II" : "MHC I";
    const x = 930, ancho = 640;
    insignia(x, 250, ancho, `1 · Reconocimiento: TCR + péptido–${mhc}`, "El TCR de este linfocito reconoce el antígeno", ep(0.28, 0.4, u), (a, b, c) => glifoTCR(a, b, c));
    insignia(x, 360, ancho, "2 · Coestimulación: CD28 – CD80/86", "La DC madura aporta la segunda señal", ep(0.5, 0.62, u), glifoCD28);
    insignia(x, 470, ancho, "3 · Citocinas", "Señales solubles que orientan la respuesta", ep(0.7, 0.82, u), glifoCitocinas);
    texto("Con las tres señales, el linfocito se activa", 1250, 600, { tam: 22, alpha: act, color: C.verde });
  }

  // ----------------------------------------------------------------- E6: expansión, salida y acción
  /** Posición final de cada uno de los 16 clones (cúmulo) y por nivel de división (media del grupo). */
  function posClon(k, nivel, r0) {
    const tam = 16, grupo = tam / 2 ** nivel, ini = Math.floor(k / grupo) * grupo;
    let sx = 0, sy = 0;
    for (let j = ini; j < ini + grupo; j++) { const a = (j / tam) * TAU, rr = r0 * (0.5 + 0.5 * ((j * 7) % 5) / 4); sx += cos(a) * rr; sy += sin(a) * rr * 0.85; }
    return { x: sx / grupo, y: sy / grupo };
  }

  function escenaE6(S) {
    const { u, reloj, anim: A } = S;
    const fAB = ep(0.36, 0.42, u), fBC = ep(0.56, 0.62, u);        // A: proliferación (ganglio) · B: salida · C: acción en el tejido
    const r = rT();
    // ---------- partes A y B (ganglio)
    if (fBC < 1) {
      const eB = cubica(ep(0.36, 0.52, u)), zA = lerp(2.6, 2.0, ep(0, 0.36, u));
      fondoGanglio(reloj, { etiquetas: u > 0.4, alpha: ep(0.4, 0.5, u) });
      ctx.save(); camara(lerp(zA, 1, eB), lerp(500, 800, eB), lerp(FOCO.x - 36, 800, eB));
      dibujarPoblacion(reloj, { omitir: A.ganador, repeler: { x: FOCO.x - 36, y: FOCO.y, r: 150 + 40 * gs, k: 1 - cubica(ep(0.4, 0.6, u)) } });   // siguen patrullando
      const { pw, pdc } = parE5(S, 1);
      const salida = ep(0.4, 0.58, u);
      celulaDendritica(ctx, pdc.x, pdc.y, 9 * UM * gs, { t: reloj, madurez: 1, fase: 0.4, alpha: 1 - 0.55 * ep(0.15, 0.4, u) });
      // proliferación 1→2→4→8→16 (4 divisiones) con IL-2
      const div = ep(0.04, 0.34, u) * 4, etapa = Math.min(3, Math.floor(div)), uu = cubica(div - etapa), fin = div >= 4;
      const rr = r * lerp(1, 0.78, ep(0.04, 0.34, u)), R0 = 40 * gs * lerp(1, 1.5, ep(0.04, 0.34, u));
      for (let k = 0; k < 16; k++) {
        const a = posClon(k, etapa, R0), b = posClon(k, fin ? 4 : etapa + 1, R0), q = fin ? 1 : uu;
        let x = pw.x + lerp(a.x, b.x, q), y = pw.y + lerp(a.y, b.y, q);
        if (salida > 0) {                                                // las células efectoras salen por la linfa eferente
          const dest = { x: 1560, y: 540 }, k2 = cubica(clamp((salida * 1.25) - k * 0.018));
          x = lerp(x, dest.x + (k % 4) * 8, k2); y = lerp(y, dest.y + ((k * 13) % 30) - 15, k2);
        }
        linfocito(ctx, x, y, rr, { activado: true, brillo: 0.35 });
        if (ep(0.3, 0.36, u) > 0 && !(salida > 0)) { ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = A.tipo === "CD4" ? C.cielo : C.blanco; ctx.stroke(); }
      }
      // IL-2 (partículas) alrededor del cúmulo durante la proliferación
      const il2 = ep(0.02, 0.1, u) * (1 - ep(0.3, 0.36, u));
      for (let i = 0; i < 12; i++) { const a = i * 0.9 + reloj * 0.0007, d = 70 * gs + 14 * sin(reloj * 0.004 + i); resplandor(pw.x + cos(a) * d, pw.y + sin(a) * d * 0.8, 9, "167,240,243", 0.8 * il2); }
      ctx.restore();                                                      // fin cámara
      texto("IL-2", 330, 330, { tam: 26, alpha: il2, color: C.celeste });
      texto("Efectores salen por la linfa eferente → sangre → tejido", 800, 76, { tam: 22, alpha: ep(0.42, 0.5, u) * (1 - fBC) });
    }
    // ---------- parte C (tejido infectado)
    if (fBC > 0) {
      ctx.save(); ctx.globalAlpha *= fBC;
      escenaFinalTejido(S, ep(0.6, 1, u));
      ctx.restore();
    }
  }

  /** Final en el tejido infectado: CD8 mata una célula infectada; CD4 activa a un macrófago con IFN-γ. */
  function escenaFinalTejido(S, c) {
    const { reloj, anim: A } = S;
    fondoTejido(reloj, { vasoVisible: false });
    const cd8 = A.tipo === "CD8";
    const ctr = { x: 860, y: 480 };
    ctx.save(); ctx.translate(ctr.x, ctr.y); ctx.scale(1.45, 1.45); ctx.translate(-ctr.x, -ctr.y);   // acerca la acción
    const llegada = cubica(ep(0, 0.32, c)), r = 15 * gs ** 0.5 + 5;
    // clones efectores (4 visibles) llegan desde la izquierda
    const cel = [[-1, 0], [-0.8, -1.1], [-0.8, 1.1], [-1.5, 0.3]];
    if (cd8) {
      const contacto = ep(0.28, 0.42, c), gran = ep(0.4, 0.7, c), muere = ep(0.62, 1, c);
      // célula infectada: bacilos en el citosol y péptidos en MHC I
      ctx.save();
      const jit = muere * 5 * sin(reloj * 0.03);
      contornoIrregular(ctx, ctr.x + jit, ctr.y, 52 * (1 - 0.12 * muere), { n: 20, amp: 0.05 + 0.2 * muere, t: reloj, vel: 0.004 });
      ctx.fillStyle = mezcla("#6aa0b3", "#3d5360", muere); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = muere > 0.4 ? "#c06a6a" : "#3e6f82"; ctx.stroke();
      contornoIrregular(ctx, ctr.x - 8, ctr.y - 4, 20, { n: 12, amp: 0.08 }); ctx.fillStyle = C.epitelioNucleo; ctx.fill();
      for (let i = 0; i < 8; i++) bacilo(ctx, ctr.x + 18 + 22 * cos(i * 2.3), ctr.y + 8 + 22 * sin(i * 1.7), i * 0.8, 1.6, 1 - 0.5 * muere);
      for (let i = 0; i < 12; i++) { const a = i * 0.5236; ctx.beginPath(); ctx.arc(ctr.x + cos(a) * 54, ctr.y + sin(a) * 54, 3.4, 0, TAU); ctx.fillStyle = C.mhc; ctx.fill(); }
      ctx.restore();
      texto("Célula infectada", ctr.x, ctr.y - 128, { tam: 22, alpha: ep(0.05, 0.2, c) });
      texto("péptido bacteriano en MHC I", ctr.x, ctr.y - 104, { tam: 17, alpha: ep(0.1, 0.25, c), peso: 400 });
      cel.forEach(([dx, dy], i) => {
        const principal = i === 0, fin = { x: ctr.x + (principal ? -(52 + r) * (0.98 + 0.02 * (1 - contacto)) : dx * 110), y: ctr.y + (principal ? 0 : dy * 90) };
        const x = lerp(-80 - i * 40, fin.x, llegada), y = lerp(430 + dy * 60, fin.y, llegada);
        linfocito(ctx, x, y, r, { activado: true, brillo: 0.4 + (principal ? contacto * 0.6 : 0) });
      });
      // gránulos de perforina/granzimas del CTL principal hacia la célula blanco
      const px = ctr.x - 52 - r, py = ctr.y;
      for (let i = 0; i < 9; i++) {
        const g = clamp(gran * 1.4 - i * 0.07), a = lerp(px + r * 0.6, ctr.x - 20, g), b = lerp(py, ctr.y + (i % 3 - 1) * 12, g);
        if (g > 0 && g < 1) { ctx.beginPath(); ctx.arc(a, b, 4.2, 0, TAU); ctx.fillStyle = "#ffe28a"; ctx.fill(); }
      }
      for (let i = 0; i < 4; i++) if (gran > 0.25 + i * 0.12) { ctx.beginPath(); ctx.arc(ctr.x - 50, ctr.y - 18 + i * 12, 4, 0, TAU); ctx.strokeStyle = "#ffe28a"; ctx.lineWidth = 2; ctx.stroke(); } // poros de perforina
      if (muere > 0.6) for (let i = 0; i < 9; i++) { const a = i * 0.7, d = 60 + 70 * ep(0.6, 1, muere), x = ctr.x + cos(a) * d, y = ctr.y + sin(a) * d; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fillStyle = `rgba(106,160,179,${0.8 * (1 - ep(0.8, 1, muere) * 0.6)})`; ctx.fill(); } // cuerpos apoptóticos
      texto("Perforina y granzimas", px + 30, ctr.y + 112, { tam: 21, alpha: ep(0.4, 0.55, c) * (1 - 0.3 * muere), color: "#ffe28a" });
    } else {
      // CD4 (Th1): IFN-γ activa al macrófago, que destruye bacterias intracelulares en sus fagosomas
      const IFN = ep(0.25, 0.65, c), destruye = ep(0.55, 1, c);
      macrofago(ctx, ctr.x, ctr.y, 52, { t: reloj, fase: 0.3, activado: ep(0.45, 0.7, c) });
      for (let i = 0; i < 4; i++) {                                         // fagosomas con bacilos que se destruyen
        const a = i * 1.57 + 0.5, x = ctr.x + cos(a) * 26, y = ctr.y + sin(a) * 22;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fillStyle = "rgba(30,60,80,.55)"; ctx.fill(); ctx.strokeStyle = "rgba(167,240,243,.5)"; ctx.lineWidth = 1.5; ctx.stroke();
        bacilo(ctx, x, y, a, 1.6 * (1 - 0.6 * destruye), 1 - destruye);
      }
      texto("Macrófago con bacterias intracelulares", ctr.x + 20, ctr.y - 128, { tam: 22, alpha: ep(0.05, 0.2, c) });
      cel.forEach(([dx, dy], i) => {
        const principal = i === 0, fin = { x: ctr.x + (principal ? -(52 + r + 40) : dx * 110), y: ctr.y + (principal ? -10 : dy * 90) };
        const x = lerp(-80 - i * 40, fin.x, llegada), y = lerp(430 + dy * 60, fin.y, llegada);
        linfocito(ctx, x, y, r, { activado: true, brillo: 0.4 });
        if (principal) { ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = C.cielo; ctx.stroke(); }
      });
      const px = ctr.x - 52 - r - 40, py = ctr.y - 10;
      for (let i = 0; i < 12; i++) {                                        // partículas de IFN-γ
        const g = clamp(IFN * 1.5 - i * 0.05); if (g <= 0 || g >= 1) continue;
        ctx.beginPath(); ctx.arc(lerp(px + 10, ctr.x - 40, g), lerp(py, ctr.y + (i % 4 - 1.5) * 10, g) - 6 * sin(g * 6 + i), 4.4, 0, TAU); ctx.fillStyle = C.cielo; ctx.fill();
      }
      texto("IFN-γ", ctr.x - 118, ctr.y + 86, { tam: 24, alpha: ep(0.2, 0.35, c), color: C.cielo });
    }
    ctx.restore();
  }


  // ================================================================== ESCENAS E0–E3
  function escenaE0(S) {                                      // El elenco: frotis de sangre
    const { u, reloj } = S, Z = 2.4;
    fondoPlano("#0a4258", "#04202e");
    const rnd = mulberry32(semilla ^ 0x51ed);
    const XS = [230, 500, 780, 1060, 1340];
    for (let i = 0; i < 64; i++) {                            // eritrocitos de fondo (el frotis); no tapan a las células del elenco
      const x = rnd() * VW, y = 110 + rnd() * 700;
      if (XS.some((cx) => Math.hypot(x - cx, y - 430) < 110) || (y > 520 && y < 660)) continue;
      ctx.save(); ctx.globalAlpha *= 0.55; eritrocito(ctx, x + (reducido ? 0 : 6 * sin(reloj * 0.0005 + i)), y, 3.75 * UM * Z * 0.8); ctx.restore();
    }
    texto("Frotis de sangre (tinción tipo Wright-Giemsa)", 800, 70, { tam: 28, alpha: ep(0, 0.1, u) });
    const elenco = [
      { x: 230, dib: () => neutrofilo(ctx, 230, 430, 5.5 * UM * Z, { lobulos: 4, rot: 0.3 }), n: "Neutrófilo", t1: "10–12 µm", t2: "núcleo de 3–5 lóbulos" },
      { x: 500, dib: () => eosinofilo(ctx, 500, 430, 6.5 * UM * Z), n: "Eosinófilo", t1: "12–15 µm", t2: "gránulos rojo-anaranjados" },
      { x: 780, dib: () => basofilo(ctx, 780, 430, 6.5 * UM * Z), n: "Basófilo", t1: "12–15 µm", t2: "gránulos azul-violeta oscuros" },
      { x: 1060, dib: () => monocito(ctx, 1060, 430, 8 * UM * Z * 0.9), n: "Monocito", t1: "", t2: "" },
      { x: 1340, dib: () => linfocito(ctx, 1340, 430, 4.5 * UM * Z), n: "Linfocito", t1: "7–10 µm", t2: "núcleo redondo grande, poco citoplasma" },
    ];
    elenco.forEach((c, i) => {
      const a = ep(0.12 + i * 0.15, 0.24 + i * 0.15, u);
      ctx.save(); ctx.globalAlpha *= 0.25 + 0.75 * a; ctx.translate(0, (1 - a) * 14); c.dib(); ctx.restore();
      texto(c.n, c.x, 560, { tam: 26, alpha: a, color: C.blanco });
      if (c.t1) texto(c.t1, c.x, 596, { tam: 20, alpha: a });
      if (c.t2) texto(c.t2, c.x, 626, { tam: 17, alpha: a, peso: 400 });
    });
  }

  const BAC = 2.2;                                           // exageración didáctica del tamaño de los bacilos (~1–2 µm reales)
  const TJ = (j) => ({ x: 800 + (j - 2) * 125, y: 360 + (j % 2) * 55 });
  const bacPos = (b, t, u, fin) => {                             // entrada por la brecha (E1) y reposo con un leve temblor
    const k = fin ? 1 : suave(ep(b.te, b.te + 0.42, u));
    return { x: lerp(b.x0, b.dx, k) + (fin ? 3 : 6 * (1 - k) + 3) * sin(t * 0.003 + b.w), y: lerp(EPI_Y + 34, b.dy, k) + 3 * cos(t * 0.0026 + b.w), vis: fin ? 1 : ep(b.te, b.te + 0.05, u) };
  };

  function citocinas(u0, u, reloj, fuerza = 1) {              // TNF, IL-1 y quimiocinas del macrófago residente
    const { x, y, r } = MAC0, n = 18;
    for (let k = 0; k < n; k++) {
      const ini = u0 + (k % 6) * 0.025, d = clamp((u - ini) / 0.3);
      if (d <= 0 || d >= 1) continue;
      const a = (k / n) * TAU + 0.3, dist = r + 12 + d * 360, px = x + cos(a) * dist, py = y + sin(a) * dist * 0.85;
      resplandor(px, py, 12, k % 3 === 0 ? "240,163,192" : "167,240,243", 0.85 * (1 - d) * fuerza);
      ctx.beginPath(); ctx.arc(px, py, 3.4, 0, TAU); ctx.fillStyle = k % 3 === 0 ? C.endotelioAct : C.celeste; ctx.globalAlpha *= (1 - d * 0.8) * fuerza; ctx.fill(); ctx.globalAlpha /= Math.max(0.01, (1 - d * 0.8) * fuerza);
      if (fuerza === 1 && (k === 0 || k === 6 || k === 12) && d < 0.8) texto(["TNF", "IL-1", "Quimiocinas"][k / 6], px, py - 18, { tam: 18, alpha: Math.min(1, d * 5) * (1 - ep(0.6, 0.8, d)) });
    }
  }

  function escenaE1(S) {                                      // Barrera rota, bacilos, macrófago residente, endotelio activado
    const { u, reloj } = S;
    fondoTejido(reloj, { vasoActivo: ep(0.45, 0.9, u) });
    for (const b of bac) { const p = bacPos(b, reloj, u, false); if (p.vis > 0) bacilo(ctx, p.x, p.y, b.a + 0.5 * sin(reloj * 0.002 + b.w), BAC, p.vis); }
    const det = ep(0.28, 0.5, u);
    macrofago(ctx, MAC0.x, MAC0.y, MAC0.r, { t: reloj, fase: 1, activado: ep(0.4, 0.8, u) * 0.6 });
    if (det > 0 && det < 1.01) {                              // reconocimiento de patrones del patógeno (receptores tipo TLR)
      const px = MAC0.x + MAC0.r + 8, py = MAC0.y - 10;
      ctx.save(); ctx.globalAlpha *= 0.4 + 0.6 * sin(det * 12) ** 2; ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 3; ctx.lineCap = "round";
      for (let i = 0; i < 6; i++) { const a = i * 1.0472; ctx.beginPath(); ctx.moveTo(px + cos(a) * 5, py + sin(a) * 5); ctx.lineTo(px + cos(a) * 15, py + sin(a) * 15); ctx.stroke(); } ctx.restore();
      texto("receptores de patrones (TLR)", px + 26, py - 22, { tam: 17, ancla: "left", alpha: det * (1 - ep(0.5, 0.62, u)) });
    }
    citocinas(0.42, u, reloj);
    texto("Epitelio roto", 800, 92, { tam: 24, alpha: ep(0.02, 0.15, u) }); guia(800, 108, 800, 140, ep(0.02, 0.15, u));
    texto("Bacilos (Listeria)", 800, 515, { tam: 22, alpha: ep(0.25, 0.4, u) });
    texto("Macrófago residente", MAC0.x, MAC0.y + MAC0.r + 38, { tam: 22, alpha: ep(0.35, 0.5, u) });
    texto("Vénula poscapilar · endotelio activado", 1180, VASO.y - VASO.alto / 2 - 30, { tam: 22, alpha: ep(0.65, 0.85, u) });
  }

  /** Estado de un neutrófilo (j = 0..4) en E2: rodamiento → adhesión → diapédesis → migración → fagocitosis. */
  function estadoNeutrofilo(j, u) {
    const d = 0.01 + j * 0.08, v = clamp((u - d) / 0.62), rN = 5.5 * UM, yTop = VASO.y - VASO.alto / 2, Tj = TJ(j), xAdh = 300 + j * 190;
    let x, y, rot = 0, alarg = 0, fase = "rodamiento";
    if (v < 0.3) { const k = v / 0.3; x = lerp(-70, xAdh, suave(k)); y = lerp(VASO.y + 6, yTop + rN + 3, suave(clamp(k * 1.4))) + (k > 0.5 ? 3.5 * Math.abs(sin(k * 18)) : 0); rot = k * 10; }
    else if (v < 0.45) { const k = (v - 0.3) / 0.15; x = xAdh; y = yTop + rN + 3 - 2 * k; alarg = 0.18 * k; fase = "adhesión"; }
    else if (v < 0.62) { const k = (v - 0.45) / 0.17; x = xAdh; y = lerp(yTop + rN + 1, yTop - rN * 1.1, suave(k)); rot = Math.PI / 2; alarg = 0.1 + 0.32 * sin(k * Math.PI); fase = "diapédesis"; }
    else { const k = (v - 0.62) / 0.38; x = lerp(xAdh, Tj.x, suave(k)) + 6 * sin(k * 9 + j); y = lerp(yTop - rN * 1.1, Tj.y, suave(k)); alarg = 0.14; rot = Math.atan2(Tj.y - (yTop - rN), Tj.x - xAdh); fase = k > 0.75 ? "fagocitosis" : "migración"; }
    return { x, y, rot, alarg, fase, v, fag: ep(0.8, 1, v), visible: v > 0 };
  }

  function escenaE2(S) {                                      // Neutrófilos
    const { u, reloj } = S;
    fondoTejido(reloj, { vasoActivo: 1 });
    macrofago(ctx, MAC0.x, MAC0.y, MAC0.r, { t: reloj, fase: 1, activado: 0.6 });
    citocinas(0.0, u + 0.3, reloj, 0.5);
    const E = [0, 1, 2, 3, 4].map((j) => estadoNeutrofilo(j, u));
    for (const b of bac) {                                    // los bacilos son fagocitados por «su» neutrófilo
      if (b.por > 4) { const p = bacPos(b, reloj, 1, true); bacilo(ctx, p.x, p.y, b.a + 0.5 * sin(reloj * 0.002 + b.w), BAC); continue; }
      const e = E[b.por], p = bacPos(b, reloj, 1, true), f = e.fag;
      if (f >= 1) continue;
      bacilo(ctx, lerp(p.x, e.x, f), lerp(p.y, e.y, f), b.a, BAC * (1 - 0.4 * f), 1 - f);
    }
    // NET (red de ADN) liberada por un neutrófilo, al final de la escena
    const net = ep(0.76, 1, u), nj = E[1];
    if (net > 0) {
      ctx.save(); ctx.lineWidth = 1.3;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.2, R = 38 + 95 * net * (0.7 + 0.3 * sin(i * 5)), c = a + 0.6 * sin(i * 3.1);
        ctx.strokeStyle = `rgba(222,205,240,${0.75 * net})`; ctx.beginPath(); ctx.moveTo(nj.x, nj.y);
        ctx.quadraticCurveTo(nj.x + cos(c) * R * 0.7, nj.y + sin(c) * R * 0.7, nj.x + cos(a) * R, nj.y + sin(a) * R); ctx.stroke();
      }
      ctx.restore();
      texto("NET", nj.x, nj.y - 128, { tam: 24, alpha: ep(0.82, 0.92, u) }); guia(nj.x, nj.y - 114, nj.x, nj.y - 60, ep(0.82, 0.92, u));
    }
    E.forEach((e, j) => {
      if (!e.visible) return;
      neutrofilo(ctx, e.x, e.y, 5.5 * UM, { lobulos: 3 + (j % 3), rot: e.rot, alargado: e.alarg, t: reloj, alpha: j === 1 && net > 0 ? 1 - 0.45 * net : 1 });
      if (e.fase === "fagocitosis" && e.fag < 1) for (let i = 0; i < 4; i++) { const a = reloj * 0.004 + i * 1.6; resplandor(e.x + cos(a) * 24, e.y + sin(a) * 24, 9, "120,230,255", 0.55 + 0.4 * sin(reloj * 0.02 + i)); }   // especies reactivas de oxígeno
    });
    const ef = E.find((e) => e.v > 0 && e.v < 1) ?? E[4], paso = ef.v >= 1 ? "" : ef.v < 0.62 ? ef.fase : ef.fase === "fagocitosis" ? "fagocitosis · especies reactivas de oxígeno" : "migración hacia el patógeno";
    if (paso) texto(paso, clamp(ef.x, 160, 1250), clamp(ef.y - 42, 60, 560), { tam: 21 });
    texto("Neutrófilos", 800, 300, { tam: 24, alpha: ep(0.3, 0.45, u) });
    texto("Vénula poscapilar", 1280, VASO.y - VASO.alto / 2 - 32, { tam: 20, alpha: 0.9 });
  }

  function escenaE3(S) {                                      // La célula dendrítica captura, madura y viaja al ganglio
    const { u, reloj } = S;
    fondoTejido(reloj, { vasoActivo: 1 });
    // vaso linfático aferente
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(167,240,243,.22)"; ctx.lineWidth = 46; ctx.beginPath(); LINFA_AFERENTE.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = "rgba(5,48,67,.75)"; ctx.lineWidth = 36; ctx.stroke();
    ctx.strokeStyle = "rgba(167,240,243,.55)"; ctx.lineWidth = 3; ctx.setLineDash([2, 36]); ctx.stroke(); ctx.restore();
    texto("Vaso linfático aferente → ganglio", 1240, 430, { tam: 20, alpha: ep(0.6, 0.75, u) });
    macrofago(ctx, MAC0.x, MAC0.y, MAC0.r, { t: reloj, fase: 1, activado: 0.6 });
    for (let j = 0; j < 5; j++) { const q = TJ(j); neutrofilo(ctx, q.x + 4 * sin(reloj * 0.002 + j), q.y, 5.5 * UM, { lobulos: 3 + (j % 3), rot: j, t: reloj, alpha: 0.8 }); }
    // posición de la DC: reposo → captura → maduración → migración por el vaso
    const mig = cubica(ep(0.55, 1, u)), cap = ep(0, 0.3, u), mad = ep(0.3, 0.6, u);
    const ruta = [{ x: DC0.x, y: DC0.y }, ...LINFA_AFERENTE.map(([x, y]) => ({ x, y })), { x: 1650, y: 20 }];
    const L = mig * (ruta.length - 1), i = Math.min(ruta.length - 2, Math.floor(L)), f = L - i;
    const dc = { x: lerp(ruta[i].x, ruta[i + 1].x, f), y: lerp(ruta[i].y, ruta[i + 1].y, f) };
    for (const b of bac) {                                    // bacilos que quedan; la DC captura los suyos
      if (b.por < 5) continue;
      const p = bacPos(b, reloj, 1, true);
      if (b.por === 5) bacilo(ctx, lerp(p.x, DC0.x, cubica(cap)), lerp(p.y, DC0.y, cubica(cap)), b.a, BAC, 1 - cap);
      else bacilo(ctx, p.x, p.y, b.a + 0.5 * sin(reloj * 0.002 + b.w), BAC);
    }
    celulaDendritica(ctx, dc.x, dc.y, DC0.r, { t: reloj, madurez: lerp(0.1, 1, mad), fase: 0.4 });
    if (cap > 0.2) for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(dc.x + (k - 1.5) * 8, dc.y + 5 * sin(k * 2), 3, 0, TAU); ctx.fillStyle = C.bacilo; ctx.globalAlpha *= ep(0.2, 0.5, cap); ctx.fill(); ctx.globalAlpha /= Math.max(0.01, ep(0.2, 0.5, cap)); }
    texto("Célula dendrítica", DC0.x, DC0.y - DC0.r * 2.7, { tam: 22, alpha: ep(0, 0.12, u) * (1 - ep(0.5, 0.6, u)) });
    texto("captura antígeno", DC0.x, DC0.y + DC0.r * 2.9, { tam: 20, alpha: ep(0.08, 0.2, u) * (1 - ep(0.3, 0.4, u)), peso: 400 });
    texto("madura: ↑CCR7 · ↑MHC · ↑CD80/CD86", DC0.x, DC0.y + DC0.r * 2.9, { tam: 20, alpha: ep(0.36, 0.46, u) * (1 - ep(0.58, 0.68, u)), peso: 400 });
  }

  // ------------------------------------------------------------------ escenas (mapa) y marco general
  const DIBUJO = { INTRO: ({ reloj }) => dibujarIdle(reloj), E0: escenaE0, E1: escenaE1, E2: escenaE2, E3: escenaE3, E4: escenaE4, E5: escenaE5, E6: escenaE6 };

  function escenaActual(ta) {
    const L = anim.lista;
    let i = L.length - 1;
    for (let k = 0; k < L.length; k++) if (ta < L[k].ini + L[k].dur) { i = k; break; }
    return i;
  }

  function dibujarIdle(reloj, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha;
    fondoGanglio(reloj, { etiquetas: true });
    dibujarPoblacion(reloj, { leyenda: true });
    ctx.restore();
  }

  function claveSubtitulo(esc, u) {
    switch (esc.id) {
      case "E0": return "E0"; case "E1": return "E1"; case "E2": return "E2"; case "E3": return "E3";
      case "INTRO": return "INTRO";
      case "E4": return anim.resumido ? "E4_S" : anim.desdeE4 ? "E4_RONDA" : "E4";
      case "E5": return anim.resumido ? "E5_S" : "E5";
      default: if (anim.resumido) return "E6_S"; return u < 0.37 ? "E6_PROLIF" : anim.tipo === "CD4" ? "E6_CD4" : "E6_CD8";
    }
  }

  function fotograma(ahora) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * K, 0, 0, dpr * K, dpr * OX, dpr * OY);
    if (!n) return;
    if (!anim) { dibujarIdle(ahora); return; }
    const A = anim, ta = ahora - A.t0, reloj = reducido ? A.base : A.base + ta;
    const i = escenaActual(ta), esc = A.lista[i];
    const ms = clamp(ta - esc.ini, 0, esc.dur), u = esc.fijo ?? (esc.dur ? ms / esc.dur : 1);
    const S = { u, ms, reloj, ta, esc, anim: A };
    // fundido desde la escena anterior (o desde el ganglio en reposo al arrancar)
    const f = clamp((ta - esc.ini) / (reducido ? 1500 : FUNDIDO));
    if (f < 1) {
      if (i > 0) { const p = A.lista[i - 1]; DIBUJO[p.id]?.({ u: p.fijo ?? 1, ms: p.dur, reloj, ta, esc: p, anim: A }); }
      else dibujarIdle(reloj);
      ctx.save(); ctx.globalAlpha = f; DIBUJO[esc.id]?.(S); ctx.restore();
    } else DIBUJO[esc.id]?.(S);
    // subtítulo y barra de tiempo
    const clave = claveSubtitulo(esc, u);
    if (clave !== claveFase) { claveFase = clave; cbFase(SUBTITULOS[clave], clave, esc.id); }
    const v = lerp(esc.tiempo[0], esc.tiempo[1], u);
    if (Math.abs(v - ultimoProg) > 0.004) { ultimoProg = v; cbProgreso(v, etiquetaTiempo(v)); }
    if (esc.id === "E6" && u >= 0.88 && !A.revelado) { A.revelado = true; cbRevelar({ tipo: A.tipo }); }
    if (ta >= A.total && !A.resuelto) { A.resuelto = true; if (!A.revelado) { A.revelado = true; cbRevelar({ tipo: A.tipo }); } A.resolver(); }
  }

  function bucle(ahora) { raf = requestAnimationFrame(bucle); fotograma(ahora); }

  const ro = new ResizeObserver(() => medir());
  ro.observe(canvas); medir(); raf = requestAnimationFrame(bucle);

  // ------------------------------------------------------------------ API
  return {
    /** Define cuántos linfocitos T hay en el ganglio (uno por participante, con tope visual) y reasigna CD4/CD8. */
    establecerClones(total) { n = total; anim = null; claveFase = null; distribuir(); asignarTipos(Math.min(total, MAX_T)); },
    indiceVisual(indice, total, alAzar) { return total <= MAX_T ? indice : alAzar(Math.min(total, MAX_T)); },
    tipoDe(indiceVisual) { return tipos[indiceVisual] ?? "CD8"; },
    get maxClones() { return MAX_T; },
    alFase(f) { cbFase = f; }, alRevelar(f) { cbRevelar = f; }, alProgreso(f) { cbProgreso = f; },
    setReducido(v) { reducido = !!v; },
    /**
     * Reproduce la narración. `desdeE4`: las rondas siguientes arrancan en el ganglio (E4–E6, ~17 s).
     * `incluirE0`: antepone el elenco (frotis de sangre).
     * `resumido` (modo por defecto): tarjeta de ~3 s + E4–E6 comprimidas (~15 s) con los subtítulos sencillos.
     */
    reproducir(indice, { desdeE4 = false, incluirE0 = false, resumido = false } = {}) {
      return new Promise((resolver) => {
        if (indice < 0 || indice >= T.length) return resolver();
        const ids = resumido ? ["INTRO", "E4", "E5", "E6"] : desdeE4 ? ["E4", "E5", "E6"] : ["E1", "E2", "E3", "E4", "E5", "E6"].filter((id) => DISPONIBLES.has(id));
        if (incluirE0 && !desdeE4 && DISPONIBLES.has("E0")) ids.unshift("E0");
        let ini = 0; const lista = [], inicio = {}, dur = {};
        // Con movimiento reducido no hay movimiento: cada escena es un fotograma fijo de 3 s con fundidos de 1,5 s.
        const FIJO = { E1: 0.9, E2: 0.85, E3: 0.9, E4: 0.95, E5: 0.95 };
        const pasos = ids.flatMap((id) => (reducido && id === "E6" ? [{ id, fijo: 0.3 }, { id, fijo: 0.97 }] : [{ id, fijo: reducido ? (FIJO[id] ?? 0.9) : undefined }]));
        for (const { id, fijo } of pasos) {
          const e = ESCENAS.find((x) => x.id === id) ?? ESC_INTRO, d = reducido ? 3000 : (resumido && DUR_RESUMIDO[id]) || e.dur;
          lista.push({ id, ini, dur: d, tiempo: e.tiempo, fijo }); inicio[id] = ini; dur[id] = d; ini += d;
        }
        const ahora = performance.now(), rv = mulberry32((semilla + 104729 * ++llamadas) >>> 0);
        // clones visitados por la DC en E4: cinco linfocitos distintos del ganador
        const otros = Array.from({ length: T.length }, (_, k) => k).filter((k) => k !== indice);
        for (let k = otros.length - 1; k > 0; k--) { const j = Math.floor(rv() * (k + 1)); [otros[k], otros[j]] = [otros[j], otros[k]]; }
        anim = { t0: ahora, base: ahora, lista, inicio, dur, total: ini, ganador: indice, tipo: tipos[indice] ?? "CD8", desdeE4, resumido, visitados: otros.slice(0, Math.min(5, otros.length)), revelado: false, resuelto: false, resolver };
        claveFase = null; ultimoProg = -1;
      });
    },
    /** Salta a la escena siguiente (tecla S). En la última, termina. */
    saltar() {
      if (!anim || anim.resuelto) return false;
      const ahora = performance.now(), ta = ahora - anim.t0, i = escenaActual(ta), esc = anim.lista[i];
      const destino = i < anim.lista.length - 1 ? esc.ini + esc.dur : anim.total;
      anim.t0 -= destino - ta + 1; return true;
    },
    reiniciar() { anim = null; claveFase = null; ultimoProg = -1; },
    get enCurso() { return !!anim && !anim.resuelto; },
    destruir() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

// Animación resumida: la tarjeta introductoria dura 3 s y E4/E5 se comprimen a 4 s (E6 conserva sus 7 s): 3 + 15 = 18 s en total.
const ESC_INTRO = { id: "INTRO", dur: 3000, tiempo: [0, 0] };
const DUR_RESUMIDO = { E4: 4000, E5: 4000 };
const DISPONIBLES = new Set(["E0", "E1", "E2", "E3", "E4", "E5", "E6"]);
