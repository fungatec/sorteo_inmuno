// CONTENIDO CIENTÍFICO: única fuente de verdad de los textos biológicos de la proyección y de la ficha.
// Regla del proyecto: todo texto de la interfaz debe ser biológicamente correcto; ante la duda, usar SOLO lo que
// está aquí y marcar lo incierto con [VERIFICAR] en el README. No añadir datos nuevos sin fuente.
// Módulo puro (sin DOM): se prueba en Node.

/** Subtítulos (máximo 2 líneas y 18 palabras). Clave = escena (o subfase). */
export const SUBTITULOS = {
  E0: "El elenco: células del sistema inmune en un frotis de sangre.",
  E1: "Inmunidad innata: reconoce patrones del patógeno y da la alarma en minutos.",
  E2: "Neutrófilos: los primeros en llegar. Fagocitan, generan especies reactivas de oxígeno y NET.",
  E3: "La célula dendrítica captura el antígeno, madura y viaja al ganglio: une la inmunidad innata con la adaptativa.",
  // El texto original tenía 23 palabras (límite: 18). El «azar» se refiere al ENCUENTRO (motilidad), no a la selección.
  E4: "Cada participante es un linfocito T virgen con TCR único; se encuentra con la célula dendrítica al azar.",
  E4_RONDA: "Una respuesta real es policlonal: otros linfocitos reconocen otros epítopos del mismo patógeno.",
  E5: "Reconocimiento (TCR + MHC), coestimulación (CD28–CD80/86) y citocinas: con las tres, el linfocito se activa.",
  E6_PROLIF: "Con IL-2 y coestimulación, el linfocito prolifera y se diferencia en células efectoras.",
  E6_CD8: "Linfocito T CD8+: mata células infectadas con perforina y granzimas.",
  E6_CD4: "Linfocito T CD4+: coordina la respuesta con citocinas; IFN-γ activa macrófagos.",
  // Versión por defecto (animación resumida E4–E6, máx. 12 palabras, vocabulario sencillo; el término técnico va una sola vez).
  INTRO: "Una infección activó a una célula dendrítica. Llega al ganglio linfático.",
  E4_S: "Cada participante es un linfocito T. La célula dendrítica los recorre.",
  E5_S: "Uno reconoce el antígeno y se activa.",
  E6_S: "El linfocito activado se multiplica y entra en acción.",
};
export const MAX_PALABRAS_SUBTITULO_SIMPLE = 12;

export const MAX_PALABRAS_SUBTITULO = 18;
export const palabras = (texto) => String(texto).trim().split(/\s+/).filter(Boolean).length;

/** Tarjetas de revelado (el nombre enmascarado va debajo, en verde orgánico). */
export const TARJETA = { CD8: "Linfocito T CD8+ activado", CD4: "Linfocito T CD4+ activado" };

/** Tarjetas de la ficha inmunológica: rasgo visual + función. `dibujo` indica qué célula ilustra la miniatura. */
export const FICHA = [
  { id: "neutrofilo", dibujo: "neutrofilo", nombre: "Neutrófilo (polimorfonuclear, granulocito)",
    rasgo: "Núcleo de 3–5 lóbulos, gránulos finos y pálidos.",
    funcion: "40–70 % de los leucocitos; primera célula en llegar al sitio de infección (horas); fagocitosis, NADPH oxidasa (especies reactivas de oxígeno), gránulos con mieloperoxidasa, elastasa y defensinas, y NET." },
  { id: "eosinofilo", dibujo: "eosinofilo", nombre: "Eosinófilo (acidófilo)",
    rasgo: "Núcleo bilobulado, gránulos grandes rojo-anaranjados.",
    funcion: "1–6 %; defensa contra helmintos y papel en alergia; depende de IL-5; proteínas de gránulo (MBP, ECP, EPO)." },
  { id: "basofilo", dibujo: "basofilo", nombre: "Basófilo",
    rasgo: "Núcleo bilobulado tapado por gránulos azul-violeta oscuros.",
    funcion: "<1 %; FcεRI con IgE; liberan histamina, IL-4 e IL-13; respuesta tipo Th2; su equivalente en tejido es el mastocito." },
  { id: "macrofago", dibujo: "macrofago", nombre: "Macrófago",
    rasgo: "Grande, con vacuolas.",
    funcion: "Fagocitosis y presentación de antígeno; el IFN-γ de los Th1 lo activa para destruir patógenos intracelulares." },
  { id: "dc", dibujo: "dc", nombre: "Célula dendrítica",
    rasgo: "Cuerpo irregular con dendritas largas.",
    funcion: "Centinela de los tejidos; captura antígeno, madura por señales de TLR (sube CCR7, MHC y CD80/CD86), migra al ganglio y activa linfocitos T vírgenes; célula presentadora profesional." },
  { id: "tvirgen", dibujo: "linfocito", nombre: "Linfocito T virgen",
    rasgo: "Pequeño, núcleo redondo grande, poco citoplasma.",
    funcion: "TCR único; CD4 reconoce péptido en MHC II y CD8 en MHC I; recircula entre sangre y ganglios; proporción CD4:CD8 ≈ 2:1 en sangre." },
  { id: "cd8", dibujo: "cd8", nombre: "Linfocito T CD8+ (CTL)",
    rasgo: "Marcador CD8.",
    funcion: "Perforina, granzimas, FasL e IFN-γ; elimina células infectadas." },
  { id: "cd4", dibujo: "cd4", nombre: "Linfocito T CD4+ (Th)",
    rasgo: "Marcador CD4.",
    funcion: "Th1 (IFN-γ → macrófagos), Th2 (IL-4/5/13 → eosinófilos, basófilos, IgE), Th17 (IL-17 → neutrófilos), Tfh (ayuda a linfocitos B); también «licencia» a la DC para activar a los CD8." },
];

