// Pista vertical por tramos, todo dibujado con código: ciudad, mercado, carretera, cerro y meta.
// Incluye obstáculos (con su señal de aviso ⚠), línea de salida, arco de meta y chatarra.
import { P, ANCHO } from './palette.js';
import { VISTA } from './camera.js';
import { textoContorno } from './texto.js';
import { dibujarAuto } from './cars.js';

const AMBIENTE = {
  ciudad:    { lado: '#b9bcc6', ladoB: '#a3a6b2', pista: '#55586a', borde: '#f5d000', nombre: 'LA CIUDAD' },
  mercado:   { lado: '#d9b38c', ladoB: '#c89f77', pista: '#6a6460', borde: '#ffffff', nombre: 'EL MERCADO' },
  carretera: { lado: '#7cc35a', ladoB: '#6bb14b', pista: '#4c4f5c', borde: '#ffffff', nombre: 'LA CARRETERA' },
  cerro:     { lado: '#b07a4a', ladoB: '#9c6a3e', pista: '#8a6a4a', borde: '#d9c3a0', nombre: 'EL CERRO' },
  meta:      { lado: '#8f7bd6', ladoB: '#7d69c4', pista: '#55586a', borde: '#ffd23f', nombre: '¡LA META!' },
};

/** Número pseudoaleatorio estable a partir de un entero (para decorados). */
function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function tramoEn(pista, y) {
  return pista.tramos.find((t) => y >= t.desde && y < t.hasta) ?? (y < 0 ? pista.tramos[0] : pista.tramos[pista.tramos.length - 1]);
}

/**
 * @param {object} e  { pista, carriles, largo, posObstaculo(o)->{x,y}, avisos: Map(id->t), chatarra: [[duenoId,y,x]], info: Map(id->auto), tiempo }
 */
