// Clasificación y mensajes de los errores al guardar una ronda del sorteo (módulo puro, sin Firebase ni DOM).
// Antes, cualquier fallo mostraba «Revisa tu conexión», lo que ocultaba un desajuste de reglas publicadas.

/** → "reglas" | "red" | "sesion" | "cuota" | "otro" */
export function clasificarErrorGuardado(code = "", mensaje = "") {
  const c = String(code).replace(/^firestore\//, ""), m = String(mensaje).toLowerCase();
  if (c === "permission-denied") return "reglas";
  if (c === "unavailable" || c === "deadline-exceeded" || c === "cancelled" || c === "network-request-failed"
    || m.includes("offline") || m.includes("network")) return "red";
  if (c === "unauthenticated") return "sesion";
  if (c === "resource-exhausted") return "cuota";
  return "otro";
}

export function mensajeErrorGuardado(code, mensaje = "") {
  switch (clasificarErrorGuardado(code, mensaje)) {
    case "reglas":
      return "Las reglas de Firestore publicadas no coinciden con esta versión de la app. Republica firestore.rules.";
    case "red":
      return "No hay conexión con el servidor, así que no se guardó el sorteo ni se reveló a nadie. Revisa tu conexión a internet e inténtalo de nuevo.";
    case "sesion":
      return "Tu sesión expiró y no se guardó el sorteo. Vuelve a iniciar sesión e inténtalo de nuevo.";
    case "cuota":
      return "Firestore agotó su cuota y no se guardó el sorteo. Revisa el uso del proyecto en la consola de Firebase.";
    default:
      return `No se pudo guardar el sorteo (código: ${code || "desconocido"}), así que no se reveló a nadie.`;
  }
}
