// Configuración pública de la app web de Firebase (proyecto sorteoinmuno).
// El apiKey de Firebase NO es un secreto: la seguridad la dan firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyD1LVtUfT2ldTDHOpn7GvP0gyyeIl364wk",
  authDomain: "sorteoinmuno.firebaseapp.com",
  projectId: "sorteoinmuno",
  storageBucket: "sorteoinmuno.firebasestorage.app",
  messagingSenderId: "383348097413",
  appId: "1:383348097413:web:d9fbc09a9dfc29958284ec",
};

// Cuenta de admin compartida. Ni el usuario ni el correo son secretos; la contraseña NUNCA va
// en el código: la teclea quien inicia sesión. El login muestra "Usuario"/"Contraseña"; solo si
// el usuario escrito es ADMIN_USUARIO se llama a Firebase Auth, con ADMIN_CORREO.
export const ADMIN_USUARIO = "admin123";
export const ADMIN_CORREO = "admin@admin.admin";
