import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generarPista, posicionObstaculo, tramoEn } from '../track.js';
import { Carrera } from '../race.js';
import { Juego } from '../game.js';
import { crearRng } from '../util.js';

const leer = (f) => JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const config = leer('config.json');
const frases = leer('frases.json');
const pilotos = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, nombre: `p${i}`, modelo: 'sedan', color: i % 12, numero: i + 1 }));
const correr = (c) => { let n = 0; while (c.estado !== 'final' && n++ < 10000) c.update(33); return n; };

test('la pista es reproducible con la misma semilla y distinta con otra', () => {
  const a = generarPista(config, 123), b = generarPista(config, 123), c = generarPista(config, 124);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.obstaculos, c.obstaculos);
});

test('la pista tiene 5 tramos contiguos y obstáculos dentro de la pista y del tramo correcto', () => {
  const p = generarPista(config, 7);
  assert.equal(p.tramos.length, 5);
  assert.equal(p.tramos[0].desde, 0);
  assert.equal(p.tramos.at(-1).hasta, p.largo);
  for (let i = 1; i < p.tramos.length; i++) assert.equal(p.tramos[i].desde, p.tramos[i - 1].hasta);
  for (const o of p.obstaculos) {
    assert.ok(o.y > 0 && o.y < p.largo);
    assert.ok(o.x - o.ancho / 2 >= -0.01 && o.x + o.ancho / 2 <= p.carriles + 0.01, `${o.tipo} fuera de la pista`);
    assert.ok(config.obstaculos[o.tipo].tramos.includes(tramoEn(p, o.y).tipo));
  }
});

test('la dificultad sube: más obstáculos en la segunda mitad', () => {
  let antes = 0, despues = 0;
  for (let s = 1; s <= 10; s++) {
    const p = generarPista(config, s);
    for (const o of p.obstaculos) (o.y < p.largo / 2 ? antes++ : despues++);
  }
  assert.ok(despues > antes, `${antes} vs ${despues}`);
});

test('obstáculos que cruzan se mantienen dentro de la pista', () => {
  const o = { mov: 'cruza', vel: 1.4, x: 1, ancho: 1, dir: 1, y: 100 };
  for (let t = 0; t < 30; t += 0.37) {
    const { x } = posicionObstaculo(o, t, 6);
    assert.ok(x >= 0.5 - 1e-9 && x <= 5.5 + 1e-9, `x=${x}`);
  }
});

test('una carrera de 30 autos termina sola, con explosiones y podio coherente', () => {
  const c = new Carrera({ config, pista: generarPista(config, 99), pilotos: pilotos(30), rng: crearRng(99) });
  correr(c);
  assert.equal(c.estado, 'final');
  const rk = c.ranking();
  assert.equal(rk.length, 30);
  const metas = rk.filter((a) => a.estado === 'meta');
  metas.forEach((a, i) => assert.equal(a.llegada, i + 1, 'los que llegaron, en orden de llegada'));
  assert.ok(rk.slice(0, metas.length).every((a) => a.estado === 'meta'));
  const destruidos = c.autos.filter((a) => a.estado === 'destruido');
  assert.equal(c.chatarra.length, destruidos.length, 'cada destruido deja chatarra');
  for (const a of destruidos) assert.equal(a.hp, 0);
});

test('la duración de la carrera está en el rango esperado (60–110 s)', () => {
  for (const s of [1, 2, 3]) {
    const c = new Carrera({ config, pista: generarPista(config, s), pilotos: pilotos(30), rng: crearRng(s) });
    correr(c);
    assert.ok(c.tSeg >= 55 && c.tSeg <= config.carrera.maxSeg + 1, `duró ${c.tSeg}`);
  }
});

test('golpe quita vida sin detener y frena un poco; con vida baja va más lento', () => {
  const c = new Carrera({ config, pista: { ...generarPista(config, 5), obstaculos: [] }, pilotos: pilotos(1), rng: crearRng(5) });
  c.update(config.carrera.cuentaSeg * 1000 + 10);
  const a = c.autos[0];
  c.golpear(a, { tipo: 'cono', dano: 10 }, c.tSeg);
  assert.equal(a.hp, 90);
  assert.equal(a.estado, 'vivo');
  c.update(33);
  assert.ok(a.vel > 0 && a.vel < config.carrera.velocidadBase * 0.8);
  c.golpear(a, { tipo: 'vaca', dano: 200 }, c.tSeg);
  assert.equal(a.estado, 'destruido');
  assert.equal(c.eventos.filter((e) => e.tipo === 'explosion').length, 1);
});

test('la chatarra daña a los que vienen detrás pero no a su dueño', () => {
  const pista = { ...generarPista(config, 5), obstaculos: [] };
  const c = new Carrera({ config, pista, pilotos: pilotos(2), rng: crearRng(1) });
  c.update(config.carrera.cuentaSeg * 1000 + 10);
  const [a, b] = c.autos;
  a.y = 500; a.x = 3; b.y = 300; b.x = 3; b.xObjetivo = 3; b.proxRumbo = 1e9;
  c.destruir(a);
  for (let i = 0; i < 60; i++) { b.x = 3; c.update(33); }
  assert.ok(b.hp < 100, 'el de atrás chocó con la chatarra');
});

test('Juego: con pocos inscritos rellena con bots', () => {
  const j = new Juego({ config: structuredClone(config), frases, rng: crearRng(4) });
  j.manejarEvento({ tipo: 'chat', userId: 'a', nickname: 'ana', texto: '!jugar' });
  for (let t = 0; t < config.fases.lobbySeg * 1000 + 100; t += 50) j.update(50);
  assert.equal(j.fase, 'CARRERA');
  assert.equal(j.carrera.autos.length, config.fases.rellenarHasta);
  assert.equal(j.carrera.autos.filter((a) => a.bot).length, config.fases.rellenarHasta - 1);
});

test('Juego: comentar durante la carrera anota para la próxima; snapshot ligero sin estáticos', () => {
  const j = new Juego({ config: structuredClone(config), frases, rng: crearRng(4) });
  j.manejarEvento({ tipo: 'chat', userId: 'a', nickname: 'ana', texto: '!jugar' });
  for (let t = 0; t < config.fases.lobbySeg * 1000 + 100; t += 50) j.update(50);
  j.manejarEvento({ tipo: 'chat', userId: 'z', nickname: 'zoe', texto: 'hola' });
  assert.equal(j.lobby.espera.at(-1).nombre, 'zoe');
  assert.ok(j.snapshot({ estatico: true }).carrera.pista);
  assert.equal(j.snapshot({ estatico: false }).carrera.pista, undefined);
});
