// Autenticación de admin. La contraseña nunca está en el código: solo se teclea.
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { ADMIN_USUARIO, ADMIN_CORREO } from "./firebase-config.js";

/** Correo interno para el usuario escrito, o null si no es el usuario admin. */
export function correoDeUsuario(usuario) {
  return String(usuario ?? "").trim().toLowerCase() === ADMIN_USUARIO ? ADMIN_CORREO : null;
}

/** Admin ⇔ existe admins/{uid}. Cualquier error (incluido permission-denied) cuenta como "no". */
async function esAdmin(user) {
  try { return (await getDoc(doc(db, "admins", user.uid))).exists(); }
  catch { return false; }
}

/** Lanza Error con code "app/usuario-invalido" (sin llamar a Firebase) o "app/no-admin". */
export async function iniciarSesion(usuario, contrasena) {
  const correo = correoDeUsuario(usuario);
  if (!correo) throw Object.assign(new Error("Usuario no válido"), { code: "app/usuario-invalido" });
  const { user } = await signInWithEmailAndPassword(auth, correo, contrasena);
  if (!(await esAdmin(user))) {
    await signOut(auth);
    throw Object.assign(new Error("Sin permisos de admin"), { code: "app/no-admin" });
  }
  return user;
}

/** Resuelve con el usuario admin o redirige a login.html. Usar en panel y sorteo. */
export function requerirAdmin() {
  return new Promise((resolve) => {
    const dejar = onAuthStateChanged(auth, async (user) => {
      dejar();
      if (user && await esAdmin(user)) return resolve(user);
      if (user) await signOut(auth);
      location.replace("login.html");
    });
  });
}

/** Resuelve true si ya hay una sesión de admin válida (para saltar el login). */
export function sesionAdminActiva() {
  return new Promise((resolve) => {
    const dejar = onAuthStateChanged(auth, async (user) => { dejar(); resolve(!!user && await esAdmin(user)); });
  });
}

export async function cerrarSesion() {
  await signOut(auth);
  location.replace("login.html");
}
