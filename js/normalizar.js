// Normalización y validación compartidas por registro, carga de lista y alta manual.
// Módulo puro (sin DOM ni Firebase): se importa en el navegador y en las pruebas de Node.

export const DOMINIO_CORREO = "@alumnos.udg.mx";
export const NOMBRE_MIN = 5;
export const NOMBRE_MAX = 100;

/**
 * Clave normalizada de un nombre (ID de lista/{clave} y participantes/{clave}).
 * minúsculas → NFD y quitar marcas combinantes (ñ → n) → solo letras a-z y espacios
 * → colapsar espacios → palabras → orden alfabético → unir con guiones.
 * Se ordenan las palabras para tolerar distinto orden de nombre y apellidos.
 * Devuelve "" si no queda ninguna letra (el llamador debe rechazarlo).
 */
export function claveDeNombre(nombre) {
  const palabras = String(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .split(" ")
    .filter(Boolean);
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
