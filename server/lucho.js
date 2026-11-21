// Estado AUTORITATIVO de Don Lucho: pose, acciones puntuales, sueño, paciencia y habla.
// El overlay solo dibuja lo que esto decide.
import { elegir } from './util.js';

/** Prioridades de habla: un mensaje no pisa a otro de prioridad mayor. */
export const PRIORIDAD = { charla: 1, reaccion: 2, importante: 3 };

const ACCIONES_IDLE = ['bostezo', 'rascarse', 'golpearMicro'];

export class Lucho {
  /**
   * @param {{config: object, narrador: import('./narrator.js').Narrador, rng: () => number}} deps
   */
  constructor({ config, narrador, rng, escalaTiempo = 1 }) {
    this.cfg = config.lucho;
    this.cfgVoz = config.voz ?? { esperaMaxSeg: 3, colaTrasAudioSeg: 0.5 };
    this.narrador = narrador;
    this.rng = rng;
    this.escalaTiempo = escalaTiempo;
    this.alHablar = null; // callback opcional (texto) para logs de consola
    /** Motor de voz opcional: { pedir(texto, estilo) -> Promise<{url, durMs}> }. Sin él, solo texto. */
    this.voz = null;
    this.tAhora = 0;
    this.seq = 0;
    /** Callback para eventos visuales/sonoros que Lucho dispara solo (p. ej. flatulencia). */
    this.alEvento = null;
    this.preparadas = new Map(); // evento|vars -> texto ya elegido (y con audio en camino)
    this.reset(0);
  }

  reset(t) {
    this.dormido = false;
    this.manta = false;
    this.sustoHasta = 0;
    this.enojadoHasta = 0;
    this.cafeHasta = 0;
    this.mojadoHasta = 0;
    this.ultimaInteraccion = t;
    this.accion = null;
    this.habla = null;
    this.pendiente = null;
    this.paciencia = 0;
    this.avisoPacienciaMedia = false;
    this.ultimoAvisoCooldown = -Infinity;
    this.proxRutina = t + this.rango(this.cfg.charlaCadaSeg);
  }

  /** Milisegundos al azar dentro de un rango [min, max] en segundos. */
  rango([a, b]) {
    return (a + this.rng() * (b - a)) * 1000;
  }

  // ---------------------------------------------------------------- habla

  hablando(t) {
    return !!this.habla && t < this.habla.desde + this.habla.durMs;
  }

  /** Intenta decir un texto. Devuelve true si se mostró. */
  decir(t, texto, prioridad = 'charla') {
    if (!texto) return false;
    const p = PRIORIDAD[prioridad] ?? 1;
    if (this.hablando(t)) {
      const actual = this.habla;
      if (actual.prioridad > p) return false;
      const minMs = this.cfg.hablaMinMostrarSeg * 1000;
      if (actual.prioridad === p && p < PRIORIDAD.importante && t - actual.desde < minMs) return false;
    }
    const rapido = t < this.cafeHasta;
    const id = ++this.seq;
    const durTexto = this.duracionTexto(texto, rapido);
    if (this.voz) {
      // Reserva el turno mientras se genera el audio; la burbuja arranca cuando llega (o al vencer la espera).
      const esperaMs = this.cfgVoz.esperaMaxSeg * 1000 * this.escalaTiempo;
      this.habla = { id, texto, desde: t, durMs: esperaMs + durTexto, prioridad: p, rapido, preparando: true, audio: null };
      const estilo = this.estiloVoz(p, rapido);
      this.voz.pedir(texto, estilo).then((r) => this.alAudioListo(id, r), () => this.alAudioListo(id, null));
    } else {
      this.habla = { id, texto, desde: t, durMs: durTexto, prioridad: p, rapido, preparando: false, audio: null };
    }
    this.alHablar?.(texto);
    return true;
  }

  duracionTexto(texto, rapido) {
    let durMs = (this.cfg.hablaBaseSeg + texto.length * this.cfg.hablaPorCaracterSeg) * 1000;
    if (rapido) durMs *= this.cfg.cafeFactorHabla;
    return durMs;
  }

  /** Estilo de voz según el momento: dormido, con café, gritando o normal. */
  estiloVoz(prioridad, rapido) {
    if (this.dormido) return 'dormido';
    if (rapido) return 'cafe';
    if (prioridad >= PRIORIDAD.importante) return 'grito';
    return 'normal';
  }

