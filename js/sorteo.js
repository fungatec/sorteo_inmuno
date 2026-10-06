// Pantalla del sorteo / modo proyección. Selección clonal: cada participante es un linfocito B,
// el libro es el antígeno. Reglas de oro (ver CLAUDE.md):
//  - el ganador sale de crypto.getRandomValues con muestreo por rechazo (js/azar.js), nunca Math.random;
//  - se elige y se GUARDA antes de animar: si no se pudo guardar, no se revela a nadie;
//  - en pantalla solo aparece el nombre OFICIAL (lista/{clave}.nombre), abreviado; nunca el tecleado.
import { configPendiente } from "./firebase.js";
import { requerirAdmin, cerrarSesion } from "./auth.js";
import { leerColeccion, guardarSorteo } from "./datos.js";
import { enteroAleatorio } from "./azar.js";
import { crearEscena, FRASES } from "./escena.js";
import { enmascararNombre } from "./sorteo-util.js";
import { $, h, aviso, avisoConfigPendiente } from "./ui.js";

const msg = $("#aviso"), proyeccion = $("#proyeccion"), boton = $("#sortear"), btnNombre = $("#nombre-completo");
const btnPantalla = $("#pantalla-completa"), ensayoChk = $("#ensayo");

let participantes = [], oficiales = new Map(), sorteos = [], ocupado = false;
let actual = null;                       // { p, oficial, mascara, ensayo } del último ganador revelado
const ensayoGanadores = new Set();       // en ensayo se excluyen entre sí solo durante esta sesión de pantalla

const escena = crearEscena($("#lienzo"), { semilla: enteroAleatorio(2 ** 32) });
const movimientoReducido = matchMedia("(prefers-reduced-motion: reduce)");
escena.setReducido(movimientoReducido.matches);
movimientoReducido.addEventListener("change", (e) => escena.setReducido(e.matches));
escena.alFase((texto) => { $("#fase").textContent = texto; });
escena.alRevelar(() => mostrarResultado());

// ------------------------------------------------------------------ datos
const nombreOficial = (p) => oficiales.get(p.id) ?? p.nombre;
const ganadoresPrevios = () => new Set(sorteos.map((s) => s.ganadorClave));
function elegibles() {
  const g = ganadoresPrevios();
  return participantes.filter((p) => !g.has(p.id) && !(ensayoChk.checked && ensayoGanadores.has(p.id)));
}

async function cargar() {
  try {
    const [p, l, s] = await Promise.all([leerColeccion("participantes"), leerColeccion("lista"), leerColeccion("sorteos")]);
    participantes = p; oficiales = new Map(l.map((x) => [x.id, x.nombre]));
    sorteos = s.sort((a, b) => a.ronda - b.ronda);
    aviso(msg, "");
  } catch {
    aviso(msg, "No se pudieron leer los participantes. Revisa tu conexión y recarga la página.", "error");
    return;
  }
  preparar();
}

// ------------------------------------------------------------------ estado de la pantalla
/** Deja la escena en reposo (Escena 1) con un clon por participante elegible. */
function preparar() {
  actual = null;
  const pool = elegibles();
  escena.establecerClones(pool.length);
  $("#ronda").textContent = ensayoChk.checked ? "Ensayo" : `Ronda ${sorteos.length + 1}`;
  $("#contador").textContent = pool.length;
  $("#contador-texto").textContent = pool.length === 1 ? "clon en el repertorio" : "clones en el repertorio";
  $("#resultado").hidden = true; btnNombre.hidden = true; btnNombre.setAttribute("aria-pressed", "false");
  btnNombre.textContent = "Mostrar nombre completo";
  $("#fase").textContent = pool.length ? FRASES[0] : "";
  boton.textContent = sorteos.length || ensayoGanadores.size ? "Volver a sortear" : "Liberar el antígeno";
  boton.disabled = pool.length === 0 || ocupado;
  if (!pool.length) aviso(msg, participantes.length
    ? "No quedan clones elegibles: todos los participantes ya fueron ganadores." : "No hay participantes inscritos. Revisa el panel.", "aviso");
  const previos = sorteos.map((s) => h("li", {}, `Ronda ${s.ronda}: ${oficiales.get(s.ganadorClave) ?? s.ganadorClave}`));
  $("#lista-previos").replaceChildren(...previos); $("#previos").hidden = !previos.length;
}

function mostrarResultado() {
  if (!actual) return;
  $("#ganador").textContent = actual.mascara;
  $("#etiqueta-ensayo").hidden = !actual.ensayo;
  $("#resultado").hidden = false; btnNombre.hidden = false;
}

