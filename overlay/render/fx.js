// Partículas (pool con tope) y efectos de escena (balde, corneta, café, flash, temblor).
import { P } from './palette.js';
import { textoContorno, clamp, easeBack } from './texto.js';

const MAX_PARTICULAS = 700;

export class Particulas {
  constructor(max = MAX_PARTICULAS) {
    this.lista = [];
    this.max = max;
  }

  agregar(p) {
    if (this.lista.length >= this.max) this.lista[Math.floor(Math.random() * this.lista.length)] = p;
    else this.lista.push(p);
  }

  gota(x, y, vx, vy, piso) {
    this.agregar({ tipo: 'gota', x, y, vx: vx + (Math.random() - 0.5) * 40, vy, g: 1400, vida: 3, piso, r: 5 + Math.random() * 4 });
  }

  salpicon(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      this.agregar({ tipo: 'salpicon', x, y, vx: (Math.random() - 0.5) * 260, vy: -150 - Math.random() * 200, g: 1200, vida: 0.5, vidaMax: 0.5, r: 3 + Math.random() * 3 });
    }
  }

  zzz(x, y) {
    this.agregar({ tipo: 'zzz', x, y, vx: 30, vy: -60, g: 0, vida: 2.6, vidaMax: 2.6, fase: Math.random() * 6 });
  }

  vapor(x, y, vx, vy, color = '#ffffff') {
    this.agregar({ tipo: 'vapor', x, y, vx, vy, g: 0, vida: 0.9, vidaMax: 0.9, r: 10, color });
  }

  estrella(x, y) {
    const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 300;
    this.agregar({ tipo: 'estrella', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, g: 500, vida: 1.1, vidaMax: 1.1, rot: Math.random() * 6, r: 12 + Math.random() * 10 });
  }

  confeti(x, y) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 500 + Math.random() * 600;
    this.agregar({ tipo: 'confeti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, vida: 2.2, vidaMax: 2.2, rot: Math.random() * 6, color: P.autos[Math.floor(Math.random() * P.autos.length)] });
  }

  /** Explosión: bola de fuego, humo y escombros. s = escala (zoom de cámara). */
  explosion(x, y, s = 1) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = (120 + Math.random() * 380) * s;
      this.agregar({ tipo: 'fuego', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, vida: 0.6 + Math.random() * 0.4, vidaMax: 1, r: (18 + Math.random() * 22) * s });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 160) * s;
      this.agregar({ tipo: 'humo', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 0, vida: 1.6, vidaMax: 1.6, r: 20 * s, color: '#3a3440' });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, v = (250 + Math.random() * 400) * s;
      this.agregar({ tipo: 'escombro', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 600, vida: 1.2, vidaMax: 1.2, rot: Math.random() * 6, r: (6 + Math.random() * 8) * s, color: Math.random() < 0.5 ? '#3a3430' : '#9aa0b5' });
    }
  }

  humo(x, y, s = 1, color = '#6b6570') {
    this.agregar({ tipo: 'humo', x: x + (Math.random() - 0.5) * 10 * s, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30, g: 0, vida: 1.1, vidaMax: 1.1, r: 10 * s, color });
  }

  chispas(x, y, s = 1) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = (200 + Math.random() * 300) * s;
      this.agregar({ tipo: 'chispa', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, vida: 0.4, vidaMax: 0.4, r: 3 });
    }
  }

  /** Rueda que se sale y se va rodando. */
  rueda(x, y, s = 1) {
    this.agregar({ tipo: 'rueda', x, y, vx: (140 + Math.random() * 80) * s, vy: 60 * s, g: 0, vida: 2, vidaMax: 2, rot: 0, r: 12 * s });
  }

  /** Nubecita verde de la flatulencia. */
  gas(x, y) {
    for (let i = 0; i < 9; i++) this.agregar({ tipo: 'humo', x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 40, g: 0, vida: 1.6, vidaMax: 1.6, r: 16, color: '#9acd32' });
  }

  update(dt) {
    const l = this.lista;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.vida -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += dt * 6;
      if (p.tipo === 'gota' && p.y >= p.piso) {
        this.salpicon(p.x, p.piso, 2);
        p.vida = 0;
      }
      if (p.tipo === 'confeti') p.vx *= 1 - dt * 1.5;
      if (p.tipo === 'vapor') p.r += dt * 40;
      if (p.tipo === 'humo') { p.r += dt * 30; p.vx *= 1 - dt; }
      if (p.tipo === 'fuego') { p.vx *= 1 - dt * 4; p.vy *= 1 - dt * 4; }
      if (p.vida <= 0) { l[i] = l[l.length - 1]; l.pop(); }
    }
  }

  dibujar(ctx) {
    for (const p of this.lista) {
      const a = p.vidaMax ? clamp(p.vida / p.vidaMax, 0, 1) : 1;
      switch (p.tipo) {
        case 'gota':
          ctx.fillStyle = P.agua;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - p.r * 2);
          ctx.quadraticCurveTo(p.x + p.r, p.y, p.x, p.y + p.r);
          ctx.quadraticCurveTo(p.x - p.r, p.y, p.x, p.y - p.r * 2);
          ctx.fill();
          break;
        case 'salpicon':
          ctx.globalAlpha = a;
          ctx.fillStyle = P.aguaClara;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'zzz': {
          const k = 1 - a;
          ctx.globalAlpha = Math.min(1, a * 2);
          textoContorno(ctx, 'Z', p.x + Math.sin(p.fase + k * 6) * 18, p.y, { px: 34 + k * 40, color: '#ffffff', contorno: '#5d4bb3', grosor: 6 });
          ctx.globalAlpha = 1;
          break;
        }
        case 'vapor':
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'estrella':
          ctx.globalAlpha = a;
          dibujarEstrella(ctx, p.x, p.y, p.r, p.rot, P.acento);
          ctx.globalAlpha = 1;
          break;
        case 'fuego':
          ctx.globalAlpha = a;
          ctx.fillStyle = a > 0.6 ? '#fff3a0' : a > 0.35 ? '#ffb000' : '#ff4d1a';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'humo':
          ctx.globalAlpha = a * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'chispa':
          ctx.globalAlpha = a;
          ctx.fillStyle = '#ffe066';
          ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
          ctx.globalAlpha = 1;
          break;
        case 'escombro':
          ctx.save(); ctx.globalAlpha = Math.min(1, a * 2);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66);
          ctx.restore();
          break;
        case 'rueda':
          ctx.save(); ctx.globalAlpha = Math.min(1, a * 2);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot * 2);
          ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#9aa0b5'; ctx.fillRect(-p.r * 0.5, -2, p.r, 4);
          ctx.restore();
          break;
        case 'confeti':
          ctx.save();
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-8, -4, 16, 8);
          ctx.restore();
          break;
      }
    }
  }
}

