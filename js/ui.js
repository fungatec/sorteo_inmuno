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

/** Descarga un texto como archivo. Lanza si el navegador no pudo iniciar la descarga (no puede confirmar que el usuario lo guardó). */
export function descargarArchivo(nombre, texto) {
  const enlace = h("a", { href: URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" })), download: nombre });
  document.body.append(enlace);
  try { enlace.click(); } finally { enlace.remove(); }
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
}

export function avisoConfigPendiente(contenedor) {
  contenedor.prepend(h("p", { class: "aviso aviso-aviso", role: "alert" },
    "Configuración de Firebase pendiente: pega tu firebaseConfig en js/firebase-config.js."));
}

export const fechaCorta = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * Validación del campo: el mensaje aparece bajo el campo (#<id>-error) al SALIR del campo y al enviar, no en cada tecla.
 * Mientras se escribe solo se retira un error ya mostrado en cuanto el valor pasa a ser válido (nunca aparece uno nuevo).
 * Devuelve { validar() } para forzarla al enviar.
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
  input.addEventListener("input", () => { if (tocado && !salida.hidden && !validador(input.value)) pintar(); });
  return { validar: () => { tocado = true; return pintar(); }, reiniciar: () => { tocado = false; pintar(); } };
}

/** Copia texto al portapapeles (con alternativa para navegadores sin la API o sin HTTPS). Devuelve true si se copió. */
export async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* se prueba la alternativa */ }
  try {
    const t = document.createElement("textarea");
    t.value = texto; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); return ok;
  } catch { return false; }
}

/** Botón con estado de copiado: cambia su texto un instante («Copiado») y lo restaura. */
export function marcarCopiado(boton, textoCopiado = "Copiado ✓", ms = 2000) {
  const original = boton.dataset.original ?? boton.textContent;
  boton.dataset.original = original;
  boton.textContent = textoCopiado;
  clearTimeout(boton._tCopiado);
  boton._tCopiado = setTimeout(() => { boton.textContent = original; }, ms);
}
