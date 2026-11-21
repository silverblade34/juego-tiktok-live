// Ayudas de texto y formas: texto con contorno (legible en teléfono), envoltura y roundRect.
import { P } from './palette.js';

export const FUENTE = '"Arial Rounded MT Bold", "Arial Black", "Helvetica Neue", Arial, sans-serif';

export function fuente(px, peso = 'bold') {
  return `${peso} ${Math.round(px)}px ${FUENTE}`;
}

/** Texto relleno con contorno grueso. */
export function textoContorno(ctx, texto, x, y, opts = {}) {
  const { px = 40, color = P.texto, contorno = P.contorno, grosor, align = 'center', base = 'middle', peso = 'bold', maxAncho } = opts;
  ctx.font = fuente(px, peso);
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (contorno) {
    ctx.lineWidth = grosor ?? Math.max(4, px * 0.2);
    ctx.strokeStyle = contorno;
    ctx.strokeText(texto, x, y, maxAncho);
  }
  ctx.fillStyle = color;
  ctx.fillText(texto, x, y, maxAncho);
}

/** Parte un texto en líneas que caben en maxAncho (con la fuente actual de ctx). */
export function envolver(ctx, texto, maxAncho) {
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width <= maxAncho || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Abre un path de rectángulo redondeado (con respaldo si no existe roundRect). */
export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Panel redondeado con relleno, borde y sombra suave. */
export function panel(ctx, x, y, w, h, { r = 28, fondo = P.hudFondo, borde = P.hudBorde, grosor = 5, sombra = true } = {}) {
  ctx.save();
  if (sombra) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; }
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = fondo;
  ctx.fill();
  ctx.restore();
  if (borde) {
    rrect(ctx, x, y, w, h, r);
    ctx.lineWidth = grosor;
    ctx.strokeStyle = borde;
    ctx.stroke();
  }
}

export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Curva de rebote para animaciones "pop" (0..1 -> sobrepasa y vuelve a 1). */
export function easeBack(k) {
  const c = 1.9;
  const x = k - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}
