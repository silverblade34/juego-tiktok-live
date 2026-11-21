// Narrador por plantillas: elige una frase al azar del evento, sin repetir la última,
// y rellena variables {nombre}, {seg}, etc.

/** Reemplaza {clave} por vars.clave (deja la marca si falta la variable). */
export function rellenar(plantilla, vars = {}) {
  return plantilla.replace(/\{(\w+)\}/g, (marca, clave) => (vars[clave] ?? marca).toString());
}

export class Narrador {
  /**
   * @param {object} frases  mapa evento -> [plantillas]
   * @param {() => number} rng
   */
  constructor(frases, rng = Math.random) {
    this.frases = frases;
    this.rng = rng;
    this.ultima = new Map(); // evento -> índice usado la última vez
  }

  /** Frase lista para mostrar, o null si el evento no existe. */
  frase(evento, vars = {}) {
    const lista = this.frases[evento];
    if (!Array.isArray(lista) || lista.length === 0) return null;
    let i = 0;
    if (lista.length > 1) {
      const anterior = this.ultima.get(evento);
      do { i = Math.floor(this.rng() * lista.length); } while (i === anterior);
    }
    this.ultima.set(evento, i);
    return rellenar(lista[i], vars);
  }

  /** Texto corto para el feed (frases.feed[clave]). */
  feed(clave, vars = {}) {
    const p = this.frases.feed?.[clave];
    return p ? rellenar(p, vars) : null;
  }

  /**
   * Fase 7: punto de enchufe para IA + voz. Hoy devuelve la plantilla.
   * La versión IA deberá respetar un timeout y caer a la plantilla si falla.
   */
  async generate(evento, vars = {}) {
    return this.frase(evento, vars);
  }
}