export function dibujarEstrella(ctx, x, y, r, rot, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = P.contorno; ctx.stroke();
  ctx.restore();
}

/**
 * Efectos con utilería animada (balde que se voltea, corneta, taza voladora) y
 * efectos de pantalla (flash, temblor).
 */
export class EfectosEscena {
  constructor(particulas) {
    this.fx = particulas;
    this.lista = [];
    this.temblor = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
  }

  sacudir(fuerza) { this.temblor = Math.max(this.temblor, fuerza); }
  destello(color = '#ffffff', fuerza = 0.7) { this.flash = fuerza; this.flashColor = color; }

  /** @param {{x:number,y:number}} cabeza punto de la cabeza de Lucho en pantalla */
  balde(cabeza) {
    this.lista.push({ tipo: 'balde', t: 0, dur: 1.4, x: cabeza.x, y: cabeza.y - 230, vertido: false });
  }

  corneta(cabeza) {
    this.lista.push({ tipo: 'corneta', t: 0, dur: 1.3, x: cabeza.x + 330, y: cabeza.y + 40 });
    this.sacudir(26);
    this.destello('#fff6c2', 0.5);
    for (let i = 0; i < 14; i++) this.fx.estrella(cabeza.x, cabeza.y);
  }

  cafe(cabeza) {
    this.lista.push({ tipo: 'taza', t: 0, dur: 0.7, x0: 1150, y0: cabeza.y - 120, x1: cabeza.x + 80, y1: cabeza.y + 120 });
  }

  manta(cabeza) {
    for (let i = 0; i < 10; i++) this.fx.vapor(cabeza.x + (Math.random() - 0.5) * 220, cabeza.y + 140 + Math.random() * 160, (Math.random() - 0.5) * 120, -40, '#fff3d6');
  }

  confeti(x, y, n = 80) {
    for (let i = 0; i < n; i++) this.fx.confeti(x + (Math.random() - 0.5) * 200, y);
  }

