// Panel de admin: estado del registro, participantes, lista de la clase, alta manual y vaciado final.
import { configPendiente } from "./firebase.js";
import { requerirAdmin, cerrarSesion } from "./auth.js";
import {
  leerRegistroAbierto, fijarRegistroAbierto, leerColeccion, guardarLista, borrarDeLista,
  crearParticipante, borrarParticipante, vaciarDatos, ErrorValidacion,
} from "./datos.js";
import {
  analizarLista, claveDeNombre, compararConOficial, mensajeErrorNombre, mensajeErrorCorreo, normalizarCorreo,
} from "./normalizar.js";
import { textoRegistroSorteo, nombreArchivoRegistro, enmascararNombre } from "./sorteo-util.js";
import { $, h, aviso, avisoConfigPendiente, fechaCorta, validarEnVivo, copiarTexto, marcarCopiado, descargarArchivo } from "./ui.js";
import { urlTransmision } from "./en-vivo-util.js";
import { urlRegistro } from "./enlaces.js";
import { dibujarQR } from "./qr.js";

const msg = $("#aviso");
let lista = [], participantes = [], registroAbierto = null, vistaPrevia = null;
let sorteosN = null, vaciado = false, cargado = false;   // sorteosN: rondas guardadas (null = no se pudo leer)

// ------------------------------------------------------------------ datos derivados
const oficial = (clave) => lista.find((l) => l.id === clave)?.nombre;
const nombreMostrado = (p) => oficial(p.id) ?? p.nombre;
const estadoNombre = (p) => compararConOficial(p.nombre, oficial(p.id), p.id);
const hayAdvertencia = (p) => ["difiere", "no-corresponde"].includes(estadoNombre(p));
/** Minúsculas y sin acentos, para que la búsqueda no distinga "Gómez" de "gomez". */
const plano = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function recargar() {
  try {
    [lista, participantes, registroAbierto] = await Promise.all([
      leerColeccion("lista"), leerColeccion("participantes"), leerRegistroAbierto(),
    ]);
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    participantes.sort((a, b) => nombreMostrado(a).localeCompare(nombreMostrado(b), "es"));
    sorteosN = await leerColeccion("sorteos").then((x) => x.length).catch(() => null);
    cargado = true;
  } catch {
    aviso(msg, "No se pudieron leer los datos. Revisa tu conexión y recarga la página.", "error");
  }
  pintar();
}

function pintar() { pintarEstado(); pintarResumen(); pintarGuia(); pintarParticipantes(); pintarLista(); }

// ------------------------------------------------------------------ registro abierto/cerrado
function pintarEstado() {
  const b = $("#alternar");
  b.disabled = registroAbierto === null;
  b.setAttribute("aria-checked", String(registroAbierto === true));
  $("#etq-alternar").textContent = registroAbierto === true ? "Registro abierto"
    : registroAbierto === false ? "Registro cerrado" : "Estado no disponible (¿existe config/estado?)";
  const cab = $("#estado-cabecera");
  cab.textContent = registroAbierto === true ? "ABIERTO" : registroAbierto === false ? "CERRADO" : "NO DISPONIBLE";
  cab.dataset.estado = registroAbierto === true ? "abierto" : registroAbierto === false ? "cerrado" : "desconocido";
}