export function dibujarPista(ctx, cam, e) {
  const { pista, carriles } = e;
  const { desde, hasta } = cam.rangoVisible();
  const z = cam.zoom;
  const izq = cam.aPantalla(0, 0, carriles).x;
  const der = cam.aPantalla(carriles, 0, carriles).x;

  ctx.save();
  ctx.beginPath(); ctx.rect(0, VISTA.arriba, ANCHO, VISTA.abajo - VISTA.arriba); ctx.clip();

  // Fondo por bandas de 200 u (lados + asfalto) con el color del tramo
  const paso = 200;
  for (let y = Math.floor(desde / paso) * paso; y < hasta; y += paso) {
    const amb = AMBIENTE[tramoEn(pista, y).tipo];
    const a = cam.aPantalla(0, y + paso, carriles).y;
    const b = cam.aPantalla(0, y, carriles).y;
    ctx.fillStyle = Math.floor(y / paso) % 2 ? amb.lado : amb.ladoB;
    ctx.fillRect(0, a, ANCHO, b - a + 1);
    ctx.fillStyle = amb.pista;
    ctx.fillRect(izq, a, der - izq, b - a + 1);
    dibujarDecorados(ctx, cam, e, y, paso, amb, izq, der);
  }

  // Bordes de la pista y líneas de carril
  for (let y = Math.floor(desde / 80) * 80; y < hasta; y += 80) {
    const amb = AMBIENTE[tramoEn(pista, y).tipo];
    const a = cam.aPantalla(0, y + 40, carriles).y;
    const b = cam.aPantalla(0, y, carriles).y;
    ctx.fillStyle = Math.floor(y / 80) % 2 ? amb.borde : '#e63946';
    ctx.fillRect(izq - 10 * z, a, 10 * z, b - a);
    ctx.fillRect(der, a, 10 * z, b - a);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let k = 1; k < carriles; k++) {
      const x = cam.aPantalla(k, 0, carriles).x;
      ctx.fillRect(x - 2 * z, a, 4 * z, (b - a) * 0.9);
    }
  }

  // Carteles de inicio de cada tramo, pintados sobre el asfalto
  for (const t of pista.tramos) {
    if (t.desde < desde || t.desde > hasta || t.desde === 0) continue;
    const p = cam.aPantalla(carriles / 2, t.desde + 120, carriles);
    textoContorno(ctx, AMBIENTE[t.tipo].nombre, p.x, p.y, { px: Math.max(26, 70 * z), color: 'rgba(255,255,255,0.85)', contorno: 'rgba(29,21,48,0.6)' });
  }

  dibujarSalida(ctx, cam, carriles);
  dibujarMeta(ctx, cam, e);

  // Chatarra (autos destruidos, siguen en la pista humeando)
  for (const [duenoId, y, x] of e.chatarra) {
    if (y < desde || y > hasta) continue;
    const p = cam.aPantalla(x, y, carriles);
    const info = e.info.get(duenoId);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(z, z); ctx.rotate(0.35);
    dibujarAuto(ctx, { modelo: info?.modelo, destruido: true, tiempo: e.tiempo });
    ctx.restore();
    if (info) textoContorno(ctx, info.nombre, p.x, p.y - 70 * z, { px: 20, color: '#c9c3d6', grosor: 5, maxAncho: 200 });
  }

  // Obstáculos (+ señal de aviso y resaltado si Don Lucho lo anunció)
  for (const o of pista.obstaculos) {
    const pos = e.posObstaculo(o);
    if (pos.y < desde - 300 || pos.y > hasta + 300) continue;
    const p = cam.aPantalla(pos.x, pos.y, carriles);
    const anchoPx = o.ancho * VISTA.anchoCarril * z;
    const avisado = e.avisos.get(o.id);
    if (avisado !== undefined) {
      // señal ⚠ al costado, un poco antes del obstáculo
      const s = cam.aPantalla(-0.45, pos.y - 260, carriles);
      dibujarSenal(ctx, s.x, s.y, Math.max(0.5, z), e.tiempo);
      const pulso = 0.5 + 0.5 * Math.sin(e.tiempo * 10);
      ctx.strokeStyle = `rgba(255,59,92,${0.4 + pulso * 0.5})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, anchoPx / 2 + 14 * z, 50 * z, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(z, z);
    dibujarObstaculo(ctx, o.tipo, o.ancho * VISTA.anchoCarril, e.tiempo);
    ctx.restore();
  }
  ctx.restore();
}

function dibujarDecorados(ctx, cam, e, y, paso, amb, izq, der) {
  const z = cam.zoom;
  const tipo = tramoEn(e.pista, y).tipo;
  const n = Math.floor(y / paso);
  for (const lado of [-1, 1]) {
    const h = hash(n * 2 + (lado > 0 ? 1 : 0));
    const base = cam.aPantalla(0, y + paso * 0.5, e.carriles).y;
    const bordeX = lado < 0 ? izq : der;
    const anchoLado = lado < 0 ? izq : ANCHO - der;
    if (anchoLado < 20) continue;
    const cx = bordeX + lado * Math.min(anchoLado * 0.55, 140 * z);
    ctx.save();
    ctx.translate(cx, base);
    ctx.scale(z, z);
    switch (tipo) {
      case 'ciudad': { // edificio visto desde arriba con ventanas
        const c = P.edificios[Math.floor(h * P.edificios.length)];
        ctx.fillStyle = c; ctx.fillRect(-90, -85, 180, 170);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-90, 60, 180, 25);
        ctx.fillStyle = P.ventana;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.fillRect(-70 + i * 50, -65 + j * 45, 30, 28);
        break;
      }
      case 'mercado': { // puesto con toldo a rayas y fruta
        const cols = ['#e63946', '#ffbe0b', '#2ec4b6', '#ff70a6'];
        const c = cols[Math.floor(h * cols.length)];
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? c : '#ffffff'; ctx.fillRect(-90 + i * 30, -70, 30, 110); }
        ctx.strokeStyle = P.contorno; ctx.lineWidth = 4; ctx.strokeRect(-90, -70, 180, 110);
        for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#ff9f1c', '#e63946', '#a7c957'][i % 3]; ctx.beginPath(); ctx.arc(-60 + i * 30, 62, 12, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case 'carretera': { // árboles y postes
        ctx.fillStyle = '#3d8b3d';
        ctx.beginPath(); ctx.arc(0, 0, 50 + h * 25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4fa84f';
        ctx.beginPath(); ctx.arc(-12, -12, 30 + h * 15, 0, Math.PI * 2); ctx.fill();
        if (h > 0.6) { ctx.fillStyle = '#fff'; ctx.fillRect(lado * -60, 60, 10, 10); }
        break;
      }
      case 'cerro': { // rocas
        ctx.fillStyle = '#8d8173';
        ctx.beginPath(); ctx.ellipse(0, 0, 70 + h * 30, 45 + h * 20, h * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a3978a';
        ctx.beginPath(); ctx.ellipse(-15, -10, 35, 22, h * 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'meta': { // tribuna con público saltando
        ctx.fillStyle = '#5b4aa8'; ctx.fillRect(-100, -90, 200, 180);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const salto = Math.abs(Math.sin(e.tiempo * 8 + i + j * 2 + n)) * 8;
          ctx.fillStyle = P.autos[(i + j + n) % P.autos.length];
          ctx.beginPath(); ctx.arc(-70 + i * 46, -60 + j * 42 - salto, 14, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }
}

function dibujarSalida(ctx, cam, carriles) {
  const a = cam.aPantalla(0, 0, carriles), b = cam.aPantalla(carriles, 0, carriles);
  if (a.y < VISTA.arriba - 50 || a.y > VISTA.abajo + 50) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(a.x, a.y - 6 * cam.zoom, b.x - a.x, 12 * cam.zoom);
  textoContorno(ctx, 'SALIDA', (a.x + b.x) / 2, a.y + 40 * cam.zoom, { px: Math.max(22, 50 * cam.zoom), color: '#ffffff' });
}

function dibujarMeta(ctx, cam, e) {
  const z = cam.zoom;
  const a = cam.aPantalla(0, e.largo, e.carriles), b = cam.aPantalla(e.carriles, e.largo, e.carriles);
  if (a.y < VISTA.arriba - 300 || a.y > VISTA.abajo + 300) return;
  // franja a cuadros
  const cuadro = 26 * z;
  for (let i = 0; i * cuadro < b.x - a.x; i++) for (let j = 0; j < 2; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
    ctx.fillRect(a.x + i * cuadro, a.y - cuadro + j * cuadro, cuadro, cuadro);
  }
  // arco con banderín
  ctx.fillStyle = '#d9d9e3';
  ctx.fillRect(a.x - 30 * z, a.y - 40 * z, 22 * z, 50 * z);
  ctx.fillRect(b.x + 8 * z, a.y - 40 * z, 22 * z, 50 * z);
  const ab = a.y - 110 * z;
  ctx.fillStyle = P.peligro; ctx.fillRect(a.x - 30 * z, ab, b.x - a.x + 60 * z, 60 * z);
  ctx.strokeStyle = P.contorno; ctx.lineWidth = 4; ctx.strokeRect(a.x - 30 * z, ab, b.x - a.x + 60 * z, 60 * z);
  textoContorno(ctx, 'META', (a.x + b.x) / 2, ab + 31 * z, { px: Math.max(22, 48 * z), color: P.acento });
}

function dibujarSenal(ctx, x, y, s, tiempo) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.rotate(Math.sin(tiempo * 6) * 0.08);
  ctx.fillStyle = '#d9d9e3'; ctx.fillRect(-4, 0, 8, 50);
  ctx.beginPath(); ctx.moveTo(0, -55); ctx.lineTo(48, 25); ctx.lineTo(-48, 25); ctx.closePath();
  ctx.fillStyle = P.acento; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
  ctx.fillStyle = P.contorno; ctx.fillRect(-4, -28, 8, 30); ctx.beginPath(); ctx.arc(0, 12, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Obstáculos centrados en (0,0), en unidades de mundo. anchoPx = ancho real que daña. */
function dibujarObstaculo(ctx, tipo, anchoPx, t) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = P.contorno;
  const w = anchoPx;
  switch (tipo) {
    case 'cono':
      for (const dx of w > 70 ? [-w / 4, w / 4] : [0]) {
        ctx.fillStyle = '#ff7b1c';
        ctx.beginPath(); ctx.moveTo(dx, -26); ctx.lineTo(dx + 20, 20); ctx.lineTo(dx - 20, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(dx - 10, -2, 20, 7);
      }
      break;
    case 'bache':
      ctx.fillStyle = '#2b2a33';
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d3c48'; ctx.beginPath(); ctx.ellipse(-6, -4, w / 3, 14, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'charco':
      ctx.fillStyle = 'rgba(89,195,255,0.75)';
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, 34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-w / 6, -8, w / 8, 6, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ambulante': { // carrito + vendedor
      ctx.fillStyle = '#ffbe0b'; ctx.fillRect(-36, -24, 52, 40); ctx.strokeRect(-36, -24, 52, 40);
      ctx.fillStyle = '#e63946'; ctx.fillRect(-36, -24, 52, 10);
      ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(-26, 18, 7, 0, Math.PI * 2); ctx.arc(6, 18, 7, 0, Math.PI * 2); ctx.fill();
      cabezaPersona(ctx, 32, -4, '#2a9d8f', t);
      break;
    }
    case 'policia':
      cabezaPersona(ctx, 0, 0, '#2f4a8a', t);
      ctx.fillStyle = '#d9d9e3'; ctx.fillRect(18, -40, 5, 30);
      ctx.beginPath(); ctx.arc(20, -48, 16, 0, Math.PI * 2); ctx.fillStyle = P.peligro; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PARE', 20, -47);
      break;
    case 'cajones':
      for (const dx of [-w / 4, w / 4]) {
        ctx.fillStyle = '#a0673a'; ctx.fillRect(dx - 26, -22, 52, 44); ctx.strokeRect(dx - 26, -22, 52, 44);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ff9f1c', '#e63946', '#a7c957'][i]; ctx.beginPath(); ctx.arc(dx - 14 + i * 14, -6 + (i % 2) * 10, 9, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    case 'perro': {
      const pata = Math.sin(t * 20) * 5;
      ctx.fillStyle = '#c98d5b';
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(30, -6, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(-22, 10 + pata, 6, 10); ctx.fillRect(16, 10 - pata, 6, 10);
      break;
    }
    case 'toldo': // toldo bajo cruzando la calle
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#2ec4b6' : '#ffffff'; ctx.fillRect(-w / 2 + i * w / 8, -22, w / 8, 44); }
      ctx.strokeRect(-w / 2, -22, w, 44);
      break;
    case 'vaca': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, 48, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1d1530';
      ctx.beginPath(); ctx.ellipse(-14, -6, 12, 9, 0.4, 0, Math.PI * 2); ctx.ellipse(16, 8, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2b8c6'; ctx.beginPath(); ctx.ellipse(52, 0, 16, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(40, -20, 6, 8); ctx.fillRect(40, 12, 6, 8);
      break;
    }
    case 'camion':
      ctx.fillStyle = '#6c757d'; ctx.fillRect(-34, -80, 68, 120); ctx.strokeRect(-34, -80, 68, 120);
      ctx.fillStyle = '#e63946'; ctx.fillRect(-32, -110, 64, 34); ctx.strokeRect(-32, -110, 64, 34);
      ctx.fillStyle = '#bfe9ff'; ctx.fillRect(-26, -106, 52, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 4; i++) ctx.fillRect(-30, -70 + i * 28, 60, 6);
      break;
    case 'derrumbe':
    case 'piedra': {
      const n = tipo === 'piedra' ? 1 : Math.max(3, Math.round(w / 45));
      for (let i = 0; i < n; i++) {
        const dx = n === 1 ? 0 : -w / 2 + 25 + i * ((w - 50) / (n - 1));
        ctx.fillStyle = i % 2 ? '#8d8173' : '#a3978a';
        ctx.beginPath(); ctx.ellipse(dx, (i % 2) * 10 - 5, 28, 22, i, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case 'huaico': { // barro que baja ondulando
      ctx.fillStyle = '#7a4a25';
      ctx.beginPath();
      ctx.moveTo(-w / 2, 30);
      for (let i = 0; i <= 10; i++) ctx.lineTo(-w / 2 + (i * w) / 10, -20 + Math.sin(t * 4 + i) * 12);
      ctx.lineTo(w / 2, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3418'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-w / 2 + 30 + i * (w - 60) / 4, 8, 10, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
  }
}

function cabezaPersona(ctx, x, y, ropa, t) {
  ctx.fillStyle = ropa;
  ctx.beginPath(); ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c98d5b';
  ctx.beginPath(); ctx.arc(x, y - 2 + Math.sin(t * 12) * 1.5, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
