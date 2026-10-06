// URL pública del registro (la raíz del sitio, sin query ni hash). La de la transmisión está en en-vivo-util.js.
export function urlRegistro(href) {
  const u = new URL("./", href);
  u.search = ""; u.hash = "";
  return u.href;
}
