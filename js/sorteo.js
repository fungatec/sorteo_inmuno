// Pantalla del sorteo / modo proyección. Tres variantes de animación:
//  - por defecto («resumido», ≈ 18 s): tarjeta de 3 s («Una infección activó a una célula dendrítica…») y las escenas E4–E6
//    de la respuesta inmune (js/escena-inmune.js). El botón «Sortear con historia completa» lanza la ronda con E1–E6 (≈ 30 s);
//  - ?modo=completo: la historia completa E0–E6 como animación por defecto (con barra «minutos → horas → días» y elenco);
//  - ?modo=clasico (plan B del evento): la animación anterior de selección clonal, intacta (js/escena.js).
// Reglas de oro (ver CLAUDE.md), idénticas en ambos modos:
//  - el ganador sale de crypto.getRandomValues con muestreo por rechazo (js/azar.js), nunca Math.random;
//  - se elige y se GUARDA antes de animar: si no se pudo guardar, no se revela a nadie;
//  - en pantalla solo aparece el nombre OFICIAL (lista/{clave}.nombre), abreviado; nunca el tecleado;
//  - transmisión en vivo (Paso 6, ADITIVA): solo en sorteos reales y SOLO después de guardar la ronda se publica «animando»
//    (sin ganador) y, en el instante del revelado, «revelado» con la máscara. Es best-effort: nunca se espera, nunca
//    bloquea ni retrasa el guardado ni el revelado, y si falla solo se avisa. No se publica en el modo clásico.
import { configPendiente } from "./firebase.js";
import { requerirAdmin, cerrarSesion } from "./auth.js";
import { leerColeccion, guardarSorteo, publicarAnimando, publicarRevelado } from "./datos.js";
import { enteroAleatorio } from "./azar.js";
import { crearEscena, FRASES } from "./escena.js";
import { crearEscenaInmune } from "./escena-inmune.js";
import { TARJETA } from "./contenido-cientifico.js";
import { crearFicha } from "./ficha.js";
import { enmascararNombre, formatoTitulo } from "./sorteo-util.js";
import { mensajeErrorGuardado } from "./errores-guardado.js";
import { $, h, aviso, avisoConfigPendiente, copiarTexto } from "./ui.js";
import { urlTransmision } from "./en-vivo-util.js";

const msg = $("#aviso"), proyeccion = $("#proyeccion"), boton = $("#sortear"), btnNombre = $("#nombre-completo");
const btnPantalla = $("#pantalla-completa"), ensayoChk = $("#ensayo"), elencoChk = $("#elenco");

let participantes = [], oficiales = new Map(), sorteos = [], ocupado = false;
let actual = null;                       // { p, oficial, mascara, ensayo } del último ganador revelado
const ensayoGanadores = new Set();       // en ensayo se excluyen entre sí solo durante esta sesión de pantalla

// ---- modo de animación y textos de la interfaz (los del modo clásico son los de siempre)
const MODO = new URLSearchParams(location.search).get("modo");
const CLASICO = MODO === "clasico", COMPLETO = MODO === "completo";
proyeccion.classList.add(CLASICO ? "clasico" : "inmune", ...(CLASICO ? [] : [COMPLETO ? "completo" : "resumido"]));
const TXT = CLASICO
  ? { uno: "clon en el repertorio", varios: "clones en el repertorio", iniciar: "Liberar el antígeno", otra: "Volver a sortear",
      tarjeta: () => "El antígeno reconoció a", sinElegibles: "No quedan clones elegibles: todos los participantes ya fueron ganadores.", agotado: "Ya no quedan clones elegibles para otra ronda." }
  : { uno: "linfocito T en el ganglio", varios: "linfocitos T en el ganglio", iniciar: "Iniciar la respuesta inmune", otra: "Activar otro linfocito",
      tarjeta: (tipo) => TARJETA[tipo] ?? TARJETA.CD8, sinElegibles: "No quedan linfocitos elegibles: todos los participantes ya fueron ganadores.", agotado: "Ya no quedan linfocitos para activar otro." };
const btnHistoria = $("#historia-completa");
$("#etq-elenco").hidden = !COMPLETO;                       // el elenco (E0) solo existe en la historia completa
btnHistoria.hidden = CLASICO || COMPLETO;                  // en los otros dos modos no hay nada que ampliar
if (!CLASICO) $(".barra strong").textContent = "Respuesta inmune";
/** Habilita o bloquea los botones que inician una ronda. */
const fijarBoton = (deshabilitado) => { boton.disabled = deshabilitado; btnHistoria.disabled = deshabilitado; };

