// Código QR generado EN EL NAVEGADOR (no se envía ningún dato a terceros): se dibuja en un <canvas> módulo a módulo.
// Usa la librería «qrcode-generator» 1.4.4 (MIT), copiada en js/vendor/ y cargada bajo demanda, desde el mismo sitio,
// solo cuando la admin pulsa «Mostrar códigos QR». No se carga ningún script de terceros. Nunca se usa innerHTML.
export const URL_LIBRERIA_QR = new URL("./vendor/qrcode.js", import.meta.url).href;

let carga = null;
export function cargarLibreriaQR() {
  if (globalThis.qrcode) return Promise.resolve(globalThis.qrcode);
  carga ??= new Promise((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = URL_LIBRERIA_QR;
    s.onload = () => (globalThis.qrcode ? resolver(globalThis.qrcode) : rechazar(new Error("qrcode no disponible")));
    s.onerror = () => { carga = null; rechazar(new Error("no se pudo cargar la librería de QR")); };
    document.head.append(s);
  });
  return carga;
}

/** Dibuja `texto` como QR (corrección M, zona de silencio de 4 módulos) en el canvas, en negro sobre blanco. */
export async function dibujarQR(canvas, texto) {
  const qrcode = await cargarLibreriaQR();
  const q = qrcode(0, "M"); q.addData(texto); q.make();
  const n = q.getModuleCount(), silencio = 4, total = n + 2 * silencio;
  const lado = canvas.width, ctx = canvas.getContext("2d");
  const m = Math.floor(lado / total), margen = Math.floor((lado - m * total) / 2);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(margen + (c + silencio) * m, margen + (r + silencio) * m, m, m);
}
