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
  constructor(frases, rng = Math.random, { config = {}, generador = null } = {}) {
    this.cfg = config;
    this.generador = generador;
    this.pendientes = 0;
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

  /** Enchufe asíncrono opcional: solo charla permitida; las reacciones usan frase() siempre. */
  async generate(evento, vars = {}) {
    const plantilla = this.frase(evento, vars);
    if (!this.cfg.activo || !this.generador || !plantilla ||
        !this.cfg.eventosPermitidos?.includes(evento) || this.pendientes >= this.cfg.maxPendientes) return plantilla;
    const abortar = new AbortController();
    let timer;
    this.pendientes++;
    try {
      const timeout = new Promise(resolve => {
        timer = setTimeout(() => { abortar.abort(); resolve(null); }, this.cfg.timeoutMs);
      });
      const generado = Promise.resolve().then(() => this.generador({ evento, vars: { ...vars }, plantilla, signal: abortar.signal }));
      const texto = await Promise.race([generado, timeout]);
      return typeof texto === 'string' && texto.trim() && texto.trim().length <= this.cfg.maxCaracteres && !/[<>{}]/u.test(texto)
        ? texto.trim() : plantilla;
    } catch { return plantilla; }
    finally { clearTimeout(timer); this.pendientes--; }
  }
}
