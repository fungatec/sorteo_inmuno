// Transmisión en vivo para los inscritos (sin sesión): escucha publico/sorteo y pinta espera / animando / revelado.
// Solo lectura. Todo texto entra con textContent. El documento nunca contiene la clave ni el nombre completo del ganador.
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db, configPendiente } from "./firebase.js";
import { crearEscenaEspectador } from "./en-vivo-escena.js";
import { vistaDe, guion, duracionGuion, pasoEn, llegoTarde, estaInterrumpido, TEXTOS, UMBRAL_INTERRUMPIDO_MS } from "./en-vivo-util.js";

const $ = (s) => document.querySelector(s);
const titulo = $("#titulo-ev"), sub = $("#subtitulo-ev"), rev = $("#revelado-ev"), conexion = $("#conexion");
const escena = crearEscenaEspectador($("#lienzo-ev"));
const mov = matchMedia("(prefers-reduced-motion: reduce)");
escena.setReducido(mov.matches); mov.addEventListener("change", (e) => escena.setReducido(e.matches));

let primero = true;                    // el primer snapshot decide si se llegó tarde
let claveVista = "";                   // estado|ronda|inicio: evita repintar por snapshots duplicados
let temporizadores = [];
const limpiarTemporizadores = () => { temporizadores.forEach(clearTimeout); temporizadores = []; };

function mostrar({ t, s = "", reveladoVisible = false, escenaModo }) {
  titulo.textContent = t; sub.textContent = s;
  rev.hidden = !reveladoVisible; $("#lienzo-ev").hidden = reveladoVisible;
  if (escenaModo) escena.fijar(escenaModo);
}

function pintarEspera() { mostrar({ t: TEXTOS.espera, escenaModo: "espera" }); }

function pintarAnimando(v, tarde) {
  if (tarde) {
    const interrumpido = estaInterrumpido(v.inicioMs, Date.now());
    mostrar({ t: interrumpido ? TEXTOS.interrumpido : TEXTOS.enCurso, escenaModo: "calma" });
    if (!interrumpido) programarInterrupcion();
    return;
  }
  const g = guion(v.modo, v.tipo);
  escena.fijar("animando", { duracion: duracionGuion(g) });
  titulo.textContent = `Ronda ${v.ronda}`; rev.hidden = true; $("#lienzo-ev").hidden = false;
  let ultimo = -1;
  const paso = (i) => { if (i !== ultimo) { ultimo = i; sub.textContent = g[i].texto; } };
  paso(0);
  g.forEach((p, i) => { if (i) temporizadores.push(setTimeout(() => paso(i), p.ini)); });
  programarInterrupcion();
}

/** 90 s en «animando» sin revelado → se avisa que el sorteo se interrumpió (la siguiente ronda lo reemplaza). */
function programarInterrupcion() {
  temporizadores.push(setTimeout(() => mostrar({ t: TEXTOS.interrumpido, escenaModo: "calma" }), UMBRAL_INTERRUMPIDO_MS));
}

function pintarRevelado(v) {
  limpiarTemporizadores();
  mostrar({ t: `Ronda ${v.ronda}`, reveladoVisible: true });
  $("#mascara-ev").textContent = v.ganadorMascara; $("#tipo-ev").textContent = v.tarjeta;
}

function alSnapshot(snap) {
  const data = snap.exists() ? snap.data() : undefined, v = vistaDe(data);
  const clave = `${v.estado}|${v.ronda ?? ""}|${v.inicioMs ?? ""}|${v.ganadorMascara ?? ""}`;
  const servidor = !snap.metadata.fromCache;
  if (servidor) conexion.hidden = true;
  else if (!navigator.onLine) { conexion.textContent = TEXTOS.sinConexion; conexion.hidden = false; }
  if (clave === claveVista) return;
  claveVista = clave; limpiarTemporizadores();
  if (v.estado === "espera") pintarEspera();
  else if (v.estado === "animando") pintarAnimando(v, primero && llegoTarde(v.inicioMs, Date.now()));
  else pintarRevelado(v);
  if (servidor) primero = false;                 // un snapshot de caché vacía no cuenta como «el primero»
}

// ---- suscripción con reintentos (un error termina el listener: se vuelve a abrir)
let baja = null, reintento = 0;
function suscribir() {
  baja?.();
  baja = onSnapshot(doc(db, "publico", "sorteo"), { includeMetadataChanges: true }, alSnapshot, (err) => {
    console.error("[en vivo] error de la transmisión:", err?.code ?? err?.name ?? "desconocido");
    conexion.textContent = err?.code === "permission-denied" ? TEXTOS.noDisponible : TEXTOS.sinConexion; conexion.hidden = false;
    clearTimeout(reintento); reintento = setTimeout(suscribir, err?.code === "permission-denied" ? 15000 : 5000);
  });
}
window.addEventListener("offline", () => { conexion.textContent = TEXTOS.sinConexion; conexion.hidden = false; });
window.addEventListener("online", () => { conexion.textContent = TEXTOS.reconectando; conexion.hidden = false; });

if (configPendiente) { titulo.textContent = "La transmisión aún no está configurada."; }
else { pintarEspera(); suscribir(); }