const escena = CLASICO ? crearEscena($("#lienzo"), { semilla: enteroAleatorio(2 ** 32) })
                       : crearEscenaInmune($("#lienzo"), {
                           semilla: enteroAleatorio(2 ** 32),
                           // Solo para pruebas locales (?tipo=CD4|CD8 en localhost): fuerza el tipo ilustrativo. Sin efecto en el sitio publicado.
                           forzarTipo: ["localhost", "127.0.0.1"].includes(location.hostname) ? new URLSearchParams(location.search).get("tipo") : null,
                         });
const movimientoReducido = matchMedia("(prefers-reduced-motion: reduce)");
escena.setReducido(movimientoReducido.matches);
movimientoReducido.addEventListener("change", (e) => escena.setReducido(e.matches));
escena.alFase((texto, clave) => { $("#fase").textContent = texto; proyeccion.classList.toggle("tarjeta-intro", clave === "INTRO"); });
escena.alRevelar((info) => {
  if (actual && info?.tipo) actual.tipo = info.tipo;
  mostrarResultado();
  // Mismo instante que el revelado del proyector. Solo la máscara (nunca la clave ni el nombre completo).
  if (actual?.transmitir) { const { ronda, modo, tipo, mascara: ganadorMascara } = actual; transmitir(() => publicarRevelado({ ronda, modo, tipo, ganadorMascara })); }
});

// ---- transmisión en vivo (best-effort): cola serie para que «revelado» nunca se adelante a «animando»
const estadoEnVivo = $("#envivo-estado");
let colaEnVivo = Promise.resolve();
function transmitir(escribir) {
  colaEnVivo = colaEnVivo.then(escribir).catch((err) => {
    console.error("[en vivo] no se pudo publicar:", err?.code ?? err?.name ?? "desconocido");     // solo el código
    estadoEnVivo.textContent = "Transmisión en vivo: no se pudo publicar esta ronda (el sorteo en pantalla no se vio afectado). Revisa que firestore.rules esté republicada.";
    estadoEnVivo.hidden = false;
  });
}
$("#copiar-enlace").addEventListener("click", async () => {
  const url = urlTransmision(location.href);
  aviso(msg, (await copiarTexto(url)) ? `Enlace de la transmisión copiado: ${url}` : `No se pudo copiar automáticamente. El enlace de la transmisión es: ${url}`, "exito");
});
// Barra de tiempo («minutos → horas → días»): solo en el modo inmune, mientras dura la animación.
const barra = $("#barra-tiempo");
escena.alProgreso?.((v) => { barra.style.setProperty("--avance", `${(v * 100).toFixed(1)}%`); });
const ficha = crearFicha({ raiz: proyeccion, bloquear: [proyeccion.querySelector(".caja"), $("#mandos")], alCambiar: (abierta) => proyeccion.classList.toggle("ficha-abierta", abierta) });
$("#btn-ficha").addEventListener("click", () => ficha.alternar());
let narrativaMostrada = false;           // la historia completa (E1–E6) se cuenta una vez; las rondas siguientes arrancan en E4

// ------------------------------------------------------------------ datos
const nombreOficial = (p) => oficiales.get(p.id) ?? p.nombre;
/** Nombre oficial para mostrar: la lista viene en MAYÚSCULAS; en pantalla va en formato título. */
const nombreVisible = (clave) => formatoTitulo(oficiales.get(clave) ?? participantes.find((p) => p.id === clave)?.nombre ?? clave);
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
  $("#contador-texto").textContent = pool.length === 1 ? TXT.uno : TXT.varios;
  barra.hidden = true; $("#tarjeta-tipo").textContent = TXT.tarjeta();
  $("#resultado").hidden = true; btnNombre.hidden = true; btnNombre.setAttribute("aria-pressed", "false");
  btnNombre.textContent = "Mostrar nombre completo";
  $("#fase").textContent = pool.length && CLASICO ? FRASES[0] : "";
  boton.textContent = sorteos.length || ensayoGanadores.size ? TXT.otra : TXT.iniciar;
  fijarBoton(pool.length === 0 || ocupado);
  if (!pool.length) aviso(msg, participantes.length ? TXT.sinElegibles : "No hay participantes inscritos. Revisa el panel.", "aviso");
  const previos = sorteos.map((s) => h("li", {}, `Ronda ${s.ronda}: ${nombreVisible(s.ganadorClave)}`));
  $("#lista-previos").replaceChildren(...previos); $("#previos").hidden = !previos.length;
}

