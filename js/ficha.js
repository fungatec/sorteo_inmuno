// Ficha inmunológica: panel superpuesto (tecla I) con una tarjeta por célula (rasgo visual + función) y la tarjeta
// «Innata vs. adaptativa». El contenido sale SOLO de contenido-cientifico.js. Las miniaturas se dibujan con el mismo código
// que la animación (celulas.js). Todo el texto se inserta con textContent (vía h()).
import { h } from "./ui.js";
import { FICHA, INNATA_ADAPTATIVA, ESCENARIO, FUENTES } from "./contenido-cientifico.js";
import { COLOR as C, neutrofilo, eosinofilo, basofilo, macrofago, celulaDendritica, linfocito } from "./celulas.js";

function miniatura(canvas, id) {
  const ctx = canvas.getContext("2d"), S = canvas.width, c = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.font = "700 15px Montserrat, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = C.celeste;
  switch (id) {
    case "neutrofilo": neutrofilo(ctx, c, c, 36, { lobulos: 4, rot: 0.3 }); break;
    case "eosinofilo": eosinofilo(ctx, c, c, 40); break;
    case "basofilo": basofilo(ctx, c, c, 40); break;
    case "macrofago": macrofago(ctx, c, c, 36, { t: 400, fase: 1 }); break;
    case "dc": celulaDendritica(ctx, c, c, 21, { t: 400, madurez: 0.9, fase: 0.4 }); break;
    case "linfocito": linfocito(ctx, c, c, 30); break;
    case "cd8": linfocito(ctx, c, c - 6, 28, { activado: true, anillo: C.blanco }); ctx.fillText("CD8", c, S - 8); break;
    case "cd4": linfocito(ctx, c, c - 6, 28, { activado: true, anillo: C.cielo }); ctx.fillText("CD4", c, S - 8); break;
    default: break;
  }
}

/** Construye la ficha dentro de `raiz` y devuelve { abrir, cerrar, alternar, abierta }. */
export function crearFicha({ raiz, bloquear = [], alCambiar = () => {} }) {
  const cierre = h("button", { type: "button", class: "secundario", id: "cerrar-ficha" }, "Cerrar (I)");
  const rejilla = h("div", { class: "ficha-rejilla" }, FICHA.map((f) => {
    const lienzo = h("canvas", { width: "120", height: "120", "aria-hidden": "true" });
    setTimeout(() => miniatura(lienzo, f.dibujo), 0);
    return h("article", { class: "tarjeta-celula" }, lienzo,
      h("h3", {}, f.nombre),
      h("p", {}, h("b", {}, "Rasgo visual: "), f.rasgo),
      h("p", {}, h("b", {}, "Función: "), f.funcion));
  }));
  const comparativa = h("article", { class: "tarjeta-celula tarjeta-comp" },
    h("h3", {}, "Innata vs. adaptativa"),
    h("div", { class: "dos" },
      h("div", {}, h("h4", {}, "Inmunidad innata"), h("p", {}, INNATA_ADAPTATIVA.innata)),
      h("div", {}, h("h4", {}, "Inmunidad adaptativa"), h("p", {}, INNATA_ADAPTATIVA.adaptativa))));
  const panel = h("div", { class: "ficha", id: "ficha", role: "dialog", "aria-modal": "true", "aria-labelledby": "ficha-titulo", hidden: true },
    h("div", { class: "ficha-cuerpo" },
      h("header", { class: "ficha-cabecera" }, h("h2", { id: "ficha-titulo" }, "Ficha inmunológica"), cierre),
      h("p", { class: "suave" }, ESCENARIO),
      rejilla, comparativa,
      h("details", { class: "ficha-fuentes" }, h("summary", {}, "Fuentes"), h("ol", {}, FUENTES.map((f) => h("li", {}, f))))));
  raiz.append(panel);

  let previo = null;
  const abierta = () => !panel.hidden;
  function abrir() {
    if (abierta()) return;
    previo = document.activeElement; panel.hidden = false;
    bloquear.forEach((el) => { el.inert = true; });
    panel.scrollTop = 0; cierre.focus(); alCambiar(true);
  }
  function cerrar() {
    if (!abierta()) return;
    panel.hidden = true; bloquear.forEach((el) => { el.inert = false; });
    previo?.focus?.(); alCambiar(false);
  }
  const alternar = () => (abierta() ? cerrar() : abrir());
  cierre.addEventListener("click", cerrar);
  panel.addEventListener("keydown", (e) => {                       // Esc cierra; Tab no sale del panel
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
    if (e.key !== "Tab") return;
    const f = [...panel.querySelectorAll("button, summary, [href], [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  });
  return { abrir, cerrar, alternar, get abierta() { return abierta(); } };
}
