// Lógica pura de comandos: parseo, cooldowns y anti-spam.
// No conoce el juego: recibe siempre el tiempo actual (ms de reloj de juego).

/** Quita tildes para que "!café" y "!cafe" sean lo mismo. */
function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Convierte un texto de chat en comando.
 * Con signo:    "  !TURBO  ya " -> { cmd: 'turbo', args: ['ya'] }
 * Sin signo:    "balde" / "CAFE" -> { cmd: 'balde', args: [] }  (si está en cmdsSinExclamacion)
 * Devuelve null si no es comando.
 *
 * @param {string} texto
 * @param {Set<string>} [cmdsSinExclamacion] - conjunto de comandos que se aceptan sin "!"
 */
export function parsearComando(texto, cmdsSinExclamacion = new Set()) {
  if (typeof texto !== 'string') return null;
  const limpio = quitarTildes(texto.trim().toLowerCase()).replace(/\s+/g, ' ');

  // Con signo "!" (comportamiento original)
  const mExcl = limpio.match(/^!\s?([a-z0-9]+)(?:\s+(.*))?$/);
  if (mExcl) return { cmd: mExcl[1], args: mExcl[2] ? mExcl[2].split(' ') : [] };

  // Sin signo "!": solo si el mensaje es EXACTAMENTE la palabra del comando sola
  // (sin texto antes ni después), para evitar falsos positivos en frases normales.
  // "balde" → ok; "balde de agua" → NO; "oye balde" → NO.
  const mSimple = limpio.match(/^([a-z0-9]+)$/);
  if (mSimple && cmdsSinExclamacion.has(mSimple[1])) {
    return { cmd: mSimple[1], args: [] };
  }

  return null;
}

/** Cooldowns de dos tipos: GLOBAL (todo el chat) y POR USUARIO. Guarda instantes de expiración. */
export class Cooldowns {
  constructor() {
    this.global = new Map();   // cmd -> expira
    this.usuario = new Map();  // `${cmd}|${userId}` -> expira
  }

  /** Tiempo restante (ms) y qué cooldown bloquea. ms = 0 si está libre. */
  restante(cmd, userId, ahora) {
    const g = Math.max(0, (this.global.get(cmd) ?? 0) - ahora);
    const u = Math.max(0, (this.usuario.get(`${cmd}|${userId}`) ?? 0) - ahora);
    if (g === 0 && u === 0) return { tipo: null, ms: 0 };
    return g >= u ? { tipo: 'global', ms: g } : { tipo: 'usuario', ms: u };
  }

  restanteGlobal(cmd, ahora) {
    return Math.max(0, (this.global.get(cmd) ?? 0) - ahora);
  }

  /** Marca el uso de un comando. */
  registrar(cmd, userId, ahora, { globalMs = 0, usuarioMs = 0 } = {}) {
    if (globalMs > 0) this.global.set(cmd, ahora + globalMs);
    if (usuarioMs > 0) this.usuario.set(`${cmd}|${userId}`, ahora + usuarioMs);
  }

  /** Borra entradas vencidas para no acumular memoria. */
  purgar(ahora) {
    for (const [k, v] of this.usuario) if (v <= ahora) this.usuario.delete(k);
    for (const [k, v] of this.global) if (v <= ahora) this.global.delete(k);
  }

  limpiar() {
    this.global.clear();
    this.usuario.clear();
  }
}

/**
 * Anti-spam: más de `maxMensajes` dentro de `ventanaMs` => silencio de `silencioMs`.
 * registrar() devuelve 'ok' | 'silenciado' (ya estaba castigado) | 'nuevoSilencio'.
 */
export class AntiSpam {
  constructor({ maxMensajes = 4, ventanaMs = 10000, silencioMs = 30000 } = {}) {
    this.maxMensajes = maxMensajes;
    this.ventanaMs = ventanaMs;
    this.silencioMs = silencioMs;
    this.historial = new Map();   // userId -> [tiempos]
    this.silenciados = new Map(); // userId -> hasta
  }

  registrar(userId, ahora) {
    const hasta = this.silenciados.get(userId);
    if (hasta !== undefined) {
      if (ahora < hasta) return 'silenciado';
      this.silenciados.delete(userId);
    }
    const lista = (this.historial.get(userId) ?? []).filter((t) => ahora - t < this.ventanaMs);
    lista.push(ahora);
    if (lista.length > this.maxMensajes) {
      this.silenciados.set(userId, ahora + this.silencioMs);
      this.historial.delete(userId);
      return 'nuevoSilencio';
    }
    this.historial.set(userId, lista);
    return 'ok';
  }

  estaSilenciado(userId, ahora) {
    const hasta = this.silenciados.get(userId);
    return hasta !== undefined && ahora < hasta;
  }

  purgar(ahora) {
    for (const [u, lista] of this.historial) {
      if (!lista.length || ahora - lista[lista.length - 1] >= this.ventanaMs) this.historial.delete(u);
    }
    for (const [u, hasta] of this.silenciados) if (ahora >= hasta) this.silenciados.delete(u);
  }
}
