// Simulador: consola interactiva + bots que comentan con cadencia humana y lag tipo TikTok.
import readline from 'node:readline';
import { crearRng, elegir, entre } from '../util.js';

const NOMBRES = [
  'ana_lima', 'elcholo99', 'rosita.pe', 'gato_criollo', 'tio_pepe', 'la_chola_bonita', 'jhonny_cevichero',
  'mototaxi_veloz', 'pollo_a_la_brasa', 'causa_limeña', 'el_chato_ruiz', 'yeni.rk', 'kevin_xd', 'abuela_turbo',
  'doña_peta', 'chifa_master', 'inca_kolita', 'el_profe_lucho', 'pancho_villa_pe', 'martita_22', 'el_bryan',
  'sra_maruja', 'brayan_pro', 'tamalito', 'cuy_volador', 'jaladorcito', 'chocherita', 'el_flaco_pz',
  'pisco_sour', 'marcianito', 'combi_asesina', 'la_tía_veneno', 'papa_rellena', 'anticuchera', 'mazamorra',
  'charapa_style', 'huachafo_king', 'misti_boy', 'picaron_dulce', 'el_compadre',
];
const CHARLA = ['hola', 'jajaja', 'qué tal', 'buenas noches', 'vamos!!', 'yo quiero jugar', 'hola don lucho', 'xd', 'jaja ya'];
const LOBBY = ['me apunto', 'yo!', 'vamos', 'entro', '!jugar', 'aquí', 'listo', 'a correr'];
const MOLESTIAS = ['!balde', '!balde', '!cafe', '!corneta', '!manta', '!BALDE', '! corneta', '!café'];
const INVALIDOS = ['!xyz', '!volar', '!ganar', '!hack'];
// Espectadores que entran a mirar y NO comentan (para ver a Don Lucho picarlos).
const MIRONES = ['juan_perez', 'maria.fer', 'luchito_77', 'carmen_rosa', 'el_mudo_pe', 'sofia.lima', 'mario_bros_pe', 'lucia_23', 'pedro.k', 'rocio_xd'];

const AYUDA = `
Comandos de consola:
  <usuario>: <texto>     inyecta un comentario (ej:  ana: !balde)
  +<usuario>             ese usuario ENTRA a mirar el live (ej:  +maria_lopez)
  !espectadores N        fija el número de espectadores (saluda a todos si hay < 10)
  !estado                resumen del juego
  !fase espera|lobby|carrera  fuerza una fase (carrera = cierra el lobby y arranca)
  !reset                 reinicia el juego
  !bots on|off           activa / pausa los bots
  !ayuda                 esta ayuda
`;

/**
 * @param {{juego: import('../game.js').Juego, bus: import('node:events').EventEmitter, config: object, escalaTiempo: number, bots: number}} opts
 */
