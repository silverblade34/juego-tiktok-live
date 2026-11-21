// Escenario de la espera: cielo, ciudad, vereda y la garita del paradero. Todo con código.
import { P, L, ANCHO, ALTO } from './palette.js';
import { rrect, textoContorno } from './texto.js';

// Edificios fijos (pseudoaleatorios pero estables entre recargas).
const EDIFICIOS = (() => {
  const lista = [];
  let semilla = 11;
  const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  let x = -20;
  while (x < ANCHO + 20) {
    const ancho = 110 + rnd() * 120;
    lista.push({ x, ancho, alto: 260 + rnd() * 420, color: P.edificios[Math.floor(rnd() * P.edificios.length)], ventanas: rnd() > 0.25 });
    x += ancho - 8;
  }
  return lista;
})();

export function dibujarFondo(ctx, tiempo) {
  // Cielo
  const g = ctx.createLinearGradient(0, 0, 0, L.pisoY);
  g.addColorStop(0, P.cieloA);
  g.addColorStop(1, P.cieloB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Sol con rayos que giran lento
  ctx.save();
  ctx.translate(880, 330);
  ctx.rotate(tiempo * 0.08);
  ctx.fillStyle = 'rgba(255,230,120,0.35)';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(-22, 170);
    ctx.lineTo(22, 170);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(880, 330, 80, 0, Math.PI * 2);
  ctx.fillStyle = P.sol;
  ctx.fill();

  // Nubes que se desplazan
  for (let i = 0; i < 4; i++) {
    const x = ((tiempo * (12 + i * 5) + i * 330) % (ANCHO + 400)) - 200;
    dibujarNube(ctx, x, 420 + i * 120, 0.8 + (i % 2) * 0.4);
  }

  // Ciudad
  const base = L.pisoY;
  for (const e of EDIFICIOS) {
    const y = base - e.alto;
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x, y, e.ancho, e.alto);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(e.x + e.ancho - 14, y, 14, e.alto);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(e.x - 4, y - 10, e.ancho + 8, 14);
    if (e.ventanas) {
      ctx.fillStyle = P.ventana;
      for (let vy = y + 34; vy < base - 60; vy += 62) {
        for (let vx = e.x + 18; vx < e.x + e.ancho - 34; vx += 44) ctx.fillRect(vx, vy, 24, 32);
      }
    }
  }
}

function dibujarNube(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.arc(42, -16, 48, 0, Math.PI * 2);
  ctx.arc(92, 0, 36, 0, Math.PI * 2);
  ctx.arc(46, 14, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Vereda con bordillo amarillo y pista abajo. */
export function dibujarPiso(ctx) {
  const y = L.pisoY;
  ctx.fillStyle = P.vereda;
  ctx.fillRect(0, y, ANCHO, ALTO - y);
  ctx.strokeStyle = P.veredaLinea;
  ctx.lineWidth = 4;
  for (let x = -40; x < ANCHO; x += 140) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 40, y + 70);
    ctx.stroke();
  }
  ctx.fillStyle = P.bordillo;
  ctx.fillRect(0, y + 70, ANCHO, 14);
  ctx.fillStyle = P.pista;
  ctx.fillRect(0, y + 84, ANCHO, ALTO - y - 84);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, y, ANCHO, 6);
}

