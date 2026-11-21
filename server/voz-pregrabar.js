// Pregraba TODAS las frases fijas con la voz configurada, sin abrir el juego.
// Úsalo antes de salir en vivo (solo hace falta una vez, o cuando cambies frases o la muestra de voz):
//   npm run voz:pregrabar
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Voz, frasesFijas } from './voz.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, f), 'utf8'));
const voz = new Voz({ config: leer('config.json'), raiz: RAIZ });
await voz.iniciar();
await voz.precalentar(frasesFijas(leer('frases.json')));
console.log('[voz] Todo pregrabado. Ya puedes salir en vivo.');
voz.detener();
process.exit(0);
