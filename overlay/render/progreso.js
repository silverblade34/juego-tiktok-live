// Rankings públicos: rotación en la espera, con la misma tarjeta que invita a jugar.
import { panel, textoContorno } from './texto.js';
import { P, ANCHO } from './palette.js';

export function dibujarRankingEspera(ctx, s) {
  if (s?.fase !== 'ESPERA' || !s.rankings) return false;
  const r = s.rankings;
  const vistas = [null, ['diario', 'puntos', 'PUNTOS DEL DÍA'], ['diario', 'victorias', 'VICTORIAS DEL DÍA'],
    ['diario', 'baldazos', 'MAYOR AGUADOR DEL DÍA'], ['global', 'puntos', 'PUNTOS DE SIEMPRE'],
    ['global', 'victorias', 'VICTORIAS DE SIEMPRE'], ['global', 'baldazos', 'AGUADORES DE SIEMPRE']];
  const vista = vistas[Math.floor(s.t / (r.rotacionSeg * 1000)) % vistas.length];
  if (!vista) return false;
  const [periodo, campo, titulo] = vista;
  const filas = r[periodo][campo];
  panel(ctx, 60, 240, ANCHO - 120, 300, { fondo: P.hudFondoClaro, borde: P.contorno, grosor: 7, r: 36 });
  textoContorno(ctx, titulo, 540, 282, { px: 37, color: '#ff7b1c', grosor: 6 });
  if (!filas.length) textoContorno(ctx, '¡El primer puesto puede ser tuyo!', 540, 380, { px: 34, color: P.contorno, contorno: null });
  filas.slice(0,3).forEach((f,i) => {
    textoContorno(ctx, `${i+1}. ${f.nombre}`, 95, 341+i*53, {px:31,color:P.contorno,contorno:null,align:'left',maxAncho:650});
    textoContorno(ctx, String(f.valor), 970, 341+i*53, {px:32,color:'#7351ba',contorno:null,align:'right'});
  });
  textoContorno(ctx, periodo === 'diario' ? `${r.fecha} · Comenta para jugar` : 'Acumulado · Comenta para jugar',540,510,{px:24,color:'#5a5470',contorno:null});
  return true;
}
