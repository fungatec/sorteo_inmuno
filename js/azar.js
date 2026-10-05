// Aleatoriedad del sorteo: crypto.getRandomValues + muestreo por rechazo (sin sesgo de módulo).
// Nunca Math.random.
const DOS32 = 2 ** 32;

/** Entero uniforme en [0, n). `rng` es inyectable solo para pruebas. */
export function enteroAleatorio(n, rng = globalThis.crypto) {
  if (!Number.isInteger(n) || n < 1 || n > DOS32) throw new RangeError("n fuera de rango");
  const limite = DOS32 - (DOS32 % n); // valores >= limite se rechazan
  const buf = new Uint32Array(1);
  let x;
  do { rng.getRandomValues(buf); x = buf[0]; } while (x >= limite);
  return x % n;
}
