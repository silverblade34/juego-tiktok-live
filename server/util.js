// Utilidades compartidas del servidor: RNG con semilla y helpers pequeños.

/** RNG determinista (mulberry32). Devuelve una función que da números en [0, 1). */
export function crearRng(semilla = Date.now()) {
  let a = semilla >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elige un elemento al azar de una lista. */
export const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];

/** Número al azar en [a, b). */
export const entre = (rng, a, b) => a + rng() * (b - a);

/** Limpia un nombre visible: sin caracteres de control y con largo máximo. */
export function limpiarNombre(nombre, max = 18) {
  const limpio = String(nombre ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return limpio.slice(0, max) || 'anónimo';
}