// ------------------------------------------------------------------ enlaces (copiar con confirmación «Copiado») y códigos QR
async function copiarEnlace(boton, url, que) {
  if (await copiarTexto(url)) { marcarCopiado(boton); aviso(msg, `Enlace ${que} copiado: ${url}`, "exito"); }
  else aviso(msg, `No se pudo copiar automáticamente. El enlace ${que} es: ${url}`, "aviso");
}
$("#copiar-registro").addEventListener("click", (e) => copiarEnlace(e.currentTarget, urlRegistro(location.href), "de registro"));
$("#alternar-qr").addEventListener("click", async (e) => {
  const boton = e.currentTarget, zona = $("#qr-zona"), abrir = zona.hidden;
  e.currentTarget.setAttribute("aria-expanded", String(abrir));
  e.currentTarget.textContent = abrir ? "Ocultar códigos QR" : "Mostrar códigos QR";
  zona.hidden = !abrir; $("#qr-aviso").hidden = true;
  if (!abrir) return;
  try {
    await dibujarQR($("#qr-registro"), urlRegistro(location.href));
    await dibujarQR($("#qr-vivo"), urlTransmision(location.href));
  } catch {
    zona.hidden = true; boton.setAttribute("aria-expanded", "false"); boton.textContent = "Mostrar códigos QR";
    $("#qr-aviso").textContent = "No se pudo cargar el generador de códigos QR. Los enlaces se pueden copiar con los botones.";
    $("#qr-aviso").hidden = false;
  }
});
msg.addEventListener("click", () => aviso(msg, ""));       // los avisos (toasts) se cierran al tocarlos

// ------------------------------------------------------------------ guía del evento y «Ir al sorteo»
function pintarGuia() {
  if (!cargado) return;
  const hayLista = lista.length > 0, hayPart = participantes.length > 0, abierto = registroAbierto === true, hechoSorteo = (sorteosN ?? 0) > 0;
  if (hayLista || hayPart || hechoSorteo) vaciado = false;     // «Datos eliminados» solo vale mientras todo siga vacío
  const pasos = {
    lista: { e: hayLista ? "hecho" : "actual", d: hayLista ? `${lista.length} nombres cargados.` : "En «Lista de la clase»: un nombre por línea." },
    abrir: { e: abierto || hayPart ? "hecho" : hayLista ? "actual" : "pendiente",
      d: abierto ? `Abierto · ${participantes.length} inscritos.` : hayPart ? `Cerrado · ${participantes.length} inscritos.` : "Con el interruptor de arriba, cuando la lista esté cargada." },
    sortear: { e: hechoSorteo ? "hecho" : !abierto && hayPart ? "actual" : "pendiente",
      d: hechoSorteo ? `${sorteosN} ronda(s) guardada(s).` : abierto ? "Cierra el registro cuando termine el plazo; ensaya antes con «Ensayo»." : "Abre «Ir al sorteo» (ensaya antes con la casilla «Ensayo»)." },
    vaciar: { e: vaciado ? "hecho" : hechoSorteo ? "actual" : "pendiente", d: vaciado ? "Datos eliminados." : "Primero «Descargar registro del sorteo»; luego «Vaciar datos» (zona de peligro, al final)." },
  };
  const texto = { hecho: "Hecho", actual: "Siguiente", pendiente: "Pendiente" };
  for (const [id, { e, d }] of Object.entries(pasos)) {
    const li = $(`#guia [data-paso="${id}"]`);
    li.dataset.estado = e; li.querySelector(".detalle").textContent = d;
    li.querySelector(".paso-estado").textContent = texto[e];
    li.querySelector(".paso-num").textContent = e === "hecho" ? "✓" : String(Object.keys(pasos).indexOf(id) + 1);
  }
  const sin = !hayPart;
  $("#ir-sorteo").disabled = sin;
  $("#ir-sorteo").title = sin ? "Disponible cuando haya al menos un participante inscrito." : "";
  $("#ir-sorteo-ayuda").textContent = sin ? "«Ir al sorteo» se habilita cuando haya al menos un participante inscrito."
    : abierto ? "El registro sigue abierto: ciérralo antes del sorteo real y ensaya antes con la casilla «Ensayo»." : "Listo: abre «Ir al sorteo» y ensaya antes con la casilla «Ensayo».";
}
$("#ir-sorteo").addEventListener("click", () => { location.href = "sorteo.html"; });

