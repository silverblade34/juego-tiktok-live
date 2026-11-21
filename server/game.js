// Máquina de estados del juego: ESPERA -> LOBBY -> (CARRERA -> RESULTADOS) -> ESPERA.
// Todo el tiempo es "tiempo de juego" (this.t, en ms) que avanza con update(dt).
import { parsearComando, Cooldowns, AntiSpam } from './commands.js';
import { Narrador } from './narrator.js';
import { Usuarios } from './users.js';
import { Lucho } from './lucho.js';
import { Publico } from './publico.js';
import { limpiarNombre, elegir } from './util.js';
import { generarPista } from './track.js';
import { Carrera } from './race.js';

const N_COLORES = 12; // colores de auto definidos en overlay/render/palette.js (P.autos)

export const FASES = ['ESPERA', 'LOBBY', 'CARRERA', 'RESULTADOS'];
const MAX_EVENTOS = 60;
const MAX_FEED = 6;

export class Juego {
  /**
   * @param {{config: object, frases: object, rng?: () => number, escalaTiempo?: number}} deps
   */
  constructor({ config, frases, rng = Math.random, escalaTiempo = 1 }) {
    this.cfg = config;
    this.rng = rng;
    this.escalaTiempo = escalaTiempo;
    this.narrador = new Narrador(frases, rng);
    this.usuarios = new Usuarios();
    this.cooldowns = new Cooldowns();
    const s = config.antiSpam;
    this.antiSpam = new AntiSpam({ maxMensajes: s.maxMensajes, ventanaMs: s.ventanaSeg * 1000, silencioMs: s.silencioSeg * 1000 });
    this.lucho = new Lucho({ config, narrador: this.narrador, rng, escalaTiempo });
    this.publico = new Publico({ config, rng });
    this.lucho.alEvento = (tipo, datos) => this.emitir(tipo, datos);
    this.t = 0;
    this.seqEvento = 0;
    this.seqFeed = 0;
    this.proxPurga = 0;
    this.reset();
  }

  reset() {
    this.fase = 'ESPERA';
    this.faseHasta = null;
    this.avisoFinalLobby = false;
    this.lobby = { inscritos: [], espera: [] };
    this.carrera = null;
    this.resultados = null;
    this.ultimaNarracionLider = -Infinity;
    this.proxCharlaCarrera = 0;
    this.eventos = [];
    this.feed = [];
    this.cooldowns.limpiar();
    this.lucho.reset(this.t);
  }

  // ---------------------------------------------------------------- utilidades

  /** Registra un evento puntual que el overlay convertirá en efecto visual. */
  emitir(tipo, datos = {}) {
    const ev = { id: ++this.seqEvento, t: this.t, tipo, ...datos };
    this.eventos.push(ev);
    if (this.eventos.length > MAX_EVENTOS) this.eventos.shift();
    return ev;
  }

  alFeed(clave, vars = {}) {
    const texto = this.narrador.feed(clave, vars);
    if (!texto) return;
    this.feed.unshift({ id: ++this.seqFeed, texto });
    if (this.feed.length > MAX_FEED) this.feed.length = MAX_FEED;
  }

  // ---------------------------------------------------------------- entrada

  /** Punto de entrada de TODAS las fuentes (eventos ya normalizados). */
  manejarEvento(evt) {
    if (!evt) return;
    if (evt.tipo === 'chat') return this.manejarChat(evt);
    if (evt.tipo === 'join') return this.manejarLlegada(evt);
    if (evt.tipo === 'viewers') return this.publico.setEspectadores(evt.valor);
    // gift / like / follow: cableados hasta aquí, sin efecto todavía (Fase 7).
  }

  /** Alguien entró a mirar: el público decide si se le saluda (pocos espectadores = a todos). */
  manejarLlegada({ userId, nickname }) {
    if (!userId) return;
    const nombre = limpiarNombre(nickname || userId);
    const item = this.publico.alUnirse(this.t, userId, nombre);
    if (!item) return;
    this.alFeed('llegada', { nombre });
    this.lucho.prepararSaludo(item, this.fase, this.espectadoresPocos());
  }

