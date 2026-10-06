// Ejecutar: node tests/en-vivo-util.test.mjs
import assert from "node:assert/strict";
import { urlTransmision, guion, duracionGuion, pasoEn, vistaDe, llegoTarde, estaInterrumpido, TEXTOS, MAX_MASCARA } from "../js/en-vivo-util.js";
import { SUBTITULOS, palabras } from "../js/contenido-cientifico.js";

assert.equal(urlTransmision("https://fungatec.github.io/sorteo_inmuno/sorteo.html?emulador&modo=completo#x"), "https://fungatec.github.io/sorteo_inmuno/en-vivo.html");
assert.equal(urlTransmision("http://localhost:8000/panel.html"), "http://localhost:8000/en-vivo.html");

// El guion del espectador usa los mismos textos que la proyección y las mismas duraciones.
const r = guion("resumido", "CD8"), c = guion("completo", "CD4");
assert.deepEqual(r.map((p) => p.texto), [SUBTITULOS.INTRO, SUBTITULOS.E4_S, SUBTITULOS.E5_S, SUBTITULOS.E6_S]);
assert.equal(duracionGuion(r), 18000);
assert.deepEqual(c.map((p) => p.texto), [SUBTITULOS.E1, SUBTITULOS.E2, SUBTITULOS.E3, SUBTITULOS.E4, SUBTITULOS.E5, SUBTITULOS.E6_PROLIF, SUBTITULOS.E6_CD4]);
assert.equal(duracionGuion(c), 31000);
assert.equal(guion("completo", "CD8").at(-1).texto, SUBTITULOS.E6_CD8);
for (const g of [r, c]) for (const p of g) assert.ok(p.texto && palabras(p.texto) <= 18, p.clave);
assert.equal(pasoEn(r, 0).indice, 0); assert.equal(pasoEn(r, 3000).indice, 1); assert.equal(pasoEn(r, 6999).indice, 1);
assert.equal(pasoEn(r, 7000).indice, 2); assert.equal(pasoEn(r, 11000).indice, 3); assert.equal(pasoEn(r, 99999).indice, 3);

// vistaDe: defensivo; nunca expone nada más que la máscara en «revelado»
assert.deepEqual(vistaDe(undefined), { estado: "espera" });
assert.deepEqual(vistaDe({ estado: "espera" }), { estado: "espera" });
assert.deepEqual(vistaDe({ estado: "raro" }), { estado: "espera" });
const t = { toMillis: () => 1234 };
assert.deepEqual(vistaDe({ estado: "animando", ronda: 2, modo: "completo", tipo: "CD4", inicio: t }), { estado: "animando", ronda: 2, modo: "completo", tipo: "CD4", inicioMs: 1234 });
assert.deepEqual(vistaDe({ estado: "animando", ronda: "x", modo: "otro", tipo: "otro", ganadorMascara: "Ana L.", ganadorClave: "lopez-ana" }),
  { estado: "animando", ronda: 1, modo: "resumido", tipo: "CD8", inicioMs: null }, "en «animando» se ignora cualquier máscara o clave");
const v = vistaDe({ estado: "revelado", ronda: 3, modo: "resumido", tipo: "CD4", inicio: t, ganadorMascara: "Marta E. R. V. S.", ganadorClave: "x-y", nombre: "Nombre Completo" });
assert.deepEqual(v, { estado: "revelado", ronda: 3, modo: "resumido", tipo: "CD4", inicioMs: 1234, ganadorMascara: "Marta E. R. V. S.", tarjeta: "Linfocito T CD4+ activado" });
assert.ok(!("ganadorClave" in v) && !("nombre" in v));
assert.deepEqual(vistaDe({ estado: "revelado", ronda: 1, modo: "resumido", tipo: "CD8" }), { estado: "espera" }, "revelado sin máscara = espera");
assert.equal(vistaDe({ estado: "revelado", ronda: 1, tipo: "CD8", ganadorMascara: "A".repeat(200) }).ganadorMascara.length, MAX_MASCARA);

assert.equal(llegoTarde(1000, 4999), false); assert.equal(llegoTarde(1000, 5001), true); assert.equal(llegoTarde(null, 9e9), false);
assert.equal(estaInterrumpido(0, 89999), false); assert.equal(estaInterrumpido(0, 90001), true);
assert.ok(TEXTOS.interrumpido.includes("El sorteo se interrumpió; espera la siguiente ronda."));
console.log("en-vivo-util: ok");
