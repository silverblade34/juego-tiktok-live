import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planificarRegalo} from '../regalos.js';
import {Juego} from '../game.js';
import {normalizarEvento} from '../bus.js';
import {normalizarTikTok} from '../sources/tiktok.js';
import {crearRng} from '../util.js';
const config=JSON.parse(fs.readFileSync(new URL('../../config.json',import.meta.url)));
const frases=JSON.parse(fs.readFileSync(new URL('../../frases.json',import.meta.url)));
const regalo={tipo:'gift',userId:'u1',nickname:'Ana',regaloId:'123',cantidad:2};
const activado=()=>{const c=structuredClone(config);c.regalos.activo=true;c.regalos.mapa['123']='confeti';return c;};
test('regalos desactivados o no mapeados no generan planes',()=>{
  assert.equal(planificarRegalo(regalo,config),null);assert.equal(planificarRegalo({...regalo,regaloId:'desconocido'},activado()),null);
});
test('mapa solo devuelve efecto visual con campos conocidos',()=>{
  const c=activado();Object.assign(c.regalos.efectos.confeti,{hp:999,velocidad:10,victoria:true,puntos:1000});
  const p=planificarRegalo(regalo,c);assert.deepEqual(p.efecto,{tipo:'confeti',color:'#ffd23f',duracionSeg:3});assert.equal(p.cantidad,2);
});
test('tipos competitivos, cantidades y apariencias inválidas se rechazan',()=>{
  for(const tipo of ['turbo','reparar','victoria']){const c=activado();c.regalos.efectos.confeti.tipo=tipo;assert.equal(planificarRegalo(regalo,c),null);}
  for(const cantidad of [0,-1,NaN,1.5])assert.equal(planificarRegalo({...regalo,cantidad},activado()),null);
  const c=activado();c.regalos.efectos.confeti.color='url(javascript:...)';assert.equal(planificarRegalo(regalo,c),null);
});
test('regalo real normalizado llega al juego sin cambiar vida, recursos, ranking ni victoria',()=>{
  const j=new Juego({config:activado(),frases,rng:crearRng(3)});j.abrirLobby({userId:'u1',nombre:'Ana'});j.finLobby();j.update(4100);
  const antes=j.snapshot();
  const ev=normalizarEvento(normalizarTikTok('gift',{user:{userId:'u1',nickname:'Ana'},giftId:123,repeatCount:2,repeatEnd:1,giftDetails:{giftType:1}}));
  assert.equal(ev.regaloId,'123');j.manejarEvento(ev);const despues=j.snapshot();assert.deepEqual(despues.carrera,antes.carrera);assert.deepEqual(despues.rankings,antes.rankings);assert.deepEqual(despues.eventos,antes.eventos);
});
