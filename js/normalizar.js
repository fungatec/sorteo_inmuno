// Normalización y validación compartidas por registro, carga de lista y alta manual.
// Módulo puro (sin DOM ni Firebase): se importa en el navegador y en las pruebas de Node.

export const DOMINIO_CORREO = "@alumnos.udg.mx";
export const NOMBRE_MIN = 5;
export const NOMBRE_MAX = 100;

// Partículas que se ignoran al construir la clave ("María de los Ángeles" ≡ "María Ángeles").
export const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);

/**
 * Clave normalizada de un nombre (ID de lista/{clave} y participantes/{clave}).
 * minúsculas → guiones y espacios en blanco → un espacio → NFD y quitar marcas
 * combinantes (ñ → n) → solo letras a-z y espacios → palabras → quitar partículas
 * (de, del, la, las, los, y) → orden alfabético → unir con guiones.
 * Los guiones se convierten en espacio ANTES de quitar caracteres no alfabéticos
 * ("Pérez-Gil" ≡ "Pérez Gil"). Se ordenan las palabras para tolerar distinto orden
 * de nombre y apellidos. Devuelve "" si no queda ninguna palabra (rechazarlo).
 */
export function claveDeNombre(nombre) {
  const palabras = String(nombre ?? "")
    .toLowerCase()
    .replace(/[\s\-\u2010-\u2015\u2212]+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "")
    .split(" ")
    .filter((p) => p && !PARTICULAS.has(p));
  return palabras.sort().join("-");
}

/** Nombre tal como se mostrará: recortado y con espacios internos colapsados. */
export function limpiarNombre(nombre) {
  return String(nombre ?? "").replace(/\s+/g, " ").trim();
}

/** Devuelve "" si es válido, o un mensaje de error en español. */
export function validarNombre(nombre) {
  const n = limpiarNombre(nombre);
  if (n.length < NOMBRE_MIN || n.length > NOMBRE_MAX) {
    return `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;
  }
  if (!claveDeNombre(n)) return "El nombre debe contener letras.";
  return "";
}

/** Minúsculas y sin espacios (cualquier espacio en blanco). */
export function normalizarCorreo(correo) {
  return String(correo ?? "").toLowerCase().replace(/\s+/g, "");
}

// Debe coincidir con correoValido() de firestore.rules.
const RE_CORREO = /^[a-z0-9][a-z0-9._%+-]*@alumnos\.udg\.mx$/;

export function esCorreoValido(correo) {
  const c = normalizarCorreo(correo);
  return c.length <= 100 && RE_CORREO.test(c);
}

/**
 * Compara el nombre tecleado con el oficial (lista/{clave}.nombre) para el panel.
 *  "sin-oficial"     : la clave no está en la lista (p. ej. alta manual).
 *  "no-corresponde"  : el nombre tecleado NO produce esta clave (posible manipulación).
 *  "difiere"         : misma clave, pero escrito distinto (orden, acentos, etc.).
 *  "ok"              : igual salvo mayúsculas y espacios.
 */
export function compararConOficial(tecleado, oficial, clave) {
  if (!oficial) return "sin-oficial";
  if (claveDeNombre(tecleado) !== clave) return "no-corresponde";
  const a = limpiarNombre(tecleado).toLowerCase();
  const b = limpiarNombre(oficial).toLowerCase();
  return a === b ? "ok" : "difiere";
}

/**
 * Analiza el texto de la lista de la clase (un nombre por línea) sin tocar Firebase.
 * Devuelve { validos: [{clave, nombre}], rechazados: [{linea, texto, motivo}],
 *            colisiones: [{clave, nombres}], repetidos }.
 * Las claves en colisión (nombres distintos con la misma clave) NO se incluyen en
 * `validos`: la admin debe distinguirlas a mano. Líneas idénticas se cuentan como repetidos.
 */
export function analizarLista(texto) {
  const porClave = new Map(); // clave -> [nombres distintos]
  const rechazados = [];
  let repetidos = 0;
  String(texto ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).forEach((crudo, i) => {
    const nombre = limpiarNombre(crudo.replace(/^["']+|["']+$/g, ""));
    if (!nombre) return;
    const error = validarNombre(nombre);
    if (error) { rechazados.push({ linea: i + 1, texto: nombre, motivo: error }); return; }
    const clave = claveDeNombre(nombre);
    const vistos = porClave.get(clave) ?? [];
    if (vistos.some((v) => v.toLowerCase() === nombre.toLowerCase())) { repetidos++; return; }
    porClave.set(clave, [...vistos, nombre]);
  });
  const validos = [], colisiones = [];
  for (const [clave, nombres] of porClave) {
    if (nombres.length === 1) validos.push({ clave, nombre: nombres[0] });
    else colisiones.push({ clave, nombres });
  }
  return { validos, rechazados, colisiones, repetidos };
}

/** Mensajes para validación en vivo. Devuelven "" si el valor es válido. */
export function mensajeErrorNombre(nombre) {
  if (!limpiarNombre(nombre)) return "Escribe tu nombre completo.";
  return validarNombre(nombre);
}

export function mensajeErrorCorreo(correo) {
  const c = normalizarCorreo(correo);
  if (!c) return "Escribe tu correo institucional.";
  if (!c.endsWith(DOMINIO_CORREO)) return "El correo debe ser @alumnos.udg.mx";
  return esCorreoValido(c) ? "" : "Revisa el correo: antes de la @ solo puede haber letras, números y . _ % + -";
}
