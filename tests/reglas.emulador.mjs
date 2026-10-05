// Pruebas de firestore.rules con el emulador (batches reales, serverTimestamp incluido).
// Requiere Java y: npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
// Uso:  npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";

const ADMIN_UID = "i0y2lNrbtRed5L7dTIUFTLSKeQr1";
const env = await initializeTestEnvironment({
  projectId: "sorteoinmuno",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
});
let fallos = 0, total = 0;
const prueba = async (nombre, fn) => {
  total++;
  try { await fn(); console.log("ok   ", nombre); }
  catch (e) { fallos++; console.log("FALLA", nombre, "\n     ", String(e.message).split("\n")[0]); }
};

async function sembrar({ abierto = true } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "admins", ADMIN_UID), { activo: true });
    await setDoc(doc(db, "config", "estado"), { registroAbierto: abierto });
    await setDoc(doc(db, "lista", "gomez-jonathan-peregrina"), { nombre: "Jonathan Gómez Peregrina" });
    await setDoc(doc(db, "lista", "lopez-maria"), { nombre: "María López" });
    // Ya registrada: María, con su correo.
    await setDoc(doc(db, "participantes", "lopez-maria"), { nombre: "María López", clave: "lopez-maria",
      correo: "maria.lopez@alumnos.udg.mx", origen: "registro", creadoEn: Timestamp.now() });
    await setDoc(doc(db, "correos", "maria.lopez@alumnos.udg.mx"), { clave: "lopez-maria" });
  });
}
const publico = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext(ADMIN_UID).firestore();
const otro = () => env.authenticatedContext("uid-cualquiera").firestore();

function registrar(db, { clave, nombre, correo, origen = "registro", extraP = {}, claveCorreo = clave }) {
  const b = writeBatch(db);
  b.set(doc(db, "participantes", clave), { nombre, clave, correo, origen, creadoEn: serverTimestamp(), ...extraP });
  b.set(doc(db, "correos", correo), { clave: claveCorreo });
  return b.commit();
}
const JON = { clave: "gomez-jonathan-peregrina", nombre: "Jonathan Gómez Peregrina", correo: "jonathan.gomez4016@alumnos.udg.mx" };

await sembrar();
await prueba("público: registro válido (nombre en lista)", async () => assertSucceeds(registrar(publico(), JON)));
await sembrar();
await prueba("público: nombre fuera de lista", () => assertFails(registrar(publico(), { clave: "perez-pedro", nombre: "Pedro Pérez", correo: "pedro@alumnos.udg.mx" })));
await prueba("público: correo @gmail", () => assertFails(registrar(publico(), { ...JON, correo: "jonathan@gmail.com" })));
await prueba("público: correo con mayúsculas/espacios", () => assertFails(registrar(publico(), { ...JON, correo: "Jonathan@alumnos.udg.mx" })));
await prueba("público: duplicado por nombre", () => assertFails(registrar(publico(), { clave: "lopez-maria", nombre: "María López", correo: "otra@alumnos.udg.mx" })));
await prueba("público: duplicado por correo", () => assertFails(registrar(publico(), { ...JON, correo: "maria.lopez@alumnos.udg.mx" })));
await prueba("público: origen = admin", () => assertFails(registrar(publico(), { ...JON, origen: "admin" })));
await prueba("público: campo extra", () => assertFails(registrar(publico(), { ...JON, extraP: { x: 1 } })));
await prueba("público: nombre de 4 caracteres", () => assertFails(registrar(publico(), { ...JON, nombre: "Jona" })));
await prueba("público: correo apunta a otra clave", () => assertFails(registrar(publico(), { ...JON, claveCorreo: "lopez-maria" })));
await prueba("público: participante sin su correo (sin batch pareado)", () => assertFails(
  setDoc(doc(publico(), "participantes", JON.clave), { nombre: JON.nombre, clave: JON.clave, correo: JON.correo, origen: "registro", creadoEn: serverTimestamp() })));
await prueba("público: correo sin participante", () => assertFails(setDoc(doc(publico(), "correos", JON.correo), { clave: JON.clave })));
await prueba("público: creadoEn manipulado", () => assertFails((() => {
  const db = publico(); const b = writeBatch(db);
  b.set(doc(db, "participantes", JON.clave), { ...JON, origen: "registro", creadoEn: Timestamp.fromDate(new Date(2020, 0, 1)) });
  b.set(doc(db, "correos", JON.correo), { clave: JON.clave }); return b.commit(); })()));
await prueba("público: ID distinto del campo clave", () => assertFails((() => {
  const db = publico(); const b = writeBatch(db);
  b.set(doc(db, "participantes", JON.clave), { ...JON, clave: "otra-clave", origen: "registro", creadoEn: serverTimestamp() });
  b.set(doc(db, "correos", JON.correo), { clave: JON.clave }); return b.commit(); })()));
