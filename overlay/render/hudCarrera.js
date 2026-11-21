// HUD de la carrera: barra superior (tiempo, vivos, top 3), minimapa vertical, cuenta regresiva,
// panel inferior de Don Lucho y pantalla de resultados con podio y estadísticas.
import { P, ANCHO, ALTO } from './palette.js';
import { VISTA } from './camera.js';
import { textoContorno, rrect, panel, fuente, clamp, easeBack } from './texto.js';
import { dibujarAuto, colorAuto } from './cars.js';

const MEDALLAS = ['#ffd23f', '#d9d9e3', '#e0995e'];
const COLOR_TRAMO = { ciudad: '#a3a6b2', mercado: '#e0a96d', carretera: '#6bb14b', cerro: '#9c6a3e', meta: '#8f7bd6' };

export function dibujarBarraCarrera(ctx, s, autos, info, reloj, pulsoTop) {
  const h = 190;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(22,14,48,0.97)'); g.addColorStop(1, 'rgba(22,14,48,0.85)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, ANCHO, h);
  ctx.fillStyle = P.acento; ctx.fillRect(0, h - 6, ANCHO, 6);

  const c = s.carrera;
  textoContorno(ctx, 'EL PARADERO FINAL', 30, 42, { px: 40, color: P.acento, align: 'left', grosor: 9 });
  const seg = Math.floor(c.tSeg);
  textoContorno(ctx, `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, ANCHO - 30, 42, { px: 44, align: 'right', color: P.blanco, grosor: 9 });
  const total = c.autos.length;
  textoContorno(ctx, `VIVOS ${c.vivos}/${total}`, ANCHO / 2 + 170, 42, { px: 34, color: c.vivos < total / 2 ? '#ffb3c1' : P.ok, grosor: 8 });

  // Top 3
  const w = (ANCHO - 60 - 20) / 3;
  c.top.forEach((id, i) => {
    const a = info.get(id);
    if (!a) return;
    const x = 30 + i * (w + 10), y = 82;
    const k = 1 + (pulsoTop[i] ?? 0) * 0.12;
    ctx.save();
    ctx.translate(x + w / 2, y + 40); ctx.scale(k, k); ctx.translate(-(x + w / 2), -(y + 40));
    rrect(ctx, x, y, w, 80, 22);
    ctx.fillStyle = i === 0 ? 'rgba(255,210,63,0.95)' : 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = P.contorno; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 36, y + 40, 24, 0, Math.PI * 2);
    ctx.fillStyle = MEDALLAS[i]; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    textoContorno(ctx, String(i + 1), x + 36, y + 42, { px: 28, color: P.contorno, contorno: null });
    ctx.fillStyle = colorAuto(a.color); ctx.fillRect(x + 68, y + 22, 10, 36);
    textoContorno(ctx, a.nombre, x + 86, y + 42, { px: 28, align: 'left', color: P.contorno, contorno: null, maxAncho: w - 100 });
    ctx.restore();
  });
}

/** Minimapa vertical a la derecha: progreso de cada auto con su color. */
export function dibujarMinimapa(ctx, s, autos, info, reloj) {
  const c = s.carrera;
  const x = 1032, arriba = 235, abajo = 1520, ancho = 30;
  const aY = (y) => abajo - clamp(y / c.largo, 0, 1) * (abajo - arriba);
  rrect(ctx, x - ancho / 2 - 6, arriba - 34, ancho + 12, abajo - arriba + 60, 18);
  ctx.fillStyle = 'rgba(22,14,48,0.75)'; ctx.fill();
  const pista = s.pistaCache;
  if (pista) for (const t of pista.tramos) {
    ctx.fillStyle = COLOR_TRAMO[t.tipo] ?? '#888';
    ctx.fillRect(x - ancho / 2, aY(t.hasta), ancho, aY(t.desde) - aY(t.hasta));
  }
  // bandera de meta
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(x - 15 + i * 10, arriba - 26 + j * 10, 10, 10); }
  // puntos: destruidos como x, vivos como bolitas, líder grande
  const lider = c.top[0];
  for (const a of autos) {
    const y = aY(a.y);
    const col = colorAuto(info.get(a.id)?.color ?? 0);
    if (a.estado === 1) {
      ctx.strokeStyle = '#ffb3c1'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
      continue;
    }
    const r = a.id === lider ? 11 + Math.sin(reloj * 8) * 2 : 7;
    ctx.beginPath(); ctx.arc(x + ((a.id * 7) % 13) - 6, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = P.contorno; ctx.stroke();
  }
}

/** "3, 2, 1, ¡YA!" grande en el centro. */
export function dibujarCuenta(ctx, s, reloj) {
  const c = s.carrera;
  let texto, k;
  if (c.estado === 'cuenta') {
    const seg = Math.ceil(c.cuentaMs / 1000);
    texto = seg > 3 ? '¡LISTOS!' : String(seg);
    k = 1 - ((c.cuentaMs / 1000) % 1);
  } else if (c.tSeg < 1.2) {
    texto = '¡YA!';
    k = c.tSeg / 1.2;
  } else return;
  const escala = easeBack(clamp(k * 3, 0, 1)) * (1 + k * 0.2);
  ctx.save();
  ctx.globalAlpha = 1 - clamp((k - 0.75) / 0.25, 0, 1);
  ctx.translate(VISTA.centroX, 760); ctx.scale(escala, escala);
  textoContorno(ctx, texto, 0, 0, { px: texto.length > 2 ? 130 : 260, color: texto === '¡YA!' ? P.ok : P.acento, grosor: 22 });
  ctx.restore();
}

/** Nombres sobre los autos (tamaño fijo para que se lean aunque haya zoom out). */
export function dibujarNombre(ctx, x, y, nombre, esLider, destacado) {
  const px = esLider ? 26 : 20;
  ctx.font = fuente(px);
  const w = Math.min(190, ctx.measureText(nombre).width + 16);
  rrect(ctx, x - w / 2, y - px * 0.75, w, px * 1.5, 10);
  ctx.fillStyle = esLider ? 'rgba(255,210,63,0.95)' : destacado ? 'rgba(255,179,193,0.95)' : 'rgba(22,14,48,0.75)';
  ctx.fill();
  textoContorno(ctx, nombre, x, y + 1, { px, color: esLider || destacado ? P.contorno : P.blanco, contorno: esLider || destacado ? null : P.contorno, grosor: 4, maxAncho: w - 10 });
}

/** Barra de vida chiquita bajo el nombre. */
export function dibujarVida(ctx, x, y, hp) {
  const w = 56;
  ctx.fillStyle = 'rgba(22,14,48,0.8)'; ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 10);
  ctx.fillStyle = hp > 60 ? P.ok : hp > 30 ? P.acento : P.peligro;
  ctx.fillRect(x - w / 2, y, (w * hp) / 100, 6);
}

/** Panel inferior durante la carrera (Don Lucho chiquito narrando). */
export function dibujarPanelLucho(ctx) {
  const y = VISTA.abajo;
  const g = ctx.createLinearGradient(0, y, 0, ALTO);
  g.addColorStop(0, '#2c8f88'); g.addColorStop(1, '#1d1530');
  ctx.fillStyle = g; ctx.fillRect(0, y, ANCHO, ALTO - y);
  ctx.fillStyle = P.acento; ctx.fillRect(0, y, ANCHO, 6);
  textoContorno(ctx, '¡Comenta para entrar a la PRÓXIMA carrera!', 640, ALTO - 42, { px: 30, color: P.blanco, grosor: 7 });
}

/** Pantalla de resultados: podio con autos, burla al último y estadísticas. */
export function dibujarResultados(ctx, r, reloj, tEntrada) {
  if (!r) return;
  const k = easeBack(clamp(tEntrada / 0.5, 0, 1));
  ctx.save();
  ctx.fillStyle = `rgba(11,8,32,${0.6 * clamp(tEntrada * 2, 0, 1)})`;
  ctx.fillRect(0, VISTA.arriba, ANCHO, VISTA.abajo - VISTA.arriba);
  ctx.translate(ANCHO / 2, 860); ctx.scale(k, k); ctx.translate(-ANCHO / 2, -860);
  panel(ctx, 50, 250, ANCHO - 100, 1230, { fondo: 'rgba(255,255,255,0.96)', borde: P.contorno, grosor: 8, r: 40 });
  textoContorno(ctx, '¡PODIO DEL PARADERO!', ANCHO / 2, 320, { px: 64, color: '#ff7b1c', grosor: 12 });

  // Podio: 2º izquierda, 1º centro (más alto), 3º derecha
  const orden = [1, 0, 2];
  const alturas = [260, 340, 200];
  orden.forEach((idx, col) => {
    const f = r.podio[idx];
    if (!f) return;
    const x = ANCHO / 2 + (col - 1) * 290;
    const base = 900;
    const h = alturas[idx];
    rrect(ctx, x - 120, base - h, 240, h, 16);
    ctx.fillStyle = MEDALLAS[idx]; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
    textoContorno(ctx, String(idx + 1), x, base - h / 2 + 10, { px: 110, color: P.blanco, grosor: 12 });
    // auto saltando encima
    const salto = idx === 0 ? Math.abs(Math.sin(reloj * 5)) * 18 : Math.abs(Math.sin(reloj * 4 + idx)) * 8;
    ctx.save(); ctx.translate(x, base - h - 70 - salto); ctx.scale(1.1, 1.1);
    dibujarAuto(ctx, { modelo: f.modelo, color: f.color, numero: f.numero, hp: f.estado === 'destruido' ? 0 : 100, destruido: f.estado === 'destruido', tiempo: reloj });
    ctx.restore();
    textoContorno(ctx, f.nombre, x, base - h - 150 - salto, { px: idx === 0 ? 38 : 30, color: P.contorno, contorno: '#ffffff', grosor: 8, maxAncho: 270 });
    textoContorno(ctx, `+${f.puntos} pts`, x, base + 40, { px: 32, color: '#5a5470', contorno: null });
  });

  // Último lugar y estadísticas
  let y = 1010;
  if (r.ultimo) {
    rrect(ctx, 100, y - 40, ANCHO - 200, 80, 24); ctx.fillStyle = '#ffe3e8'; ctx.fill();
    textoContorno(ctx, `Farolito rojo: ${r.ultimo.nombre}`, ANCHO / 2, y, { px: 38, color: P.peligro, contorno: null, maxAncho: ANCHO - 240 });
    y += 110;
  }
  const st = r.stats;
  const lineas = [
    st.masGolpes && `Más golpeado: ${st.masGolpes.nombre} (${st.masGolpes.valor} golpes)`,
    st.masDano && `Más daño recibido: ${st.masDano.nombre} (${st.masDano.valor})`,
    `Llegaron ${st.llegaron} · Explotaron ${st.destruidos} · ${st.segundos} s`,
  ].filter(Boolean);
  for (const l of lineas) { textoContorno(ctx, l, ANCHO / 2, y, { px: 34, color: P.contorno, contorno: null, maxAncho: ANCHO - 160 }); y += 62; }
  textoContorno(ctx, '¡Comenta para la próxima carrera!', ANCHO / 2, 1430, { px: 40, color: '#ff7b1c', grosor: 8 });
  ctx.restore();
}
