// Animación ligera para el espectador (en-vivo.html): un ganglio con linfocitos T virgenes que patrullan, una célula
// dendrítica que llega y recorre, y al final un pequeño grupo ANÓNIMO de linfocitos activados que se multiplica.
// Es una ilustración: no representa ni identifica a ningún participante (el espectador nunca recibe al ganador antes del
// revelado). Canvas 2D vectorial con js/celulas.js; el azar visual sale de un PRNG sembrado con crypto (nunca Math.random).
import { linfocito, celulaDendritica, mulberry32, clamp, lerp, suave, UM } from "./celulas.js";

const W = 800, H = 600, N = 26;

export function crearEscenaEspectador(canvas) {
  const ctx = canvas.getContext("2d");
  const semilla = crypto.getRandomValues(new Uint32Array(1))[0];
  const az = mulberry32(semilla);
  const T = Array.from({ length: N }, () => ({ x: 70 + az() * (W - 140), y: 90 + az() * (H - 180), ax: 8 + az() * 22, ay: 8 + az() * 22, w: 0.0004 + az() * 0.0007, f: az() * 6.28 }));
  const grupo = { x: 150 + az() * 120, y: 200 + az() * 200 };            // posición ilustrativa del grupo activado (arbitraria)
  let modo = "espera", t0 = 0, total = 1, reducido = false, raf = 0, dpr = 1, K = 1, OX = 0, OY = 0, visible = true;

  function medir() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    K = Math.min(r.width / W, r.height / H); OX = (r.width - W * K) / 2; OY = (r.height - H * K) / 2;
  }
  const pos = (c, reloj) => reducido ? [c.x, c.y] : [c.x + Math.cos(reloj * c.w + c.f) * c.ax, c.y + Math.sin(reloj * c.w * 1.3 + c.f) * c.ay];

  function fondo() {
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, "#0d4f6b"); g.addColorStop(1, "#053043");
    ctx.fillStyle = g; ctx.fillRect(-OX / K, -OY / K, W + 2 * OX / K, H + 2 * OY / K);
  }

  function dibujar(ahora) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * K, 0, 0, dpr * K, dpr * OX, dpr * OY);
    fondo();
    const reloj = reducido ? 0 : ahora;
    if (modo === "espera") {                       // un linfocito grande que flota
      const y = H / 2 + (reducido ? 0 : Math.sin(ahora / 900) * 14), x = W / 2 + (reducido ? 0 : Math.cos(ahora / 1300) * 10);
      ctx.globalAlpha = 0.35;
      T.slice(0, 8).forEach((c, i) => { const [px, py] = pos(c, reloj); linfocito(ctx, px, py, 8 + (i % 3) * 2); });
      ctx.globalAlpha = 1; linfocito(ctx, x, y, 46, { brillo: 0.5 }); return;
    }
    // «en curso» / «interrumpido»: ganglio en calma, sin célula dendrítica
    const p = modo === "animando" ? clamp((ahora - t0) / total) : 0;
    for (const c of T) { const [px, py] = pos(c, reloj); linfocito(ctx, px, py, 4.5 * UM); }
    if (modo !== "animando") return;
    // célula dendrítica: entra por la derecha (0–20 %), recorre (20–65 %) y se queda junto al grupo
    const dc = p < 0.2 ? [lerp(W + 60, W * 0.68, suave(p / 0.2)), H * 0.45]
      : p < 0.65 ? [lerp(W * 0.68, W * 0.38, suave((p - 0.2) / 0.45)) + (reducido ? 0 : Math.sin(ahora / 700) * 30), H * 0.45 + (reducido ? 0 : Math.cos(ahora / 900) * 60)]
      : [grupo.x + 90, grupo.y - 10];
    celulaDendritica(ctx, dc[0], dc[1], 9 * UM, { t: reloj, madurez: clamp(p / 0.5) });
    // grupo anónimo de linfocitos activados (1 → 2 → 4 → 8) a partir del 65 %
    if (p > 0.65) {
      const k = Math.min(8, 2 ** Math.floor((p - 0.65) / 0.35 * 4));
      for (let i = 0; i < k; i++) { const a = i * 2.4, r = i ? 22 + i * 3 : 0; linfocito(ctx, grupo.x + Math.cos(a) * r, grupo.y + Math.sin(a) * r, 4.5 * UM, { activado: true, brillo: 0.3 }); }
    }
  }
  function bucle(ahora) { raf = requestAnimationFrame(bucle); dibujar(ahora); }
  const ro = new ResizeObserver(() => medir()); ro.observe(canvas); medir();
  const arrancar = () => { if (!raf && visible) raf = requestAnimationFrame(bucle); };
  const parar = () => { cancelAnimationFrame(raf); raf = 0; };
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) arrancar(); else parar(); });
  arrancar();

  return {
    setReducido(v) { reducido = !!v; },
    /** modo: "espera" | "calma" (sin animación de sorteo) | "animando" (con la duración total del guion en ms). */
    fijar(nuevo, { duracion = 18000 } = {}) { modo = nuevo === "calma" ? "calma" : nuevo; t0 = performance.now(); total = duracion; },
    destruir() { parar(); ro.disconnect(); },
  };
}