  manejarChat({ userId, nickname, texto }) {
    if (!userId) return;
    const nombre = limpiarNombre(nickname || userId);

    // 1) Anti-spam antes que nada.
    const spam = this.antiSpam.registrar(userId, this.t);
    if (spam === 'silenciado') return;
    if (spam === 'nuevoSilencio') {
      const seg = this.cfg.antiSpam.silencioSeg;
      this.lucho.narrar(this.t, 'spam', { nombre, seg }, 'reaccion');
      this.emitir('spam', { nombre, seg });
      this.alFeed('spam', { nombre });
      return;
    }

    this.usuarios.tocar(userId, nombre);
    this.publico.alComentar(this.t, userId, nombre);

    // 2) En LOBBY cualquier mensaje inscribe. Durante la carrera/resultados, se anota para la próxima.
    if (this.fase === 'LOBBY') this.inscribir(userId, nombre);
    else if (this.fase === 'CARRERA' || this.fase === 'RESULTADOS') this.anotarParaProxima(userId, nombre);

    // 3) ¿Comando?
    const c = parsearComando(texto);
    if (c) {
      const def = this.cfg.comandos[c.cmd];
      if (def && def.fases.includes(this.fase)) this.ejecutarComando(c.cmd, def, userId, nombre);
      return; // inválido o fuera de fase: se ignora sin ruido
    }

    // 4) Comentario normal.
    if (this.lucho.interaccion(this.t, nombre)) this.alFeed('despertar', { nombre });
    if (this.fase === 'ESPERA' && this.cfg.fases.abrirLobbyConComentario) {
      this.abrirLobby({ userId, nombre, motivo: 'comentario' });
    }
  }

  ejecutarComando(cmd, def, userId, nombre) {
    const r = this.cooldowns.restante(cmd, userId, this.t);
    if (r.ms > 0) {
      const seg = Math.ceil(r.ms / 1000);
      this.lucho.avisoCooldown(this.t, cmd, seg, nombre);
      this.emitir('cooldown', { cmd, seg, nombre, alcance: r.tipo });
      return;
    }
    this.cooldowns.registrar(cmd, userId, this.t, {
      globalMs: (def.cooldownGlobalSeg ?? 0) * 1000,
      usuarioMs: (def.cooldownUsuarioSeg ?? 0) * 1000,
    });

    if (def.tipo === 'molestia') {
      this.lucho.molestar(this.t, cmd, nombre);
      this.usuarios.sumar(userId, def.estadistica);
      this.emitir(cmd, { nombre });
      this.alFeed(cmd, { nombre });
      if (this.fase === 'ESPERA') {
        if (this.lucho.sumarPaciencia(this.t, def.paciencia ?? 0) === 'llena') {
          this.abrirLobby({ userId, nombre, motivo: 'paciencia' });
        } else {
          this.emitir('paciencia', { valor: this.lucho.paciencia });
        }
      }
    } else if (def.tipo === 'jugar') {
      this.lucho.interaccion(this.t, nombre);
      this.alFeed('jugar', { nombre });
      this.abrirLobby({ userId, nombre, motivo: 'jugar' });
    }
  }

  // ---------------------------------------------------------------- fases

  abrirLobby({ userId = null, nombre = '', motivo = 'forzado' } = {}) {
    if (this.fase === 'LOBBY' || this.fase === 'CARRERA') return;
    this.fase = 'LOBBY';
    this.faseHasta = this.t + this.cfg.fases.lobbySeg * 1000;
    this.avisoFinalLobby = false;
    // Los de la lista de espera de la ronda anterior entran primero.
    const prioridad = this.lobby.espera;
    this.lobby = { inscritos: [], espera: [] };
    this.lucho.alAbrirLobby(this.t);
    if (motivo === 'paciencia') {
      this.lucho.iniciarAccion(this.t, 'salto', this.lucho.duracion('salto'));
      this.lucho.narrar(this.t, 'pacienciaLlena', { nombre }, 'importante');
      this.alFeed('paciencia');
    } else {
      this.lucho.narrar(this.t, 'lobbyAbre', { nombre: nombre || 'el chat' }, 'importante');
      if (motivo === 'comentario') this.alFeed('comentario', { nombre });
    }
    this.emitir('lobbyAbre', { motivo, nombre });
    for (const p of prioridad) this.inscribir(p.userId, p.nombre);
    if (userId) this.inscribir(userId, nombre);
  }

