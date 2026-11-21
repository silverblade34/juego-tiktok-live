// Overlay: se conecta al servidor por WebSocket, recibe snapshots y dibuja a 60 fps.
// No decide nada del juego: si se recarga, el primer snapshot reconstruye todo.
//
// Dos escenas:
//  - Paradero (ESPERA / LOBBY): garita grande con Don Lucho.
//  - Pista (CARRERA / RESULTADOS): carretera con cámara, minimapa y Don Lucho chiquito abajo.
import { ANCHO, ALTO, L, P } from './render/palette.js';
import { dibujarFondo, dibujarPiso, dibujarGarita } from './render/scene.js';
import { LuchoRender } from './render/lucho.js';
import { Particulas, EfectosEscena } from './render/fx.js';
import { Hud } from './render/hud.js';
import { textoContorno } from './render/texto.js';
import { VozCliente } from './render/voz.js';
import { Sonidos } from './render/sonidos.js';
import { Camara, VISTA } from './render/camera.js';
import { dibujarPista } from './render/track.js';
import { dibujarAuto } from './render/cars.js';
import {
  dibujarBarraCarrera, dibujarMinimapa, dibujarCuenta, dibujarNombre, dibujarVida, dibujarPanelLucho, dibujarResultados,
} from './render/hudCarrera.js';

const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d');

// ---------------------------------------------------------------- estado local

const estado = {
  cliente: null,       // config visible enviada por el servidor
  snap: null,          // último snapshot
  conectado: false,
  ultimoEventoId: 0,
  primerSnap: true,
};

const particulas = new Particulas();
const efectos = new EfectosEscena(particulas);
const lucho = new LuchoRender();
const hud = new Hud();
const voz = new VozCliente();
const sonidos = new Sonidos();
const camara = new Camara();
if (new URLSearchParams(location.search).has('depurar')) { window.__voz = voz; window.__sonidos = sonidos; } // solo para pruebas

// Carrera: datos estáticos (llegan 1 vez por segundo) + búfer de snapshots para interpolar.
const carrera = {
  semilla: null,
  pista: null,
  info: new Map(),       // id -> { nombre, modelo, color, numero, bot }
  bufer: [],             // [{ t, autos: Map(id -> [id,y,x,hp,estado,pos]) }]
  avisos: new Map(),     // id obstáculo -> tiempo en que se avisó
  moviles: new Map(),    // id obstáculo -> {x, y}
  estadoPrevio: new Map(), // id auto -> estado (para detectar explosiones)
  ruedaPerdida: new Set(),
  pulsoTop: [0, 0, 0],
  topPrevio: [],
  tResultados: 0,
  ultimoSeg: null,
};

// Layout del paradero (escena grande) vs. carrera (Don Lucho chiquito en el panel de abajo).
const LAYOUT = {
  paradero: { lucho: { x: 470, y: 1505, escala: 1.2 }, burbuja: { x: 540, abajo: 1105, anchoMax: 500 }, piso: L.pisoY },
  carrera: { lucho: { x: 150, y: 1745, escala: 0.55 }, burbuja: { x: 290, abajo: 1700, anchoMax: 750 }, piso: 1850 },
};

// ---------------------------------------------------------------- escala a la ventana

function ajustar() {
  const s = Math.min(window.innerWidth / ANCHO, window.innerHeight / ALTO);
  lienzo.style.width = `${ANCHO * s}px`;
  lienzo.style.height = `${ALTO * s}px`;
}
window.addEventListener('resize', ajustar);
ajustar();

// ---------------------------------------------------------------- red

function conectar() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => { estado.conectado = true; };
  ws.onmessage = (m) => {
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.tipo === 'hola') {
      estado.cliente = msg.cliente;
      hud.lobbySeg = msg.cliente.lobbySeg;
      estado.primerSnap = true; // el servidor pudo reiniciarse: ids de eventos desde cero
    } else if (msg.tipo === 'snap') {
      alSnapshot(msg);
    }
  };
  ws.onclose = () => {
    estado.conectado = false;
    setTimeout(conectar, 1000);
  };
  ws.onerror = () => ws.close();
}

