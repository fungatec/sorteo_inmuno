// Escena de selección clonal en Canvas 2D (sin librerías). Solo dibuja: la elección del ganador
// ocurre antes, en sorteo.js. Todo el azar visual sale de un PRNG con semilla criptográfica
// (nunca Math.random).
//
// Guion (ms desde que empieza la reproducción):
//   Escena 1  repertorio                0 – 2200   linfocitos B flotando, sin nombres
//   Escena 2  el antígeno explora    2200 – 6000   el libro barre el campo; los clones cercanos se iluminan
//   Escena 3  reconocimiento         6000 – 8200   se une a UN clon; los demás se desvanecen
//   Escena 4  expansión clonal       8200 – 11400  el clon se divide 1→2→4→8→16 y forma un anillo
export const DURACION = { e1: 2200, e2: 3800, e3: 2200, e4: 3200 };
const T2 = DURACION.e1, T3 = T2 + DURACION.e2, T4 = T3 + DURACION.e3, TFIN = T4 + DURACION.e4;
export const DURACION_TOTAL = TFIN;
export const FRASES = [
  "El repertorio: cada linfocito B porta un receptor único.",
  "El antígeno explora el repertorio…",
  "Reconocimiento: un solo clon porta el receptor complementario.",
  "Expansión clonal: el clon reconocido prolifera.",
];
const MAX_CLONES = 300;      // tope de células dibujadas (el sorteo usa a todos, aunque no quepan en pantalla)
const GENERACIONES = 4;      // 2^4 = 16 clones finales
const C = { petroleo: "#053043", cielo: "#25A9E0", celeste: "#A7F0F3", verde: "#45AC4D", blanco: "#ffffff" };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => t * t * (3 - 2 * t);
const cubica = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sprite de un linfocito B (cuerpo, núcleo y 4 receptores en Y) a 512 px; se reescala al dibujar. */
function sprite(colorCuerpo, colorReceptor) {
  const S = 512, c = S / 2, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  g.translate(c, c);
  g.strokeStyle = colorReceptor; g.lineWidth = 11; g.lineCap = "round"; g.lineJoin = "round";
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate((i * Math.PI) / 2 + Math.PI / 4);
    g.beginPath(); g.moveTo(0, -112); g.lineTo(0, -160); g.moveTo(0, -160); g.lineTo(-24, -192); g.moveTo(0, -160); g.lineTo(24, -192);
    g.stroke(); g.restore();
  }
  g.beginPath(); g.arc(0, 0, 116, 0, Math.PI * 2);
  g.fillStyle = colorCuerpo; g.fill(); g.lineWidth = 9; g.strokeStyle = C.petroleo; g.stroke();
  g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fillStyle = C.petroleo; g.fill();
  return cv;
}
const CUERPO = 116 / 256; // radio del cuerpo respecto a la mitad del sprite