  /** Llega el audio (o falla): la frase empieza AHORA y dura lo que dura el audio. */
  alAudioListo(id, r) {
    const h = this.habla;
    if (!h || h.id !== id || !h.preparando) return; // ya la reemplazaron o venció la espera
    h.preparando = false;
    h.desde = this.tAhora;
    if (r) {
      h.audio = r.url;
      // durMs está en tiempo de juego: el audio dura lo mismo en tiempo real.
      h.durMs = (r.durMs + this.cfgVoz.colaTrasAudioSeg * 1000) * this.escalaTiempo;
    } else {
      h.durMs = this.duracionTexto(h.texto, h.rapido);
    }
  }

  /** Si el audio tarda demasiado, Don Lucho habla solo con texto. */
  vencerEsperaAudio(t) {
    const h = this.habla;
    if (!h?.preparando) return;
    if (t - h.desde < this.cfgVoz.esperaMaxSeg * 1000 * this.escalaTiempo) return;
    h.preparando = false;
    h.desde = t;
    h.durMs = this.duracionTexto(h.texto, h.rapido);
  }

  /** Dice una frase del narrador para el evento dado (usa la preparada si existe). */
  narrar(t, evento, vars = {}, prioridad = 'charla') {
    const clave = `${evento}|${JSON.stringify(vars)}`;
    const preparada = this.preparadas.get(clave);
    if (preparada) this.preparadas.delete(clave);
    return this.decir(t, preparada ?? this.narrador.frase(evento, vars), prioridad);
  }

  /**
   * Elige YA la frase de un evento probable (con nombre) y empieza a generar su audio,
   * para que cuando ocurra suene sin espera. Ej.: el ganador cuando el líder se acerca a la meta.
   */
  prepararFrase(evento, vars = {}, estilo = 'normal') {
    const clave = `${evento}|${JSON.stringify(vars)}`;
    if (this.preparadas.has(clave)) return;
    if (this.preparadas.size > 40) this.preparadas.clear();
    const texto = this.narrador.frase(evento, vars);
    this.preparadas.set(clave, texto);
    this.voz?.pedir(texto, estilo).catch(() => {});
  }

  /** Se le escapa una flatulencia (sonido + nubecita en pantalla + excusa). */
  flatulencia(t, inmediata = false) {
    this.alEvento?.('flatulencia');
    if (inmediata) this.narrar(t, 'flatulencia', {}, 'reaccion');
    else this.encolar('flatulencia');
  }

  /** Deja una frase en cola para decirla apenas termine la actual. */
  encolar(evento, vars = {}, prioridad = 'reaccion') {
    this.pendiente = { evento, vars, prioridad };
  }

  // ---------------------------------------------------------------- acciones

  iniciarAccion(t, tipo, durSeg) {
    this.accion = { id: ++this.seq, tipo, desde: t, durMs: durSeg * 1000 };
  }

  duracion(tipo) {
    return this.cfg.duracionAccionesSeg[tipo] ?? 1.5;
  }

  /** ¿Está en medio de una reacción que impide dormirse o hacer rutinas? */
  ocupado(t) {
    return t < this.sustoHasta || t < this.enojadoHasta || t < this.cafeHasta || !!this.accion;
  }

  // ---------------------------------------------------------------- pose

  /** Pose objetivo que el overlay interpolará. */
  pose(t, fase) {
    if (this.accion?.tipo === 'caida') return 'susto';
    if (t < this.sustoHasta) return 'susto';
    if (t < this.enojadoHasta) return 'enojado';
    if (this.dormido) return 'dormido';
    if (t < this.cafeHasta) return 'hiperactivo';
    if (t < this.mojadoHasta) return 'mojado';
    if (fase === 'LOBBY' || fase === 'CARRERA' || fase === 'RESULTADOS') return 'animado';
    return 'aburrido';
  }

  // ---------------------------------------------------------------- ciclo

  update(t, dt, fase) {
    this.tAhora = t;
    this.vencerEsperaAudio(t);
    if (this.accion && t >= this.accion.desde + this.accion.durMs) this.accion = null;

    // La paciencia baja sola, despacito.
    this.paciencia = Math.max(0, this.paciencia - (this.cfg.pacienciaDecaePorSeg * dt) / 1000);
    if (this.paciencia < this.cfg.pacienciaMax * this.cfg.pacienciaAvisoMedia * 0.6) this.avisoPacienciaMedia = false;

    // Se duerme tras un rato sin interacción (solo en ESPERA).
    const inactivoMs = t - this.ultimaInteraccion;
    if (fase === 'ESPERA' && !this.dormido && !this.ocupado(t) && inactivoMs >= this.cfg.durmiendoTrasSeg * 1000) {
      this.dormirse(t);
    }

    // Frase pendiente apenas quede libre.
    if (this.pendiente && !this.hablando(t)) {
      const { evento, vars, prioridad } = this.pendiente;
      this.pendiente = null;
      this.narrar(t, evento, vars, prioridad);
    }

    this.rutina(t, fase);
  }