$("#copiar-enlace").addEventListener("click", async (e) => {
  const boton = e.currentTarget, url = urlTransmision(location.href);       // currentTarget se anula tras el primer await
  if (await copiarTexto(url)) { marcarCopiado(boton); aviso(msg, `Enlace de la transmisión copiado: ${url}`, "exito"); }
  else aviso(msg, `No se pudo copiar automáticamente. El enlace de la transmisión es: ${url}`, "aviso");
});
$("#alternar").addEventListener("click", async () => {
  const objetivo = registroAbierto !== true;
  if (!objetivo && !confirm("¿Cerrar el registro? Nadie más podrá inscribirse.")) return;
  $("#alternar").disabled = true;
  try { await fijarRegistroAbierto(objetivo); registroAbierto = objetivo; aviso(msg, ""); }
  catch { aviso(msg, "No se pudo cambiar el estado del registro.", "error"); }
  pintarEstado(); pintarGuia();
});

function pintarResumen() {
  const inscritosDeLista = participantes.filter((p) => oficial(p.id)).length;
  $("#n-lista").textContent = lista.length;
  $("#n-registrados").textContent = participantes.length;
  $("#n-pendientes").textContent = lista.length - inscritosDeLista;
  $("#prog-x").textContent = inscritosDeLista; $("#prog-y").textContent = lista.length;
  const pct = lista.length ? Math.round((inscritosDeLista / lista.length) * 100) : 0;
  $("#progreso").setAttribute("aria-valuenow", String(pct)); $("#progreso").setAttribute("aria-valuetext", `${inscritosDeLista} de ${lista.length} (${pct} %)`);
  $("#progreso").style.setProperty("--p", `${pct}%`);
  $("#n-alertas").textContent = participantes.filter(hayAdvertencia).length;
}

// ------------------------------------------------------------------ pestañas (teclado: ← → Inicio Fin)
const tabs = ["participantes", "lista", "alta"];
function activarTab(t, enfocar = false) {
  for (const u of tabs) {
    const b = $(`#tab-b-${u}`);
    b.setAttribute("aria-selected", String(u === t));
    b.tabIndex = u === t ? 0 : -1;
    $(`#tab-${u}`).hidden = u !== t;
    if (u === t && enfocar) b.focus();
  }
}
tabs.forEach((t, i) => {
  $(`#tab-b-${t}`).addEventListener("click", () => activarTab(t));
  $(`#tab-b-${t}`).addEventListener("keydown", (e) => {
    const destino = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault(); activarTab(tabs[destino], true);
  });
});

// ------------------------------------------------------------------ participantes (tabla + búsqueda)
$("#solo-alertas").addEventListener("change", pintarParticipantes);
$("#buscar").addEventListener("input", pintarParticipantes);

function pintarParticipantes() {
  const q = plano($("#buscar").value.trim()), solo = $("#solo-alertas").checked;
  const filas = participantes.filter((p) =>
    (!solo || hayAdvertencia(p)) && (!q || plano(`${nombreMostrado(p)} ${p.nombre} ${p.correo}`).includes(q)));
  $("#contador-tabla").textContent = participantes.length
    ? `Mostrando ${filas.length} de ${participantes.length} participantes.` : "";
  $("#participantes").replaceChildren(...(filas.length ? filas.map(filaParticipante)
    : [h("tr", {}, h("td", { class: "vacio", colspan: "5" },
        participantes.length ? "Ningún participante coincide con la búsqueda."
          : "Todavía no hay participantes inscritos. Comparte el enlace de registro (botón «Copiar enlace de registro»)."))]));
}