function alSnapshot(s) {
  const maxId = s.eventos.reduce((m, e) => Math.max(m, e.id), 0);
  if (estado.primerSnap) {
    // Al (re)conectar no repetimos efectos viejos.
    estado.ultimoEventoId = maxId;
    estado.primerSnap = false;
  } else {
    for (const ev of s.eventos) if (ev.id > estado.ultimoEventoId) procesarEvento(ev, s);
    estado.ultimoEventoId = Math.max(estado.ultimoEventoId, maxId);
  }
  if (s.carrera) recibirCarrera(s.carrera);
  else if (carrera.bufer.length) { carrera.bufer = []; carrera.estadoPrevio.clear(); carrera.ruedaPerdida.clear(); }
  s.pistaCache = carrera.pista;
  if (s.fase === 'RESULTADOS' && estado.snap?.fase !== 'RESULTADOS') carrera.tResultados = 0;
  estado.snap = s;
}

function recibirCarrera(c) {
  if (c.pista && c.pista.semilla !== carrera.semilla) {
    carrera.semilla = c.pista.semilla;
    carrera.pista = c.pista;
    carrera.avisos.clear();
    carrera.bufer = [];
    carrera.estadoPrevio.clear();
    carrera.ruedaPerdida.clear();
    camara.y = -300;
  }
  if (c.info) carrera.info = new Map(c.info.map((a) => [a.id, a]));
  carrera.moviles = new Map(c.moviles.map(([id, x, y]) => [id, { x, y }]));
  carrera.bufer.push({ t: c.t, autos: new Map(c.autos.map((a) => [a[0], a])) });
  carrera.recibidoEn = performance.now();
  if (carrera.bufer.length > 4) carrera.bufer.shift();
  // Top 3: pulso cuando cambia alguien
  c.top.forEach((id, i) => { if (carrera.topPrevio[i] !== id) carrera.pulsoTop[i] = 1; });
  carrera.topPrevio = [...c.top];
}

/** Traduce eventos del servidor a efectos visuales y sonidos. */
function procesarEvento(ev, s) {
  const cabeza = lucho.pCabeza;
  hud.evento(ev);
  switch (ev.tipo) {
    case 'balde': efectos.balde(cabeza); setTimeout(() => sonidos.tocar('balde'), 380); break;
    case 'corneta': efectos.corneta(cabeza); sonidos.tocar('corneta'); setTimeout(() => sonidos.tocar('caida'), 450); break;
    case 'cafe': efectos.cafe(cabeza); setTimeout(() => sonidos.tocar('sorbo'), 650); break;
    case 'manta': efectos.manta(cabeza); sonidos.tocar('manta'); break;
    case 'flatulencia':
      setTimeout(() => { sonidos.tocar('flatulencia'); particulas.gas(cabeza.x - 40, cabeza.y + 260 * escalaLucho()); }, 900);
      break;
    case 'cooldown': sonidos.tocar('error', { minMs: 300 }); break;
    case 'spam': efectos.sacudir(10); sonidos.tocar('silbato'); break;
    case 'paciencia': sonidos.tocar('paciencia'); break;
    case 'saludo': sonidos.tocar('saludo'); break;
    case 'miron': sonidos.tocar('psst'); break;
    case 'inscrito': sonidos.tocar('pop', { minMs: 90 }); break;
    case 'lobbyAbre':
      efectos.destello('#ffffff', ev.motivo === 'paciencia' ? 0.9 : 0.5);
      if (ev.motivo === 'paciencia') efectos.sacudir(30);
      efectos.confeti(ANCHO / 2, 900, 120);
      sonidos.tocar('campana');
      break;
    case 'ya': sonidos.tocar('ya'); efectos.destello('#ffffff', 0.3); break;
    case 'aviso':
      if (ev.obstaculo === 'vaca') sonidos.tocar('vaca');
      else if (ev.obstaculo === 'perro') sonidos.tocar('perro');
      else sonidos.tocar('tic');
      carrera.avisos.set(ev.id, performance.now());
      break;
    case 'golpe': {
      sonidos.tocar('golpe', { minMs: 110 });
      const p = posAutoPantalla(ev.autoId);
      if (p) particulas.chispas(p.x, p.y, camara.zoom);
      break;
    }
    case 'explosion': {
      sonidos.tocar('explosion', { minMs: 150 });
      efectos.sacudir(18);
      const p = posAutoPantalla(ev.autoId);
      if (p) particulas.explosion(p.x, p.y, Math.max(0.6, camara.zoom));
      break;
    }
    case 'meta':
      if (ev.pos === 1) { sonidos.tocar('meta'); efectos.confeti(VISTA.centroX, VISTA.arriba + 100, 140); efectos.destello('#fff6c2', 0.4); }
      else sonidos.tocar('pop', { minMs: 120 });
      break;
    case 'resultados':
      sonidos.tocar('aplausos');
      setTimeout(() => sonidos.tocar('abucheo'), 3500); // cuando Don Lucho se burla del último
      efectos.confeti(ANCHO / 2, 300, 160);
      break;
  }
}

