// Login de admin: "Usuario"/"Contraseña". Usuario distinto de ADMIN_USUARIO se rechaza sin llamar a Firebase.
import { configPendiente } from "./firebase.js";
import { iniciarSesion, sesionAdminActiva } from "./auth.js";
import { mensajeErrorLogin } from "./login-errores.js";
import { $, aviso, avisoConfigPendiente } from "./ui.js";

const form = $("#login"), usuario = $("#usuario"), contrasena = $("#contrasena"), entrar = $("#entrar"), msg = $("#aviso");

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
    const code = err?.code ?? "desconocido";
    // Solo el código (nunca la contraseña ni el mensaje completo): sirve para diagnosticar dominio, método o clave de API.
    if (code !== "app/usuario-invalido") console.error("[login] error de Firebase:", code);
    aviso(msg, mensajeErrorLogin(code, { hostname: location.hostname, mensaje: err?.message }), "error");
    contrasena.value = "";
    entrar.disabled = false; entrar.textContent = "Entrar";
  }
});
