// Panel de admin: estado del registro, lista de la clase, participantes y alta manual.
import { configPendiente } from "./firebase.js";
import { requerirAdmin, cerrarSesion } from "./auth.js";
import {
  leerRegistroAbierto, fijarRegistroAbierto, leerColeccion, guardarLista, borrarDeLista,
  crearParticipante, borrarParticipante, ErrorValidacion,
} from "./datos.js";
import { analizarLista, claveDeNombre, compararConOficial } from "./normalizar.js";
import { $, h, aviso, avisoConfigPendiente, fechaCorta } from "./ui.js";

const msg = $("#aviso");
let lista = [], participantes = [], registroAbierto = null, vistaPrevia = null;

async function recargar() {
  try {
    [lista, participantes, registroAbierto] = await Promise.all([
      leerColeccion("lista"), leerColeccion("participantes"), leerRegistroAbierto(),
    ]);
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    participantes.sort((a, b) => nombreMostrado(a).localeCompare(nombreMostrado(b), "es"));
    aviso(msg, "");
  } catch {
    aviso(msg, "No se pudieron leer los datos. Revisa tu conexión y recarga la página.", "error");
  }
  pintar();
}

// ------------------------------------------------------------------ datos derivados
const oficial = (clave) => lista.find((l) => l.id === clave)?.nombre;
const nombreMostrado = (p) => oficial(p.id) ?? p.nombre;
const estadoNombre = (p) => compararConOficial(p.nombre, oficial(p.id), p.id);
const hayAdvertencia = (p) => ["difiere", "no-corresponde"].includes(estadoNombre(p));

function pintar() {
  pintarEstado(); pintarResumen(); pintarParticipantes(); pintarLista();
}

function pintarEstado() {
  $("#punto").className = "punto " + (registroAbierto === true ? "abierto" : registroAbierto === false ? "cerrado" : "");
  $("#estado-texto").textContent = registroAbierto === true ? "Registro abierto"
    : registroAbierto === false ? "Registro cerrado" : "Estado no disponible (¿existe config/estado?)";
  const b = $("#alternar");
  b.textContent = registroAbierto === true ? "Cerrar el registro" : "Abrir el registro";
  b.className = registroAbierto === true ? "secundario" : "exito";
  b.style.color = "var(--petroleo)";
}

function pintarResumen() {
  const inscritosDeLista = participantes.filter((p) => oficial(p.id)).length;
  $("#n-lista").textContent = lista.length;
  $("#n-registrados").textContent = participantes.length;
  $("#n-pendientes").textContent = lista.length - inscritosDeLista;
  $("#n-alertas").textContent = participantes.filter(hayAdvertencia).length;
}

// ------------------------------------------------------------------ registro abierto/cerrado
$("#alternar").addEventListener("click", async () => {
  const objetivo = registroAbierto !== true;
  if (!objetivo && !confirm("¿Cerrar el registro? Nadie más podrá inscribirse.")) return;
  $("#alternar").disabled = true;
  try { await fijarRegistroAbierto(objetivo); registroAbierto = objetivo; aviso(msg, ""); }
  catch { aviso(msg, "No se pudo cambiar el estado del registro.", "error"); }
  $("#alternar").disabled = false; pintarEstado();
});

// ------------------------------------------------------------------ pestañas
const tabs = ["participantes", "lista", "alta"];
for (const t of tabs) $(`#tab-b-${t}`).addEventListener("click", () => {
  for (const u of tabs) {
    $(`#tab-b-${u}`).setAttribute("aria-selected", String(u === t));
    $(`#tab-${u}`).hidden = u !== t;
  }
});

// ------------------------------------------------------------------ participantes
$("#solo-alertas").addEventListener("change", pintarParticipantes);

function pintarParticipantes() {
  const cont = $("#participantes");
  const solo = $("#solo-alertas").checked;
  const filas = participantes.filter((p) => !solo || hayAdvertencia(p));
  cont.replaceChildren(...(filas.length ? filas.map(filaParticipante)
    : [h("p", { class: "suave" }, solo ? "Ningún participante tiene advertencias." : "Todavía no hay participantes inscritos.")]));
}

function filaParticipante(p) {
  const estado = estadoNombre(p);
  const nodos = [
    h("div", { class: "nombre" }, nombreMostrado(p),
      p.origen === "admin" ? h("span", { class: "insignia" }, "alta manual") : null,
      estado === "sin-oficial" ? h("span", { class: "insignia alerta" }, "fuera de la lista") : null,
      estado === "difiere" ? h("span", { class: "insignia alerta" }, "escrito distinto") : null,
      estado === "no-corresponde" ? h("span", { class: "insignia fuerte" }, "no corresponde") : null),
    h("div", { class: "meta" }, `${p.correo} · ${fechaCorta(p.creadoEn)}`),
    h("div", { class: "accion" }, h("button", { type: "button", class: "peligro", onclick: () => eliminar(p) }, "Eliminar")),
  ];
  if (estado === "difiere") nodos.splice(2, 0, h("div", { class: "advertencia" }, `⚠ Tecleó: «${p.nombre}» (difiere del nombre oficial).`));
  if (estado === "no-corresponde") nodos.splice(2, 0, h("div", { class: "advertencia fuerte" }, `⚠ Tecleó: «${p.nombre}», que NO corresponde a este registro. Revisa y elimina si es una suplantación.`));
  if (estado === "sin-oficial") nodos.splice(2, 0, h("div", { class: "advertencia" }, "⚠ Esta clave no está en la lista de la clase; se muestra el nombre tecleado."));
  return h("div", { class: "fila" }, nodos);
}

