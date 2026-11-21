import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Usuarios } from '../users.js';
import { Juego } from '../game.js';
import { crearRng } from '../util.js';
import { frasesFijas } from '../voz.js';
const config=JSON.parse(fs.readFileSync(new URL('../../config.json',import.meta.url)));
const frases=JSON.parse(fs.readFileSync(new URL('../../frases.json',import.meta.url)));
function almacen(t, opciones={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paradero-perfiles-'));
  const archivo=path.join(dir,'profiles.json');
  const u=new Usuarios({config,archivo,...opciones});
  t.after(()=>{u.cerrar();fs.rmSync(dir,{recursive:true,force:true});});
  return {u,archivo};
}

test('agrupa comentarios, guarda automáticamente y recarga perfiles completos',async t=>{
  const cfg=structuredClone(config);cfg.perfiles.guardadoSeg=.025;
  const {u,archivo}=almacen(t,{config:cfg});
  for(let i=0;i<5;i++)u.tocar('ana','Ana');
  u.sumar('ana','baldazos',3);
  assert.equal(fs.existsSync(archivo),false);
  await new Promise(r=>setTimeout(r,70));
  assert.equal(fs.existsSync(archivo),true);assert.equal(fs.existsSync(`${archivo}.tmp`),false);
  const copia=new Usuarios({config,archivo});t.after(()=>copia.cerrar());
  assert.deepEqual(copia.obtener('ana'),u.obtener('ana'));
  assert.equal(copia.obtener('ana').rango,'Habitual');assert.equal(copia.obtener('ana').diario.baldazos,3);
});
test('el guardado final conserva cambios antes del debounce y cancela el temporizador',t=>{
  const {u,archivo}=almacen(t);u.tocar('a','Ana');assert.ok(u.temporizador);assert.equal(u.cerrar(),true);
  assert.equal(u.temporizador,null);assert.equal(JSON.parse(fs.readFileSync(archivo)).perfiles[0].comentarios,1);
});
test('guardado atómico: respaldo anterior, rename y recuperación del principal corrupto',t=>{
  const {u,archivo}=almacen(t);u.tocar('a','Ana');u.guardar();u.sumar('a','puntos',25);u.guardar();
  assert.equal(JSON.parse(fs.readFileSync(`${archivo}.bak`)).perfiles[0].puntos,0);
  fs.writeFileSync(archivo,'{corrupto');
  const logs=[];const recuperado=new Usuarios({config,archivo,log:m=>logs.push(m)});t.after(()=>recuperado.cerrar());
  assert.equal(recuperado.obtener('a').comentarios,1);assert.equal(recuperado.obtener('a').puntos,0);assert.equal(logs.length,1);
  recuperado.sumar('a','puntos',7);assert.ok(recuperado.guardar());
  assert.equal(JSON.parse(fs.readFileSync(archivo)).perfiles[0].puntos,7);
  assert.equal(JSON.parse(fs.readFileSync(`${archivo}.bak`)).perfiles[0].puntos,0);
});
test('dos archivos corruptos no impiden arrancar y el siguiente guardado repara el respaldo',t=>{
  const {u,archivo}=almacen(t);fs.writeFileSync(archivo,'no');fs.writeFileSync(`${archivo}.bak`,'no');
  const otro=new Usuarios({config,archivo,log:()=>{}});t.after(()=>otro.cerrar());assert.equal(otro.perfiles.size,0);
  otro.tocar('b','Beto');assert.equal(otro.guardar(),true);assert.equal(JSON.parse(fs.readFileSync(`${archivo}.bak`)).perfiles[0].nombre,'Beto');
});
test('un fallo de rename conserva los datos previos y deja los cambios pendientes',t=>{
  const {u,archivo}=almacen(t,{log:()=>{}});u.tocar('a','Ana');u.guardar();u.sumar('a','victorias');
  const original=fs.renameSync;fs.renameSync=()=>{throw new Error('Disco no disponible');};
  try {assert.equal(u.guardar(),false);assert.equal(u.pendiente,true);assert.equal(JSON.parse(fs.readFileSync(archivo)).perfiles[0].victorias,0);}
  finally {fs.renameSync=original;}
  assert.ok(u.guardar());assert.equal(JSON.parse(fs.readFileSync(archivo)).perfiles[0].victorias,1);
});
test('rangos y cosméticos se desbloquean por comentarios acumulados sin perder estadísticas',()=>{
  const u=new Usuarios({config});
  for(let i=1;i<=50;i++){
    const p=u.tocar('a','Ana');
    assert.equal(p.rango,i<5?'Curioso':i<20?'Habitual':i<50?'Fiel':'Leyenda');
  }
  assert.deepEqual(u.obtener('a').cosmeticos,['distintivo','estela','techoDorado']);
  assert.equal(u.apariencia('a').cosmeticos.length,3);
  u.tocar('a','Ana nueva');assert.equal(u.obtener('a').comentarios,51);assert.equal(u.perfiles.size,1);
});
test('medianoche de Lima reinicia solo el diario incluso sin nuevos comentarios',()=>{
  let fecha=new Date('2026-11-22T04:59:59Z');const u=new Usuarios({config,reloj:()=>fecha});
  u.tocar('a','Ana');u.sumar('a','baldazos',4);u.sumar('a','victorias',2);u.sumar('a','puntos',30);
  assert.equal(u.rankings().fecha,'2026-11-21');assert.equal(u.rankings().diario.puntos[0].valor,30);
  fecha=new Date('2026-11-22T05:00:00Z');assert.equal(u.rankings().fecha,'2026-11-22');assert.deepEqual(u.rankings().diario.puntos,[]);
  assert.equal(u.obtener('a').puntos,30);assert.equal(u.obtener('a').victorias,2);assert.equal(u.obtener('a').rango,'Curioso');
  u.sumar('a','puntos',5);assert.equal(u.rankings().diario.puntos[0].valor,5);assert.equal(u.rankings().global.puntos[0].valor,35);
});
test('recarga otro día: diario vacío, global y rangos conservados',t=>{
  const {u,archivo}=almacen(t,{reloj:()=>new Date('2026-11-21T20:00:00Z')});
  for(let i=0;i<20;i++)u.tocar('a','Ana');u.sumar('a','puntos',25);u.cerrar();
  const otro=new Usuarios({config,archivo,reloj:()=>new Date('2026-11-22T20:00:00Z')});t.after(()=>otro.cerrar());
  assert.equal(otro.obtener('a').diario.puntos,0);assert.equal(otro.obtener('a').puntos,25);assert.equal(otro.obtener('a').rango,'Fiel');
});
test('ranking ordena, limita, resuelve empates por ID y no incluye usuarios sin puntuación',()=>{
  const u=new Usuarios({config});for(const id of ['d','b','c','a','e']){u.tocar(id,id);if(id!=='e')u.sumar(id,'puntos',10);}
  assert.deepEqual(u.rankings().global.puntos.map(p=>p.userId),['a','b','c']);
  const cache=u.rankings();assert.equal(u.rankings(),cache);u.sumar('d','puntos',1);assert.equal(u.rankings().global.puntos[0].userId,'d');
});
test('datos malformados recuperan respaldo; campos desconocidos no alteran perfiles',t=>{
  const {u,archivo}=almacen(t);u.tocar('a','Ana');u.guardar();const d=JSON.parse(fs.readFileSync(archivo));d.perfiles[0].puntos=-1;fs.writeFileSync(archivo,JSON.stringify(d));
  const otro=new Usuarios({config,archivo,log:()=>{}});t.after(()=>otro.cerrar());assert.equal(otro.obtener('a').puntos,0);
  otro.sumar('a','nombre',1);otro.sumar('a','puntos',NaN);assert.equal(otro.obtener('a').nombre,'Ana');assert.equal(otro.obtener('a').puntos,0);
});
test('Juego emite ascenso, propaga cosméticos y acredita daño efectivo y victoria una vez',()=>{
  const j=new Juego({config:structuredClone(config),frases,rng:crearRng(5)});
  for(let i=0;i<49;i++)j.usuarios.tocar('a','Ana');j.usuarios.tocar('b','Beto');
  j.iniciarCarrera([{userId:'a',nombre:'Ana',cupo:1},{userId:'b',nombre:'Beto',cupo:2}]);j.update(config.carrera.cuentaSeg*1000);
  j.manejarChat({userId:'a',nickname:'Ana',texto:'!turbo'});
  assert.ok(j.eventos.some(e=>e.tipo==='subeRango'&&e.rango==='Leyenda'));
  assert.equal(j.snapshot().carrera.info[0].cosmeticos.length,3);
  const [a,b]=j.carrera.autos;a.y=0;b.y=100;b.hp=5;
  j.carrera.bomba(a.id);j.atenderCarrera();assert.equal(j.usuarios.obtener('a').danoCausado,5);
  for(const auto of j.carrera.vivos())j.carrera.llegarMeta(auto,j.carrera.tSeg);
  j.update(33);assert.equal(j.fase,'RESULTADOS');assert.equal(j.usuarios.obtener('a').victorias,1);assert.equal(j.usuarios.obtener('a').carreras,1);
  assert.equal(j.resultados.filas[0].rango,'Leyenda');assert.ok(j.resultados.rankings.diario.puntos.length);
  j.update(33);assert.equal(j.usuarios.obtener('a').victorias,1);
});
test('subida de rango tiene ocho frases fijas pregrabables sin nombre',()=>{
  assert.equal(frases.subeRango.length,8);for(const texto of frases.subeRango)assert.ok(frasesFijas(frases).some(f=>f.texto===texto&&f.estilo==='normal'));
});

test('recuperación desde respaldo repara el principal aun sin comentarios nuevos',t=>{
  const {u,archivo}=almacen(t);u.tocar('a','Ana');u.cerrar();fs.writeFileSync(archivo,'roto');
  const otro=new Usuarios({config,archivo,log:()=>{}});assert.equal(otro.pendiente,true);assert.ok(otro.cerrar());
  assert.equal(JSON.parse(fs.readFileSync(archivo)).perfiles[0].nombre,'Ana');
});
test('diez rondas de 25 jugadores guardan y recargan estadísticas y rangos coherentes',t=>{
  const {u,archivo}=almacen(t);const j=new Juego({config:structuredClone(config),frases,usuarios:u,rng:crearRng(88)});
  const humanos=Array.from({length:25},(_,i)=>({userId:`u${i}`,nombre:`Piloto ${i}`,cupo:i+1,modelo:'sedan',color:i%12}));
  for(let ronda=0;ronda<10;ronda++){
    for(const p of humanos)u.tocar(p.userId,p.nombre);
    j.iniciarCarrera(humanos);
    let pasos=0;while(j.fase==='CARRERA'&&pasos++<5000)j.update(33);
    assert.equal(j.fase,'RESULTADOS');
  }
  assert.ok(u.cerrar());const copia=new Usuarios({config,archivo});t.after(()=>copia.cerrar());
  assert.equal(copia.perfiles.size,25);
  for(const p of copia.perfiles.values()){
    assert.equal(p.carreras,10);assert.equal(p.rango,'Habitual');assert.equal(p.comentarios,10);assert.equal(p.diario.carreras,10);
    assert.ok(p.victorias<=10&&p.puntos>=0);
  }
  assert.deepEqual(copia.rankings(),u.rankings());
});
test('el ascenso espera su turno de voz y no se pierde al abrir lobby',()=>{
  const j=new Juego({config:structuredClone(config),frases,rng:crearRng(9)});
  for(let i=0;i<4;i++)j.usuarios.tocar('a','Ana');
  j.manejarChat({userId:'a',nickname:'Ana',texto:'!jugar'});assert.equal(j.fase,'LOBBY');assert.ok(j.avisoRangoPendiente);
  j.update(33);assert.ok(j.avisoRangoPendiente);
  const narradas=[];j.lucho.hablando=()=>false;j.lucho.narrar=(t,e)=>{narradas.push(e);return true;};
  j.update(33);assert.ok(narradas.includes('subeRango'));assert.equal(j.avisoRangoPendiente,false);
});
