// Acceso a Firestore. Las colecciones sensibles solo las lee un admin (las reglas lo imponen).
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp, deleteDoc, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db, auth } from "./firebase.js";
import { claveDeNombre, limpiarNombre, validarNombre, normalizarCorreo, esCorreoValido, DOMINIO_CORREO } from "./normalizar.js";

/** true/false, o null si no se pudo leer (sin red, config pendiente…). */
export async function leerRegistroAbierto() {
  try { return (await getDoc(doc(db, "config", "estado"))).data()?.registroAbierto === true; }
  catch { return null; }
}

export const fijarRegistroAbierto = (abierto) =>
  setDoc(doc(db, "config", "estado"), { registroAbierto: !!abierto });

/** Error de validación del formulario (mensaje ya en español, apto para mostrar). */
export class ErrorValidacion extends Error {}

/**
 * Crea participantes/{clave} y correos/{correo} en UN batch (las reglas exigen el par).
 * origen: "registro" (público) | "admin" (alta manual). Lanza ErrorValidacion o el error de Firestore.
 */
export async function crearParticipante({ nombre, correo, origen }) {
  const nombreLimpio = limpiarNombre(nombre);
  const errNombre = validarNombre(nombreLimpio);
  if (errNombre) throw new ErrorValidacion(errNombre);
  const correoNorm = normalizarCorreo(correo);
  if (!esCorreoValido(correoNorm)) throw new ErrorValidacion(`El correo debe ser institucional y terminar en ${DOMINIO_CORREO}.`);
  const clave = claveDeNombre(nombreLimpio);

  const lote = writeBatch(db);
  lote.set(doc(db, "participantes", clave), {
    nombre: nombreLimpio, clave, correo: correoNorm, origen, creadoEn: serverTimestamp(),
  });
  lote.set(doc(db, "correos", correoNorm), { clave });
  await lote.commit();
  return { clave, nombre: nombreLimpio, correo: correoNorm };
}

/** Borra el participante y su índice de correo juntos. */
export async function borrarParticipante({ clave, correo }) {
  const lote = writeBatch(db);
  lote.delete(doc(db, "participantes", clave));
  lote.delete(doc(db, "correos", correo));
  await lote.commit();
}

export const borrarDeLista = (clave) => deleteDoc(doc(db, "lista", clave));

/** Lee una colección completa como arreglo [{id, ...datos}] (solo admin). */
export async function leerColeccion(nombre) {
  const snap = await getDocs(collection(db, nombre));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Agrega/actualiza entradas de lista en lotes de 400 (límite de Firestore: 500). */
export async function guardarLista(entradas) {
  for (let i = 0; i < entradas.length; i += 400) {
    const lote = writeBatch(db);
    for (const { clave, nombre } of entradas.slice(i, i + 400)) lote.set(doc(db, "lista", clave), { nombre });
    await lote.commit();
  }
}

/**
 * Guarda un sorteo (las reglas exigen: exactamente fecha, totalParticipantes, ganadorClave, ronda y adminUid;
 * fecha == request.time; adminUid == UID de la sesión; ganador existente en participantes).
 * Se escribe con una TRANSACCIÓN, no con setDoc: setDoc sin conexión no falla, se encola y se aplica en silencio al
 * volver la red (la pantalla se quedaría colgada y la ronda se guardaría sin que nadie lo sepa). La transacción
 * necesita al servidor y falla con un código claro (unavailable, permission-denied…), que sorteo.js traduce.
 */
export async function guardarSorteo({ totalParticipantes, ganadorClave, ronda }) {
  const ref = doc(collection(db, "sorteos"));
  const adminUid = auth.currentUser?.uid;
  await runTransaction(db, async (tx) => {
    tx.set(ref, { fecha: serverTimestamp(), totalParticipantes, ganadorClave, ronda, adminUid });
  }, { maxAttempts: 1 });
  return ref.id;
}

/**
 * Transmisión en vivo: documento único publico/sorteo (ver firestore.rules y js/en-vivo-util.js). Solo sorteos reales.
 * Se escribe con una transacción (como guardarSorteo) para que, sin conexión, falle en vez de encolarse y aplicarse
 * minutos después con un estado ya obsoleto. NUNCA se escribe el ganador (clave, nombre ni máscara) antes del revelado.
 */
const refPublico = () => doc(db, "publico", "sorteo");
const escribirPublico = (datos) => runTransaction(db, async (tx) => { tx.set(refPublico(), datos); }, { maxAttempts: 1 });
export const publicarEspera = () => escribirPublico({ estado: "espera" });
export const publicarAnimando = ({ ronda, modo, tipo }) => escribirPublico({ estado: "animando", ronda, modo, tipo, inicio: serverTimestamp() });
export const publicarRevelado = ({ ronda, modo, tipo, ganadorMascara }) =>
  escribirPublico({ estado: "revelado", ronda, modo, tipo, inicio: serverTimestamp(), ganadorMascara });

/** Borra TODOS los documentos de una colección en lotes de 400. Devuelve cuántos borró. */
async function borrarColeccion(nombre) {
  const docs = (await getDocs(collection(db, nombre))).docs;
  for (let i = 0; i < docs.length; i += 400) {
    const lote = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  return docs.length;
}

/**
 * Vaciado de fin de evento: cierra el registro y borra participantes, correos, sorteos y lista.
 * El orden importa: primero se cierra el registro; la lista va al final para que, si algo
 * falla a medias, nadie pueda volver a inscribirse con datos ya borrados.
 */
export async function vaciarDatos() {
  await fijarRegistroAbierto(false);
  const borrados = {};
  // La máscara del último ganador es visible para quien tenga el enlace de la transmisión: se limpia primero. Si falla
  // (p. ej. reglas sin republicar) no se detiene el vaciado: se avisa en el resultado para que la admin lo resuelva.
  try { await publicarEspera(); borrados.transmisionLimpia = true; }
  catch (err) { console.error("[vaciar] no se pudo limpiar publico/sorteo:", err?.code ?? err?.name ?? "desconocido"); borrados.transmisionLimpia = false; }
  for (const col of ["participantes", "correos", "sorteos", "lista"]) borrados[col] = await borrarColeccion(col);
  return borrados;
}
