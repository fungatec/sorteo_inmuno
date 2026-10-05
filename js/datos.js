// Acceso a Firestore. Las colecciones sensibles solo las lee un admin (las reglas lo imponen).
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
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

/** Guarda un sorteo (las reglas exigen fecha = hora del servidor y ganador existente). */
export async function guardarSorteo({ totalParticipantes, ganadorClave, ronda }) {
  const ref = doc(collection(db, "sorteos"));
  await setDoc(ref, { fecha: serverTimestamp(), totalParticipantes, ganadorClave, ronda });
  return ref.id;
}
