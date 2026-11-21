import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Carrera } from '../race.js';
import { Juego } from '../game.js';
import { crearRng } from '../util.js';
import { generarPista } from '../track.js';
import { frasesFijas } from '../voz.js';
const config = JSON.parse(fs.readFileSync(new URL('../../config.json', import.meta.url)));
const frases = JSON.parse(fs.readFileSync(new URL('../../frases.json', import.meta.url)));
function carrera(n=3, obstaculos=[]) {
  const c = new Carrera({config:structuredClone(config),pista:{...generarPista(config,42),obstaculos},pilotos:Array.from({length:n},(_,i)=>({id:i+1,userId:`u${i+1}`,nombre:`Piloto ${i+1}`})),rng:crearRng(42)});
  c.update(config.carrera.cuentaSeg*1000);return c;
}
function juego() {
  const j=new Juego({config:structuredClone(config),frases,rng:crearRng(42)});
  j.abrirLobby({userId:'u1',nombre:'Ana'});j.inscribir('u2','Beto');j.finLobby();j.update(config.carrera.cuentaSeg*1000);return j;
}
const chat=(j,id,texto)=>j.manejarChat({userId:id,nickname:id,texto});

test('turbo: dos cargas, velocidad extra y daño multiplicado',()=>{
  const c=carrera(),a=c.autos[0];assert.ok(c.aplicarTurbo(1).ok);c.update(33);assert.ok(a.vel>config.carrera.velocidadBase*1.2);
  c.golpear(a,{tipo:'cono',dano:10},c.tSeg);assert.equal(a.hp,85);
  assert.equal(c.aplicarTurbo(1).motivo,'activo');c.update(3100);assert.ok(c.aplicarTurbo(1).ok);c.update(3100);
  assert.equal(c.aplicarTurbo(1).motivo,'sinCargas');assert.equal(a.cargasTurbo,0);
});
test('escudo absorbe un golpe, se consume y expira',()=>{
  const c=carrera(),a=c.autos[0];c.aplicarEscudo(1);c.golpear(a,{dano:20},c.tSeg);assert.equal(a.hp,100);
  c.golpear(a,{dano:20},c.tSeg);assert.equal(a.hp,80);c.aplicarEscudo(1);c.update(8100);c.golpear(a,{dano:10},c.tSeg);assert.equal(a.hp,70);
});
test('reparación: un uso, vida limitada y freno temporal',()=>{
  const c=carrera(),a=c.autos[0];assert.equal(c.reparar(1).motivo,'vidaCompleta');a.hp=90;assert.ok(c.reparar(1).ok);assert.equal(a.hp,100);
  c.update(33);assert.ok(a.vel<100);c.update(2100);assert.ok(a.vel>100);assert.equal(c.reparar(1).motivo,'sinCargas');
});
test('bomba: objetivo más cercano adelante, escudo y venganza',()=>{
  const c=carrera(),[a,b,d]=c.autos;a.y=10;b.y=100;d.y=50;
  c.bomba(1);assert.equal(b.hp,100);assert.equal(d.hp,82);
  a.y=60;c.bomba(3);assert.ok(c.eventos.some(e=>e.tipo==='venganza'));
  c.aplicarEscudo(1);const hp=a.hp;c.bomba(3);assert.equal(a.hp,hp);
  b.y=1000;assert.equal(c.bomba(2).motivo,'sinObjetivo');
});
test('esquivar evita el próximo obstáculo y conserva rumbo hasta cruzarlo',()=>{
  const o={id:'o',tipo:'cono',x:3,y:400,ancho:1,dano:20,mov:'fijo'};
  const c=carrera(1,[o]),a=c.autos[0];a.x=3;a.xObjetivo=3;a.proxRumbo=0;
  assert.ok(c.esquivar(1).ok);while(a.y<=420)c.update(33);
  assert.equal(a.hp,100);assert.ok(c.eventos.some(e=>e.tipo==='esquivarExito'));assert.equal(c.esquivar(1).motivo,'sinObjetivo');
});
test('aceite derrapa sin daño, excluye dueño y caduca; fantasma crea proyectil',()=>{
  const c=carrera(),[a,b]=c.autos;a.y=300;b.y=100;a.x=b.x=3;b.xObjetivo=3;b.proxRumbo=1000;
  c.soltarAceite(1);const o=c.obstaculos.at(-1);assert.equal(o.duenoId,1);
  while(b.y<270)c.update(33);assert.equal(b.hp,100);assert.ok(b.derrapeHastaSeg>0);
  assert.equal(c.lanzar(1,2).motivo,'noFantasma');c.destruir(a);assert.equal(c.lanzar(1,7).ok,false);assert.ok(c.lanzar(1,2).ok);
  assert.equal(c.obstaculos.at(-1).x,1.5);c.update(16000);assert.ok(!c.obstaculos.some(o=>o.hastaSeg));
});
test('chat: no inscritos y muertos ignorados; fantasma solo lanza; cooldown individual y reinicio',()=>{
  const j=juego(),[a,b]=j.carrera.autos;chat(j,'fuera','!turbo');assert.equal(j.carrera.eventos.length,0);
  chat(j,'u1','!escudo');chat(j,'u1','!escudo');assert.ok(j.eventos.some(e=>e.tipo==='cooldown'&&e.autoId===a.id));
  chat(j,'u2','!escudo');assert.ok(b.escudoHastaSeg>0);
  j.carrera.destruir(a);const n=j.carrera.eventos.length;chat(j,'u1','!bomba');assert.equal(j.carrera.eventos.length,n);
  j.antiSpam.purgar(j.t+30000);chat(j,'u1','!lanzar 2');assert.ok(j.carrera.eventos.some(e=>e.tipo==='fantasmaLanza'));
  j.iniciarCarrera([{userId:'u1',nombre:'Ana',cupo:1}]);assert.equal(j.cooldowns.restante('escudo','u1',j.t).ms,0);
});
test('equipos optativos: elección única y marcador en snapshot',()=>{
  const c=carrera();assert.equal(c.accion(1,'ceviche').ok,false);c.equipos.activo=true;
  assert.ok(c.accion(1,'ceviche').ok);assert.equal(c.accion(1,'chifa').ok,false);assert.equal(c.snapshot(true).equipos.length,2);
});
test('misma semilla: usar escudo y turbo mejora llegada y posición final',()=>{
  const correr=(estrategia)=>{
    const c=carrera(2,[{id:'bache',tipo:'bache',x:.5,y:150,ancho:1,dano:80,mov:'fijo'}]);
    c.cfg.variacion=0;c.cfg.derivaCarrilesPorSeg=0;c.cfg.separacionLargo=0;c.cfg.ligaFuerza=0;
    if(estrategia){c.aplicarEscudo(1);c.aplicarTurbo(1);}
    while(c.estado!=='final')c.update(33);return c;
  };
  const sin=correr(false),con=correr(true);
  assert.ok(con.autos[0].tiempoMetaSeg<sin.autos[0].tiempoMetaSeg);
  assert.ok(con.ranking().findIndex(a=>a.id===1)<sin.ranking().findIndex(a=>a.id===1));
});
test('10 rondas con 25 pilotos y decisiones terminan con estado válido y efectos',()=>{
  const tipos=new Set();
  for(let semilla=1;semilla<=10;semilla++){
    const c=carrera(25);c.obstaculos=generarPista(config,semilla).obstaculos;
    let proximo=0;
    while(c.estado!=='final'){
      c.update(33);
      if(c.tSeg>=proximo){
        proximo+=8;
        for(const a of c.autos){const cmd=a.estado==='destruido'?'lanzar':config.simulador.comandosCarrera[(a.id+Math.floor(c.tSeg/8))%6];c.accion(a.id,cmd);}
      }
      for(const ev of c.eventos)tipos.add(ev.tipo);c.eventos=[];
      assert.ok(c.autos.every(a=>Number.isFinite(a.y)&&Number.isFinite(a.x)&&a.hp>=0&&a.hp<=100));
    }
    assert.equal(c.ranking().length,25);
  }
  for(const tipo of ['turbo','escudo','reparar','bomba','aceite','fantasmaLanza'])assert.ok(tipos.has(tipo),tipo);
});
test('nuevas reacciones se pregraban sin nombres en estilo normal',()=>{
  const fijas=frasesFijas(frases);
  for(const evento of ['turbo','escudo','escudoRoto','reparar','bomba','venganza','aceite','derrape','esquivar','esquivarExito','fantasmaLanza','adelantamiento','ultimoPuesto']){
    assert.ok(frases[evento].length>=8);
    for(const texto of frases[evento])assert.ok(fijas.some(f=>f.texto===texto&&f.estilo==='normal'));
  }
});

