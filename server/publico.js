// El público que MIRA (no solo el que comenta): llegadas, conteo de espectadores, cola de saludos,
// apodos chacoteros y "mirones" (gente que entró y no comenta) para que Don Lucho los molestee.
import { elegir } from './util.js';

// Apodos neutros (sirven para cualquiera, no adivinamos género).
const APELLIDOS_COMICOS = [
  'Alimaña', 'Turbo', 'Chancleta', 'Mazamorra', 'Tornillo', 'Cachimbo', 'Pan con Pollo',
  'Rompecombis', 'Sabrosura', 'Papa Rellena', 'Picarón', 'Huaico', 'Anticucho', 'Chalaco de Corazón',
];

/** Primer "nombre" legible de un nickname: "maria_lopez23" -> "Maria". */
export function nombreCorto(nickname) {
  const limpio = String(nickname ?? '').replace(/^@/, '');
  const trozo = limpio.split(/[^a-záéíóúñü]+/i).find((p) => p.length >= 2);
  if (!trozo) return limpio.slice(0, 14) || 'causa';
  const corto = trozo.slice(0, 12).toLowerCase();
  return corto[0].toUpperCase() + corto.slice(1);
}

/** Diminutivo cariñoso a la peruana: Juan->Juanito, Maria->Marita, Carlos->Carlitos, Pedro->Pedrito. */
export function diminutivo(nombre) {
  const n = nombre;
  if (n.length < 3) return n;
  const bajo = n.toLowerCase();
  if (/ito$|ita$|itos$/.test(bajo)) return n;
  if (bajo.endsWith('os')) return n.slice(0, -2) + 'itos';
  if (bajo.endsWith('ia')) return n.slice(0, -2) + 'ita'; // Maria->Marita, Lucia->Lucita
  if (bajo.endsWith('io')) return n.slice(0, -2) + 'ito'; // Mario->Marito
  if (bajo.endsWith('a')) return n.slice(0, -1) + 'ita';
  if (bajo.endsWith('o') || bajo.endsWith('e')) return n.slice(0, -1) + 'ito';
  if (/[aeiouáéíóú]$/.test(bajo)) return n + 'to';
  return n + 'ito';
}

/** Apodo de cómico ambulante: "Juanito Alimaña", "Marita Turbo"... */
export function apodo(nombre, rng = Math.random) {
  return `${diminutivo(nombre)} ${elegir(rng, APELLIDOS_COMICOS)}`;
}

export class Publico {
  /** @param {{config: object, rng: () => number}} deps */
  constructor({ config, rng }) {
    this.cfg = config.publico;
    this.rng = rng;
    this.vistos = new Map(); // userId -> { nombre, corto, apodo, primeraVez, ultimaVez, comento, molestado }
    this.cola = [];
    this.espectadores = 0;
    this.proxSaludo = 0;
    this.proxMiron = this.rango(this.cfg.molestarMironCadaSeg);
  }

  rango([a, b]) {
    return (a + this.rng() * (b - a)) * 1000;
  }

  setEspectadores(n) {
    if (Number.isFinite(n) && n >= 0) this.espectadores = Math.round(n);
  }

  /** Alguien entró al live. Decide si merece saludo y lo encola. */
  alUnirse(t, userId, nickname) {
    const previo = this.vistos.get(userId);
    // Re-entradas seguidas (conexión inestable) no se saludan de nuevo.
    if (previo && t - previo.ultimaVez < this.cfg.ignorarReentradaSeg * 1000) {
      previo.ultimaVez = t;
      return null;
    }
    const corto = nombreCorto(nickname);
    const regreso = !!previo;
    const v = previo ?? { comento: false, molestado: false, primeraVez: t };
    Object.assign(v, { nombre: nickname, corto, apodo: previo?.apodo ?? apodo(corto, this.rng), ultimaVez: t });
    this.vistos.set(userId, v);
    this.limitarMemoria();

    const pocos = this.espectadores < this.cfg.maxEspectadoresParaSaludarTodos;
    if (!pocos && this.rng() >= this.cfg.probSaludoConMuchos) return null;
    if (this.cola.some((s) => s.userId === userId)) return null;
    const item = { userId, nombre: corto, apodo: v.apodo, tipo: regreso ? 'regreso' : 'nuevo', t };
    this.cola.push(item);
    if (this.cola.length > this.cfg.colaMax) this.cola.shift(); // descarta el más viejo
    return item;
  }

  /** Quien comenta deja de ser "mirón". */
  alComentar(t, userId, nickname) {
    const v = this.vistos.get(userId);
    if (v) { v.comento = true; v.ultimaVez = t; return; }
    const corto = nombreCorto(nickname);
    this.vistos.set(userId, { nombre: nickname, corto, apodo: apodo(corto, this.rng), primeraVez: t, ultimaVez: t, comento: true, molestado: false });
  }

  /** Próximo saludo pendiente (sin sacarlo de la cola) si ya toca. */
  siguienteSaludo(t) {
    const maxEdad = this.cfg.saludoMaxEdadSeg * 1000;
    this.cola = this.cola.filter((s) => t - s.t <= maxEdad);
    if (t < this.proxSaludo || this.cola.length === 0) return null;
    return this.cola[0];
  }

  /** Confirma que el saludo se dijo. */
  saludoHecho(t) {
    this.cola.shift();
    this.proxSaludo = t + this.cfg.saludoCadaSeg * 1000;
  }

  /** Un espectador que entró hace rato y no ha comentado, para picarlo. */
  elegirMiron(t) {
    if (t < this.proxMiron) return null;
    this.proxMiron = t + this.rango(this.cfg.molestarMironCadaSeg);
    const minMs = this.cfg.molestarMironTrasSeg * 1000;
    const recienteMs = this.cfg.mironActivoSeg * 1000;
    const candidatos = [...this.vistos.entries()].filter(([, v]) =>
      !v.comento && !v.molestado && t - v.primeraVez >= minMs && t - v.ultimaVez <= recienteMs);
    if (!candidatos.length) return null;
    const [userId, v] = elegir(this.rng, candidatos);
    v.molestado = true;
    return { userId, nombre: v.corto, apodo: v.apodo };
  }

  limitarMemoria() {
    if (this.vistos.size <= 2000) return;
    const viejos = [...this.vistos.entries()].sort((a, b) => a[1].ultimaVez - b[1].ultimaVez).slice(0, 500);
    for (const [k] of viejos) this.vistos.delete(k);
  }
}