export function crearEscena(canvas, { semilla = 1 } = {}) {
  const ctx = canvas.getContext("2d");
  const sprites = { celeste: sprite(C.celeste, C.celeste), verde: sprite(C.verde, C.verde) };
  let W = 0, H = 0, dpr = 1, n = 0, celdas = [], reducido = false;
  let anim = null;                       // { t0, g, revelado, resuelto, resolver }
  let alFase = () => {}, alRevelar = () => {}, faseActual = -1, raf = 0, ultimoFrame = 0;

  // ---------- distribución: rejilla con jitter, determinista para (n, tamaño, semilla)
  function distribuir() {
    const rnd = mulberry32(semilla);
    const total = Math.min(n, MAX_CLONES);
    const cols = Math.max(1, Math.ceil(Math.sqrt((total * W) / Math.max(H, 1))));
    const filas = Math.max(1, Math.ceil(total / cols));
    const m = 0.07, cw = (W * (1 - 2 * m)) / cols, ch = (H * (1 - 2 * m)) / filas;
    const huecos = Array.from({ length: cols * filas }, (_, i) => i);
    for (let i = huecos.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [huecos[i], huecos[j]] = [huecos[j], huecos[i]]; }
    const lado = Math.min(cw, ch);
    celdas = Array.from({ length: total }, (_, i) => {
      const h = huecos[i];
      return {
        bx: W * m + (h % cols + 0.5 + (rnd() - 0.5) * 0.35) * cw,
        by: H * m + (Math.floor(h / cols) + 0.5 + (rnd() - 0.5) * 0.35) * ch,
        fase: rnd() * 6.283, wx: 0.00035 + rnd() * 0.0004, wy: 0.0003 + rnd() * 0.0004,
        rot: rnd() * 6.283, vrot: (rnd() - 0.5) * 0.0004,
      };
    });
    celdas.radio = clamp(lado * 0.27, 7, 30);
    celdas.deriva = lado * 0.2;
  }

  function medir() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.setProperty("--anillo", `${anilloR()}px`);
    canvas.parentElement?.style.setProperty("--anillo", `${anilloR()}px`);
    canvas.parentElement?.style.setProperty("--cy", `${centro().y}px`);
    distribuir();
  }
  // El anillo cabe entre el borde superior y la franja inferior de frase + controles (RESERVA px).
  const reserva = () => (W < 640 ? 64 : 140);   // en pantallas estrechas los controles quedan fuera del lienzo
  const anilloR = () => Math.max(40, Math.min(W * 0.34, ((H - reserva()) / 2 - 10) / 1.16));
  const centro = () => ({ x: W / 2, y: (H - reserva()) / 2 + 12 });

  // ---------- posiciones
  function pos(i, t) {
    const c = celdas[i], d = reducido ? 0 : celdas.deriva;
    return { x: c.bx + d * Math.sin(t * c.wx + c.fase), y: c.by + d * Math.cos(t * c.wy + c.fase * 1.3) };
  }
  function dibujarCelda(sp, x, y, radio, rot, alpha) {
    if (alpha <= 0.003) return;
    const k = radio / (256 * CUERPO);
    ctx.globalAlpha = alpha;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    ctx.setTransform(dpr * k * cos, dpr * k * sin, -dpr * k * sin, dpr * k * cos, dpr * x, dpr * y);
    ctx.drawImage(sp, -256, -256);
  }
  function resplandor(x, y, radio, alpha, color = C.cielo) {
    if (alpha <= 0.01) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(x, y, radio * 0.3, x, y, radio);
    g.addColorStop(0, color + "AA"); g.addColorStop(1, color + "00");
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, radio, 0, 6.283); ctx.fill();
  }

  /** El libro (antígeno): tapa cielo, lomo oscuro y hojas blancas. */
  function dibujarLibro(x, y, escala, alpha, ang) {
    if (alpha <= 0.003) return;
    ctx.setTransform(dpr * escala * Math.cos(ang), dpr * escala * Math.sin(ang), -dpr * escala * Math.sin(ang), dpr * escala * Math.cos(ang), dpr * x, dpr * y);
    ctx.globalAlpha = alpha;
    const w = 46, h = 60;
    ctx.fillStyle = C.blanco; ctx.strokeStyle = C.petroleo; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 4, w, h, 4); ctx.fill(); ctx.stroke();       // hojas
    ctx.fillStyle = C.cielo;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.stroke();               // tapa
    ctx.fillStyle = C.petroleo; ctx.fillRect(-w / 2 + 1, -h / 2 + 1, 7, h - 2);                      // lomo
    ctx.fillStyle = C.blanco; ctx.fillRect(-w / 2 + 15, -h / 2 + 14, 20, 3); ctx.fillRect(-w / 2 + 15, -h / 2 + 22, 14, 3); // título
  }

  /** Spline de Catmull-Rom por puntos (px) con parámetro s∈[0,1]. */
  function camino(pts, s) {
    const seg = pts.length - 1, f = clamp(s) * seg, i = Math.min(seg - 1, Math.floor(f)), u = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(seg, i + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    return { x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) };
  }

  // ---------- anillo final de clones: el clon k, en el nivel s, ocupa la media de su grupo (continuidad al dividirse)
  function posClon(k, nivel) {
    const tam = 2 ** GENERACIONES, grupo = tam / 2 ** nivel, ini = Math.floor(k / grupo) * grupo;
    const { x, y } = centro(), R = anilloR();
    let sx = 0, sy = 0;
    for (let j = ini; j < ini + grupo; j++) { const a = (j / tam) * 6.283 - 1.5708; sx += Math.cos(a); sy += Math.sin(a); }
    return { x: x + (R * sx) / grupo, y: y + (R * sy) / grupo };
  }

  // ---------- fotograma
  function fotograma(ahora) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = reducido ? 0 : ahora;
    const ta = anim ? Math.min(ahora - anim.t0, TFIN) : 0;
    const escena = !anim ? 0 : ta < T2 ? 0 : ta < T3 ? 1 : ta < T4 ? 2 : 3;
    if (anim && escena !== faseActual) { faseActual = escena; alFase(FRASES[escena], escena); }

    const R = celdas.radio, gano = anim?.g ?? -1, ctr = centro(), ring = anilloR();
    const u3 = anim ? cubica(clamp((ta - T3) / DURACION.e3)) : 0;
    const u4 = anim ? clamp((ta - T4) / DURACION.e4) : 0;
    const rGrande = ring * 0.28, rFinal = ring * 0.152;
    const esc = Math.min(W, H) / 560 + 0.55;                     // escala del libro
    const acople = (r) => (r * 1.15 + 34 * esc) * 0.8;           // distancia (por eje) a la que el libro se une al clon

    // posición del clon reconocido (sigue flotando hasta que sube al centro)
    const pw = anim && celdas[gano] ? pos(gano, t) : null;
    const pwAhora = pw ? { x: lerp(pw.x, ctr.x, u3), y: lerp(pw.y, ctr.y, u3) } : null;

    // 1) el resto del repertorio (se desvanece y se aleja del centro al reconocer)
    let libro = null;
    if (anim && escena >= 1 && !reducido) {
      const s = suave(clamp((ta - T2) / DURACION.e2));
      const off = acople(R), meta = { x: pw.x + off, y: pw.y - off };
      const nodos = [{ x: W * 1.12, y: H * 0.2 }, { x: W * 0.82, y: H * 0.3 }, { x: W * 0.62, y: H * 0.74 },
        { x: W * 0.38, y: H * 0.26 }, { x: W * 0.2, y: H * 0.68 }, { x: W * 0.46, y: H * 0.5 }, meta];
      libro = escena === 1 ? camino(nodos, s) : null;
    }
    for (let i = 0; i < celdas.length; i++) {
      if (i === gano) continue;
      const p = pos(i, t);
      let alpha = 1, x = p.x, y = p.y;
      if (anim && escena >= 2) {
        const f = escena === 2 ? clamp(u3 * 1.7) : 1;
        alpha = lerp(1, escena === 3 ? lerp(0.07, 0.02, u4) : 0.07, f);
        const dx = x - ctr.x, dy = y - ctr.y, d = Math.hypot(dx, dy) || 1, u = escena === 2 ? u3 : 1;
        x += (dx / d) * u * Math.min(W, H) * 0.05; y += (dy / d) * u * Math.min(W, H) * 0.05;
      }
      if (libro) {                                    // los clones que el libro roza se iluminan (exploración)
        const prox = clamp(1 - Math.hypot(p.x - libro.x, p.y - libro.y) / (Math.min(W, H) * 0.17));
        if (prox > 0) resplandor(p.x, p.y, R * 2.6, prox * 0.85);
      }
      dibujarCelda(sprites.celeste, x, y, R, celdas[i].rot + (reducido ? 0 : celdas[i].vrot * t), alpha);
    }

    // 2) el clon reconocido
    if (anim && pwAhora && escena < 3) {
      const crece = escena === 2 ? u3 : 0, r = lerp(R, rGrande, crece);
      const verde = escena === 2 ? suave(crece) : 0;
      if (escena === 2) resplandor(pwAhora.x, pwAhora.y, r * (3 + Math.sin(ta / 90) * 0.2), 0.9, C.cielo);
      const rot = celdas[gano].rot + (reducido ? 0 : celdas[gano].vrot * t);
      dibujarCelda(sprites.celeste, pwAhora.x, pwAhora.y, r, rot, 1 - verde);
      dibujarCelda(sprites.verde, pwAhora.x, pwAhora.y, r, rot, verde);
    }

    // 3) el libro: explora (E2), se une al clon (E3) y se retira (E4)
    if (anim && !reducido) {
      if (escena === 1 && libro) dibujarLibro(libro.x, libro.y, esc, 1, Math.sin(ta / 380) * 0.18);
      if (escena === 2 && pwAhora) {
        const r = lerp(R, rGrande, u3), o = acople(r);
        dibujarLibro(pwAhora.x + o, pwAhora.y - o, esc, 1, -0.2 * suave(clamp(u3 * 3)));
        for (let k = 0; k < 2; k++) {                 // pulsos de reconocimiento (unión receptor–antígeno)
          const ph = clamp((ta - T3 - k * 420) / 900);
          if (ph > 0 && ph < 1) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1 - ph; ctx.strokeStyle = C.celeste; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(pwAhora.x, pwAhora.y, r * (1.3 + ph * 1.6), 0, 6.283); ctx.stroke(); }
        }
      }
      if (escena === 3 && u4 < 0.35) {
        const a = 1 - u4 / 0.35, o = acople(rGrande);
        dibujarLibro(ctr.x + o, ctr.y - o - u4 * 60, esc, a, -0.2);
      }
    }

    // 4) expansión clonal: 1→2→4→8→16 en verde y anillo final
    if (anim && escena === 3) {
      const tam = 2 ** GENERACIONES, etapa = Math.min(GENERACIONES - 1, Math.floor(u4 * GENERACIONES));
      const u = cubica(clamp(u4 * GENERACIONES - etapa)), done = u4 >= 1;
      const r = lerp(rGrande, rFinal, suave(clamp((etapa + u) / GENERACIONES)));
      const giro = done && !reducido ? (ahora - anim.t0 - TFIN) * 0.00006 : 0;
      for (let k = 0; k < tam; k++) {
        const a = posClon(k, etapa), b = posClon(k, done ? GENERACIONES : etapa + 1), uu = done ? 1 : u;
        let x = lerp(a.x, b.x, uu), y = lerp(a.y, b.y, uu);
        if (giro) { const dx = x - ctr.x, dy = y - ctr.y, c = Math.cos(giro), s = Math.sin(giro); x = ctr.x + dx * c - dy * s; y = ctr.y + dx * s + dy * c; }
        dibujarCelda(sprites.verde, x, y, done ? rFinal : r, celdas[gano]?.rot + k * 0.4 + (reducido ? 0 : giro * 3), 1);
      }
      if (!anim.revelado && u4 >= 0.45) { anim.revelado = true; alRevelar(); }
      if (done && !anim.resuelto) { anim.resuelto = true; anim.resolver(); }
    }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function bucle(ahora) {
    raf = requestAnimationFrame(bucle);
    ultimoFrame = ahora;
    if (!celdas.length && n === 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    fotograma(ahora);
  }

  const ro = new ResizeObserver(() => medir());
  ro.observe(canvas);
  medir();
  raf = requestAnimationFrame(bucle);

  return {
    /** Define cuántos linfocitos hay en el repertorio (uno por participante, con tope visual). */
    establecerClones(total) { n = total; anim = null; faseActual = -1; distribuir(); },
    /** Índice visual del clon ganador para un ganador entre `total` participantes. */
    indiceVisual(indice, total, alAzar) { return total <= MAX_CLONES ? indice : alAzar(Math.min(total, MAX_CLONES)); },
    get maxClones() { return MAX_CLONES; },
    alFase(f) { alFase = f; }, alRevelar(f) { alRevelar = f; },
    setReducido(v) { reducido = !!v; },
    /** Reproduce las 4 escenas y resuelve al terminar. Con `reducido`, un fundido breve sin movimiento. */
    reproducir(indice) {
      return new Promise((resolver) => {
        if (indice < 0 || indice >= celdas.length) return resolver();
        faseActual = -1;
        if (reducido) {
          anim = { t0: performance.now(), g: indice, revelado: false, resuelto: false, resolver: () => setTimeout(resolver, 700) };
          anim.t0 = performance.now() - TFIN; alRevelar(); anim.revelado = true;
          return;
        }
        anim = { t0: performance.now(), g: indice, revelado: false, resuelto: false, resolver };
      });
    },
    /** Vuelve al repertorio en reposo. */
    reiniciar() { anim = null; faseActual = -1; },
    destruir() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
