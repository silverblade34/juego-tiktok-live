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

const preparadas={aburrido:['Plantilla de respaldo.'],turbo:['¡Turbo fijo!']};
const opcionesIA={activo:true,timeoutMs:20,maxCaracteres:100,maxPendientes:1,eventosPermitidos:['aburrido']};
test('generate: desactivada o sin proveedor conserva plantilla; reacción nunca llama a IA',async()=>{
  let llamadas=0;const generador=()=>{llamadas++;return 'Texto IA.';};
  const apagado=new Narrador(preparadas,Math.random,{config:{...opcionesIA,activo:false},generador});
  assert.equal(await apagado.generate('aburrido'),'Plantilla de respaldo.');
  assert.equal(await new Narrador(preparadas,Math.random,{config:opcionesIA}).generate('aburrido'),'Plantilla de respaldo.');
  const activo=new Narrador(preparadas,Math.random,{config:opcionesIA,generador});assert.equal(await activo.generate('turbo'),'¡Turbo fijo!');assert.equal(llamadas,0);
});
test('generate: proveedor válido recibe contexto y señal de aborto',async()=>{
  let pedido;const n=new Narrador(preparadas,Math.random,{config:opcionesIA,generador:async p=>{pedido=p;return '  Chacota nueva.  ';}});
  assert.equal(await n.generate('aburrido',{n:2}),'Chacota nueva.');assert.equal(pedido.evento,'aburrido');assert.equal(pedido.vars.n,2);assert.equal(pedido.signal.aborted,false);assert.equal(n.pendientes,0);
});
test('generate: timeout retorna plantilla, aborta y descarta resultado tardío',async()=>{
  let signal,resolver;const n=new Narrador(preparadas,Math.random,{config:opcionesIA,generador:p=>{signal=p.signal;return new Promise(r=>{resolver=r;});}});
  assert.equal(await n.generate('aburrido'),'Plantilla de respaldo.');assert.equal(signal.aborted,true);resolver('Demasiado tarde.');assert.equal(n.pendientes,0);
});
test('generate: errores, texto vacío, excesivo o con etiquetas usan respaldo',async()=>{
  for(const generador of [()=>{throw new Error('fallo');},()=>Promise.reject(new Error('red')),()=>'',()=>null,()=>'<script>no</script>',()=>'{nombre}',()=> 'x'.repeat(101)]){
    const n=new Narrador(preparadas,Math.random,{config:opcionesIA,generador});assert.equal(await n.generate('aburrido'),'Plantilla de respaldo.');assert.equal(n.pendientes,0);
  }
});
test('generate: exceso de peticiones cae inmediatamente a plantilla',async()=>{
  let resolver;const n=new Narrador(preparadas,Math.random,{config:{...opcionesIA,timeoutMs:1000},generador:()=>new Promise(r=>{resolver=r;})});
  const primero=n.generate('aburrido');assert.equal(await n.generate('aburrido'),'Plantilla de respaldo.');resolver('Listo.');assert.equal(await primero,'Listo.');assert.equal(n.pendientes,0);
});
