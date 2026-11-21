import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {iniciarTikTok,normalizarTikTok} from '../sources/tiktok.js';
import {normalizarEvento,crearBus} from '../bus.js';
import {TikTokLiveConnection,WebcastEvent,ControlEvent} from 'tiktok-live-connector';
const config=JSON.parse(fs.readFileSync(new URL('../../config.json',import.meta.url)));
const tick=()=>new Promise(r=>setImmediate(r));
const usuario={userId:'7654321987654321987',uniqueId:'ana.pe',nickname:'Ana'};
const regalo={user:usuario,giftId:123,repeatCount:3,repeatEnd:1,groupId:'777',giftDetails:{giftType:1},common:{msgId:'999'}};
class Conexion extends EventEmitter {
  constructor(){super();this.cerradas=0;this.promesa=new Promise((resolve,reject)=>{this.resolver=resolve;this.rechazar=reject;});}
  connect(){return this.promesa;}
  disconnect(){this.cerradas++;return Promise.resolve();}
}
function escenario(){
  const cfg=structuredClone(config);cfg.tiktok.usuario='@ana.pe';
  const clientes=[],tareas=new Map(),logs=[],eventos=[];let id=0,t=0;
  const temporizadores={setTimeout:(fn,ms)=>{const n=++id;tareas.set(n,{fn,ms});return n;},clearTimeout:n=>tareas.delete(n)};
  const bus=crearBus();bus.on('evento',e=>eventos.push(normalizarEvento(e)));
  const fuente=iniciarTikTok({config:cfg,bus,log:m=>logs.push(m),crearConexion:(nombre,opciones)=>{const c=new Conexion();c.nombre=nombre;c.opciones=opciones;clientes.push(c);return c;},temporizadores,ahora:()=>t,signApiKey:''});
  const ejecutar=ms=>{const a=[...tareas].find(([id,x])=>x.ms===ms);assert.ok(a,`temporizador de ${ms} ms`);tareas.delete(a[0]);a[1].fn();};
  return {fuente,clientes,tareas,logs,eventos,ejecutar,tiempo:n=>{t=n;}};
}

