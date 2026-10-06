// Utilidades mínimas de DOM. Todo el contenido dinámico se inserta con textContent
// (nunca innerHTML) para que nombres o correos no puedan inyectar HTML.
export const $ = (sel, raiz = document) => raiz.querySelector(sel);

/** h("div", {class:"x", onclick: fn}, "texto", otroNodo) */
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) {
      if (typeof v !== "function") throw new TypeError(`h(): el manejador ${k} debe ser una función`);
      el.addEventListener(k.slice(2), v);
    } else if (k === "class") el.className = v;
    else {
      // Defensa en profundidad: ni srcdoc ni URLs javascript: aunque algún día un dato llegara a un atributo.
      if (k === "srcdoc" || (["href", "src", "action", "formaction"].includes(k) && /^\s*javascript:/i.test(String(v)))) throw new TypeError(`h(): atributo ${k} no permitido`);
      el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const hijo of hijos.flat()) if (hijo != null && hijo !== false) el.append(hijo);
  return el;
}

/** Muestra un aviso en un contenedor con role="status"/"alert". tipo: info | error | exito | aviso */
export function aviso(el, texto, tipo = "info") {
  el.textContent = texto || "";
  el.className = texto ? `aviso aviso-${tipo}` : "aviso";
  el.hidden = !texto;
  el.setAttribute("role", tipo === "error" ? "alert" : "status");
}

export function avisoConfigPendiente(contenedor) {
  contenedor.prepend(h("p", { class: "aviso aviso-aviso", role: "alert" },
    "Configuración de Firebase pendiente: pega tu firebaseConfig en js/firebase-config.js."));
}

export const fechaCorta = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * Validación en vivo: el mensaje aparece bajo el campo (#<id>-error) tras la primera salida del
 * campo y se actualiza en cada tecla. Devuelve { validar() } para forzarla al enviar.
 */
export function validarEnVivo(input, validador) {
  const salida = document.getElementById(`${input.id}-error`);
  let tocado = false;
  const pintar = () => {
    const error = validador(input.value);
    salida.textContent = tocado ? error : "";
    salida.hidden = !(tocado && error);
    input.setAttribute("aria-invalid", String(tocado && !!error));
    return error;
  };
  input.addEventListener("blur", () => { tocado = true; pintar(); });
  input.addEventListener("input", () => { if (tocado) pintar(); });
  return { validar: () => { tocado = true; return pintar(); }, reiniciar: () => { tocado = false; pintar(); } };
}