function filaParticipante(p) {
  const estado = estadoNombre(p);
  const nombre = h("td", { class: "nombre" }, nombreMostrado(p),
    p.origen === "admin" ? h("span", { class: "insignia" }, "alta manual") : null,
    estado === "sin-oficial" ? h("span", { class: "insignia alerta" }, "fuera de la lista") : null,
    estado === "difiere" ? h("span", { class: "insignia alerta" }, "escrito distinto") : null,
    estado === "no-corresponde" ? h("span", { class: "insignia fuerte" }, "no corresponde") : null,
    estado === "difiere" ? h("div", { class: "advertencia" }, `⚠ Tecleó: «${p.nombre}» (difiere del nombre oficial).`) : null,
    estado === "no-corresponde"
      ? h("div", { class: "advertencia fuerte" }, `⚠ Tecleó: «${p.nombre}», que NO corresponde a este registro. Revisa y elimina si es una suplantación.`) : null,
    estado === "sin-oficial" ? h("div", { class: "advertencia" }, "⚠ Esta clave no está en la lista de la clase; se muestra el nombre tecleado.") : null);
  return h("tr", {}, nombre,
    h("td", { "data-label": "Correo" }, p.correo),
    h("td", { "data-label": "Origen" }, p.origen === "admin" ? "Alta manual" : "Registro"),
    h("td", { "data-label": "Fecha" }, fechaCorta(p.creadoEn)),
    h("td", { class: "acciones" }, h("button", {
      type: "button", class: "peligro", "aria-label": `Eliminar a ${nombreMostrado(p)}`, onclick: () => eliminar(p),
    }, "Eliminar")));
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
  const bloques = [
    h("p", {}, h("b", {}, `Se leyeron ${r.total} nombres.`), ` ${r.validos.length} listos para guardar.`,
      r.repetidos ? ` ${r.repetidos} línea(s) repetida(s) se ignoran.` : ""),
  ];
  if (r.validos.length) bloques.push(h("div", {},
    h("p", { class: "suave" }, "Vista previa (los 3 primeros, como se verán en pantalla):"),
    h("ul", { id: "muestra-lista" }, r.validos.slice(0, 3).map((v) =>
      h("li", {}, h("b", {}, enmascararNombre(v.nombre)), h("span", { class: "suave" }, `  ← se guardará como «${v.nombre}»`))))));
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
  $("#lista-actual").replaceChildren(...(lista.length ? lista.map((l) => h("div", { class: "fila" },
    h("div", { class: "nombre" }, l.nombre,
      inscritos.has(l.id) ? h("span", { class: "insignia ok" }, "inscrito") : h("span", { class: "insignia" }, "pendiente")),
    h("div", { class: "accion" }, h("button", {
      type: "button", class: "peligro", "aria-label": `Quitar a ${l.nombre} de la lista`, onclick: () => quitarDeLista(l),
    }, "Quitar"))))
    : [h("p", { class: "suave" }, "La lista está vacía. Cárgala antes de abrir el registro.")]));
}

async function quitarDeLista(l) {
  if (!confirm(`¿Quitar a ${l.nombre} de la lista? Si ya está inscrito, su inscripción no se borra.`)) return;
  try { await borrarDeLista(l.id); } catch { aviso(msg, "No se pudo quitar de la lista.", "error"); }
  await recargar();
}

// ------------------------------------------------------------------ alta manual (mismas validaciones que el registro)
const altaNombre = $("#alta-nombre"), altaCorreo = $("#alta-correo");
const vAltaNombre = validarEnVivo(altaNombre, mensajeErrorNombre);
const vAltaCorreo = validarEnVivo(altaCorreo, mensajeErrorCorreo);

