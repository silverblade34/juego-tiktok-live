import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Juego } from '../game.js';
import { crearRng } from '../util.js';

const leer = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const config = leer('config.json');
const frases = leer('frases.json');

function nuevoJuego() {
  return new Juego({ config: structuredClone(config), frases, rng: crearRng(7) });
}
/** Avanza el tiempo en pasos de 33 ms. */
function avanzar(j, ms) {
  for (let t = 0; t < ms; t += 33) j.update(33);
}
const chat = (j, nombre, texto) => j.manejarEvento({ tipo: 'chat', userId: `u_${nombre}`, nickname: nombre, texto });
const tipos = (j) => j.eventos.map((e) => e.tipo);

test('arranca en ESPERA y se duerme tras durmiendoTrasSeg', () => {
  const j = nuevoJuego();
  assert.equal(j.fase, 'ESPERA');
  avanzar(j, (config.lucho.durmiendoTrasSeg - 1) * 1000);
  assert.equal(j.lucho.dormido, false);
  avanzar(j, 6000);
  assert.equal(j.lucho.dormido, true);
  assert.equal(j.snapshot().lucho.pose, 'dormido');
});

test('!balde despierta, moja y aplica cooldown global', () => {
  const j = nuevoJuego();
  avanzar(j, 70000);
  assert.equal(j.lucho.dormido, true);
  chat(j, 'ana', '!balde');
  assert.equal(j.lucho.dormido, false);
  assert.ok(j.snapshot().lucho.mojadoMs > 0);
  assert.ok(tipos(j).includes('balde'));
  assert.equal(j.usuarios.obtener('u_ana').baldazos, 1);

  chat(j, 'beto', '!balde');
  const cd = j.eventos.at(-1);
  assert.equal(cd.tipo, 'cooldown');
  assert.equal(cd.cmd, 'balde');
  assert.equal(cd.seg, config.comandos.balde.cooldownGlobalSeg);

  avanzar(j, config.comandos.balde.cooldownGlobalSeg * 1000 + 100);
  chat(j, 'beto', '!balde');
  assert.ok(j.eventos.slice(-2).some((e) => e.tipo === 'balde'));
});

test('!manta lo duerme con manta y un comentario lo despierta', () => {
  const j = nuevoJuego();
  chat(j, 'ana', '!manta');
  assert.equal(j.lucho.dormido, true);
  assert.equal(j.lucho.manta, true);
  j.cfg.fases.abrirLobbyConComentario = false;
  chat(j, 'beto', 'hola');
  assert.equal(j.lucho.dormido, false);
  assert.equal(j.lucho.manta, false);
});

test('!corneta: caída (susto) y luego enojado', () => {
  const j = nuevoJuego();
  chat(j, 'ana', '!corneta');
  assert.equal(j.lucho.accion.tipo, 'caida');
  assert.equal(j.snapshot().lucho.pose, 'susto');
  avanzar(j, config.lucho.caidaSeg * 1000 + 200);
  assert.equal(j.snapshot().lucho.pose, 'enojado');
});

test('la paciencia llena abre el LOBBY', () => {
  const j = nuevoJuego();
  const cmds = ['balde', 'cafe', 'corneta', 'manta'];
  let i = 0;
  while (j.fase === 'ESPERA' && i < 200) {
    chat(j, `u${i}`, `!${cmds[i % 4]}`);
    avanzar(j, 41000); // supera todos los cooldowns
    i++;
  }
  assert.equal(j.fase, 'LOBBY');
  assert.ok(tipos(j).includes('lobbyAbre'));
  assert.equal(j.lucho.paciencia, 0);
});

test('un comentario normal en ESPERA abre el LOBBY e inscribe al autor', () => {
  const j = nuevoJuego();
  chat(j, 'ana', 'hola');
  assert.equal(j.fase, 'LOBBY');
  assert.equal(j.lobby.inscritos.length, 1);
  assert.equal(j.lobby.inscritos[0].nombre, 'ana');
});

test('comando inválido no abre el lobby ni hace nada', () => {
  const j = nuevoJuego();
  chat(j, 'ana', '!volar');
  assert.equal(j.fase, 'ESPERA');
  assert.equal(j.eventos.length, 0);
});