/** Garita del paradero con letrero, ventana, afiche y poste de parada. */
export function dibujarGarita(ctx, tiempo) {
  const { x, y, ancho, techoY } = L.garita;
  const piso = L.pisoY;
  const alto = piso - y;

  // Pared
  ctx.fillStyle = P.garitaPared;
  ctx.fillRect(x, y, ancho, alto);
  ctx.fillStyle = P.garitaParedOscura;
  for (let i = 1; i < 6; i++) ctx.fillRect(x, y + i * (alto / 6), ancho, 4);
  ctx.lineWidth = 6;
  ctx.strokeStyle = P.contorno;
  ctx.strokeRect(x, y, ancho, alto);

  // Ventana con rejas
  const vx = x + 340, vy = y + 95, vw = 280, vh = 230;
  ctx.fillStyle = P.vidrio;
  ctx.fillRect(vx, vy, vw, vh);
  ctx.fillStyle = P.vidrioBrillo;
  ctx.beginPath();
  ctx.moveTo(vx + 30, vy); ctx.lineTo(vx + 110, vy); ctx.lineTo(vx + 40, vy + vh); ctx.lineTo(vx - 40 + 30, vy + vh);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = P.contorno;
  ctx.lineWidth = 6;
  ctx.strokeRect(vx, vy, vw, vh);
  ctx.lineWidth = 4;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(vx + (i * vw) / 5, vy);
    ctx.lineTo(vx + (i * vw) / 5, vy + vh);
    ctx.stroke();
  }
  // Repisa
  ctx.fillStyle = P.mesaOscura;
  ctx.fillRect(vx - 14, vy + vh, vw + 28, 18);

  // Afiche "SE BUSCA CHOFER"
  ctx.save();
  ctx.translate(x + 70, y + 110);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#fff6d6';
  ctx.fillRect(0, 0, 150, 190);
  ctx.strokeStyle = P.contorno;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 150, 190);
  textoContorno(ctx, 'SE BUSCA', 75, 32, { px: 26, color: P.peligro, contorno: null });
  textoContorno(ctx, 'CHOFER', 75, 64, { px: 30, color: P.contorno, contorno: null });
  ctx.fillStyle = '#ccc';
  ctx.fillRect(25, 88, 100, 60);
  ctx.fillStyle = P.contorno;
  ctx.beginPath(); ctx.arc(75, 108, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(55, 124, 40, 24);
  textoContorno(ctx, 'S/ 50 x día', 75, 170, { px: 18, color: P.contorno, contorno: null });
  ctx.restore();

  // Reloj de pared con segundero
  const rx = x + 285, ry = y + 70;
  ctx.beginPath(); ctx.arc(rx, ry, 42, 0, Math.PI * 2);
  ctx.fillStyle = P.blanco; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 28); ctx.stroke();
  const a = tiempo * 1.2;
  ctx.strokeStyle = P.peligro; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.sin(a) * 34, ry - Math.cos(a) * 34); ctx.stroke();

  // Techo
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 8;
  rrect(ctx, x - 40, techoY, ancho + 80, 56, 14);
  ctx.fillStyle = P.garitaTecho; ctx.fill();
  ctx.restore();
  rrect(ctx, x - 40, techoY, ancho + 80, 56, 14);
  ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
  ctx.fillStyle = P.garitaTechoOscuro;
  for (let i = 0; i < 9; i++) ctx.fillRect(x - 20 + i * ((ancho + 40) / 9), techoY + 40, 40, 10);

  // Letrero
  const lw = 430, lx = x + ancho / 2 - lw / 2, ly = techoY - 70;
  rrect(ctx, lx, ly, lw, 74, 16);
  ctx.fillStyle = P.letrero; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
  textoContorno(ctx, 'PARADERO FINAL', lx + lw / 2, ly + 39, { px: 42, color: P.acento, contorno: P.contorno, grosor: 6 });

  // Poste de parada a la derecha
  const px = x + ancho + 50;
  ctx.fillStyle = P.poste;
  ctx.fillRect(px - 7, techoY + 80, 14, piso - techoY - 80);
  ctx.strokeStyle = P.contorno; ctx.lineWidth = 4;
  ctx.strokeRect(px - 7, techoY + 80, 14, piso - techoY - 80);
  ctx.beginPath(); ctx.arc(px, techoY + 120, 46, 0, Math.PI * 2);
  ctx.fillStyle = P.senal; ctx.fill();
  ctx.lineWidth = 6; ctx.stroke();
  textoContorno(ctx, 'P', px, techoY + 122, { px: 58, color: P.blanco, contorno: null });

  // Sombra de la garita en el piso
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - 20, piso, ancho + 40, 16);
}