test('API instalada: cliente y nombres de eventos reales disponibles sin conectar a Internet',()=>{
  const c=new TikTokLiveConnection('prueba',{processInitialData:false});assert.equal(typeof c.connect,'function');assert.equal(typeof c.disconnect,'function');
  for(const e of ['CHAT','GIFT','MEMBER','ROOM_USER','LIKE','FOLLOW','SOCIAL','STREAM_END'])assert.equal(typeof WebcastEvent[e],'string');
  assert.equal(ControlEvent.ERROR,'error');
});
test('eventos anidados: ID estable de 64 bits, espectadores, likes, follow y share ignorado',()=>{
  assert.equal(normalizarTikTok('chat',{user:usuario,comment:'!turbo'}).userId,usuario.userId);
  assert.equal(normalizarTikTok('member',{user:usuario}).tipo,'join');
  assert.deepEqual(normalizarTikTok('roomUser',{viewerCount:35}),{tipo:'viewers',valor:35});
  assert.equal(normalizarTikTok('like',{user:usuario,likeCount:4}).valor,4);
  assert.equal(normalizarTikTok('follow',{user:usuario}).tipo,'follow');
  assert.equal(normalizarTikTok('social',{user:usuario,common:{displayText:{displayType:'live_follow'}}}).tipo,'follow');
  assert.equal(normalizarTikTok('social',{user:usuario,common:{displayText:{displayType:'live_share'}}}),null);
});
test('datos incompletos, IDs numéricos inseguros y cantidades inválidas se descartan',()=>{
  assert.equal(normalizarTikTok('chat',{user:{nickname:'Ana'},comment:'hola'}),null);
  assert.equal(normalizarTikTok('chat',{user:{userId:7654321987654321987},comment:'hola'}),null);
  for(const d of [null,{}, {viewerCount:NaN},{viewerCount:-1},{viewerCount:null},{viewerCount:'foo'},{viewerCount:1.5}])assert.equal(normalizarTikTok('roomUser',d),null);
  assert.equal(normalizarEvento({tipo:'viewers',valor:Infinity}),null);
  assert.equal(normalizarTikTok('gift',{...regalo,repeatCount:1.5}),null);
});
test('regalos en racha: solo final, cantidad final y metadatos sobreviven al bus',()=>{
  assert.equal(normalizarTikTok('gift',{...regalo,repeatEnd:0}),null);
  assert.equal(normalizarTikTok('gift',{...regalo,repeatEnd:false}),null);
  for(const repeatEnd of [true,1]){
    const ev=normalizarEvento(normalizarTikTok('gift',{...regalo,repeatEnd}));assert.equal(ev.cantidad,3);assert.equal(ev.regaloId,'123');assert.equal(ev.grupoId,'777');assert.equal(ev.eventoId,'999');
  }
  assert.equal(normalizarTikTok('gift',{...regalo,giftDetails:{giftType:2},repeatEnd:0}).cantidad,3);
});
test('usuario vacío no crea conexiones ni temporizadores',()=>{
  let creado=false;const fuente=iniciarTikTok({config,bus:crearBus(),log:()=>{},crearConexion:()=>{creado=true;}});
  assert.equal(fuente.estado().estado,'sinConfig');assert.equal(creado,false);fuente.detener();
});
test('conexión inicial sin historial y eventos deduplicados por ID y grupo de racha',async()=>{
  const s=escenario(),c=s.clientes[0];assert.equal(c.nombre,'ana.pe');assert.equal(c.opciones.processInitialData,false);
  c.emit('connected',{});c.resolver({});await tick();assert.equal(s.fuente.estado().estado,'conectado');assert.equal(s.tareas.size,0);
  c.emit('chat',{user:usuario,comment:'!escudo',common:{msgId:'10'}});c.emit('chat',{user:usuario,comment:'!escudo',common:{msgId:'10'}});
  c.emit('gift',regalo);c.emit('gift',{...regalo,common:{msgId:'1000'}});
  assert.equal(s.eventos.length,2);assert.equal(s.eventos[1].cantidad,3);
  s.tiempo(config.tiktok.deduplicarSeg*1000+1);c.emit('gift',regalo);assert.equal(s.eventos.length,3);s.fuente.detener();
});
test('backoff exponencial acotado y un solo reintento aunque lleguen error y rechazo',async()=>{
  const s=escenario();
  for(let i=0;i<8;i++){
    const c=s.clientes.at(-1);c.emit('error',{exception:new Error('red')});c.rechazar(new Error('red'));await tick();
    assert.equal(s.tareas.size,1);s.ejecutar(Math.min(config.tiktok.reconexionMaxSeg,config.tiktok.reconexionBaseSeg*2**i)*1000);
  }
  s.clientes.at(-1).resolver({});await tick();s.clientes.at(-1).emit('disconnected');s.ejecutar(config.tiktok.reconexionBaseSeg*1000);s.fuente.detener();
});
test('conexión colgada vence, se reconecta y descarta resolución o mensajes tardíos',async()=>{
  const s=escenario(),vieja=s.clientes[0];s.ejecutar(config.tiktok.timeoutMs);assert.equal(s.fuente.estado().estado,'reintentando');
  s.ejecutar(config.tiktok.reconexionBaseSeg*1000);vieja.resolver({});vieja.emit('chat',{user:usuario,comment:'viejo'});await tick();
  assert.equal(s.eventos.length,0);assert.equal(s.fuente.estado().estado,'conectando');s.fuente.detener();assert.equal(s.tareas.size,0);
});
test('LIVE terminado no reconecta; detener durante connect impide reaperturas',async()=>{
  const s=escenario(),c=s.clientes[0];c.emit('streamEnd',{});c.resolver({});await tick();assert.equal(s.fuente.estado().estado,'finalizado');assert.equal(s.tareas.size,0);s.fuente.detener();
  const otro=escenario();otro.fuente.detener();otro.clientes[0].resolver({});await tick();assert.equal(otro.fuente.estado().estado,'detenido');assert.equal(otro.tareas.size,0);assert.ok(otro.clientes[0].cerradas>0);
});

test('esquemas reales preservan IDs de 64 bits y campos anidados al codificar/decodificar',async()=>{
  const {User,Gift,WebcastGiftMessage,WebcastChatMessage}=await import('tiktok-live-connector');
  const u=User.decode(new Uint8Array());Object.assign(u,usuario);
  const chat=WebcastChatMessage.decode(new Uint8Array());Object.assign(chat,{user:u,comment:'!turbo'});
  const chat2=WebcastChatMessage.decode(WebcastChatMessage.encode(chat).finish());assert.equal(normalizarTikTok('chat',chat2).userId,usuario.userId);
  const gift=Gift.decode(new Uint8Array());gift.giftType=1;
  const mensaje=WebcastGiftMessage.decode(new Uint8Array());Object.assign(mensaje,regalo,{user:u,giftDetails:gift,common:undefined});
  const decodificado=WebcastGiftMessage.decode(WebcastGiftMessage.encode(mensaje).finish());
  assert.equal(normalizarTikTok('gift',decodificado).cantidad,3);assert.equal(normalizarTikTok('gift',decodificado).regaloId,'123');
});
test('regalos no apilables con el mismo grupo se cuentan por mensaje, sin confundirlos con rachas',()=>{
  const s=escenario(),c=s.clientes[0];const data={...regalo,giftDetails:{giftType:2}};
  c.emit('gift',data);c.emit('gift',{...data,common:{msgId:'1000'}});assert.equal(s.eventos.length,2);s.fuente.detener();
});
