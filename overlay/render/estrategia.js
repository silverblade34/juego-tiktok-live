// Efectos de estrategia: posiciones del mundo para que sigan a la cámara.
import { textoContorno } from './texto.js';
import { dibujarIcono } from './iconos.js';
import { VISTA } from './camera.js';

export class Estrategia {
  constructor() { this.avisos = []; }
  evento(ev, carrera) {
    const tipos = ['turbo','escudo','escudoRoto','reparar','bomba','aceite','derrape','esquivar','esquivarExito','fantasmaLanza','venganza','cooldown'];
    if (!ev.autoId || !tipos.includes(ev.tipo)) return;
    const a = carrera.autos.find(a => a[0] === ev.autoId);
    const b = carrera.autos.find(a => a[0] === ev.objetivoId);
    if (!a) return;
    const mensajes = { sinCargas: 'Sin cargas', vidaCompleta: 'Vida completa', sinObjetivo: 'Sin objetivo', activo: 'Ya está activo' };
    this.avisos.push({ ...ev, x: a[2], y: a[1], proyectilY: ev.y, destino: b ? { x: b[2], y: b[1] } : null,
      texto: ev.tipo === 'cooldown' ? (mensajes[ev.motivo] ?? `!${ev.cmd}: ${ev.seg}s`) : ({ escudoRoto: '¡Escudo absorbió!', esquivar: '➜ ¡A un lado!', esquivarExito: '¡Esquive logrado!', fantasmaLanza: '¡Desde las gradas!', venganza: '¡Venganza!' }[ev.tipo] ?? `!${ev.tipo}`), vida: 2 });
    if (this.avisos.length > 60) this.avisos.shift();
  }
  update(dt) { this.avisos = this.avisos.filter(e => (e.vida -= dt) > 0); }
  dibujar(ctx, s, camara) {
    const c = s.carrera;
    for (const o of c.dinamicos ?? []) {
      const p = camara.aPantalla(o.x, o.y, c.carriles);
      if (p.y < 200 || p.y > 1550) continue;
      ctx.fillStyle = o.tipo === 'aceite' ? '#171226' : '#fa5741';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, o.ancho * VISTA.anchoCarril / 2 * camara.zoom, 14 * camara.zoom, -.2, 0, Math.PI * 2); ctx.fill();
    }
    for (const e of this.avisos) {
      const a = c.autos.find(a => a[0] === e.autoId);
      const p = camara.aPantalla(a?.[2] ?? e.x, a?.[1] ?? e.y, c.carriles);
      ctx.save(); ctx.globalAlpha = Math.min(1, e.vida);
      if (e.tipo === 'bomba' && e.destino) {
        const b = camara.aPantalla(e.destino.x, e.destino.y, c.carriles);
        const t = Math.min(1, (2-e.vida)*2);
        const x = p.x+(b.x-p.x)*t, y = p.y+(b.y-p.y)*t-Math.sin(t*Math.PI)*130;
        ctx.fillStyle = '#ffb633'; ctx.beginPath(); ctx.arc(x,y,t<1?13:35,0,Math.PI*2);ctx.fill();
      }
      if (e.tipo === 'fantasmaLanza') {
        const t = Math.min(1, (2-e.vida)*2);
        const b = camara.aPantalla(e.carril-.5, e.proyectilY, c.carriles);
        ctx.fillStyle='#ff5544';ctx.beginPath();ctx.arc(40+(b.x-40)*t,220+(b.y-220)*t,15,0,Math.PI*2);ctx.fill();
      }
      textoContorno(ctx, e.texto, p.x, p.y-95-(2-e.vida)*32, {px:24,color:'#fff09a',grosor:5});
      ctx.restore();
    }
  }
}

export function dibujarRecursos(ctx, p, r, z, tiempo) {
  if (!r) return;
  ctx.save(); ctx.translate(p.x,p.y); ctx.scale(z,z);
  if (r.escudo) { ctx.strokeStyle='#62eaff';ctx.lineWidth=5;ctx.fillStyle='#52dbff30';ctx.beginPath();ctx.ellipse(0,0,46,82,0,0,Math.PI*2);ctx.fill();ctx.stroke(); }
  if (r.acelerando) { ctx.fillStyle='#ff9739';ctx.beginPath();ctx.moveTo(-20,55);ctx.lineTo(0,115+Math.sin(tiempo*40)*15);ctx.lineTo(20,55);ctx.fill(); }
  if (r.derrape) { ctx.strokeStyle='#eee';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-25,45);ctx.lineTo(-40,100);ctx.moveTo(25,45);ctx.lineTo(10,100);ctx.stroke(); }
  ctx.restore();
  textoContorno(ctx, `${'ϟ'.repeat(r.turbo)}${r.reparar ? ' +':''}${r.escudo ? ' ◇':''}`,p.x,p.y+85*z,{px:22,color:'#ffe66c',grosor:4});
}

export function dibujarLeyendaCarrera(ctx, s, info, cliente) {
  const defs = cliente?.comandos ?? {};
  const lista = ['turbo','escudo','reparar','bomba','aceite','esquivar'].map(cmd => {
    const d=defs[cmd] ?? {};
    const detalle=d.cargas ? `${d.cargas} ${d.cargas===1?'uso':'cargas'}` : `${d.escudoSeg ? `${d.escudoSeg}s · `:''}cd ${d.cooldownUsuarioSeg ?? 0}s`;
    return [cmd, detalle];
  });
  lista.forEach(([cmd,detalle],i) => {
    const x=300+(i%3)*250,y=1740+Math.floor(i/3)*66;
    dibujarIcono(ctx,cmd,x,y,.25);
    textoContorno(ctx,`!${cmd}`,x+95,y-3,{px:26,color:'#fff',grosor:5});
    textoContorno(ctx,detalle,x+95,y+22,{px:19,color:'#ffdb8b',grosor:3});
  });
  textoContorno(ctx,`Gradas: !lanzar [1–${s.carrera.carriles}] · cd ${defs.lanzar?.cooldownUsuarioSeg ?? 0}s`,650,1878,{px:25,color:'#fff',grosor:5});
  s.feed.slice(0,2).forEach((f,i) => textoContorno(ctx,f.texto,510,238+i*34,{px:23,color:'#fff',grosor:5}));
  const muertos=s.carrera.autos.filter(a=>a[4]===1).map(a=>info.get(a[0])?.nombre ?? '').filter(Boolean);
  if (muertos.length) {
    const i=Math.floor(s.carrera.tSeg/3)%muertos.length;
    textoContorno(ctx,`GRADAS (${muertos.length}): ${muertos[i]}`,540,1530,{px:26,color:'#ffd99a',grosor:6});
  }
  if (s.carrera.equipos?.length) textoContorno(ctx,s.carrera.equipos.map(e=>`${e.bando}: ${e.puntos}`).join('   ·   ') + ' · !ceviche / !chifa',540,1490,{px:26,color:'#fff',grosor:5});
}
