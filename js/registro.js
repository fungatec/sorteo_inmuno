// Registro público: nombre completo + correo institucional. Sin lecturas de datos personales.
import { configPendiente } from "./firebase.js";
import { leerRegistroAbierto, crearParticipante, ErrorValidacion } from "./datos.js";
import { validarNombre, esCorreoValido, limpiarNombre } from "./normalizar.js";
import { $, aviso, avisoConfigPendiente } from "./ui.js";

// Mensaje único (decisión de privacidad): Firestore no distingue las causas y no abrimos lecturas.
const MENSAJE_RECHAZO =
  "No pudimos completar tu registro. Puede deberse a que tu nombre no coincide con la lista de la clase, " +
  "a que ya te habías registrado o a que ese correo ya se usó. Si el problema persiste, avisa a la maestra.";
const MENSAJE_CERRADO = "El registro está cerrado por ahora. Avisa a la maestra si crees que es un error.";
const MENSAJE_RED = "No pudimos conectar. Revisa tu conexión a internet e inténtalo de nuevo.";

const form = $("#registro"), nombre = $("#nombre"), correo = $("#correo"), enviar = $("#enviar"), msg = $("#aviso");

function pintarEstado(abierto) {
  $("#punto").className = "punto " + (abierto === true ? "abierto" : abierto === false ? "cerrado" : "");
  $("#estado-texto").textContent =
    abierto === true ? "Registro abierto" : abierto === false ? "Registro cerrado" : "Estado del registro no disponible";
}

function marcar(campo, invalido) { campo.setAttribute("aria-invalid", invalido ? "true" : "false"); }

async function iniciar() {
  if (configPendiente) {
    avisoConfigPendiente($("main"));
    enviar.disabled = true;
    pintarEstado(null);
    return;
  }
  const abierto = await leerRegistroAbierto();
  pintarEstado(abierto);
  if (abierto === false) { enviar.disabled = true; aviso(msg, MENSAJE_CERRADO, "aviso"); }
  else if (abierto === null) aviso(msg, MENSAJE_RED, "aviso");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (enviar.disabled) return;
  aviso(msg, "");
  const errNombre = validarNombre(nombre.value);
  const errCorreo = esCorreoValido(correo.value) ? "" : "Escribe tu correo institucional, que termina en @alumnos.udg.mx.";
  marcar(nombre, !!errNombre); marcar(correo, !!errCorreo);
  if (errNombre || errCorreo) { aviso(msg, errNombre || errCorreo, "error"); (errNombre ? nombre : correo).focus(); return; }

  enviar.disabled = true; enviar.textContent = "Inscribiendo…";
  try {
    const abierto = await leerRegistroAbierto();
    pintarEstado(abierto);
    if (abierto === false) { aviso(msg, MENSAJE_CERRADO, "aviso"); return; }
    if (abierto === null) { aviso(msg, MENSAJE_RED, "error"); enviar.disabled = false; return; }
    const r = await crearParticipante({ nombre: nombre.value, correo: correo.value, origen: "registro" });
    form.hidden = true; $("#estado").hidden = true;
    $("#listo-texto").textContent = `${limpiarNombre(r.nombre)}, tu receptor ya forma parte del repertorio. Ahora solo queda esperar el reconocimiento.`;
    $("#listo").hidden = false;
    $("#listo h1").focus?.();
  } catch (err) {
    if (err instanceof ErrorValidacion) aviso(msg, err.message, "error");
    else if (err?.code === "permission-denied") aviso(msg, MENSAJE_RECHAZO, "error");
    else if (["unavailable", "deadline-exceeded", "resource-exhausted"].includes(err?.code) || !navigator.onLine) aviso(msg, MENSAJE_RED, "error");
    else aviso(msg, "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, avisa a la maestra.", "error");
    if (!form.hidden && abiertoNoCerrado()) enviar.disabled = false;
  } finally {
    enviar.textContent = "Inscribir mi clon";
  }
});

// El botón solo queda deshabilitado de forma permanente si el registro está cerrado.
function abiertoNoCerrado() { return !$("#punto").classList.contains("cerrado"); }

iniciar();
