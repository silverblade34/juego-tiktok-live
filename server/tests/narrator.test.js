import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Narrador, rellenar } from '../narrator.js';
import { crearRng } from '../util.js';

const frases = JSON.parse(fs.readFileSync(new URL('../../frases.json', import.meta.url), 'utf8'));

test('rellenar sustituye variables y deja las que faltan', () => {
  assert.equal(rellenar('¡Hola {nombre}! {seg}s', { nombre: 'ana', seg: 5 }), '¡Hola ana! 5s');
  assert.equal(rellenar('{x} y {y}', { x: 1 }), '1 y {y}');
});

test('nunca repite la última frase del mismo evento', () => {
  const n = new Narrador(frases, crearRng(42));
  let anterior = null;
  for (let i = 0; i < 300; i++) {
    const f = n.frase('balde', { nombre: 'ana' });
    assert.notEqual(f, anterior);
    anterior = f;
  }
});

test('evento inexistente devuelve null', () => {
  assert.equal(new Narrador(frases).frase('noExiste'), null);
});

test('cada evento de frases.json tiene al menos 8 frases', () => {
  for (const [evento, lista] of Object.entries(frases)) {
    if (evento === "feed") continue;
    const minimo = evento.startsWith("aviso_") ? 4 : 8; // avisos de obstáculo: 4 por tipo
    assert.ok(Array.isArray(lista) && lista.length >= minimo, `${evento} tiene ${lista.length} frases`);
  }
});