function escalaLucho() {
  return modoCarrera(estado.snap) ? LAYOUT.carrera.lucho.escala : LAYOUT.paradero.lucho.escala;
}

function modoCarrera(s) {
  return !!s && (s.fase === 'CARRERA' || s.fase === 'RESULTADOS') && !!carrera.pista;
}

// ---------------------------------------------------------------- interpolación de autos

/** Autos interpolados entre los dos snapshots que rodean al "tiempo de render" (~100 ms atrás). */
function autosInterpolados() {
  const b = carrera.bufer;
  if (!b.length) return [];
  const ultimo = b[b.length - 1];
  const escala = estado.snap?.escalaTiempo ?? 1;
  const tRender = ultimo.t + (performance.now() - (carrera.recibidoEn ?? performance.now())) * escala - 100 * escala;
  let a = b[0], c = ultimo;
  for (let i = 0; i < b.length - 1; i++) if (b[i].t <= tRender && b[i + 1].t >= tRender) { a = b[i]; c = b[i + 1]; break; }
  const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (tRender - a.t) / (c.t - a.t)));
  const lista = [];
  for (const [id, fc] of c.autos) {
    const fa = a.autos.get(id) ?? fc;
    lista.push({ id, y: fa[1] + (fc[1] - fa[1]) * k, x: fa[2] + (fc[2] - fa[2]) * k, hp: fc[3], estado: fc[4], pos: fc[5] });
  }
  return lista;
}

let autosCache = [];
function posAutoPantalla(id) {
  const a = autosCache.find((x) => x.id === id);
  if (!a || !estado.snap?.carrera) return null;
  return camara.aPantalla(a.x, a.y, estado.snap.carrera.carriles);
}

// ---------------------------------------------------------------- loop

let previo = performance.now();
let reloj = 0;

function cuadro(ahora) {
  const dtReal = Math.min(0.1, (ahora - previo) / 1000);
  previo = ahora;
  const s = estado.snap;
  const dt = dtReal * (s?.escalaTiempo ?? 1);
  reloj += dt;
  const enCarrera = modoCarrera(s);
  const lay = enCarrera ? LAYOUT.carrera : LAYOUT.paradero;
  Object.assign(L.burbuja, lay.burbuja);

  if (s) {
    hud.update(dt, s);
    voz.sincronizar(s.lucho.habla, s.escalaTiempo);
    voz.update(dtReal);
    lucho.nivelVoz = voz.nivel;
    lucho.conVoz = voz.sonando();
    lucho.hablando = hud.burbuja.escribiendo();
    lucho.rapido = hud.burbuja.rapido;
    lucho.update(dt, s.lucho, particulas, lay.piso, lay.lucho.escala);
    actualizarCarrera(dt, s);
    actualizarSonidos(s);
  }
  efectos.update(dt);
  particulas.update(dt);

  dibujar(s, reloj, enCarrera, lay);
  requestAnimationFrame(cuadro);
}