await prueba("público: no puede editar participante existente", () => assertFails(setDoc(doc(publico(), "participantes", "lopez-maria"), { nombre: "Hack Hack", clave: "lopez-maria", correo: "maria.lopez@alumnos.udg.mx", origen: "registro", creadoEn: serverTimestamp() })));
await prueba("público: no puede borrar", () => assertFails(deleteDoc(doc(publico(), "participantes/lopez-maria"))));
for (const col of ["lista/lopez-maria", "participantes/lopez-maria", "correos/maria.lopez@alumnos.udg.mx", "sorteos/x", "admins/" + ADMIN_UID])
  await prueba(`público: no lee ${col}`, () => assertFails(getDoc(doc(publico(), col))));
await prueba("público: SÍ lee config/estado", () => assertSucceeds(getDoc(doc(publico(), "config/estado"))));
await prueba("público: no escribe config/estado", () => assertFails(setDoc(doc(publico(), "config/estado"), { registroAbierto: true })));
await prueba("no-admin autenticado: no lee participantes", () => assertFails(getDoc(doc(otro(), "participantes/lopez-maria"))));
await prueba("no-admin autenticado: no escribe lista", () => assertFails(setDoc(doc(otro(), "lista/x-y"), { nombre: "Xxxxx Yyyyy" })));
await prueba("no-admin autenticado: no se autoasigna admin", () => assertFails(setDoc(doc(otro(), "admins/uid-cualquiera"), { a: 1 })));

await sembrar({ abierto: false });
await prueba("registro cerrado: público no puede registrarse", () => assertFails(registrar(publico(), JON)));
await prueba("registro cerrado: admin SÍ puede alta manual", () => assertSucceeds(registrar(admin(), { ...JON, origen: "admin" })));

await sembrar();
await prueba("admin: lee participantes, correos, lista, sorteos", async () => {
  for (const p of ["participantes/lopez-maria", "correos/maria.lopez@alumnos.udg.mx", "lista/lopez-maria", "admins/" + ADMIN_UID])
    await assertSucceeds(getDoc(doc(admin(), p)));
});
await prueba("admin: alta manual fuera de lista con origen=admin", () => assertSucceeds(registrar(admin(), { clave: "perez-pedro", nombre: "Pedro Pérez", correo: "pedro@alumnos.udg.mx", origen: "admin" })));
await prueba("admin: alta manual con origen=registro es rechazada", () => assertFails(registrar(admin(), { clave: "perez-pedro", nombre: "Pedro Pérez", correo: "pedro@alumnos.udg.mx", origen: "registro" })));
await prueba("admin: alta manual con correo @gmail es rechazada", () => assertFails(registrar(admin(), { clave: "perez-pedro", nombre: "Pedro Pérez", correo: "pedro@gmail.com", origen: "admin" })));
await prueba("admin: alta manual duplicada por nombre es rechazada", () => assertFails(registrar(admin(), { clave: "lopez-maria", nombre: "María López", correo: "nueva@alumnos.udg.mx", origen: "admin" })));
await prueba("admin: borra participante y correo en batch", async () => {
  const db = admin(); const b = writeBatch(db);
  b.delete(doc(db, "participantes", "lopez-maria")); b.delete(doc(db, "correos", "maria.lopez@alumnos.udg.mx"));
  await assertSucceeds(b.commit());
});
await prueba("admin: crea/edita/borra lista", async () => {
  await assertSucceeds(setDoc(doc(admin(), "lista", "ruiz-ana"), { nombre: "Ana Ruiz" }));
  await assertSucceeds(setDoc(doc(admin(), "lista", "ruiz-ana"), { nombre: "Ana Ruiz Díaz" }));
  await assertFails(setDoc(doc(admin(), "lista", "Ruiz Ana"), { nombre: "Ana Ruiz" }));
  await assertFails(setDoc(doc(admin(), "lista", "ruiz-ana"), { nombre: "Ana Ruiz", extra: 1 }));
  await assertSucceeds(deleteDoc(doc(admin(), "lista/ruiz-ana")));
});
await prueba("admin: escribe config/estado (bool) y rechaza otros tipos", async () => {
  await assertSucceeds(setDoc(doc(admin(), "config/estado"), { registroAbierto: false }));
  await assertFails(setDoc(doc(admin(), "config/estado"), { registroAbierto: "si" }));
  await assertFails(setDoc(doc(admin(), "config/otro"), { registroAbierto: true }));
});
await sembrar();
await prueba("admin: crea sorteo válido; rechaza ganador inexistente; no edita", async () => {
  await assertSucceeds(setDoc(doc(admin(), "sorteos/s1"), { fecha: serverTimestamp(), totalParticipantes: 1, ganadorClave: "lopez-maria", ronda: 1 }));
  await assertFails(setDoc(doc(admin(), "sorteos/s2"), { fecha: serverTimestamp(), totalParticipantes: 1, ganadorClave: "nadie-nadie", ronda: 1 }));
  await assertFails(setDoc(doc(admin(), "sorteos/s1"), { fecha: serverTimestamp(), totalParticipantes: 2, ganadorClave: "lopez-maria", ronda: 1 }));
});
await prueba("colección desconocida denegada incluso a admin", () => assertFails(setDoc(doc(admin(), "otra/x"), { a: 1 })));

console.log(`\n${total - fallos}/${total} pruebas de reglas pasaron`);
await env.cleanup();
process.exit(fallos ? 1 : 0);
