import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nombreCorto, diminutivo, apodo, Publico } from '../publico.js';
import { Juego } from '../game.js';
import { crearRng } from '../util.js';

const leer = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const config = leer('config.json');
const frases = leer('frases.json');
const nuevoJuego = () => new Juego({ config: structuredClone(config), frases, rng: crearRng(3) });
const avanzar = (j, ms) => { for (let t = 0; t < ms; t += 33) j.update(33); };
const llega = (j, n) => j.manejarEvento({ tipo: 'join', userId: `u_${n}`, nickname: n });

test('nombreCorto saca un nombre legible del nickname', () => {
  assert.equal(nombreCorto('maria_lopez23'), 'Maria');
  assert.equal(nombreCorto('@JUAN.perez'), 'Juan');
  assert.equal(nombreCorto('x_carlos99'), 'Carlos');
  assert.equal(nombreCorto('12345'), '12345');
});

test('diminutivo a la peruana', () => {
  assert.equal(diminutivo('Juan'), 'Juanito');
  assert.equal(diminutivo('Maria'), 'Marita');
  assert.equal(diminutivo('Carlos'), 'Carlitos');
  assert.equal(diminutivo('Pedro'), 'Pedrito');
  assert.equal(diminutivo('Jose'), 'Josito');
  assert.equal(diminutivo('Pepito'), 'Pepito');
});

test('apodo combina diminutivo y apellido cómico', () => {
  assert.match(apodo('Juan', crearRng(1)), /^Juanito .+/);
});

test('con pocos espectadores saluda a todos; con muchos solo a veces', () => {
  const p = new Publico({ config, rng: crearRng(5) });
  p.setEspectadores(3);
  for (let i = 0; i < 3; i++) assert.ok(p.alUnirse(i, `u${i}`, `user${i}`));
  const q = new Publico({ config, rng: crearRng(5) });
  q.setEspectadores(500);
  let saludados = 0;
  for (let i = 0; i < 400; i++) if (q.alUnirse(i, `u${i}`, `user${i}`)) saludados++;
  assert.ok(saludados > 20 && saludados < 120, `saludó a ${saludados}/400`);
});

test('re-entradas seguidas no se vuelven a saludar; regreso posterior sí', () => {
  const p = new Publico({ config, rng: crearRng(5) });
  assert.equal(p.alUnirse(0, 'a', 'ana').tipo, 'nuevo');
  p.saludoHecho(0);
  assert.equal(p.alUnirse(5000, 'a', 'ana'), null);
  assert.equal(p.alUnirse(5000 + config.publico.ignorarReentradaSeg * 1000 + 1, 'a', 'ana').tipo, 'regreso');
});

test('la cola respeta el espaciado entre saludos', () => {
  const p = new Publico({ config, rng: crearRng(5) });
  p.alUnirse(0, 'a', 'ana'); p.alUnirse(0, 'b', 'beto');
  assert.ok(p.siguienteSaludo(0));
  p.saludoHecho(0);
  assert.equal(p.siguienteSaludo(1000), null);
  assert.equal(p.siguienteSaludo(config.publico.saludoCadaSeg * 1000).nombre, 'Beto');
});

test('saludos viejos se descartan', () => {
  const p = new Publico({ config, rng: crearRng(5) });
  p.alUnirse(0, 'a', 'ana');
  assert.equal(p.siguienteSaludo((config.publico.saludoMaxEdadSeg + 1) * 1000), null);
});

test('Juego: saluda al que llega y si duerme lo bota pero sigue durmiendo', () => {
  const j = nuevoJuego();
  j.manejarEvento({ tipo: 'viewers', valor: 2 });
  avanzar(j, 65000);
  assert.equal(j.lucho.dormido, true);
  llega(j, 'maria_88');
  avanzar(j, 3000);
  const ev = j.eventos.find((e) => e.tipo === 'saludo');
  assert.ok(ev, 'hubo saludo');
  assert.equal(ev.nombre, 'Maria');
  assert.equal(ev.dormido, true);
  assert.equal(j.lucho.dormido, true, 'sigue durmiendo');
  assert.equal(j.fase, 'ESPERA', 'entrar a mirar no abre el lobby');
});

test('Juego: molesta a un mirón que no comenta', () => {
  const j = nuevoJuego();
  j.manejarEvento({ tipo: 'viewers', valor: 3 });
  llega(j, 'timido_pe');
  // lo mantenemos despierto con molestias para que no se duerma
  for (let k = 0; k < 6; k++) {
    j.manejarEvento({ tipo: 'chat', userId: `x${k}`, nickname: `x${k}`, texto: '!corneta' });
    avanzar(j, 21000);
    if (j.eventos.some((e) => e.tipo === 'miron')) break;
  }
  assert.ok(j.eventos.some((e) => e.tipo === 'miron' && e.nombre === 'Timido'));
});

test('el que comenta no es mirón', () => {
  const p = new Publico({ config, rng: crearRng(5) });
  p.alUnirse(0, 'a', 'ana');
  p.alComentar(1000, 'a', 'ana');
  p.proxMiron = 0;
  assert.equal(p.elegirMiron(100000), null);
});
