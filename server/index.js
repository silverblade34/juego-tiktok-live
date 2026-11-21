// Arranque: HTTP estático (overlay/) + WebSocket en el mismo puerto + loop de juego.
//   node server/index.js                 -> fuente TikTok
//   node server/index.js --sim [--bots N] [--fast]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Juego } from './game.js';
import { crearBus, normalizarEvento } from './bus.js';
import { Voz, frasesFijas } from './voz.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OVERLAY = path.join(RAIZ, 'overlay');
const VOZ_CACHE = path.join(RAIZ, 'data', 'voz-cache');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/** Lee argumentos tipo --sim --bots 25 --fast. */
function leerArgs(argv) {
  const args = { sim: false, bots: 0, fast: false, puerto: null, sinVoz: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sim') args.sim = true;
    else if (argv[i] === '--fast') args.fast = true;
    else if (argv[i] === '--sin-voz') args.sinVoz = true;
    else if (argv[i] === '--bots') args.bots = parseInt(argv[++i], 10) || 0;
    else if (argv[i] === '--puerto') args.puerto = parseInt(argv[++i], 10) || null;
  }
  if (args.bots > 0) args.sim = true;
  return args;
}

const leerJson = (archivo) => JSON.parse(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'));

/** Sirve archivos de overlay/ sin permitir salir de la carpeta. */
function servirEstatico(req, res) {
  let ruta;
  try { ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { ruta = '/'; }
  if (ruta === '/') ruta = '/index.html';
  // Audios de Don Lucho: solo nombres de hash, nada de rutas arbitrarias.
  const voz = ruta.match(/^\/voz\/([a-f0-9]{40}\.(?:mp3|wav))$/);
  const archivo = voz ? path.join(VOZ_CACHE, voz[1]) : path.normalize(path.join(OVERLAY, ruta));
  if (!voz && !archivo.startsWith(OVERLAY + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); return; }
    const cache = voz ? 'public, max-age=31536000, immutable' : 'no-store';
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': cache });
    res.end(datos);
  });
}

/** Parte de la config que el overlay necesita (leyenda, cooldowns totales, etc.). */
function configCliente(config) {
  const comandos = {};
  for (const [cmd, def] of Object.entries(config.comandos)) comandos[cmd] = { cooldownGlobalSeg: def.cooldownGlobalSeg, tipo: def.tipo, fases: def.fases };
  return {
    nombre: config.juego.nombre,
    leyendaEspera: config.leyendaEspera,
    comandos,
    maxJugadores: config.fases.maxJugadores,
    lobbySeg: config.fases.lobbySeg,
  };
}

async function main() {
  const args = leerArgs(process.argv.slice(2));
  const config = leerJson('config.json');
  const frases = leerJson('frases.json');
  const escalaTiempo = args.fast ? config.simulador.factorRapido : 1;

  const juego = new Juego({ config, frases, escalaTiempo });

  // --- Voz de Don Lucho (opcional: si falla, habla solo con texto)
  let voz = null;
  if (config.voz?.activa && !args.sinVoz) {
    voz = new Voz({ config, raiz: RAIZ });
    await voz.iniciar();
    juego.lucho.voz = voz;
    if (config.voz.precalentar) setTimeout(() => voz.precalentar(frasesFijas(frases)), 2000);
  }
  const bus = crearBus();
  bus.on('evento', (crudo) => {
    try { juego.manejarEvento(normalizarEvento(crudo)); }
    catch (e) { console.error('[juego] error manejando evento:', e); }
  });

  // --- HTTP + WebSocket en el mismo puerto
  const servidor = http.createServer(servirEstatico);
  const wss = new WebSocketServer({ server: servidor });
  const hola = JSON.stringify({ tipo: 'hola', cliente: configCliente(config) });
  wss.on('connection', (ws) => {
    ws.send(hola);
    ws.send(JSON.stringify(juego.snapshot({ estatico: true })));
    ws.on('error', () => {});
  });

  const puerto = args.puerto ?? config.servidor.puerto;
  const alFallar = (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n[servidor] El puerto ${puerto} está ocupado. ¿Ya hay otra instancia corriendo? (usa --puerto 3001)`);
    else console.error('[servidor]', e);
    process.exit(1);
  };
  servidor.on('error', alFallar);
  wss.on('error', alFallar); // ws re-emite los errores del servidor HTTP
  servidor.listen(puerto, () => {
    console.log(`[servidor] Overlay en http://localhost:${puerto}  (tiempo x${escalaTiempo})`);
  });

  // --- Loop de juego a tick fijo
  let anterior = performance.now();
  setInterval(() => {
    const ahora = performance.now();
    const dt = Math.min(250, ahora - anterior); // evita saltos enormes si el proceso se pausa
    anterior = ahora;
    try { juego.update(dt * escalaTiempo); }
    catch (e) { console.error('[juego] error en update:', e); }
  }, 1000 / config.servidor.tickHz);

  // --- Snapshots
  // Los datos estáticos (pista, nombres) van 1 vez por segundo: así un overlay recargado se
  // re-sincroniza enseguida sin mandar todo 20 veces por segundo.
  let nSnap = 0;
  setInterval(() => {
    if (wss.clients.size === 0) return;
    const estatico = nSnap++ % config.servidor.snapshotHz === 0;
    const msg = JSON.stringify(juego.snapshot({ estatico }));
    for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  }, 1000 / config.servidor.snapshotHz);

  // --- Fuente de eventos
  let fuente;
  if (args.sim) {
    const { iniciarSimulador } = await import('./sources/simulator.js');
    fuente = iniciarSimulador({ juego, bus, config, escalaTiempo, bots: args.bots });
  } else {
    const { iniciarTikTok } = await import('./sources/tiktok.js');
    fuente = iniciarTikTok({ config, bus });
  }

  const cerrar = () => {
    console.log('\n[servidor] Cerrando...');
    fuente?.detener?.();
    voz?.detener();
    wss.close();
    servidor.close();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main();