btnNombre.addEventListener("click", () => {
  if (!actual) return;
  const completo = btnNombre.getAttribute("aria-pressed") !== "true";
  btnNombre.setAttribute("aria-pressed", String(completo));
  btnNombre.textContent = completo ? "Ocultar nombre completo" : "Mostrar nombre completo";
  $("#ganador").textContent = completo ? actual.oficial : actual.mascara;
});

ensayoChk.addEventListener("change", () => { if (ocupado) { ensayoChk.checked = !ensayoChk.checked; return; } ensayoGanadores.clear(); preparar(); });

// ------------------------------------------------------------------ sorteo
async function sortear() {
  if (ocupado || boton.disabled) return;
  ocupado = true; boton.disabled = true; btnNombre.hidden = true; aviso(msg, "");
  $("#resultado").hidden = true; escena.reiniciar();

  const ensayo = ensayoChk.checked, pool = elegibles();
  if (!pool.length) { ocupado = false; preparar(); return; }
  const indice = enteroAleatorio(pool.length);       // ← la elección (crypto + muestreo por rechazo)
  const p = pool[indice], ronda = sorteos.length + 1;

  if (!ensayo) {                                     // guardar ANTES de revelar
    try {
      const id = await guardarSorteo({ totalParticipantes: pool.length, ganadorClave: p.id, ronda });
      sorteos.push({ id, ganadorClave: p.id, ronda });
    } catch {
      aviso(msg, "No se pudo guardar el sorteo, así que no se reveló a nadie. Revisa tu conexión e inténtalo de nuevo.", "error");
      ocupado = false; preparar(); return;
    }
  } else ensayoGanadores.add(p.id);

  const oficial = nombreOficial(p);
  actual = { p, oficial, mascara: enmascararNombre(oficial), ensayo };
  if (!oficiales.has(p.id)) aviso(msg, "El ganador no está en la lista oficial: se usó el nombre capturado en el alta manual.", "aviso");

  escena.establecerClones(pool.length);               // un clon por participante elegible de esta ronda
  $("#contador").textContent = pool.length;
  $("#ronda").textContent = ensayo ? "Ensayo" : `Ronda ${ronda}`;
  await escena.reproducir(escena.indiceVisual(indice, pool.length, enteroAleatorio));

  ocupado = false;
  const quedan = elegibles().length;
  boton.textContent = "Volver a sortear"; boton.disabled = quedan === 0;
  if (!quedan) aviso(msg, "Ya no quedan clones elegibles para otra ronda.", "aviso");
  mostrarResultado(); $("#fase").textContent = "Clon seleccionado.";
  if (!ensayo) $("#lista-previos").replaceChildren(...sorteos.map((s) => h("li", {}, `Ronda ${s.ronda}: ${oficiales.get(s.ganadorClave) ?? s.ganadorClave}`)));
  $("#previos").hidden = !sorteos.length;
}
boton.addEventListener("click", sortear);

// ------------------------------------------------------------------ pantalla completa y atajos
const puedePantalla = !!proyeccion.requestFullscreen;
btnPantalla.hidden = !puedePantalla;
const alternarPantalla = () => {
  if (!puedePantalla) return;
  if (document.fullscreenElement) document.exitFullscreen(); else proyeccion.requestFullscreen().catch(() => {});
};
btnPantalla.addEventListener("click", alternarPantalla);

let temporizador = 0;
function despertar() {
  proyeccion.classList.remove("inactivo");
  clearTimeout(temporizador);
  if (document.fullscreenElement) temporizador = setTimeout(() => proyeccion.classList.add("inactivo"), 3000);
}
["mousemove", "pointerdown", "touchstart", "keydown"].forEach((ev) => document.addEventListener(ev, despertar, { passive: true }));
document.addEventListener("fullscreenchange", () => {
  btnPantalla.textContent = document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa";
  despertar();
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select")) return;
  // Espacio/Enter ya activan de forma nativa los botones, enlaces y resúmenes enfocados.
  if ((e.key === " " || e.key === "Enter") && !e.target.closest?.("button, summary, a")) { e.preventDefault(); sortear(); }
  else if (e.key === "f" || e.key === "F") alternarPantalla();
  else if ((e.key === "n" || e.key === "N") && !btnNombre.hidden) btnNombre.click();
});

// ---------------------------------------------------------------- arranque (al final: usa todo lo anterior)
$("#salir").addEventListener("click", cerrarSesion);
if (configPendiente) {
  $("#contenido").hidden = false; avisoConfigPendiente($("#contenido"));
} else {
  await requerirAdmin();
  $("#contenido").hidden = false;
  await cargar();
}
