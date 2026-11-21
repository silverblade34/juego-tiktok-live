// Prueba rápida de la voz de Don Lucho:  npm run voz:probar -- "¡Hola Juanito Alimaña!"
//   ESTILO=cafe|dormido|grito npm run voz:probar -- "texto"
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Voz } from './voz.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config.json'), 'utf8'));
const texto = process.argv.slice(2).join(' ') || '¡Ey tú, Marita! Vete de acá, que ya estoy durmiendo, oe.';
const estilo = process.env.ESTILO || 'normal';

const voz = new Voz({ config, raiz: RAIZ });
await voz.iniciar();
// La voz clonada tarda en cargar: esperamos a que esté lista.
const inicio = Date.now();
while (voz.worker && !voz.worker.listo && Date.now() - inicio < 180000) await new Promise((r) => setTimeout(r, 500));
const t0 = Date.now();
const r = await voz.pedir(texto, estilo);
console.log(`[voz] "${texto}" (${estilo}) listo en ${Date.now() - t0} ms, dura ${(r.durMs / 1000).toFixed(1)} s`);
const archivo = path.join(RAIZ, 'data', 'voz-cache', path.basename(new URL(r.url, 'http://local').pathname));
execFile('afplay', [archivo], () => { voz.detener(); process.exit(0); });