async function eliminar(p) {
  if (!confirm(`¿Eliminar a ${nombreMostrado(p)}? Podrá volver a registrarse.`)) return;
  try { await borrarParticipante({ clave: p.id, correo: p.correo }); aviso(msg, `Eliminado: ${nombreMostrado(p)}.`, "exito"); }
  catch { aviso(msg, "No se pudo eliminar al participante.", "error"); }
  await recargar();
}

// ------------------------------------------------------------------ lista de la clase
$("#archivo").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (f) { $("#texto-lista").value = await f.text(); revisarLista(); }
});
$("#analizar").addEventListener("click", revisarLista);

function revisarLista() {
  vistaPrevia = analizarLista($("#texto-lista").value);
  const r = vistaPrevia, cont = $("#vista-previa");
  const bloques = [h("p", {}, h("b", {}, `${r.validos.length} nombres listos para guardar.`),
    r.repetidos ? ` ${r.repetidos} línea(s) repetida(s) se ignoran.` : "")];
  if (r.colisiones.length) bloques.push(
    h("div", { class: "aviso aviso-aviso" }, h("b", {}, `${r.colisiones.length} colisión(es) NO se guardarán`),
      " (nombres distintos con la misma clave; distínguelos o resuélvelos con alta manual):",
      h("ul", {}, r.colisiones.map((c) => h("li", {}, c.nombres.join("  ↔  "))))));
  if (r.rechazados.length) bloques.push(
    h("div", { class: "aviso aviso-error" }, h("b", {}, `${r.rechazados.length} línea(s) rechazada(s):`),
      h("ul", {}, r.rechazados.map((x) => h("li", {}, `línea ${x.linea}: «${x.texto}» — ${x.motivo}`)))));
  const yaEstan = r.validos.filter((v) => oficial(v.clave)).length;
  if (yaEstan) bloques.push(h("p", { class: "suave" }, `${yaEstan} ya existen en la lista y se actualizarán.`));
  bloques.push(h("button", { type: "button", id: "guardar-lista", disabled: !r.validos.length, onclick: confirmarLista },
    `Guardar ${r.validos.length} nombres`));
  cont.replaceChildren(...bloques); cont.hidden = false;
}

async function confirmarLista() {
  if (!vistaPrevia?.validos.length) return;
  const btn = $("#guardar-lista"); btn.disabled = true; btn.textContent = "Guardando…";
  try {
    await guardarLista(vistaPrevia.validos);
    aviso(msg, `Lista guardada: ${vistaPrevia.validos.length} nombres.`, "exito");
    $("#texto-lista").value = ""; $("#archivo").value = ""; $("#vista-previa").hidden = true; vistaPrevia = null;
  } catch { aviso(msg, "No se pudo guardar la lista. Revisa tu conexión e inténtalo de nuevo.", "error"); }
  await recargar();
}

function pintarLista() {
  const inscritos = new Set(participantes.map((p) => p.id));
  const cont = $("#lista-actual");
  cont.replaceChildren(...(lista.length ? lista.map((l) => h("div", { class: "fila" },
    h("div", { class: "nombre" }, l.nombre,
      inscritos.has(l.id) ? h("span", { class: "insignia ok" }, "inscrito") : h("span", { class: "insignia" }, "pendiente")),
    h("div", { class: "accion" }, h("button", { type: "button", class: "peligro", onclick: () => quitarDeLista(l) }, "Quitar"))))
    : [h("p", { class: "suave" }, "La lista está vacía. Cárgala antes de abrir el registro.")]));
}

async function quitarDeLista(l) {
  if (!confirm(`¿Quitar a ${l.nombre} de la lista? Si ya está inscrito, su inscripción no se borra.`)) return;
  try { await borrarDeLista(l.id); } catch { aviso(msg, "No se pudo quitar de la lista.", "error"); }
  await recargar();
}

// ------------------------------------------------------------------ alta manual
$("#form-alta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#alta-nombre"), correo = $("#alta-correo"), btn = $("#alta-enviar");
  aviso(msg, "");
  const clave = claveDeNombre(nombre.value);
  if (clave && participantes.some((p) => p.id === clave)) { aviso(msg, "Esa persona ya está inscrita (misma clave de nombre).", "error"); return; }
  if (participantes.some((p) => p.correo === correo.value.trim().toLowerCase())) { aviso(msg, "Ese correo ya está en uso.", "error"); return; }
  btn.disabled = true;
  try {
    const r = await crearParticipante({ nombre: nombre.value, correo: correo.value, origen: "admin" });
    aviso(msg, `Agregado: ${r.nombre}${oficial(r.clave) ? "" : " (no está en la lista de la clase)"}.`, "exito");
    nombre.value = ""; correo.value = "";
    await recargar();
  } catch (err) {
    aviso(msg, err instanceof ErrorValidacion ? err.message : "No se pudo agregar al participante.", "error");
  }
  btn.disabled = false;
});

// ---------------------------------------------------------------- arranque (al final: usa todo lo anterior)
$("#salir").addEventListener("click", cerrarSesion);
if (configPendiente) {
  $("#contenido").hidden = false; avisoConfigPendiente($("#contenido"));
} else {
  await requerirAdmin();
  $("#contenido").hidden = false;
  await recargar();
}
