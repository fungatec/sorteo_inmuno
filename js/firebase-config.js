// Configuración pública de la app web de Firebase (proyecto sorteoinmuno).
// El apiKey de Firebase NO es un secreto: la seguridad la dan firestore.rules.
// TODO (pegar desde Consola Firebase → Configuración del proyecto → Tus apps → SDK):
export const firebaseConfig = {
  apiKey: "AIzaSyD1LVtUfT2ldTDHOpn7GvP0gyyeIl364wk",
  authDomain: "sorteoinmuno.firebaseapp.com",
  projectId: "sorteoinmuno",
  storageBucket: "sorteoinmuno.firebasestorage.app",
  messagingSenderId: "383348097413",
  appId: "1:383348097413:web:d9fbc09a9dfc29958284ec",
};

// Cuenta de admin compartida. El correo no es secreto; la contraseña NUNCA va en el código:
// la teclea quien inicia sesión. El login muestra "Usuario"/"Contraseña" y, si el usuario
// escribe ADMIN_USUARIO, usa ADMIN_CORREO al llamar a Firebase Auth.
export const ADMIN_USUARIO = "admin";
export const ADMIN_CORREO = "admin@admin.admin";
