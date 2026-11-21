// Íconos de la leyenda de comandos, dibujados con formas. Centrados en (0,0), tamaño ~1 = 100px.
import { P } from './palette.js';

const DIBUJOS = {
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