test('snapshots conservan recursos y obstáculos; avisos no rompen la secuencia de eventos',()=>{
  const j=juego();chat(j,'u1','!escudo');chat(j,'u1','!aceite');
  j.carrera.emitir('aviso',{id:'o-prueba',obstaculo:'vaca'});j.atenderCarrera();
  const s=j.snapshot({estatico:true}), ligero=j.snapshot({estatico:false});
  assert.deepEqual(s.carrera.recursos,ligero.carrera.recursos);
  assert.equal(s.carrera.recursos[0].escudo,true);assert.equal(s.carrera.dinamicos[0].tipo,'aceite');
  assert.ok(s.eventos.every(e=>Number.isInteger(e.id)));
  assert.ok(s.eventos.some(e=>e.obstaculoId==='o-prueba'));
});
test('lanzar aplica cooldown por fantasma y la narración respeta su cadencia',()=>{
  const j=juego();j.carrera.destruir(j.carrera.autos[0]);
  chat(j,'u1','!lanzar 1');chat(j,'u1','!lanzar 2');
  assert.equal(j.carrera.obstaculos.filter(o=>o.tipo==='proyectil').length,1);
  assert.ok(j.eventos.some(e=>e.cmd==='lanzar'&&e.seg===40));
  const narraciones=[];j.lucho.narrar=(t,evento)=>{narraciones.push(evento);return true;};
  j.narrarReaccionCarrera('turbo');j.narrarReaccionCarrera('bomba');assert.deepEqual(narraciones,['turbo']);
  j.t+=config.carrera.narrarReaccionCadaSeg*1000;j.narrarReaccionCarrera('escudo');assert.deepEqual(narraciones,['turbo','escudo']);
});