function actualizarCarrera(dt, s) {
  autosCache = s.carrera ? autosInterpolados() : [];
  if (!s.carrera) return;
  const c = s.carrera;
  const vivos = autosCache.filter((a) => a.estado === 0);
  const lider = autosCache.find((a) => a.id === c.top[0]);
  camara.update(dt, vivos.length ? vivos : autosCache, lider?.y ?? 0, c.estado === 'cuenta');
  carrera.pulsoTop = carrera.pulsoTop.map((p) => Math.max(0, p - dt * 2.5));
  if (s.fase === 'RESULTADOS') carrera.tResultados += dt;

  // Humo y rueda perdida según la vida (detalles de daño)
  for (const a of autosCache) {
    if (a.estado !== 0) continue;
    const p = camara.aPantalla(a.x, a.y, c.carriles);
    if (p.y < VISTA.arriba || p.y > VISTA.abajo) continue;
    if (a.hp < 50 && Math.random() < dt * (a.hp < 30 ? 14 : 6)) particulas.humo(p.x, p.y + 30 * camara.zoom, camara.zoom, a.hp < 30 ? '#3a3440' : '#8a8590');
    if (a.hp < 25 && !carrera.ruedaPerdida.has(a.id)) { carrera.ruedaPerdida.add(a.id); particulas.rueda(p.x + 20 * camara.zoom, p.y + 30 * camara.zoom, camara.zoom); }
  }
  // Cuenta regresiva: un pitido por segundo
  if (c.estado === 'cuenta') {
    const seg = Math.ceil(c.cuentaMs / 1000);
    if (seg !== carrera.ultimoSeg && seg <= 3 && seg > 0) sonidos.tocar('cuenta');
    carrera.ultimoSeg = seg;
  }
}

function actualizarSonidos(s) {
  const enCarrera = s.fase === 'CARRERA' && s.carrera?.estado === 'corriendo';
  sonidos.ambienteCalle(!enCarrera, voz.sonando());
  sonidos.roncar(s.lucho.dormido && !voz.sonando());
  if (enCarrera) {
    const vivos = s.carrera.vivos / Math.max(1, s.carrera.autos.length);
    sonidos.motoresCarrera(0.4 + 0.6 * vivos);
  } else sonidos.motoresCarrera(0);
  // Últimos 10 s del lobby: tic-tac
  if (s.fase === 'LOBBY' && s.faseRestanteMs != null) {
    const seg = Math.ceil(s.faseRestanteMs / 1000);
    if (seg <= 10 && seg !== hud.ultimoTic) { hud.ultimoTic = seg; sonidos.tocar('tic'); }
  }
}

// ---------------------------------------------------------------- dibujo

function dibujar(s, tiempo, enCarrera, lay) {
  const off = efectos.offset();
  ctx.save();
  ctx.translate(off.x, off.y);

  if (enCarrera) dibujarEscenaCarrera(s, tiempo, lay);
  else dibujarEscenaParadero(s, tiempo, lay);

  ctx.restore();

  if (enCarrera) dibujarBarraCarrera(ctx, s, autosCache, carrera.info, tiempo, carrera.pulsoTop);
  else hud.dibujarBarra(ctx, s ?? { fase: 'ESPERA' }, estado.cliente, estado.conectado);
  efectos.dibujarFlash(ctx, ANCHO, ALTO);

  if (!estado.conectado || !s) {
    ctx.fillStyle = 'rgba(11,8,32,0.6)';
    ctx.fillRect(0, 0, ANCHO, ALTO);
    textoContorno(ctx, 'Conectando con el servidor…', ANCHO / 2, ALTO / 2, { px: 52, color: P.blanco, grosor: 10 });
  }
}