export const INNATA_ADAPTATIVA = {
  innata: "Rápida (minutos–horas), reconoce patrones moleculares con receptores como los TLR, sin memoria clásica.",
  adaptativa: "Lenta (días), específica por antígeno (TCR y BCR), con memoria.",
};

/** Escenario didáctico (solo en la ficha): infección de un tejido por Listeria monocytogenes (bacilos de ~1–2 µm). */
export const ESCENARIO = "Escenario: infección de un tejido por una bacteria intracelular (modelo: Listeria monocytogenes, bacilos de ~1–2 µm). Eosinófilos y basófilos no participan en esta infección: aparecen solo en el elenco (E0) y en esta ficha.";

export const FUENTES = [
  "Abbas AK, Lichtman AH, Pillai S (2022). Cellular and Molecular Immunology, 10.ª ed.",
  "Murphy K, Weaver C (2022). Janeway's Immunobiology, 10.ª ed.",
  "Banchereau J, Steinman RM (1998). Dendritic cells and the control of immunity. Nature 392:245–252.",
  "Kolaczkowska E, Kubes P (2013). Neutrophil recruitment and function in health and inflammation. Nat Rev Immunol 13:159–175.",
  "Brinkmann V et al. (2004). Neutrophil extracellular traps kill bacteria. Science 303:1532–1535.",
  "Rosenberg HF, Dyer KD, Foster PS (2013). Eosinophils: changing perspectives in health and disease. Nat Rev Immunol 13:9–22.",
  "Voehringer D (2013). Protective and pathological roles of mast cells and basophils. Nat Rev Immunol 13:362–375.",
  "Jenkins MK, Moon JJ (2012). The role of naive T cell precursor frequency and recruitment in dictating immune response magnitude. J Immunol 188:4135–4140.",
];

/** Guion de escenas: duración (ms) y cuánto avanza la barra de tiempo («minutos → horas → días»). */
export const ESCENAS = [
  { id: "E0", dur: 5000, tiempo: [0, 0] },
  { id: "E1", dur: 5000, tiempo: [0.03, 0.3] },     // minutos      (primer tercio de la barra)
  { id: "E2", dur: 5000, tiempo: [0.34, 0.52] },    // horas        (segundo tercio)
  { id: "E3", dur: 4000, tiempo: [0.52, 0.65] },    // horas → ~1 día
  { id: "E4", dur: 5000, tiempo: [0.69, 0.78] },    // días         (tercer tercio)
  { id: "E5", dur: 5000, tiempo: [0.78, 0.88] },
  { id: "E6", dur: 7000, tiempo: [0.88, 1] },
];

/** Etiqueta de la barra de tiempo según el avance. */
export function etiquetaTiempo(v) {
  return v <= 0 ? "" : v < 1 / 3 ? "minutos" : v < 2 / 3 ? "horas" : "días";
}