  /** Inscribe a un usuario (cupo 1..max) con auto al azar, o lo manda a la lista de espera. */
  inscribir(userId, nombre) {
    const { inscritos, espera } = this.lobby;
    if (inscritos.some((p) => p.userId === userId) || espera.some((p) => p.userId === userId)) return null;
    if (inscritos.length < this.cfg.fases.maxJugadores) {
      const p = { userId, nombre, cupo: inscritos.length + 1, ...this.autoAlAzar(inscritos) };
      inscritos.push(p);
      this.emitir('inscrito', { nombre, cupo: p.cupo });
      return 'inscrito';
    }
    espera.push({ userId, nombre });
    return 'espera';
  }

  /** Modelo y color al azar (intenta no repetir colores hasta agotar la paleta). */
  autoAlAzar(ocupados) {
    const usados = new Set(ocupados.map((p) => p.color));
    const libres = Array.from({ length: N_COLORES }, (_, i) => i).filter((i) => !usados.has(i));
    const color = libres.length ? elegir(this.rng, libres) : Math.floor(this.rng() * N_COLORES);
    return { modelo: elegir(this.rng, this.cfg.carrera.modelos), color };
  }

  /** Durante la carrera, quien comenta y no corre queda primero para la próxima. */
  anotarParaProxima(userId, nombre) {
    if (this.carrera?.autos.some((a) => a.userId === userId)) return;
    if (this.lobby.espera.some((p) => p.userId === userId)) return;
    if (this.lobby.espera.length >= this.cfg.fases.maxJugadores * 2) return;
    this.lobby.espera.push({ userId, nombre });
    this.alFeed('proxima', { nombre });
  }

  finLobby() {
    const humanos = this.lobby.inscritos;
    this.emitir('lobbyFin', { inscritos: humanos.length });
    if (humanos.length === 0) {
      this.lucho.narrar(this.t, 'lobbyVacio', {}, 'importante');
      this.volverAEspera();
      return;
    }
    this.iniciarCarrera(humanos);
  }

  /** Arma la parrilla (con bots de relleno si hay pocos) y arranca la cuenta regresiva. */
  iniciarCarrera(humanos) {
    const pilotos = humanos.map((p, i) => ({ id: i + 1, userId: p.userId, nombre: p.nombre, modelo: p.modelo, color: p.color, numero: p.cupo, bot: false }));
    const faltan = Math.max(0, this.cfg.fases.rellenarHasta - pilotos.length);
    const nombresBot = [...this.cfg.bots.nombres].sort(() => this.rng() - 0.5);
    for (let k = 0; k < faltan; k++) {
      const n = pilotos.length + 1;
      pilotos.push({ id: n, userId: null, nombre: nombresBot[k % nombresBot.length], numero: n, bot: true, ...this.autoAlAzar(pilotos) });
    }
    const semilla = Math.floor(this.rng() * 1e9);
    this.carrera = new Carrera({ config: this.cfg, pista: generarPista(this.cfg, semilla), pilotos, rng: this.rng });
    this.fase = 'CARRERA';
    this.faseHasta = null;
    this.resultados = null;
    this.lobby = { inscritos: [], espera: this.lobby.espera };
    this.ultimaNarracionLider = -Infinity;
    this.proxCharlaCarrera = this.t + 15000;
    this.lucho.alIniciarCarrera(this.t);
    this.lucho.narrar(this.t, 'carreraCuenta', {}, 'importante');
    if (faltan > 0) this.lucho.encolar('botsRelleno', {}, 'reaccion');
    this.emitir('carreraInicio', { semilla, pilotos: pilotos.length, bots: faltan });
  }