function mostrarResultado() {
  if (!actual) return;
  $("#ganador").textContent = btnNombre.getAttribute("aria-pressed") === "true" ? actual.oficial : actual.mascara;
  $("#tarjeta-tipo").textContent = TXT.tarjeta(actual.tipo);
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

ensayoChk.addEventListener("change", () => { if (ocupado) { ensayoChk.checked = !ensayoChk.checked; return; } ensayoGanadores.clear(); narrativaMostrada = false; preparar(); });

// ------------------------------------------------------------------ sorteo
async function sortear({ completa = false } = {}) {   // completa: botón «Sortear con historia completa» (E1–E6) en el modo por defecto
  if (ocupado || boton.disabled) return;
  ocupado = true; fijarBoton(true); btnNombre.hidden = true; aviso(msg, "");
  btnNombre.setAttribute("aria-pressed", "false"); btnNombre.textContent = "Mostrar nombre completo";
  $("#resultado").hidden = true; escena.reiniciar();

  const ensayo = ensayoChk.checked, pool = elegibles();
  const larga = !CLASICO && (COMPLETO || completa);                  // historia completa: con barra de tiempo
  const desdeE4 = COMPLETO && (narrativaMostrada || sorteos.length > 0);   // modo completo: las rondas siguientes arrancan en E4
  if (!pool.length) { ocupado = false; preparar(); return; }
  const indice = enteroAleatorio(pool.length);       // ← la elección (crypto + muestreo por rechazo)
  const p = pool[indice], ronda = sorteos.length + 1;

  if (!ensayo) {                                     // guardar ANTES de revelar
    try {
      const id = await guardarSorteo({ totalParticipantes: pool.length, ganadorClave: p.id, ronda });
      sorteos.push({ id, ganadorClave: p.id, ronda });
    } catch (err) {
      const code = err?.code ?? err?.name ?? "desconocido";
      console.error("[sorteo] no se pudo guardar la ronda:", code);           // solo el código: sirve para diagnosticar
      aviso(msg, mensajeErrorGuardado(code, err?.message), "error");
      ocupado = false; preparar();
      leerColeccion("sorteos").then((s) => { sorteos = s.sort((a, b) => a.ronda - b.ronda); preparar(); }).catch(() => {}); // por si una escritura en vuelo llegó a aplicarse
      return;
    }
  } else ensayoGanadores.add(p.id);

  const oficial = nombreOficial(p);                        // tal como está en la lista (MAYÚSCULAS)
  actual = { p, oficial: formatoTitulo(oficial), mascara: enmascararNombre(oficial), ensayo };
  if (!oficiales.has(p.id)) aviso(msg, "El ganador no está en la lista oficial: se usó el nombre capturado en el alta manual.", "aviso");

  escena.establecerClones(pool.length);               // un clon por participante elegible de esta ronda
  $("#contador").textContent = pool.length;
  $("#ronda").textContent = ensayo ? "Ensayo" : `Ronda ${ronda}`;
  barra.hidden = !larga; if (larga) barra.style.setProperty("--avance", "0%");
  const iv = escena.indiceVisual(indice, pool.length, enteroAleatorio);
  actual.tipo = escena.tipoDe?.(iv);
  estadoEnVivo.hidden = true;
  // Transmisión: solo sorteos REALES (ya guardados arriba) y fuera del modo clásico. Sin await: no bloquea nada.
  if (!ensayo && !CLASICO) {
    actual.transmitir = true; actual.ronda = ronda; actual.modo = larga ? "completo" : "resumido";
    const { modo, tipo } = actual; transmitir(() => publicarAnimando({ ronda, modo, tipo }));
  }
  await escena.reproducir(iv, CLASICO ? undefined : { desdeE4, incluirE0: COMPLETO && elencoChk.checked, resumido: !larga });
  narrativaMostrada = true;

  ocupado = false;
  const quedan = elegibles().length;
  boton.textContent = TXT.otra; fijarBoton(quedan === 0);
  if (!quedan) aviso(msg, TXT.agotado, "aviso");
  mostrarResultado(); if (CLASICO) $("#fase").textContent = "Clon seleccionado.";
  if (!ensayo) $("#lista-previos").replaceChildren(...sorteos.map((s) => h("li", {}, `Ronda ${s.ronda}: ${nombreVisible(s.ganadorClave)}`)));
  $("#previos").hidden = !sorteos.length;
}
boton.addEventListener("click", () => sortear());
btnHistoria.addEventListener("click", () => sortear({ completa: true }));

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
  if (e.key === "i" || e.key === "I") { ficha.alternar(); return; }
  if (ficha.abierta) return;                                          // con la ficha abierta solo funcionan I y Esc
  // Espacio/Enter ya activan de forma nativa los botones, enlaces y resúmenes enfocados.
  if ((e.key === " " || e.key === "Enter") && !e.target.closest?.("button, summary, a")) { e.preventDefault(); sortear(); }   // los atajos no se muestran en pantalla, pero siguen activos
  else if (e.key === "f" || e.key === "F") alternarPantalla();
  else if ((e.key === "s" || e.key === "S") && !CLASICO) escena.saltar?.();
  else if (e.key === "c" || e.key === "C") proyeccion.classList.toggle("sin-subtitulos");
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
