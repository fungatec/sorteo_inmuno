// Pantalla del sorteo: selección clonal. El libro es el antígeno; cada participante, un linfocito B.
// El ganador se elige y (si no es ensayo) se guarda ANTES de la animación: si no se pudo guardar,
// no se revela a nadie. Se muestra siempre el nombre OFICIAL (lista/{clave}), nunca el tecleado.
import { configPendiente } from "./firebase.js";
import { requerirAdmin, cerrarSesion } from "./auth.js";
import { leerColeccion, guardarSorteo } from "./datos.js";
import { enteroAleatorio } from "./azar.js";
import { $, h, aviso, avisoConfigPendiente } from "./ui.js";

const MAX_PUNTOS = 240;
const msg = $("#aviso"), campo = $("#campo"), fase = $("#fase"), expansion = $("#expansion"), boton = $("#sortear");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let participantes = [], oficiales = new Map(), sorteos = [], ocupado = false, revelado = false;

async function cargar() {
  try {
    const [p, l, s] = await Promise.all([leerColeccion("participantes"), leerColeccion("lista"), leerColeccion("sorteos")]);
    participantes = p; oficiales = new Map(l.map((x) => [x.id, x.nombre]));
    sorteos = s.sort((a, b) => a.ronda - b.ronda || (a.fecha?.seconds ?? 0) - (b.fecha?.seconds ?? 0));
    aviso(msg, "");
  } catch {
    aviso(msg, "No se pudieron leer los participantes. Revisa tu conexión y recarga la página.", "error");
    return;
  }
  preparar();
}

const nombreOficial = (p) => oficiales.get(p.id) ?? p.nombre;
const ganadoresPrevios = () => new Set(sorteos.map((s) => s.ganadorClave));
const elegibles = () => { const g = ganadoresPrevios(); return participantes.filter((p) => !g.has(p.id)); };

/** Deja la pantalla lista para una nueva ronda. */
function preparar() {
  revelado = false;
  const pool = elegibles();
  $("#ronda").textContent = `Ronda ${sorteos.length + 1}`;
  $("#contador").textContent = pool.length;
  $("#contador-texto").textContent = pool.length === 1 ? "clon en el repertorio" : "clones en el repertorio";
  const excl = participantes.length - pool.length;
  $("#excluidos").hidden = !excl;
  $("#excluidos").textContent = `${excl} ganador(es) de rondas anteriores excluido(s)`;
  $("#resultado").hidden = true; expansion.replaceChildren(); fase.textContent = "";
  campo.replaceChildren(...Array.from({ length: Math.min(pool.length, MAX_PUNTOS) }, () => h("span", { class: "clon" })));
  boton.textContent = "Liberar el antígeno"; boton.disabled = pool.length === 0;
  if (!pool.length) aviso(msg, "No hay clones elegibles. Revisa el panel: debe haber participantes inscritos.", "aviso");
  const previos = $("#lista-previos");
  previos.replaceChildren(...sorteos.map((s) => h("li", {}, `Ronda ${s.ronda}: ${oficiales.get(s.ganadorClave) ?? s.ganadorClave}`)));
  $("#previos").hidden = !sorteos.length;
}

boton.addEventListener("click", async () => {
  if (ocupado) return;
  if (revelado) { preparar(); return; } // "Otra ronda": solo reinicia la escena
  ocupado = true; boton.disabled = true; aviso(msg, "");
  const ensayo = $("#ensayo").checked;
  const pool = elegibles();
  const ganador = pool[enteroAleatorio(pool.length)];
  const ronda = sorteos.length + 1;

  if (!ensayo) {
    try {
      const id = await guardarSorteo({ totalParticipantes: pool.length, ganadorClave: ganador.id, ronda });
      sorteos.push({ id, ganadorClave: ganador.id, ronda });
    } catch {
      aviso(msg, "No se pudo guardar el sorteo, así que no se reveló a nadie. Revisa tu conexión e inténtalo de nuevo.", "error");
      ocupado = false; boton.disabled = false; return;
    }
  }
  await animar(pool.length <= MAX_PUNTOS ? pool.indexOf(ganador) : enteroAleatorio(campo.children.length));
  $("#ganador").textContent = nombreOficial(ganador);
  $("#etiqueta-ensayo").hidden = !ensayo;
  $("#resultado").hidden = false;
  fase.textContent = "Expansión clonal completada.";
  revelado = true; ocupado = false; boton.disabled = false;
  boton.textContent = "Otra ronda";
  if (!ensayo) { $("#ronda").textContent = `Ronda ${ronda} · guardada`; pintarPrevios(); }
});

function pintarPrevios() {
  $("#lista-previos").replaceChildren(...sorteos.map((s) => h("li", {}, `Ronda ${s.ronda}: ${oficiales.get(s.ganadorClave) ?? s.ganadorClave}`)));
  $("#previos").hidden = false;
}

/** Animación: acercamiento del antígeno → reconocimiento de un clon → proliferación clonal. */
async function animar(indiceGanador) {
  const puntos = [...campo.children];
  if (sinMovimiento() || !puntos.length) { puntos[indiceGanador]?.classList.add("ganador"); return; }

  fase.textContent = "El antígeno se acerca al repertorio…";
  await espera(1400);

  fase.textContent = "Reconocimiento: el antígeno busca el receptor complementario…";
  let previo = null, pausa = 70;
  for (let i = 0; i < 26; i++) {
    previo?.classList.remove("reconocido");
    previo = puntos[enteroAleatorio(puntos.length)];
    previo.classList.add("reconocido");
    await espera(pausa); pausa = Math.min(pausa * 1.12, 320);
  }
  previo?.classList.remove("reconocido");
  const elegido = puntos[indiceGanador];
  elegido.classList.add("reconocido");
  await espera(900);

  fase.textContent = "Activación: el clon reconocido prolifera.";
  puntos.forEach((p) => { if (p !== elegido) p.classList.add("apagado"); });
  elegido.classList.remove("reconocido"); elegido.classList.add("ganador");
  for (let i = 0; i < 14; i++) { expansion.append(h("i", {})); await espera(110); }
  await espera(600);
}

// ---- arranque (al final: usa todo lo anterior)
$("#salir").addEventListener("click", cerrarSesion);

if (configPendiente) {
  $("#contenido").hidden = false; avisoConfigPendiente($("#contenido"));
} else {
  await requerirAdmin();
  $("#contenido").hidden = false;
  await cargar();
}
