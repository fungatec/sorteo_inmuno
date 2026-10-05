// Configuración pública de la app web de Firebase (proyecto sorteoinmuno).
// El apiKey de Firebase NO es un secreto: la seguridad la dan firestore.rules.
// TODO (pegar desde Consola Firebase → Configuración del proyecto → Tus apps → SDK):
export const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "sorteoinmuno.firebaseapp.com",
  projectId: "sorteoinmuno",
  storageBucket: "PEGAR_AQUI",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI",
};

// Cuenta de admin compartida. Ni el usuario ni el correo son secretos; la contraseña NUNCA va
// en el código: la teclea quien inicia sesión. El login muestra "Usuario"/"Contraseña"; solo si
// el usuario escrito es ADMIN_USUARIO se llama a Firebase Auth, con ADMIN_CORREO.
export const ADMIN_USUARIO = "admin123";
export const ADMIN_CORREO = "admin@admin.admin";
