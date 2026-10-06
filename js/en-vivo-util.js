// Lógica pura de la transmisión en vivo (en-vivo.html), sin DOM ni Firebase: se prueba en Node.
// El documento público es publico/sorteo (ver firestore.rules). NUNCA contiene la clave ni el nombre completo del ganador;
// la máscara solo aparece en estado "revelado".
import { SUBTITULOS, TARJETA } from "./contenido-cientifico.js";

export const UMBRAL_INTERRUMPIDO_MS = 90000;   // «animando» sin revelado durante 90 s → «El sorteo se interrumpió…»
export const UMBRAL_TARDE_MS = 4000;           // quien abre la página con la animación ya empezada ve «El sorteo está en curso…»
export const MAX_MASCARA = 60;                 // igual que las reglas

export const TEXTOS = {
  espera: "Esperando el sorteo…",
  enCurso: "El sorteo está en curso…",
  interrumpido: "El sorteo se interrumpió; espera la siguiente ronda.",
  sinConexion: "Sin conexión. Reintentando…",
  reconectando: "Reconectando…",
  noDisponible: "La transmisión aún no está disponible. Reintentando…",
};

/** URL pública de la transmisión a partir de la URL de cualquier página del sitio (sin query ni hash). */
export function urlTransmision(href) {
  const u = new URL("en-vivo.html", href);
  u.search = ""; u.hash = "";
  return u.href;
}

/**
 * Guion de subtítulos que ve el espectador: los mismos textos y duraciones de la proyección (js/contenido-cientifico.js).
 * modo "resumido": tarjeta 3 s + E4 4 s + E5 4 s + E6 7 s · modo "completo": E1–E6 (E6: 37 % «prolifera», luego el tipo ilustrativo).
 */
export function guion(modo, tipo) {
  const final = tipo === "CD4" ? "E6_CD4" : "E6_CD8";
  const pasos = modo === "completo"
    ? [["E1", 5000], ["E2", 5000], ["E3", 4000], ["E4", 5000], ["E5", 5000], ["E6_PROLIF", 2590], [final, 4410]]
    : [["INTRO", 3000], ["E4_S", 4000], ["E5_S", 4000], ["E6_S", 7000]];
  let ini = 0;
  return pasos.map(([clave, dur]) => { const p = { clave, texto: SUBTITULOS[clave], ini, dur }; ini += dur; return p; });
}
export const duracionGuion = (g) => g.reduce((s, p) => s + p.dur, 0);

/** Paso del guion vigente a los `ms` ms (el último se mantiene al terminar). */
export function pasoEn(g, ms) {
  for (let i = g.length - 1; i >= 0; i--) if (ms >= g[i].ini) return { indice: i, paso: g[i] };
  return { indice: 0, paso: g[0] };
}

/**
 * Convierte el documento (o su ausencia) en la vista que se pinta. Defensivo: cualquier cosa rara → «espera».
 * `inicioMs`: milisegundos del `inicio` (Timestamp) si se pudo leer.
 */
export function vistaDe(data) {
  const e = data?.estado;
  if (e !== "animando" && e !== "revelado") return { estado: "espera" };
  const ronda = Number.isInteger(data.ronda) && data.ronda >= 1 ? data.ronda : 1;
  const modo = data.modo === "completo" ? "completo" : "resumido";
  const tipo = data.tipo === "CD4" ? "CD4" : "CD8";
  const inicioMs = typeof data.inicio?.toMillis === "function" ? data.inicio.toMillis() : null;
  if (e === "animando") return { estado: "animando", ronda, modo, tipo, inicioMs };
  const m = typeof data.ganadorMascara === "string" ? data.ganadorMascara.slice(0, MAX_MASCARA) : "";
  if (!m) return { estado: "espera" };      // un «revelado» sin máscara no se muestra
  return { estado: "revelado", ronda, modo, tipo, inicioMs, ganadorMascara: m, tarjeta: TARJETA[tipo] };
}

/** ¿Se abrió la página con la animación ya empezada? (solo se evalúa en el primer snapshot). */
export const llegoTarde = (inicioMs, ahoraMs) => inicioMs != null && ahoraMs - inicioMs > UMBRAL_TARDE_MS;
export const estaInterrumpido = (inicioMs, ahoraMs) => inicioMs != null && ahoraMs - inicioMs > UMBRAL_INTERRUMPIDO_MS;