function dibujarEscenaParadero(s, tiempo, lay) {
  dibujarFondo(ctx, tiempo);
  dibujarGarita(ctx, tiempo);
  dibujarPiso(ctx);
  if (!s) return;
  lucho.dibujar(ctx, lay.lucho);
  efectos.dibujar(ctx);
  particulas.dibujar(ctx);
  hud.dibujarAtraccion(ctx);
  hud.dibujarFeed(ctx, s.feed);
  hud.dibujarLobby(ctx, s);
  hud.dibujarPaciencia(ctx);
  dibujarBurbujaLucho(s);
  hud.dibujarLeyenda(ctx, s, estado.cliente);
  hud.dibujarFlotantesYBanners(ctx);
  if (voz.bloqueado) hud.dibujarAvisoSonido(ctx);
}

function dibujarEscenaCarrera(s, tiempo, lay) {
  const c = s.carrera;
  ctx.fillStyle = '#2a2440';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  if (c && carrera.pista) {
    dibujarPista(ctx, camara, {
      pista: carrera.pista, carriles: c.carriles, largo: c.largo, tiempo,
      posObstaculo: (o) => carrera.moviles.get(o.id) ?? { x: o.x, y: o.y },
      avisos: carrera.avisos, chatarra: c.chatarra, info: carrera.info,
    });
    dibujarAutos(c, tiempo);
  }
  particulas.dibujar(ctx);
  if (c) {
    dibujarMinimapa(ctx, s, autosCache, carrera.info, tiempo);
    dibujarCuenta(ctx, s, tiempo);
  }
  if (s.fase === 'RESULTADOS') dibujarResultados(ctx, s.resultados, tiempo, carrera.tResultados);
  dibujarPanelLucho(ctx);
  lucho.dibujar(ctx, lay.lucho);
  efectos.dibujar(ctx);
  dibujarBurbujaLucho(s);
  hud.dibujarFlotantesYBanners(ctx);
  if (voz.bloqueado) hud.dibujarAvisoSonido(ctx);
}

/** Autos de atrás hacia adelante, con nombre y barra de vida; detecta explosiones. */
function dibujarAutos(c, tiempo) {
  const z = camara.zoom;
  const lider = c.top[0];
  const orden = [...autosCache].sort((a, b) => a.y - b.y);
  const etiquetas = [];
  for (const a of orden) {
    if (a.estado === 1) continue; // los destruidos se dibujan como chatarra en la pista
    const info = carrera.info.get(a.id);
    const p = camara.aPantalla(a.x, a.y, c.carriles);
    if (p.y < VISTA.arriba - 100 || p.y > VISTA.abajo + 100) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(z, z);
    // pequeño bamboleo al ir con poca vida
    if (a.hp < 40) ctx.rotate(Math.sin(tiempo * 14 + a.id) * 0.05);
    dibujarAuto(ctx, { modelo: info?.modelo, color: info?.color, numero: info?.numero, hp: a.hp, tiempo });
    ctx.restore();
    if (info) etiquetas.push({ x: p.x, y: p.y - 70 * z - 18, nombre: info.nombre, lider: a.id === lider, hp: a.hp, bot: info.bot });
  }
  // Etiquetas encima de todo (el líder al final para que quede arriba)
  etiquetas.sort((a, b) => (a.lider ? 1 : 0) - (b.lider ? 1 : 0));
  for (const e of etiquetas) {
    dibujarNombre(ctx, e.x, e.y, e.nombre, e.lider, false);
    dibujarVida(ctx, e.x, e.y + 18, e.hp);
  }
}

function dibujarBurbujaLucho(s) {
  // Punta de la cola hacia la boca, limitada para que no se estire de más (p. ej. al caerse).
  const punta = {
    x: Math.min(L.burbuja.x + 160, Math.max(L.burbuja.x - 60, lucho.pBoca.x + 40)),
    y: Math.min(L.burbuja.abajo + 170, Math.max(L.burbuja.abajo + 20, lucho.pBoca.y - 30)),
  };
  hud.dibujarBurbuja(ctx, punta, s.lucho.dormido);
}

conectar();
requestAnimationFrame(cuadro);