  update(dt) {
    this.temblor = Math.max(0, this.temblor - dt * 50);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    for (let i = this.lista.length - 1; i >= 0; i--) {
      const e = this.lista[i];
      e.t += dt;
      if (e.tipo === 'balde' && e.t > 0.45 && e.t < 0.9) {
        // chorro de agua sobre la cabeza
        for (let k = 0; k < 8; k++) this.fx.gota(e.x + (Math.random() - 0.5) * 110, e.y + 70, (Math.random() - 0.5) * 160, 250 + Math.random() * 300, 1735);
      }
      if (e.t >= e.dur) this.lista.splice(i, 1);
    }
  }

  /** Desplazamiento de cámara por temblor. */
  offset() {
    if (this.temblor <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * this.temblor, y: (Math.random() - 0.5) * this.temblor };
  }

  dibujar(ctx) {
    for (const e of this.lista) {
      const k = clamp(e.t / e.dur, 0, 1);
      if (e.tipo === 'balde') dibujarBalde(ctx, e, k);
      else if (e.tipo === 'corneta') dibujarCorneta(ctx, e, k);
      else if (e.tipo === 'taza') {
        const q = clamp(k * 1.2, 0, 1);
        const x = e.x0 + (e.x1 - e.x0) * q;
        const y = e.y0 + (e.y1 - e.y0) * q - Math.sin(q * Math.PI) * 160;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(q * 6);
        ctx.globalAlpha = 1 - clamp((k - 0.8) / 0.2, 0, 1);
        ctx.fillStyle = P.taza; ctx.strokeStyle = P.contorno; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.roundRect(-24, -26, 48, 52, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = P.cafe; ctx.fillRect(-18, -20, 36, 9);
        ctx.restore();
      }
    }
  }

  dibujarFlash(ctx, ancho, alto) {
    if (this.flash <= 0) return;
    ctx.globalAlpha = this.flash;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.globalAlpha = 1;
  }
}

function dibujarBalde(ctx, e, k) {
  // entra desde arriba, se voltea, sale volando
  const entrada = clamp(k / 0.3, 0, 1);
  const salida = clamp((k - 0.7) / 0.3, 0, 1);
  const x = e.x - 160 * (1 - entrada) + 300 * salida;
  const y = e.y - 300 * (1 - easeBack(entrada)) - 200 * salida;
  const rot = clamp((k - 0.25) / 0.2, 0, 1) * 2.6 + salida * 2;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-60, -50); ctx.lineTo(60, -50); ctx.lineTo(44, 60); ctx.lineTo(-44, 60); ctx.closePath();
  ctx.fillStyle = P.balde; ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.baldeOscuro; ctx.fillRect(-52, -10, 104, 12);
  ctx.beginPath(); ctx.arc(0, -50, 62, Math.PI, 0); ctx.lineWidth = 5; ctx.stroke();
  if (k < 0.45) { ctx.fillStyle = P.agua; ctx.beginPath(); ctx.ellipse(0, -50, 58, 12, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function dibujarCorneta(ctx, e, k) {
  const entrada = easeBack(clamp(k / 0.25, 0, 1));
  const salida = clamp((k - 0.8) / 0.2, 0, 1);
  const x = e.x + 260 * (1 - entrada) + 300 * salida;
  ctx.save();
  ctx.translate(x, e.y);
  ctx.rotate(-0.2 + Math.sin(k * 60) * 0.05);
  // ondas de sonido
  for (let i = 0; i < 3; i++) {
    const r = 40 + ((k * 3 + i / 3) % 1) * 160;
    ctx.globalAlpha = 1 - ((k * 3 + i / 3) % 1);
    ctx.strokeStyle = P.acento; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(-130, 0, r, Math.PI * 0.7, Math.PI * 1.3); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // cuerpo de la corneta
  ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(90, -14); ctx.lineTo(-40, -14); ctx.lineTo(-120, -60); ctx.lineTo(-120, 60); ctx.lineTo(-40, 14); ctx.lineTo(90, 14); ctx.closePath();
  ctx.fillStyle = P.corneta; ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.cornetaOscura;
  ctx.beginPath(); ctx.ellipse(-120, 0, 14, 60, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.peligro;
  ctx.beginPath(); ctx.arc(110, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1 - salida;
  textoContorno(ctx, '¡PAAAAA!', e.x - 120, e.y + 150, { px: 86 + Math.sin(k * 40) * 6, color: P.acento, grosor: 12 });
  ctx.globalAlpha = 1;
}
