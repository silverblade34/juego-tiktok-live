// Autos vistos desde arriba (avanzan hacia arriba de la pantalla).
// Cada modelo es un DATO; una sola función dibujarAuto() los pinta todos, con daño por niveles:
//   < 75 % abolladuras · < 50 % parabrisas roto + humo · < 40 % puerta caída · < 25 % le falta una rueda
import { P } from './palette.js';

/** Medidas en unidades de mundo (1 u = 1 px con zoom 1). */
export const MODELOS = {
  sedan:     { largo: 96,  ancho: 52, radio: 14, ruedas: 4, techo: [0.30, 0.42], cabina: null, franjas: false },
  combi:     { largo: 116, ancho: 58, radio: 10, ruedas: 4, techo: [0.18, 0.70], cabina: null, franjas: true, parrilla: true },
  deportivo: { largo: 92,  ancho: 50, radio: 20, ruedas: 4, techo: [0.40, 0.28], cabina: null, aleron: true },
  mototaxi:  { largo: 80,  ancho: 46, radio: 18, ruedas: 3, techo: [0.30, 0.50], cabina: null, toldo: true },
  camion:    { largo: 130, ancho: 60, radio: 8,  ruedas: 6, techo: [0.04, 0.24], cabina: 0.30, carga: true },
};

export function colorAuto(i) {
  return P.autos[((i % P.autos.length) + P.autos.length) % P.autos.length];
}

/** Oscurece/aclara un color hex. */
export function tono(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

/**
 * Dibuja un auto centrado en (0,0) apuntando hacia arriba (ya trasladado/escalado por quien llama).
 * @param {object} a { modelo, color (índice), numero, hp, destruido, tiempo }
 */
export function dibujarAuto(ctx, a) {
  const m = MODELOS[a.modelo] ?? MODELOS.sedan;
  const L = m.largo, W = m.ancho;
  const x0 = -W / 2, y0 = -L / 2;
  const hp = a.hp ?? 100;
  const quemado = !!a.destruido;
  const base = quemado ? '#3a3430' : colorAuto(a.color ?? 0);
  ctx.lineJoin = 'round';

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  rr(ctx, x0 + 5, y0 + 8, W, L, m.radio); ctx.fill();

  // ruedas
  ctx.fillStyle = '#1b1b1f';
  const filas = m.ruedas === 6 ? [0.18, 0.62, 0.82] : [0.2, 0.78];
  const sinRueda = !quemado && hp < 25 ? 1 : -1; // pierde la rueda trasera derecha
  filas.forEach((fy, fi) => {
    for (const lado of [-1, 1]) {
      if (m.ruedas === 3 && fi === 0 && lado === 1) continue; // mototaxi: una rueda adelante
      if (sinRueda === 1 && lado === 1 && fi === filas.length - 1) continue;
      const rx = m.ruedas === 3 && fi === 0 ? -6 : lado * (W / 2) - 7;
      ctx.fillRect(rx, y0 + L * fy - 11, 14, 22);
    }
  });

  // carrocería
  rr(ctx, x0, y0, W, L, m.radio);
  ctx.fillStyle = base; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = P.contorno; ctx.stroke();

  if (m.carga) { // camión: tolva atrás con barandas
    ctx.fillStyle = quemado ? '#2a2522' : tono(base, -0.25);
    rr(ctx, x0 + 5, y0 + L * 0.34, W - 10, L * 0.62, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) { const yy = y0 + L * 0.34 + i * (L * 0.62) / 4; ctx.beginPath(); ctx.moveTo(x0 + 6, yy); ctx.lineTo(x0 + W - 6, yy); ctx.stroke(); }
  }
  if (m.franjas && !quemado) { // combi: franjas laterales de colores
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + 3, y0 + L * 0.15, 6, L * 0.75); ctx.fillRect(x0 + W - 9, y0 + L * 0.15, 6, L * 0.75);
    ctx.fillStyle = P.acento; ctx.fillRect(x0 + 3, y0 + L * 0.45, 6, L * 0.15); ctx.fillRect(x0 + W - 9, y0 + L * 0.45, 6, L * 0.15);
  }

  // parabrisas y techo
  const [ti, tl] = m.techo;
  if (!m.toldo) {
    ctx.fillStyle = quemado ? '#151312' : hp < 50 ? '#9fb8c8' : '#bfe9ff';
    rr(ctx, x0 + 6, y0 + L * (ti - 0.12), W - 12, L * 0.12, 6); ctx.fill();
    if (hp < 50 && !quemado) { // parabrisas roto
      ctx.strokeStyle = 'rgba(30,30,40,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, y0 + L * (ti - 0.1)); ctx.lineTo(4, y0 + L * (ti - 0.04)); ctx.lineTo(-2, y0 + L * ti); ctx.stroke();
    }
  }
  ctx.fillStyle = quemado ? '#24201d' : m.toldo ? '#2a9d8f' : tono(base, 0.25);
  rr(ctx, x0 + (m.toldo ? 2 : 7), y0 + L * ti, W - (m.toldo ? 4 : 14), L * tl, 8); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(29,21,48,0.6)'; ctx.stroke();
  if (m.parrilla && !quemado) { // combi: parrilla con bultos en el techo
    ctx.strokeStyle = 'rgba(29,21,48,0.55)'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { const yy = y0 + L * ti + i * (L * tl) / 4; ctx.beginPath(); ctx.moveTo(x0 + 9, yy); ctx.lineTo(x0 + W - 9, yy); ctx.stroke(); }
    ctx.fillStyle = '#c98d5b'; rr(ctx, -12, y0 + L * (ti + tl * 0.55), 24, 16, 4); ctx.fill();
  }
  if (m.aleron && !quemado) { ctx.fillStyle = P.contorno; ctx.fillRect(x0 - 3, y0 + L - 12, W + 6, 7); }
  if (m.toldo && !quemado) { // mototaxi: toldo a rayas
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x0 + 4 + i * (W - 8) / 4, y0 + L * ti, (W - 8) / 8, L * tl);
  }

  // número en el techo
  if (!quemado && a.numero != null) {
    const ny = y0 + L * (ti + tl / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, ny, 13, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = P.contorno; ctx.stroke();
    ctx.fillStyle = P.contorno;
    ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(a.numero), 0, ny + 1);
  }

  // faros
  if (!quemado) {
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(x0 + 6, y0 + 2, 10, 5); ctx.fillRect(x0 + W - 16, y0 + 2, 10, 5);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(x0 + 6, y0 + L - 6, 10, 4); ctx.fillRect(x0 + W - 16, y0 + L - 6, 10, 4);
  }

  // daño por niveles
  if (!quemado && hp < 75) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x0 + 10, y0 + L * 0.3, 7, 10, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x0 + W - 12, y0 + L * 0.82, 8, 6, -0.3, 0, Math.PI * 2); ctx.fill();
  }
  if (!quemado && hp < 40) { // puerta caída: hueco oscuro al costado
    ctx.fillStyle = '#1d1530';
    ctx.fillRect(x0 - 1, y0 + L * 0.42, 7, L * 0.22);
  }
  if (quemado) { // casco quemado
    ctx.fillStyle = 'rgba(255,120,0,0.35)';
    ctx.beginPath(); ctx.arc(-6, -4, 12 + Math.sin((a.tiempo ?? 0) * 9) * 3, 0, Math.PI * 2); ctx.fill();
  }
}