  /** Traduce los eventos de la simulación a narración, feed y efectos. */
  atenderCarrera() {
    const c = this.carrera;
    for (const ev of c.eventos) {
      const auto = ev.autoId ? c.autoPorId(ev.autoId) : null;
      const nombre = auto?.nombre;
      switch (ev.tipo) {
        case 'ya':
          this.lucho.narrar(this.t, 'carreraArranque', {}, 'importante');
          this.emitir('ya');
          break;
        case 'aviso':
          this.lucho.narrar(this.t, `aviso_${ev.obstaculo}`, {}, 'reaccion');
          this.emitir('aviso', { obstaculo: ev.obstaculo, id: ev.id });
          break;
        case 'golpe':
          this.emitir('golpe', { autoId: ev.autoId, obstaculo: ev.obstaculo, dano: ev.dano });
          break;
        case 'explosion':
          this.lucho.narrar(this.t, 'explosion', {}, 'reaccion');
          this.emitir('explosion', { autoId: ev.autoId, nombre });
          this.alFeed('explosion', { nombre });
          if (auto?.userId) this.usuarios.sumar(auto.userId, 'explosiones');
          break;
        case 'lider':
          if (this.t - this.ultimaNarracionLider >= this.cfg.carrera.narrarLiderCadaSeg * 1000) {
            if (this.lucho.narrar(this.t, 'liderCambio', { nombre }, 'reaccion')) this.ultimaNarracionLider = this.t;
          }
          this.emitir('lider', { autoId: ev.autoId, nombre });
          break;
        case 'meta':
          if (ev.pos === 1) this.lucho.narrar(this.t, 'carreraMeta', { nombre }, 'importante');
          this.emitir('meta', { autoId: ev.autoId, pos: ev.pos, nombre });
          if (ev.pos <= 3) this.alFeed('meta', { nombre });
          break;
        case 'fin':
          this.terminarCarrera();
          break;
      }
    }
    c.eventos = [];
    // Pre-genera la voz del probable ganador cuando el líder se acerca a la meta.
    const lider = c.autoPorId(c.liderId);
    if (lider && lider.estado === 'vivo' && lider.y > c.pista.largo * 0.85) this.lucho.prepararFrase('carreraMeta', { nombre: lider.nombre }, 'grito');
    // Charla de relleno si nadie dijo nada en un rato.
    if (c.estado === 'corriendo' && this.t >= this.proxCharlaCarrera && !this.lucho.hablando(this.t)) {
      this.lucho.narrar(this.t, 'carreraCharla');
      this.proxCharlaCarrera = this.t + this.lucho.rango(this.cfg.carrera.charlaCadaSeg);
    }
  }

  /** Puntos, podio, burla al último y estadísticas rápidas. */
  terminarCarrera() {
    const c = this.carrera;
    const rk = c.ranking();
    const cc = this.cfg.carrera;
    const filas = rk.map((a, i) => {
      const puntos = a.estado === 'destruido' ? cc.puntosDestruido : (cc.puntos[i] ?? 0) + cc.puntosLlegar;
      if (a.userId) {
        this.usuarios.sumar(a.userId, 'puntos', puntos);
        this.usuarios.sumar(a.userId, 'carreras');
        if (i === 0 && a.estado === 'meta') this.usuarios.sumar(a.userId, 'victorias');
      }
      return { id: a.id, pos: i + 1, nombre: a.nombre, modelo: a.modelo, color: a.color, numero: a.numero, estado: a.estado, puntos, bot: !!a.bot };
    });
    const max = (campo) => rk.reduce((m, a) => (a[campo] > (m?.[campo] ?? -1) ? a : m), null);
    const masDano = max('danoRecibido');
    const masGolpes = max('golpes');
    const ultimo = rk[rk.length - 1];
    this.resultados = {
      filas,
      podio: filas.slice(0, 3),
      ultimo: ultimo ? { nombre: ultimo.nombre, estado: ultimo.estado } : null,
      stats: {
        masDano: masDano ? { nombre: masDano.nombre, valor: masDano.danoRecibido } : null,
        masGolpes: masGolpes ? { nombre: masGolpes.nombre, valor: masGolpes.golpes } : null,
        destruidos: rk.filter((a) => a.estado === 'destruido').length,
        llegaron: rk.filter((a) => a.estado === 'meta').length,
        segundos: Math.round(c.tSeg),
      },
    };
    this.fase = 'RESULTADOS';
    this.faseHasta = this.t + this.cfg.fases.resultadosSeg * 1000;
    this.lucho.narrar(this.t, 'carreraFin', {}, 'importante');
    if (ultimo && rk.length > 1) {
      this.lucho.prepararFrase('ultimoLugar', { nombre: ultimo.nombre });
      this.lucho.encolar('ultimoLugar', { nombre: ultimo.nombre }, 'reaccion');
    }
    this.emitir('resultados');
  }

  finResultados() {
    this.carrera = null;
    if (this.lobby.espera.length > 0) {
      const primero = this.lobby.espera[0];
      this.fase = 'ESPERA';
      this.abrirLobby({ motivo: 'espera', nombre: primero.nombre });
    } else {
      this.volverAEspera();
    }
  }