test('!jugar abre el lobby', () => {
  const j = nuevoJuego();
  chat(j, 'ana', '!JUGAR');
  assert.equal(j.fase, 'LOBBY');
});

test('LOBBY: 30 cupos, el resto a lista de espera, sin duplicados', () => {
  const j = nuevoJuego();
  chat(j, 'u0', '!jugar');
  for (let i = 1; i < 40; i++) chat(j, `u${i}`, 'yo');
  chat(j, 'u0', 'otra vez'); // duplicado
  assert.equal(j.lobby.inscritos.length, config.fases.maxJugadores);
  assert.equal(j.lobby.espera.length, 40 - config.fases.maxJugadores);
  assert.deepEqual(j.lobby.inscritos.map((p) => p.cupo), Array.from({ length: 30 }, (_, k) => k + 1));
});

test('LOBBY termina y arranca la CARRERA; los de lista de espera entran primero la próxima', () => {
  const j = nuevoJuego();
  chat(j, 'u0', '!jugar');
  for (let i = 1; i < 33; i++) chat(j, `u${i}`, 'yo');
  avanzar(j, config.fases.lobbySeg * 1000 + 100);
  assert.equal(j.fase, 'CARRERA');
  assert.equal(j.carrera.autos.length, 30);
  assert.ok(tipos(j).includes('carreraInicio'));
  assert.equal(j.lobby.espera.length, 3);
  // ronda completa
  for (let k = 0; k < 4000 && j.fase === 'CARRERA'; k++) j.update(50);
  assert.equal(j.fase, 'RESULTADOS');
  avanzar(j, config.fases.resultadosSeg * 1000 + 100);
  assert.equal(j.fase, 'LOBBY', 'con lista de espera, abre el lobby directo');
  assert.deepEqual(j.lobby.inscritos.slice(0, 3).map((p) => p.nombre), ['u30', 'u31', 'u32']);
});

test('LOBBY vacío vuelve a ESPERA', () => {
  const j = nuevoJuego();
  j.forzarFase('LOBBY');
  avanzar(j, config.fases.lobbySeg * 1000 + 100);
  assert.equal(j.fase, 'ESPERA');
});

test('anti-spam: silencia y descarta mensajes', () => {
  const j = nuevoJuego();
  j.cfg.fases.abrirLobbyConComentario = false;
  for (let i = 0; i < 5; i++) chat(j, 'spammer', `msg ${i}`);
  assert.ok(tipos(j).includes('spam'));
  const n = j.eventos.length;
  chat(j, 'spammer', '!balde');
  assert.equal(j.eventos.length, n, 'el silenciado no puede usar comandos');
  avanzar(j, config.antiSpam.silencioSeg * 1000 + 100);
  chat(j, 'spammer', '!balde');
  assert.ok(j.eventos.slice(-2).some((e) => e.tipo === 'balde'));
});

test('gift/like/follow no rompen ni cambian el juego', () => {
  const j = nuevoJuego();
  j.manejarEvento({ tipo: 'gift', userId: 'x', nickname: 'x', valor: 10 });
  j.manejarEvento({ tipo: 'like', userId: 'x', nickname: 'x' });
  j.manejarEvento(null);
  assert.equal(j.fase, 'ESPERA');
  assert.equal(j.eventos.length, 0);
});

test('snapshot solo incluye eventos recientes', () => {
  const j = nuevoJuego();
  chat(j, 'ana', '!balde');
  assert.equal(j.snapshot().eventos.length > 0, true);
  avanzar(j, (config.servidor.eventosVisiblesSeg + 1) * 1000);
  assert.equal(j.snapshot().eventos.filter((e) => e.tipo === 'balde').length, 0);
});

test('Lucho habla en ESPERA solo (no queda mudo)', () => {
  const j = nuevoJuego();
  let dichos = 0;
  j.lucho.alHablar = () => dichos++;
  avanzar(j, 50000);
  assert.ok(dichos >= 3, `dijo ${dichos} frases`);
});
