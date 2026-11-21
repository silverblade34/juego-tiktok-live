// Íconos de la leyenda de comandos, dibujados con formas. Centrados en (0,0), tamaño ~1 = 100px.
import { P } from './palette.js';

const DIBUJOS = {
  turbo(ctx) { ctx.fillStyle='#ffbf39';ctx.beginPath();ctx.moveTo(10,-40);ctx.lineTo(-25,8);ctx.lineTo(0,8);ctx.lineTo(-10,40);ctx.lineTo(30,-8);ctx.lineTo(5,-8);ctx.closePath();ctx.fill();ctx.stroke(); },
  escudo(ctx) { ctx.fillStyle='#55dfff';ctx.beginPath();ctx.moveTo(0,-38);ctx.lineTo(32,-22);ctx.quadraticCurveTo(35,20,0,40);ctx.quadraticCurveTo(-35,20,-32,-22);ctx.closePath();ctx.fill();ctx.stroke(); },
  reparar(ctx) { ctx.fillStyle='#75e89c';ctx.fillRect(-10,-35,20,70);ctx.fillRect(-35,-10,70,20); },
  bomba(ctx) { ctx.fillStyle='#323146';ctx.beginPath();ctx.arc(0,8,28,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(10,-18);ctx.lineTo(20,-38);ctx.stroke(); },
  aceite(ctx) { ctx.fillStyle='#392948';ctx.beginPath();ctx.ellipse(0,10,38,20,-.2,0,Math.PI*2);ctx.fill();ctx.stroke(); },
  esquivar(ctx) { ctx.strokeStyle='#ffe17b';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-30,30);ctx.lineTo(25,-25);ctx.lineTo(0,-25);ctx.moveTo(25,-25);ctx.lineTo(25,0);ctx.stroke(); },
  balde(ctx) {
    ctx.beginPath();
    ctx.moveTo(-34, -22); ctx.lineTo(34, -22); ctx.lineTo(25, 38); ctx.lineTo(-25, 38); ctx.closePath();
    ctx.fillStyle = P.balde; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -22, 34, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = P.agua;
    ctx.beginPath(); ctx.ellipse(0, -22, 31, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, -26); ctx.quadraticCurveTo(48, -14, 42, 4); ctx.quadraticCurveTo(36, -6, 30, -26); ctx.fill();
  },
  cafe(ctx) {
    ctx.fillStyle = P.taza;
    ctx.beginPath(); ctx.roundRect(-28, -14, 48, 48, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(22, 8, 12, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = P.cafe; ctx.fillRect(-22, -8, 36, 8);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
    for (const x of [-14, 4]) {
      ctx.beginPath(); ctx.moveTo(x, -22); ctx.quadraticCurveTo(x - 8, -32, x, -42); ctx.stroke();
    }
  },
  corneta(ctx) {
    ctx.beginPath();
    ctx.moveTo(36, -8); ctx.lineTo(-6, -8); ctx.lineTo(-36, -30); ctx.lineTo(-36, 30); ctx.lineTo(-6, 8); ctx.lineTo(36, 8); ctx.closePath();
    ctx.fillStyle = P.corneta; ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.peligro;
    ctx.beginPath(); ctx.arc(38, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  },
  manta(ctx) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-38, -30, 76, 60, 12); ctx.clip();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = P.manta[i % P.manta.length]; ctx.fillRect(-40, -30 + i * 10, 80, 10); }
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(-38, -30, 76, 60, 12); ctx.stroke();
  },
  jugar(ctx) {
    // banderín a cuadros
    ctx.fillStyle = P.poste;
    ctx.fillRect(-32, -38, 8, 78); ctx.strokeRect(-32, -38, 8, 78);
    ctx.save();
    ctx.beginPath(); ctx.rect(-24, -36, 60, 42); ctx.clip();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      ctx.fillRect(-24 + i * 10, -36 + j * 10.5, 10, 10.5);
    }
    ctx.restore();
    ctx.strokeRect(-24, -36, 60, 42);
  },
};

export function dibujarIcono(ctx, nombre, x, y, tam = 1) {
  const fn = DIBUJOS[nombre];
  if (!fn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(tam, tam);
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = P.contorno;
  fn(ctx);
  ctx.restore();
}
