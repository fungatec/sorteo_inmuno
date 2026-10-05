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

// Cuenta de admin compartida. El correo no es secreto; la contraseña NUNCA va en el código:
// la teclea quien inicia sesión. El login muestra "Usuario"/"Contraseña" y, si el usuario
// escribe ADMIN_USUARIO, usa ADMIN_CORREO al llamar a Firebase Auth.
export const ADMIN_USUARIO = "admin";
export const ADMIN_CORREO = "admin@admin.admin";
