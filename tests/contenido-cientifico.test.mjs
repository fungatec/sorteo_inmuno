// Ejecutar: node tests/contenido-cientifico.test.mjs
import assert from "node:assert/strict";
import { SUBTITULOS, MAX_PALABRAS_SUBTITULO, MAX_PALABRAS_SUBTITULO_SIMPLE, palabras, FICHA, INNATA_ADAPTATIVA, FUENTES, ESCENAS, etiquetaTiempo, TARJETA } from "../js/contenido-cientifico.js";

for (const [k, t] of Object.entries(SUBTITULOS)) {
  assert.ok(palabras(t) <= MAX_PALABRAS_SUBTITULO, `${k}: ${palabras(t)} palabras > ${MAX_PALABRAS_SUBTITULO}`);
  assert.ok(t.length <= 135, `${k}: ${t.length} caracteres (no cabe en 2 líneas)`);
}
assert.equal(Object.keys(SUBTITULOS).length, 14);
for (const k of ["INTRO", "E4_S", "E5_S", "E6_S"]) assert.ok(palabras(SUBTITULOS[k]) <= MAX_PALABRAS_SUBTITULO_SIMPLE, `${k}: ${palabras(SUBTITULOS[k])} palabras > ${MAX_PALABRAS_SUBTITULO_SIMPLE}`);
assert.equal(SUBTITULOS.INTRO, "Una infección activó a una célula dendrítica. Llega al ganglio linfático.");
assert.equal(SUBTITULOS.E5_S, "Uno reconoce el antígeno y se activa.");
assert.ok(!/mueren|desaparecen/i.test(JSON.stringify(SUBTITULOS)), "los no elegidos no mueren ni desaparecen");
// Frases exactas que pidió el inmunólogo (las demás se acortaron o reformularon solo por el límite de palabras)
assert.equal(SUBTITULOS.E1, "Inmunidad innata: reconoce patrones del patógeno y da la alarma en minutos.");
assert.equal(SUBTITULOS.E6_CD8, "Linfocito T CD8+: mata células infectadas con perforina y granzimas.");
assert.equal(SUBTITULOS.E6_CD4, "Linfocito T CD4+: coordina la respuesta con citocinas; IFN-γ activa macrófagos.");
assert.equal(TARJETA.CD8, "Linfocito T CD8+ activado"); assert.equal(TARJETA.CD4, "Linfocito T CD4+ activado");
// Exactitud: eosinófilos y basófilos NO aparecen en los subtítulos de la infección (solo en E0 y la ficha)
for (const [k, t] of Object.entries(SUBTITULOS)) if (k !== "E0") assert.ok(!/eosin[óo]filo|bas[óo]filo/i.test(t), k);
// Ficha: 8 tarjetas con rasgo y función; ninguna cifra inventada (las del contenido original se conservan)
assert.equal(FICHA.length, 8);
for (const f of FICHA) { assert.ok(f.nombre && f.rasgo && f.funcion && f.dibujo, f.id); }
assert.match(FICHA.find((f) => f.id === "neutrofilo").funcion, /40–70 %/);
assert.match(FICHA.find((f) => f.id === "tvirgen").funcion, /≈ 2:1/);
assert.ok(!/10\^5|\[VERIFICAR\]/.test(JSON.stringify(FICHA) + JSON.stringify(INNATA_ADAPTATIVA)), "la frecuencia de precursores [VERIFICAR] no se muestra en la interfaz");
assert.equal(FUENTES.length, 8);
// Escenas: duraciones del guion
const d = Object.fromEntries(ESCENAS.map((e) => [e.id, e.dur / 1000]));
assert.deepEqual(d, { E0: 5, E1: 5, E2: 5, E3: 4, E4: 5, E5: 5, E6: 7 });
assert.ok(ESCENAS.filter((e) => e.id !== "E0").reduce((s, e) => s + e.dur, 0) === 31000, "E1–E6 = 31 s; con E0, 36 s");
assert.ok(ESCENAS.filter((e) => ["E4", "E5", "E6"].includes(e.id)).reduce((s, e) => s + e.dur, 0) === 17000, "nuevas rondas ≈ 16–17 s");
assert.deepEqual([0.1, 0.2, 0.5, 0.7, 0.95].map(etiquetaTiempo), ["minutos", "minutos", "horas", "días", "días"]);
console.log("contenido-cientifico: ok");