  /** Comportamiento de relleno: charla, bostezos, habla dormido, etc. */
  rutina(t, fase) {
    if (fase === 'RESULTADOS' && t >= this.proxRutina && !this.hablando(t)) {
      this.narrar(t, 'podioCharla');
      this.proxRutina = t + this.rango(this.cfg.lobbyCharlaCadaSeg);
      return;
    }
    if (fase !== 'ESPERA' && fase !== 'LOBBY') return;
    if (t < this.proxRutina) return;
    const c = this.cfg;

    if (this.dormido) {
      this.narrar(t, 'hablaDormido');
      this.proxRutina = t + this.rango(c.hablaDormidoCadaSeg);
      return;
    }
    if (t < this.cafeHasta) {
      this.narrar(t, 'cafeCharla');
      this.proxRutina = t + this.rango(c.cafeCharlaCadaSeg);
      return;
    }
    if (fase === 'LOBBY') {
      this.narrar(t, 'lobbyCharla');
      this.proxRutina = t + this.rango(c.lobbyCharlaCadaSeg);
      return;
    }
    if (this.pose(t, fase) !== 'aburrido' || this.accion || this.hablando(t)) {
      this.proxRutina = t + 1500; // reintenta pronto
      return;
    }
    if (this.rng() < c.probFlatulenciaAburrido) {
      this.flatulencia(t, true);
    } else if (this.rng() < 0.55) {
      const tipo = elegir(this.rng, ACCIONES_IDLE);
      this.iniciarAccion(t, tipo, this.duracion(tipo));
      this.narrar(t, tipo);
    } else {
      this.narrar(t, 'aburrido');
    }
    this.proxRutina = t + this.rango(c.charlaCadaSeg);
  }

  dormirse(t) {
    this.dormido = true;
    this.narrar(t, 'dormirse', {}, 'reaccion');
    this.proxRutina = t + this.rango(this.cfg.hablaDormidoCadaSeg);
  }

  /** Cualquier comentario normal: resetea el aburrimiento y lo despierta. */
  interaccion(t, nombre) {
    this.ultimaInteraccion = t;
    if (!this.dormido) return false;
    this.dormido = false;
    this.manta = false;
    this.sustoHasta = t + this.cfg.despertarSustoSeg * 1000;
    this.narrar(t, 'despertar', { nombre }, 'reaccion');
    this.proxRutina = t + 4000;
    return true;
  }

  /** Reacción a !balde, !cafe, !corneta, !manta. */
  molestar(t, cmd, nombre) {
    const c = this.cfg;
    const estabaDormido = this.dormido;
    const despertar = () => { this.dormido = false; this.manta = false; };
    this.ultimaInteraccion = t;

    switch (cmd) {
      case 'balde':
        despertar();
        this.mojadoHasta = t + c.mojadoSeg * 1000;
        this.sustoHasta = t + c.sustoSeg * 1000;
        this.iniciarAccion(t, 'salto', this.duracion('salto'));
        this.narrar(t, estabaDormido ? 'baldeDormido' : 'balde', { nombre }, 'reaccion');
        break;
      case 'cafe':
        despertar();
        this.cafeHasta = t + c.cafeSeg * 1000;
        this.iniciarAccion(t, 'sorbo', this.duracion('sorbo'));
        this.narrar(t, 'cafe', { nombre }, 'reaccion');
        break;
      case 'corneta':
        despertar();
        this.sustoHasta = t + c.caidaSeg * 1000;
        this.enojadoHasta = t + (c.caidaSeg + c.enojadoSeg) * 1000;
        this.iniciarAccion(t, 'caida', c.caidaSeg);
        this.narrar(t, 'corneta', { nombre }, 'reaccion');
        if (this.rng() < c.probFlatulenciaCorneta) this.flatulencia(t);
        break;
      case 'manta':
        this.dormido = true;
        this.manta = true;
        this.cafeHasta = 0;
        this.enojadoHasta = 0;
        this.iniciarAccion(t, 'arropar', this.duracion('arropar'));
        this.narrar(t, 'manta', { nombre }, 'reaccion');
        break;
      default:
        return;
    }
    this.proxRutina = Math.max(this.proxRutina, t + 4000);
  }

