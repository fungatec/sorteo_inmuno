// Clasificación y mensajes de los errores del login (módulo puro, sin Firebase ni DOM).
// Regla de oro: NUNCA revelar si falló el usuario o la contraseña. Los errores de credenciales comparten
// un mismo mensaje; los de configuración o red tienen mensajes propios porque no dicen nada de las credenciales.

/** Usuario escrito → forma comparable: sin espacios en los bordes y en minúsculas. */
export const normalizarUsuario = (u) => String(u ?? "").trim().toLowerCase();

const CREDENCIALES = new Set([
  "app/usuario-invalido", "auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password",
  "auth/user-not-found", "auth/invalid-email", "auth/missing-password", "auth/missing-email",
]);

/** → "credenciales" | "dominio" | "metodo" | "red" | "clave-api" | "bloqueo" | "sin-permisos" | "otro" */
export function clasificarErrorLogin(code = "", mensaje = "") {
  const c = String(code), m = String(mensaje).toLowerCase();
  if (c === "app/no-admin") return "sin-permisos";
  if (CREDENCIALES.has(c)) return "credenciales";
  if (c === "auth/unauthorized-domain" || c === "auth/unauthorized-continue-uri") return "dominio";
  if (c === "auth/operation-not-allowed" || c === "auth/admin-restricted-operation") return "metodo";
  if (c === "auth/network-request-failed" || c === "auth/timeout") return "red";
  if (c === "auth/too-many-requests") return "bloqueo";
  if (c === "auth/invalid-api-key" || c === "auth/app-not-authorized" || c.startsWith("auth/requests-from-referer")
    || c.includes("api-key") || m.includes("api key") || m.includes("are blocked") || m.includes("api_key")) return "clave-api";
  return "otro";
}

export function mensajeErrorLogin(code, { hostname = "este sitio", mensaje = "" } = {}) {
  switch (clasificarErrorLogin(code, mensaje)) {
    case "credenciales": return "Usuario o contraseña incorrectos.";
    case "sin-permisos": return "Sin permisos de administrador.";
    case "bloqueo": return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    case "red": return "No pudimos conectar con el servicio de acceso. Revisa tu conexión a internet e inténtalo de nuevo.";
    case "dominio": return `Este sitio (${hostname}) no está autorizado en Firebase Authentication. Quien administra el proyecto debe agregarlo en Authentication → Configuración → Dominios autorizados.`;
    case "metodo": return "El inicio de sesión con correo y contraseña está desactivado en Firebase Authentication. Quien administra el proyecto debe activarlo en Authentication → Método de acceso.";
    case "clave-api": return "La clave de API de Firebase fue rechazada o está restringida para este sitio. Quien administra el proyecto debe revisar sus restricciones en Google Cloud → Credenciales.";
    default: return `No se pudo iniciar sesión por un error inesperado (código: ${code || "desconocido"}). Si persiste, avisa a quien administra el sitio.`;
  }
}
