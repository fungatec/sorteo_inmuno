// Login de admin: "Usuario"/"Contraseña". Usuario distinto de ADMIN_USUARIO se rechaza sin llamar a Firebase.
import { configPendiente } from "./firebase.js";
import { iniciarSesion, sesionAdminActiva } from "./auth.js";
import { $, aviso, avisoConfigPendiente } from "./ui.js";

const form = $("#login"), usuario = $("#usuario"), contrasena = $("#contrasena"), entrar = $("#entrar"), msg = $("#aviso");
const CREDENCIALES = "Usuario o contraseña incorrectos.";

if (configPendiente) { avisoConfigPendiente($("main")); entrar.disabled = true; }
else sesionAdminActiva().then((ok) => { if (ok) location.replace("panel.html"); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  aviso(msg, "");
  if (!usuario.value.trim() || !contrasena.value) { aviso(msg, "Escribe usuario y contraseña.", "error"); return; }
  entrar.disabled = true; entrar.textContent = "Entrando…";
  try {
    await iniciarSesion(usuario.value, contrasena.value);
    location.replace("panel.html");
  } catch (err) {
    const c = err?.code;
    if (c === "app/usuario-invalido" || ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(c)) aviso(msg, CREDENCIALES, "error");
    else if (c === "app/no-admin") aviso(msg, "Sin permisos de administrador.", "error");
    else if (c === "auth/too-many-requests") aviso(msg, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", "error");
    else if (c === "auth/network-request-failed") aviso(msg, "No pudimos conectar. Revisa tu conexión.", "error");
    else aviso(msg, "No se pudo iniciar sesión. Inténtalo de nuevo.", "error");
    contrasena.value = "";
    entrar.disabled = false; entrar.textContent = "Entrar";
  }
});
