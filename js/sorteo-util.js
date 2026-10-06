// Utilidades puras del sorteo (sin DOM ni Firebase): máscara del ganador y registro descargable.
import { limpiarNombre, PARTICULAS } from "./normalizar.js";

const plano = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const capitalizar = (p) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es");

/**
 * Formato título para mostrar el nombre oficial (la lista viene en MAYÚSCULAS y sin acentos):
 * "MARTA ELENA RIOS Y VEGA SOTO" → "Marta Elena Rios y Vega Soto". Las partículas
 * (de, del, la, las, los, y) van en minúscula salvo al inicio; los guiones capitalizan cada parte.
 * Solo es para mostrar: lo guardado en la lista no cambia.
 */
export function formatoTitulo(nombre) {
  return limpiarNombre(nombre).split(" ").filter(Boolean).map((p, i) => {
    if (i > 0 && PARTICULAS.has(plano(p))) return p.toLocaleLowerCase("es");
    return p.split("-").map(capitalizar).join("-");
  }).join(" ");
}

/**
 * Máscara pública del nombre OFICIAL: primera palabra completa (nombre de pila) + iniciales de las
 * demás palabras, sin partículas. "Julián Ramírez Soto" → "Julián R. S.".
 * Asume que la lista oficial escribe "Nombre Apellidos"; si no, el botón «Mostrar nombre completo»
 * cubre el caso. No hay dígitos de código: el modelo no tiene código de estudiante.
 */
export function enmascararNombre(oficial) {
  const palabras = limpiarNombre(oficial).split(" ").filter(Boolean);
  if (!palabras.length) return "";
  const [pila, ...resto] = palabras;
  const iniciales = resto
    .filter((p) => !PARTICULAS.has(plano(p)))
    .map((p) => `${p.charAt(0).toLocaleUpperCase("es")}.`);
  return [capitalizar(pila), ...iniciales].join(" ");
}

const aFecha = (f) => (f instanceof Date ? f : f?.toDate ? f.toDate() : f?.seconds ? new Date(f.seconds * 1000) : null);

/**
 * Texto del «Registro del sorteo» (constancia previa al vaciado de datos).
 * sorteos: [{ ronda, fecha, totalParticipantes, ganadorClave, adminUid }]
 * nombreDe(clave) → { nombre, oficial }  (oficial=false si la clave no está en la lista)
 */
export function textoRegistroSorteo({ sorteos, nombreDe, generado = new Date() }) {
  const orden = [...sorteos].sort((a, b) => a.ronda - b.ronda);
  const fmt = (d) => (d ? d.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "medium" }) : "—");
  const lineas = [
    "REGISTRO DEL SORTEO",
    "Inmunobiología · CUCBA, Universidad de Guadalajara",
    `Generado: ${fmt(generado)} (hora local del navegador)`,
    `Rondas registradas: ${orden.length}`,
    "",
  ];
  for (const s of orden) {
    const g = nombreDe(s.ganadorClave);
    lineas.push(
      `Ronda ${s.ronda}`,
      `  Fecha: ${fmt(aFecha(s.fecha))}`,
      `  Total de participantes en la ronda: ${s.totalParticipantes}`,
      `  Ganador (nombre oficial): ${g.nombre}${g.oficial ? "" : " [fuera de la lista oficial]"}`,
      `  Registrado por (UID del admin): ${s.adminUid ?? "—"}`,
      "",
    );
  }
  lineas.push(
    "Nota: este archivo contiene datos personales. Tras «Vaciar datos» la aplicación ya no conserva copia;",
    "guárdalo solo el tiempo necesario y no lo publiques.",
  );
  return lineas.join("\n") + "\n";
}

export function nombreArchivoRegistro(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `registro-sorteo-${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}.txt`;
}
