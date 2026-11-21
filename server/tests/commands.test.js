import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearComando, Cooldowns, AntiSpam } from '../commands.js';

test('parsearComando: mayúsculas, espacios y tildes', () => {
  assert.deepEqual(parsearComando('!balde'), { cmd: 'balde', args: [] });
  assert.deepEqual(parsearComando('   !BALDE   '), { cmd: 'balde', args: [] });
  assert.deepEqual(parsearComando('!Café'), { cmd: 'cafe', args: [] });
  assert.deepEqual(parsearComando('! corneta'), { cmd: 'corneta', args: [] });
  assert.deepEqual(parsearComando('!lanzar   3  ya'), { cmd: 'lanzar', args: ['3', 'ya'] });
});

test('parsearComando: no-comandos devuelven null', () => {
  assert.equal(parsearComando('hola'), null);
  assert.equal(parsearComando('jaja !balde'), null);
  assert.equal(parsearComando(''), null);
  assert.equal(parsearComando('!'), null);
  assert.equal(parsearComando(undefined), null);
});

test('Cooldowns: global bloquea a todos', () => {
  const cd = new Cooldowns();
  assert.equal(cd.restante('balde', 'a', 0).ms, 0);
  cd.registrar('balde', 'a', 0, { globalMs: 15000 });
  assert.deepEqual(cd.restante('balde', 'b', 5000), { tipo: 'global', ms: 10000 });
  assert.equal(cd.restante('balde', 'b', 15000).ms, 0);
  assert.equal(cd.restante('cafe', 'b', 1000).ms, 0, 'otro comando no se afecta');
});

test('Cooldowns: por usuario no bloquea a otros', () => {
  const cd = new Cooldowns();
  cd.registrar('bomba', 'a', 0, { usuarioMs: 25000 });
  assert.deepEqual(cd.restante('bomba', 'a', 1000), { tipo: 'usuario', ms: 24000 });
  assert.equal(cd.restante('bomba', 'b', 1000).ms, 0);
});

test('Cooldowns: purgar borra vencidos', () => {
  const cd = new Cooldowns();
  cd.registrar('x', 'a', 0, { globalMs: 10, usuarioMs: 10 });
  cd.purgar(100);
  assert.equal(cd.global.size, 0);
  assert.equal(cd.usuario.size, 0);
});

test('AntiSpam: el 5º mensaje en 10 s silencia 30 s', () => {
  const s = new AntiSpam({ maxMensajes: 4, ventanaMs: 10000, silencioMs: 30000 });
  for (let i = 0; i < 4; i++) assert.equal(s.registrar('a', i * 1000), 'ok');
  assert.equal(s.registrar('a', 4000), 'nuevoSilencio');
  assert.equal(s.registrar('a', 5000), 'silenciado');
  assert.equal(s.registrar('b', 5000), 'ok', 'otros usuarios no se afectan');
  assert.equal(s.registrar('a', 34001), 'ok', 'el silencio expira');
});

test('AntiSpam: mensajes espaciados no silencian', () => {
  const s = new AntiSpam({ maxMensajes: 4, ventanaMs: 10000, silencioMs: 30000 });
  for (let i = 0; i < 20; i++) assert.equal(s.registrar('a', i * 3000), 'ok');
});