  /**
   * Saluda a alguien que acaba de entrar. Si duerme, lo bota medio dormido y SIGUE durmiendo.
   * Devuelve false si está ocupado hablando algo más importante (el saludo espera en cola).
   */
  saludar(t, item, fase, solo = false) {
    const evento = this.eventoSaludo(item.tipo, fase, solo);
    // Si al llegar ya elegimos frase (y su audio se fue generando), la usamos.
    const texto = item.evento === evento && item.texto ? item.texto : this.narrador.frase(evento, { nombre: item.nombre, apodo: item.apodo });
    if (!this.decir(t, texto, 'reaccion')) return false;
    if (this.dormido) {
      this.iniciarAccion(t, 'abrirOjo', this.duracion('abrirOjo'));
      this.proxRutina = Math.max(this.proxRutina, t + 6000);
    } else {
      if (!this.accion) this.iniciarAccion(t, 'saludar', this.duracion('saludar'));
      this.proxRutina = Math.max(this.proxRutina, t + 4000);
    }
    return true;
  }

  /** Qué tipo de saludo toca según el estado actual. */
  eventoSaludo(tipo, fase, solo) {
    if (this.dormido) return 'saludoDormido';
    if (fase === 'LOBBY') return 'saludoLobby';
    if (tipo === 'regreso') return 'saludoRegreso';
    return solo ? 'saludoSolo' : 'saludo';
  }

  /**
   * Elige la frase de saludo apenas alguien entra y empieza a generar su audio,
   * para que cuando le toque hablar ya esté lista (sin esperar).
   */
  prepararSaludo(item, fase, solo) {
    item.evento = this.eventoSaludo(item.tipo, fase, solo);
    item.texto = this.narrador.frase(item.evento, { nombre: item.nombre, apodo: item.apodo });
    this.voz?.pedir(item.texto, this.dormido ? 'dormido' : 'normal').catch(() => {});
  }

  /** Suma paciencia. Devuelve 'llena' si se colmó (y la reinicia), si no null. */
  sumarPaciencia(t, n) {
    const max = this.cfg.pacienciaMax;
    this.paciencia = Math.min(max, this.paciencia + n);
    if (this.paciencia >= max) {
      this.paciencia = 0;
      this.avisoPacienciaMedia = false;
      return 'llena';
    }
    if (!this.avisoPacienciaMedia && this.paciencia >= max * this.cfg.pacienciaAvisoMedia) {
      this.avisoPacienciaMedia = true;
      this.encolar('pacienciaMedia');
    }
    return null;
  }

  /** Frase de cooldown, limitada para no tapar toda la narración. */
  avisoCooldown(t, cmd, seg, nombre) {
    if (t - this.ultimoAvisoCooldown < this.cfg.avisoCooldownCadaSeg * 1000) return false;
    this.ultimoAvisoCooldown = t;
    return this.narrar(t, 'cooldown', { cmd, seg, nombre }, 'reaccion');
  }

  alAbrirLobby(t) {
    this.dormido = false;
    this.manta = false;
    this.paciencia = 0;
    this.avisoPacienciaMedia = false;
    this.pendiente = null;
    this.proxRutina = t + 6000;
  }

  alIniciarCarrera(t) {
    this.dormido = false;
    this.manta = false;
    this.pendiente = null;
    this.proxRutina = t + 8000;
  }

  alVolverEspera(t) {
    this.ultimaInteraccion = t;
    this.proxRutina = t + 7000;
  }

  snapshot(t, fase) {
    const a = this.accion;
    const h = this.hablando(t) ? this.habla : null;
    return {
      pose: this.pose(t, fase),
      dormido: this.dormido,
      manta: this.manta,
      mojadoMs: Math.max(0, Math.round(this.mojadoHasta - t)),
      cafeMs: Math.max(0, Math.round(this.cafeHasta - t)),
      paciencia: Math.round(this.paciencia * 10) / 10,
      pacienciaMax: this.cfg.pacienciaMax,
      accion: a ? { id: a.id, tipo: a.tipo, transcurridoMs: Math.round(t - a.desde), durMs: a.durMs } : null,
      habla: h ? { id: h.id, texto: h.texto, transcurridoMs: Math.round(t - h.desde), durMs: Math.round(h.durMs), rapido: h.rapido, preparando: !!h.preparando, audio: h.audio ?? null } : null,
    };
  }
}