export function iniciarSimulador({ juego, bus, config, escalaTiempo, bots = 0 }) {
  const cs = config.simulador;
  const rng = crearRng(Date.now());
  const temporizadores = new Set();
  let botsActivos = bots > 0;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'sim> ' });
  const log = (...m) => {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(...m);
    rl.prompt(true);
  };

  // Mostrar lo que dice Don Lucho en la consola ayuda a depurar.
  juego.lucho.alHablar = (texto) => log(`  🎙  Don Lucho: ${texto}`);

  /** Inyecta un comentario como si viniera del chat. */
  const inyectar = (nickname, texto) => {
    bus.emit('evento', { tipo: 'chat', userId: `sim_${nickname.toLowerCase()}`, nickname, texto });
  };

  /** Inyecta con lag aleatorio (en tiempo de juego, escalado a tiempo real). */
  const conLag = (nickname, texto) => {
    const lagMs = (entre(rng, cs.lagMinSeg, cs.lagMaxSeg) * 1000) / escalaTiempo;
    const id = setTimeout(() => { temporizadores.delete(id); inyectar(nickname, texto); }, lagMs);
    temporizadores.add(id);
  };

  // ---------------------------------------------------------------- espectadores
  let espectadores = 0;
  const fijarEspectadores = (n) => {
    espectadores = Math.max(0, n);
    bus.emit('evento', { tipo: 'viewers', valor: espectadores });
  };
  /** Alguien entra al live (con lag, como en TikTok). */
  const entrar = (nickname, conRetraso = true) => {
    fijarEspectadores(espectadores + 1);
    const ev = () => bus.emit('evento', { tipo: 'join', userId: `sim_${nickname.toLowerCase()}`, nickname });
    if (!conRetraso) return ev();
    const id = setTimeout(() => { temporizadores.delete(id); ev(); }, (entre(rng, cs.lagMinSeg, cs.lagMaxSeg) * 1000) / escalaTiempo);
    temporizadores.add(id);
  };

  // ---------------------------------------------------------------- consola
  rl.on('line', (linea) => {
    const l = linea.trim();
    if (!l) return rl.prompt();
    const m = l.match(/^([^:\s][^:]*):\s*(.*)$/);
    if (l.startsWith('+') && l.length > 1) {
      entrar(l.slice(1).trim(), false);
      log(`${l.slice(1).trim()} entró al live (espectadores: ${espectadores}).`);
    } else if (l.startsWith('!espectadores')) {
      const n = parseInt(l.split(/\s+/)[1], 10);
      if (Number.isFinite(n)) { fijarEspectadores(n); log(`Espectadores: ${n}`); } else log('Uso: !espectadores N');
    } else if (m) {
      inyectar(m[1].trim(), m[2]);
    } else if (l === '!estado') {
      const s = juego.snapshot();
      log(`fase=${s.fase} restante=${s.faseRestanteMs ?? '-'}ms pose=${s.lucho.pose} dormido=${s.lucho.dormido} ` +
        `paciencia=${s.lucho.paciencia}/${s.lucho.pacienciaMax} inscritos=${s.lobby.inscritos.length}/${s.lobby.max} ` +
        `espera=${s.lobby.espera} cooldowns=${JSON.stringify(s.cooldowns)} bots=${botsActivos ? 'on' : 'off'}`);
    } else if (l === '!reset') {
      juego.reset(); log('Juego reiniciado.');
    } else if (l.startsWith('!fase')) {
      const f = l.split(/\s+/)[1]?.toUpperCase();
      if (f === 'ESPERA' || f === 'LOBBY' || f === 'CARRERA') { juego.forzarFase(f); log(`Fase forzada: ${f}`); }
      else log('Uso: !fase espera|lobby|carrera   (carrera = cierra el lobby ya)');
    } else if (l === '!bots on' || l === '!bots off') {
      botsActivos = l.endsWith('on') && bots > 0;
      log(bots > 0 ? `Bots ${botsActivos ? 'activados' : 'pausados'}.` : 'No hay bots (arranca con --bots N).');
    } else {
      log(AYUDA);
    }
    rl.prompt();
  });
  rl.on('SIGINT', () => process.emit('SIGINT'));

  // ---------------------------------------------------------------- bots
  const listaBots = [];
  for (let i = 0; i < bots; i++) {
    const base = NOMBRES[i % NOMBRES.length];
    // Cada bot "entra" al live en un momento distinto durante la espera inicial.
    listaBots.push({ nombre: i < NOMBRES.length ? base : `${base}${i}`, prox: 0, entraEn: entre(rng, 2, cs.olaQuietaInicialSeg) * 1000, dentro: false });
  }
  let proxMiron = entre(rng, 5, 15) * 1000;
  const mironesDentro = [];

  /** ¿Están los bots en ola activa? (olas en tiempo de juego para ver a Lucho dormirse). */
  const olaActiva = (t) => {
    const ini = cs.olaQuietaInicialSeg * 1000;
    if (t < ini) return false;
    const ciclo = (cs.olaActivaSeg + cs.olaQuietaSeg) * 1000;
    return (t - ini) % ciclo < cs.olaActivaSeg * 1000;
  };

  const actuarBot = (bot) => {
    if (juego.fase === 'LOBBY') {
      if (rng() < cs.probComentarLobby) conLag(bot.nombre, rng() < 0.2 ? elegir(rng, MOLESTIAS) : elegir(rng, LOBBY));
      return;
    }
    if (juego.fase === 'CARRERA') {
      const a = juego.carrera.autos.find(a => a.userId === `sim_${bot.nombre.toLowerCase()}`);
      if (!a) conLag(bot.nombre, '¡La próxima corro yo!');
      else if (a.estado === 'destruido') conLag(bot.nombre, `!lanzar ${1 + Math.floor(rng() * config.carrera.carriles)}`);
      else if (a.estado === 'vivo') {
        const cmd = a.hp < 75 && !a.reparoUsado ? 'reparar' : elegir(rng, cs.comandosCarrera);
        conLag(bot.nombre, `!${cmd}`);
      }
      return;
    }
    if (!olaActiva(juego.t)) return;
    const r = rng();
    if (r < cs.probRafagaSpam) {
      for (let k = 0; k < 6; k++) conLag(bot.nombre, `spam ${k} ${elegir(rng, CHARLA)}`);
    } else if (r < cs.probRafagaSpam + cs.probComentarioNormal) {
      conLag(bot.nombre, elegir(rng, CHARLA));
    } else if (r < cs.probRafagaSpam + cs.probComentarioNormal + cs.probComandoInvalido) {
      conLag(bot.nombre, elegir(rng, INVALIDOS));
    } else if (r < 0.55) {
      conLag(bot.nombre, elegir(rng, MOLESTIAS));
    }
  };

  const intervalo = setInterval(() => {
    if (!botsActivos) return;
    const t = juego.t;
    // Mirones: entran, no comentan, y se van al rato.
    if (t >= proxMiron) {
      proxMiron = t + entre(rng, cs.mironCadaSeg[0], cs.mironCadaSeg[1]) * 1000;
      const libres = MIRONES.filter((n) => !mironesDentro.some((x) => x.nombre === n));
      if (libres.length) {
        const nombre = elegir(rng, libres);
        mironesDentro.push({ nombre, saleEn: t + entre(rng, cs.mironQuedaSeg[0], cs.mironQuedaSeg[1]) * 1000 });
        entrar(nombre);
      }
    }
    for (let i = mironesDentro.length - 1; i >= 0; i--) {
      if (t >= mironesDentro[i].saleEn) { mironesDentro.splice(i, 1); fijarEspectadores(espectadores - 1); }
    }
    for (const bot of listaBots) {
      if (!bot.dentro) {
        if (t >= bot.entraEn) { bot.dentro = true; entrar(bot.nombre); }
        continue;
      }
      if (t < bot.prox) continue;
      bot.prox = t + entre(rng, cs.botCadenciaSeg[0], cs.botCadenciaSeg[1]) * 1000;
      actuarBot(bot);
    }
  }, 200);

  console.log(`[sim] Simulador listo. Bots: ${bots}. Escribe !ayuda para ver comandos.`);
  if (bots > 0) console.log(`[sim] Los bots esperan ${cs.olaQuietaInicialSeg}s (tiempo de juego) antes de molestar, para que veas a Don Lucho dormirse.`);
  rl.prompt();

  return {
    detener() {
      clearInterval(intervalo);
      for (const id of temporizadores) clearTimeout(id);
      rl.close();
    },
  };
}
