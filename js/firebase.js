// Inicialización única de Firebase (SDK modular, versión fijada, CDN oficial gstatic).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

/** true mientras queden marcadores PEGAR_AQUI en firebase-config.js. */
export const configPendiente = Object.values(firebaseConfig).some((v) => String(v).includes("PEGAR_AQUI"));

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Solo para desarrollo local: abrir http://localhost:8000/?emulador conecta a los emuladores.
// Nunca se activa en el dominio publicado (exige hostname localhost).
try {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    if (new URLSearchParams(location.search).has("emulador")) sessionStorage.setItem("emulador", "1");
    if (sessionStorage.getItem("emulador")) {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
  }
} catch { /* sessionStorage no disponible: se ignora */ }
