// Reemplaza grabaciones defectuosas sin cambiar textos, muestra vocal ni otro audio del LIVE.
// npm run voz:regenerar -- balde baldeDormido   (o --todas para todas las frases fijas)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Voz, frasesFijas } from './voz.js';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(raiz, 'config.json')));
const frases = JSON.parse(fs.readFileSync(path.join(raiz, 'frases.json')));
const eventos = process.argv.slice(2);
if (!eventos.length || eventos.some(e => e !== '--todas' && !Array.isArray(frases[e]))) {
  console.error('Uso: npm run voz:regenerar -- balde baldeDormido (o --todas)');
  process.exit(1);
}
const seleccion = eventos.includes('--todas') ? frases : Object.fromEntries(eventos.map(e => [e, frases[e]]));
const voz = new Voz({ config, raiz });
let fallos = 0;
try {
  await voz.iniciar();
  const inicio = Date.now();
  while (voz.worker && !voz.worker.listo && Date.now() - inicio < 180000) await new Promise(r => setTimeout(r, 500));
  if (voz.worker && !voz.worker.listo) throw new Error('La voz no terminó de cargar');
  const lista = frasesFijas(seleccion);
  for (const [i, f] of lista.entries()) {
    try { await voz.regenerar(f.texto, f.estilo); console.log(`[voz] Regenerada ${i+1}/${lista.length}: ${f.texto}`); }
    catch (e) { fallos++; console.error(`[voz] No se regeneró: ${f.texto}: ${e.message}`); }
  }
  console.log(`[voz] Terminó: ${lista.length-fallos}/${lista.length} grabaciones reemplazadas.`);
} catch (e) { fallos++; console.error(e.message); }
finally { voz.detener(); }
process.exit(fallos ? 1 : 0);
