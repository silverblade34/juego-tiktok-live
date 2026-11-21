import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { limpiarParaVoz, duracionMp3Ms } from '../voz.js';
import { Juego } from '../game.js';
import { crearRng } from '../util.js';

const leer = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const config = leer('config.json');
const frases = leer('frases.json');

test('limpiarParaVoz deja el texto listo para leer', () => {
  assert.equal(limpiarParaVoz('¡Uno a la vez! !balde vuelve en 12s.'), '¡Uno a la vez! balde vuelve en 12 segundos.');
  assert.equal(limpiarParaVoz('Buenas noches, chat fantasma... zzz'), 'Buenas noches, chat fantasma...');
  assert.equal(limpiarParaVoz('¡Hola gato_criollo!'), '¡Hola gato criollo!');
  assert.equal(limpiarParaVoz('zzz'), null);
  assert.equal(limpiarParaVoz(''), null);
});

test('duración de mp3 a 48 kbps', () => {
  assert.equal(duracionMp3Ms(6000), 1000);
});

/** Motor de voz falso: resuelve cuando lo pedimos. */
function vozFalsa() {
  const pedidos = [];
  return {
    pedidos,
    pedir(texto, estilo) {
      return new Promise((resolve, reject) => pedidos.push({ texto, estilo, resolve, reject }));
    },
  };
}
const nuevo = () => {
  const j = new Juego({ config: structuredClone(config), frases, rng: crearRng(9) });
  j.lucho.voz = vozFalsa();
  return j;
};
const esperarMicrotareas = () => new Promise((r) => setImmediate(r));

test('con voz: la frase espera el audio y luego dura lo que dura el audio', async () => {
  const j = nuevo();
  j.manejarEvento({ tipo: 'chat', userId: 'a', nickname: 'ana', texto: '!balde' });
  let h = j.snapshot().lucho.habla;
  assert.equal(h.preparando, true);
  assert.equal(h.audio, null);
  j.update(500);
  j.lucho.voz.pedidos.at(-1).resolve({ url: '/voz/x.wav', durMs: 2000 });
  await esperarMicrotareas();
  h = j.snapshot().lucho.habla;
  assert.equal(h.preparando, false);
  assert.equal(h.audio, '/voz/x.wav');
  assert.equal(h.transcurridoMs, 0, 'empieza al llegar el audio');
  assert.equal(h.durMs, 2000 + config.voz.colaTrasAudioSeg * 1000);
});

test('con voz: si el audio no llega a tiempo, habla solo con texto y el audio tardío se ignora', async () => {
  const j = nuevo();
  j.manejarEvento({ tipo: 'chat', userId: 'a', nickname: 'ana', texto: '!balde' });
  for (let t = 0; t < config.voz.esperaMaxSeg * 1000 + 100; t += 33) j.update(33);
  let h = j.snapshot().lucho.habla;
  assert.equal(h.preparando, false);
  assert.equal(h.audio, null);
  j.lucho.voz.pedidos.at(-1).resolve({ url: '/voz/tarde.wav', durMs: 2000 });
  await esperarMicrotareas();
  assert.equal(j.snapshot().lucho.habla.audio, null);
});

test('con voz: estilo según el estado (dormido, café, grito)', () => {
  const j = nuevo();
  j.manejarEvento({ tipo: 'chat', userId: 'a', nickname: 'ana', texto: '!manta' });
  assert.equal(j.lucho.voz.pedidos.at(-1).estilo, 'dormido');
  for (let t = 0; t < 41000; t += 33) j.update(33);
  j.manejarEvento({ tipo: 'chat', userId: 'b', nickname: 'beto', texto: '!cafe' });
  // la reacción al café se dice ya con cafeína
  assert.equal(j.lucho.voz.pedidos.at(-1).estilo, 'cafe');
});

test('si el motor de voz falla, igual habla con texto', async () => {
  const j = nuevo();
  j.manejarEvento({ tipo: 'chat', userId: 'a', nickname: 'ana', texto: '!corneta' });
  j.lucho.voz.pedidos.at(-1).reject(new Error('sin voz'));
  await esperarMicrotareas();
  const h = j.snapshot().lucho.habla;
  assert.equal(h.preparando, false);
  assert.ok(h.durMs > 0);
});

test('al entrar alguien, el audio de su saludo se empieza a generar YA y luego se usa esa misma frase', () => {
  const j = nuevo();
  j.manejarEvento({ tipo: 'viewers', valor: 3 });
  j.manejarEvento({ tipo: 'join', userId: 'm', nickname: 'maria_88' });
  const pedido = j.lucho.voz.pedidos.at(-1);
  assert.ok(pedido, 'se pidió el audio al llegar');
  assert.match(pedido.texto, /Mari/);
  j.update(33);
  assert.equal(j.snapshot().lucho.habla.texto, pedido.texto, 'dice la frase pregenerada');
});

test('el estilo de pregrabado coincide con el que usa Lucho para cada evento importante', async () => {
  const { frasesFijas } = await import('../voz.js');
  const lista = frasesFijas(frases);
  const estiloDe = (evento) => lista.find((x) => frases[evento].includes(x.texto))?.estilo;
  for (const ev of ['lobbyAbre', 'pacienciaLlena', 'carreraCuenta', 'carreraArranque', 'carreraFin', 'lobbyUltimos']) {
    assert.equal(estiloDe(ev), 'grito', `${ev} se dice como "importante" => grito`);
  }
  for (const ev of ['balde', 'corneta', 'cafe', 'cooldown', 'explosion', 'flatulencia']) assert.equal(estiloDe(ev), 'normal', ev);
  assert.equal(estiloDe('manta'), 'dormido');
});