  volverAEspera() {
    this.fase = 'ESPERA';
    this.faseHasta = null;
    this.carrera = null;
    // Conserva la lista de espera para la próxima ronda.
    this.lobby = { inscritos: [], espera: this.lobby.espera };
    this.lucho.alVolverEspera(this.t);
  }

  /** Atajo de consola. */
  forzarFase(fase) {
    if (fase === 'LOBBY') this.abrirLobby({ motivo: 'forzado', nombre: 'la consola' });
    else if (fase === 'ESPERA') this.volverAEspera();
    else if (fase === 'CARRERA' && this.fase === 'LOBBY') this.faseHasta = this.t; // cierra el lobby ya
  }

  // ---------------------------------------------------------------- tick

  update(dt) {
    this.t += dt;
    this.lucho.update(this.t, dt, this.fase);
    this.atenderPublico();

    if (this.fase === 'LOBBY') {
      const restante = this.faseHasta - this.t;
      if (!this.avisoFinalLobby && restante <= this.cfg.fases.lobbyAvisoFinalSeg * 1000) {
        this.avisoFinalLobby = true;
        this.lucho.narrar(this.t, 'lobbyUltimos', {}, 'importante');
        this.emitir('lobbyUltimos');
      }
      if (restante <= 0) this.finLobby();
    } else if (this.fase === 'CARRERA' && this.carrera) {
      this.carrera.update(dt);
      this.atenderCarrera();
    } else if (this.fase === 'RESULTADOS' && this.t >= this.faseHasta) {
      this.finResultados();
    }

    if (this.t >= this.proxPurga) {
      this.proxPurga = this.t + 10000;
      this.cooldowns.purgar(this.t);
      this.antiSpam.purgar(this.t);
    }
  }

  /** ¿Somos "tú y yo nomás"? (1 o 2 espectadores) */
  espectadoresPocos() {
    return this.publico.espectadores > 0 && this.publico.espectadores <= 2;
  }

  /** Saludos a los que llegan y pullas a los mirones, sin pisar lo importante. */
  atenderPublico() {
    if (this.fase !== 'ESPERA' && this.fase !== 'LOBBY') return;
    const s = this.publico.siguienteSaludo(this.t);
    if (s) {
      if (this.lucho.saludar(this.t, s, this.fase, this.espectadoresPocos())) {
        this.publico.saludoHecho(this.t);
        this.emitir('saludo', { nombre: s.nombre, apodo: s.apodo, dormido: this.lucho.dormido });
      }
      return;
    }
    if (this.fase === 'ESPERA' && !this.lucho.dormido && !this.lucho.hablando(this.t) && !this.lucho.ocupado(this.t)) {
      const m = this.publico.elegirMiron(this.t);
      if (m && this.lucho.narrar(this.t, 'molestarMiron', m, 'reaccion')) {
        this.lucho.iniciarAccion(this.t, 'senalar', this.lucho.duracion('senalar'));
        this.emitir('miron', { nombre: m.nombre });
      }
    }
  }

  // ---------------------------------------------------------------- salida

  snapshot({ estatico = true } = {}) {
    const visibleMs = this.cfg.servidor.eventosVisiblesSeg * 1000;
    const cooldowns = {};
    for (const cmd of Object.keys(this.cfg.comandos)) cooldowns[cmd] = Math.round(this.cooldowns.restanteGlobal(cmd, this.t));
    return {
      tipo: 'snap',
      t: Math.round(this.t),
      escalaTiempo: this.escalaTiempo,
      fase: this.fase,
      espectadores: this.publico.espectadores,
      faseRestanteMs: this.faseHasta ? Math.max(0, Math.round(this.faseHasta - this.t)) : null,
      lucho: this.lucho.snapshot(this.t, this.fase),
      cooldowns,
      lobby: {
        inscritos: this.lobby.inscritos.map((p) => ({ nombre: p.nombre, cupo: p.cupo, modelo: p.modelo, color: p.color })),
        espera: this.lobby.espera.length,
        max: this.cfg.fases.maxJugadores,
      },
      carrera: this.carrera ? this.carrera.snapshot(estatico) : null,
      resultados: this.fase === 'RESULTADOS' ? this.resultados : null,
      feed: this.feed,
      eventos: this.eventos.filter((e) => this.t - e.t <= visibleMs),
    };
  }
}