$("#form-alta").addEventListener("submit", async (e) => {
  e.preventDefault();
  aviso(msg, "");
  const errNombre = vAltaNombre.validar(), errCorreo = vAltaCorreo.validar();
  if (errNombre || errCorreo) { (errNombre ? altaNombre : altaCorreo).focus(); return; }
  const clave = claveDeNombre(altaNombre.value);
  if (participantes.some((p) => p.id === clave)) { aviso(msg, "Esa persona ya está inscrita (misma clave de nombre).", "error"); return; }
  if (participantes.some((p) => p.correo === normalizarCorreo(altaCorreo.value))) { aviso(msg, "Ese correo ya está en uso.", "error"); return; }
  const btn = $("#alta-enviar"); btn.disabled = true;
  try {
    const r = await crearParticipante({ nombre: altaNombre.value, correo: altaCorreo.value, origen: "admin" });
    aviso(msg, `Agregado: ${r.nombre}${oficial(r.clave) ? "" : " (no está en la lista de la clase)"}.`, "exito");
    altaNombre.value = ""; altaCorreo.value = ""; vAltaNombre.reiniciar(); vAltaCorreo.reiniciar();
    await recargar();
  } catch (err) {
    aviso(msg, err instanceof ErrorValidacion ? err.message : "No se pudo agregar al participante.", "error");
  }
  btn.disabled = false;
});

// ------------------------------------------------------------------ constancia del sorteo (archivo de texto)
async function descargarRegistro() {
  let sorteos;
  try { sorteos = await leerColeccion("sorteos"); }
  catch (err) { console.error("[panel] no se pudo leer sorteos:", err?.code ?? err?.name); aviso(msg, "No se pudo leer el registro del sorteo. Revisa tu conexión.", "error"); return false; }
  if (!sorteos.length) { aviso(msg, "Aún no hay sorteos guardados (el modo Ensayo no guarda).", "aviso"); return false; }
  const nombreDe = (clave) => {
    const o = oficial(clave);
    return o ? { nombre: o, oficial: true } : { nombre: participantes.find((p) => p.id === clave)?.nombre ?? clave, oficial: false };
  };
  const texto = textoRegistroSorteo({ sorteos, nombreDe });
  descargarArchivo(nombreArchivoRegistro(), texto);
  aviso(msg, `Registro descargado (${sorteos.length} ronda(s)): ${nombreArchivoRegistro()}`, "exito");
  return true;
}
$("#descargar-registro").addEventListener("click", descargarRegistro);
$("#descargar-registro-dlg").addEventListener("click", descargarRegistro);

// ------------------------------------------------------------------ vaciar datos (doble confirmación)
const dlg = $("#dlg-vaciar"), texto = $("#confirmar-texto"), confirmar = $("#confirmar-vaciar");
$("#abrir-vaciar").addEventListener("click", async () => {
  const sorteos = await leerColeccion("sorteos").catch(() => []);
  $("#dlg-detalle").textContent = `Se cerrará el registro y se borrarán ${lista.length} nombres de la lista, ` +
    `${participantes.length} participantes (con sus correos) y ${sorteos.length} sorteos guardados.`;
  texto.value = ""; confirmar.disabled = true;
  dlg.showModal(); texto.focus();
});
texto.addEventListener("input", () => { confirmar.disabled = texto.value.trim() !== "BORRAR"; });
$("#cancelar-vaciar").addEventListener("click", () => dlg.close());
$("#form-vaciar").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (texto.value.trim() !== "BORRAR") return; // segunda barrera: el botón deshabilitado no basta
  confirmar.disabled = true; confirmar.textContent = "Borrando…";
  try {
    const n = await vaciarDatos();
    vaciado = true;
    dlg.close();
    const resumen = `Datos eliminados: ${n.lista} de la lista, ${n.participantes} participantes, ${n.correos} correos y ${n.sorteos} sorteos. El registro quedó cerrado.`;
    if (n.transmisionLimpia) aviso(msg, `${resumen} La transmisión en vivo quedó en espera.`, "exito");
    else aviso(msg, `${resumen} ATENCIÓN: no se pudo limpiar la transmisión en vivo (publico/sorteo): puede seguir mostrando la máscara del último ganador. Republica firestore.rules, o bórrala en la consola de Firebase.`, "error");
  } catch {
    dlg.close();
    aviso(msg, "El vaciado no terminó. Revisa tu conexión y vuelve a intentarlo; el registro quedó cerrado.", "error");
  }
  confirmar.textContent = "Vaciar datos";
  await recargar();
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
