// Don Lucho dibujado con un esqueleto simple de huesos.
// - El servidor dice la POSE objetivo y las ACCIONES (con id y duración).
// - Aquí interpolamos cada hueso hacia la pose (suavizado exponencial) y superponemos la acción.
//
// Convención de brazos: se dibujan como "brazo derecho genérico" y el izquierdo se espeja.
//   h = ángulo del hombro (0 = colgando, positivo = se abre hacia afuera/arriba)
//   c = ángulo del codo   (positivo = el antebrazo se dobla hacia adentro/arriba)
// Unidades locales: origen en el asiento, piso en y = 190. Escala la decide el layout.
import { P } from './palette.js';
import { clamp, lerp } from './texto.js';

const CLAVES = ['torso', 'cabeza', 'hIzq', 'cIzq', 'hDer', 'cDer', 'parpados', 'boca', 'sonrisa', 'cejas', 'ojos', 'raizY', 'raizRot', 'rubor', 'pupX', 'pupY'];

const BASE = { torso: 0, cabeza: 0, hIzq: 0.1, cIzq: 0.3, hDer: 0.1, cDer: 0.3, parpados: 0, boca: 0, sonrisa: 0, cejas: 0, ojos: 1, raizY: 0, raizRot: 0, rubor: 0, pupX: 0, pupY: 0 };

export const POSES = {
  aburrido:    { ...BASE, torso: 0.05, cabeza: 0.14, hIzq: 0.12, cIzq: 0.5, hDer: -0.5, cDer: 2.37, parpados: 0.5, boca: 0.03, sonrisa: -0.35, cejas: -0.1, pupX: -3, pupY: 3 },
  dormido:     { ...BASE, torso: 0.12, cabeza: 0.45, hIzq: 0.05, cIzq: 0.2, hDer: 0.05, cDer: 0.2, parpados: 1, boca: 0.22, cejas: 0.2, raizY: 6 },
  susto:       { ...BASE, torso: -0.08, cabeza: -0.1, hIzq: 2.5, cIzq: 0.5, hDer: 2.5, cDer: 0.5, boca: 1, sonrisa: -0.3, cejas: 1, ojos: 1.6, raizY: -25 },
  enojado:     { ...BASE, torso: 0.04, cabeza: -0.08, hIzq: -0.3, cIzq: 1.27, hDer: 1.0, cDer: 3.84, parpados: 0.3, boca: 0.55, sonrisa: -1, cejas: -1, rubor: 1 },
  hiperactivo: { ...BASE, torso: -0.04, hIzq: 1.3, cIzq: -1.84, hDer: 1.3, cDer: -1.84, boca: 0.55, sonrisa: 1, cejas: 0.9, ojos: 1.4 },
  mojado:      { ...BASE, torso: 0.1, cabeza: 0.12, hIzq: -0.6, cIzq: 0.97, hDer: -0.6, cDer: 0.97, parpados: 0.35, boca: 0.3, sonrisa: -0.9, cejas: 0.7, ojos: 1.1 },
  animado:     { ...BASE, hIzq: 2.4, cIzq: 0.6, hDer: 0.35, cDer: 2.0, boca: 0.6, sonrisa: 1, cejas: 0.6, ojos: 1.1 },
};

/** Acciones puntuales: devuelven valores a imponer y un peso (envolvente) según el progreso p. */
const ACCIONES = {
  bostezo: (p) => ({ peso: campana(p), v: { boca: 1.15, parpados: 0.85, hIzq: 2.9, cIzq: 0.9, hDer: 2.9, cDer: 0.9, cabeza: -0.25, torso: -0.06, sonrisa: 0 } }),
  rascarse: (p, t) => ({ peso: campana(p, 0.15), v: { hIzq: 2.8, cIzq: -1.0 + Math.sin(t * 28) * 0.2, cabeza: 0.22, parpados: 0.4, boca: 0.15, sonrisa: -0.2 } }),
  golpearMicro: (p, t) => ({ peso: campana(p, 0.15), v: { hDer: 1.25, cDer: 3.95 + Math.abs(Math.sin(t * 16)) * 0.25, cabeza: 0.1, pupX: 6, cejas: 0.4 } }),
  salto: (p) => ({ peso: 1, v: { raizY: -90 * Math.sin(Math.PI * p) }, soloClaves: ['raizY'] }),
  sorbo: (p) => ({ peso: campana(p, 0.2), v: { hDer: -0.5, cDer: 2.55, cabeza: -0.1, parpados: 0.6, boca: 0.15, sonrisa: 0.6 }, taza: true }),
  caida: (p) => {
    // cae rápido, queda en el piso, se levanta al final
    const f = p < 0.15 ? suave(p / 0.15) : p > 0.72 ? 1 - suave((p - 0.72) / 0.28) : 1;
    return { peso: 1, v: { raizRot: -1.05 * f, raizY: 20 * f }, soloClaves: ['raizRot', 'raizY'] };
  },
  arropar: () => ({ peso: 0, v: {} }),
  // saluda con la mano a quien llega
  saludar: (p, t) => ({ peso: campana(p, 0.18), v: { hDer: 2.5, cDer: 0.5 + Math.sin(t * 14) * 0.45, sonrisa: 1, boca: 0.35, cejas: 0.6, parpados: 0, cabeza: -0.08 } }),
  // dormido: levanta un poco la cabeza y entreabre los ojos, fastidiado
  abrirOjo: (p) => ({ peso: campana(p, 0.2), v: { parpados: 0.55, cejas: -0.7, cabeza: 0.1, sonrisa: -0.6, pupX: 4 } }),
  // señala al mirón (a la cámara), con ojos entrecerrados
  senalar: (p, t) => ({ peso: campana(p, 0.15), v: { hDer: 1.7, cDer: 0.15 + Math.sin(t * 10) * 0.08, parpados: 0.4, cejas: -0.5, sonrisa: 0.5, pupX: 0, pupY: 0, cabeza: 0.05 } }),
};

function campana(p, borde = 0.25) {
  if (p < borde) return suave(p / borde);
  if (p > 1 - borde) return suave((1 - p) / borde);
  return 1;
}
function suave(k) {
  k = clamp(k, 0, 1);
  return k * k * (3 - 2 * k);
}

export class LuchoRender {
  constructor() {
    this.cur = { ...POSES.aburrido };
    this.final = { ...this.cur };
    this.pose = 'aburrido';
    this.accion = null;          // { id, tipo, t, dur }
    this.reloj = 0;
    this.parpadeo = 0;
    this.proxParpadeo = 2.5;
    this.manta = false;
    this.mantaCaida = 1;
    this.dormido = false;
    this.charco = 0;
    this.mojado = false;
    this.hablando = false;
    this.rapido = false;
    this.nivelVoz = 0;     // volumen de la voz (0..1) medido en el overlay
    this.conVoz = false;   // hay audio sonando: la boca la manda el volumen
    this.acumGota = 0;
    this.acumZzz = 0;
    this.acumVapor = 0;
    this.jx = 0;
    this.jy = 0;
    this.taza = false;
    // Puntos en coordenadas de pantalla (se actualizan al dibujar) para partículas y burbuja.
    this.pCabeza = { x: 470, y: 1220 };
    this.pBoca = { x: 470, y: 1280 };
    this.pNariz = { x: 470, y: 1265 };
  }

  /**
   * @param {number} dt segundos (ya escalados por escalaTiempo)
   * @param {object} L  snapshot.lucho
   * @param {import('./fx.js').Particulas} fx
   * @param {number} pisoY
   */
  update(dt, L, fx, pisoY, escala) {
    this.reloj += dt;
    const t = this.reloj;
    this.pose = L.pose;
    this.dormido = L.dormido;
    this.mojado = L.mojadoMs > 0;

    // Acción nueva => temporizador local (descontando lo que ya pasó en el servidor).
    const a = L.accion;
    if (a && (!this.accion || this.accion.id !== a.id)) {
      this.accion = { id: a.id, tipo: a.tipo, t: a.transcurridoMs / 1000, dur: a.durMs / 1000 };
    }
    if (this.accion) {
      this.accion.t += dt;
      if (this.accion.t >= this.accion.dur) this.accion = null;
    }

    // Manta: cae desde arriba cuando aparece.
    if (L.manta && !this.manta) this.mantaCaida = 0;
    this.manta = L.manta;
    this.mantaCaida = Math.min(1, this.mantaCaida + dt * 2.2);

    // Interpolación hacia la pose objetivo.
    const objetivo = POSES[L.pose] ?? POSES.aburrido;
    const rapidez = L.pose === 'susto' ? 16 : L.pose === 'dormido' ? 3 : 7;
    const k = 1 - Math.exp(-rapidez * dt);
    for (const c of CLAVES) this.cur[c] = lerp(this.cur[c], objetivo[c], k);

    // Parpadeo
    this.proxParpadeo -= dt;
    if (this.proxParpadeo <= 0) { this.parpadeo = 0.14; this.proxParpadeo = 2.5 + Math.random() * 3; }
    this.parpadeo = Math.max(0, this.parpadeo - dt);

    this.calcularFinal(t);

    // Charco crece mojado y se seca lento.
    this.charco = clamp(this.charco + (this.mojado ? dt * 0.4 : -dt * 0.05), 0, 1);

    this.emitirParticulas(dt, L, fx, pisoY, escala);
  }

  calcularFinal(t) {
    const v = this.final;
    Object.assign(v, this.cur);
    this.taza = false;

    // Acción superpuesta
    if (this.accion) {
      const fn = ACCIONES[this.accion.tipo];
      if (fn) {
        const p = clamp(this.accion.t / this.accion.dur, 0, 1);
        const r = fn(p, t);
        const claves = r.soloClaves ?? Object.keys(r.v);
        for (const c of claves) {
          if (r.soloClaves) v[c] += r.v[c] * r.peso; // aditivo (salto, caída)
          else v[c] = lerp(v[c], r.v[c], r.peso);
        }
        if (r.taza && r.peso > 0.3) this.taza = true;
      }
    }

    // Respiración y gestos por pose
    const lento = this.pose === 'dormido';
    this.respira = Math.sin(t * (lento ? 1.4 : 2.4));
    if (this.pose === 'animado') v.cIzq += Math.sin(t * 9) * 0.45;
    if (this.pose === 'hiperactivo') {
      v.hIzq += Math.sin(t * 15) * 0.3;
      v.hDer += Math.sin(t * 15 + Math.PI) * 0.3;
      v.cabeza += Math.sin(t * 11) * 0.06;
    }
    if (this.pose === 'enojado') v.hDer += Math.sin(t * 18) * 0.12;
    if (this.pose === 'dormido') v.cabeza += Math.sin(t * 0.7) * 0.05;

    // Boca al hablar: con voz real, sigue el volumen; si no, aleteo automático.
    if (this.nivelVoz > 0.02) {
      v.boca += this.nivelVoz * (this.dormido ? 0.35 : 1.0);
    } else if (this.hablando && !this.conVoz) {
      const vel = this.rapido ? 26 : 16;
      v.boca += Math.abs(Math.sin(t * vel)) * (this.dormido ? 0.12 : 0.38);
    }
    // Parpadeo (si los ojos están abiertos)
    if (this.parpadeo > 0 && v.parpados < 0.7) v.parpados = 1;

    // Temblores
    this.jx = 0; this.jy = 0;
    if (this.pose === 'hiperactivo') { this.jx = (Math.random() - 0.5) * 6; this.jy = (Math.random() - 0.5) * 4; }
    else if (this.mojado) this.jx = Math.sin(t * 55) * 1.8;
  }

  emitirParticulas(dt, L, fx, pisoY, escala) {
    const c = this.pCabeza;
    if (this.mojado) {
      this.acumGota += dt * 14;
      while (this.acumGota >= 1) {
        this.acumGota -= 1;
        const lado = Math.random() < 0.5 ? -1 : 1;
        fx.gota(c.x + lado * (40 + Math.random() * 40) * escala, c.y + (Math.random() * 60 - 10) * escala, lado * 30, 0, pisoY);
      }
    }
    if (this.dormido) {
      this.acumZzz += dt * 0.9;
      if (this.acumZzz >= 1) { this.acumZzz = 0; fx.zzz(c.x + 60 * escala, c.y - 70 * escala); }
    }
    if (this.pose === 'enojado') {
      this.acumVapor += dt * 6;
      while (this.acumVapor >= 1) {
        this.acumVapor -= 1;
        const lado = Math.random() < 0.5 ? -1 : 1;
        fx.vapor(c.x + lado * 70 * escala, c.y - 10 * escala, lado * 60, -80, '#ffffff');
      }
    }
  }

  // ================================================================ dibujo

  dibujar(ctx, { x, y, escala }) {
    const v = this.final;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(escala, escala);

    // Charco y sombra
    if (this.charco > 0.02) {
      ctx.fillStyle = 'rgba(89,195,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 192, 150 * this.charco, 20 * this.charco, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 192, 125, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Silla (se inclina menos que Lucho al caer)
    ctx.save();
    ctx.translate(-60, 190); ctx.rotate(v.raizRot * 0.45); ctx.translate(60, -190);
    this.dibujarSilla(ctx);
    ctx.restore();

    // Cuerpo
    ctx.save();
    ctx.translate(this.jx, v.raizY + this.jy);
    ctx.translate(-60, 190); ctx.rotate(v.raizRot); ctx.translate(60, -190);
    this.dibujarPiernas(ctx);

    ctx.save();
    ctx.rotate(v.torso);
    const r = this.respira;
    ctx.scale(1 + r * 0.012, 1 + r * 0.022);
    this.dibujarTorso(ctx);
    const conManta = this.manta;
    if (!conManta) {
      this.dibujarCabeza(ctx, v);
      this.dibujarBrazo(ctx, -1, v.hIzq, v.cIzq, false);
      this.dibujarBrazo(ctx, 1, v.hDer, v.cDer, this.taza);
    } else {
      this.dibujarBrazo(ctx, -1, v.hIzq, v.cIzq, false);
      this.dibujarBrazo(ctx, 1, v.hDer, v.cDer, false);
      this.dibujarManta(ctx);
      this.dibujarCabeza(ctx, v);
    }
    ctx.restore();
    ctx.restore();

    // Mesa y micrófono delante
    this.dibujarMesa(ctx);
    ctx.restore();
  }

  dibujarSilla(ctx) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.contorno;
    ctx.lineWidth = 6;
    // Respaldo
    ctx.fillStyle = P.silla;
    roundRectPath(ctx, -80, -150, 160, 140, 26);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.sillaOscura;
    for (let i = 0; i < 3; i++) ctx.fillRect(-55, -125 + i * 34, 110, 12);
    // Patas
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.strokeStyle = P.contorno; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(s * 78, 14); ctx.lineTo(s * 98, 188); ctx.stroke();
      ctx.strokeStyle = P.sillaOscura; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(s * 78, 14); ctx.lineTo(s * 98, 188); ctx.stroke();
    }
    // Asiento
    ctx.fillStyle = P.silla; ctx.strokeStyle = P.contorno; ctx.lineWidth = 6;
    roundRectPath(ctx, -96, -6, 192, 28, 12);
    ctx.fill(); ctx.stroke();
  }

  dibujarPiernas(ctx) {
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      // muslo y canilla con contorno
      trazo(ctx, [[s * 36, -2], [s * 50, 70], [s * 50, 168]], 56, P.contorno);
      trazo(ctx, [[s * 36, -2], [s * 50, 70], [s * 50, 168]], 44, P.pantalon);
      ctx.strokeStyle = P.pantalonOscuro; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s * 50, 80); ctx.lineTo(s * 50, 160); ctx.stroke();
      // zapatilla
      ctx.fillStyle = P.zapato; ctx.strokeStyle = P.contorno; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(s * 56, 180, 34, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(s * 56 - 22, 186, 44, 5);
    }
  }

  dibujarTorso(ctx) {
    const camino = () => {
      ctx.beginPath();
      ctx.moveTo(-58, 8);
      ctx.bezierCurveTo(-104, -20, -100, -112, -66, -150);
      ctx.quadraticCurveTo(-58, -174, -28, -176);
      ctx.lineTo(28, -176);
      ctx.quadraticCurveTo(58, -174, 66, -150);
      ctx.bezierCurveTo(100, -112, 104, -20, 58, 8);
      ctx.closePath();
    };
    // Polo
    camino();
    ctx.fillStyle = P.polo; ctx.fill();
    // Chaleco naranja con cinta reflectiva (recortado al torso)
    ctx.save();
    camino(); ctx.clip();
    ctx.fillStyle = P.chaleco;
    ctx.fillRect(-120, -190, 100, 210);
    ctx.fillRect(20, -190, 100, 210);
    ctx.fillStyle = P.reflectivo;
    ctx.fillRect(-120, -78, 100, 16);
    ctx.fillRect(20, -78, 100, 16);
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(-120, -82, 100, 4);
    ctx.fillRect(20, -82, 100, 4);
    // barriguita asomando
    ctx.fillStyle = P.piel;
    ctx.beginPath(); ctx.ellipse(0, 10, 38, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.pielSombra;
    ctx.beginPath(); ctx.arc(0, 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Placa
    ctx.fillStyle = P.acento; ctx.strokeStyle = P.contorno; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-48, -125, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    camino();
    ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
    // Cuello
    ctx.fillStyle = P.piel;
    ctx.fillRect(-18, -186, 36, 16);
  }

  dibujarCabeza(ctx, v) {
    ctx.save();
    ctx.translate(0, -176);
    ctx.rotate(v.cabeza);
    const piel = v.rubor > 0.05 ? mezclar(P.piel, '#d9584a', v.rubor * 0.35) : P.piel;
    ctx.lineWidth = 6; ctx.strokeStyle = P.contorno;

    // Orejas
    for (const s of [-1, 1]) {
      ctx.fillStyle = piel;
      ctx.beginPath(); ctx.arc(s * 60, -50, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.pielSombra;
      ctx.beginPath(); ctx.arc(s * 60, -50, 6, 0, Math.PI * 2); ctx.fill();
    }
    // Cara
    ctx.fillStyle = piel;
    ctx.beginPath(); ctx.ellipse(0, -55, 60, 63, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Patillas
    ctx.fillStyle = P.pelo;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 52, -72, 9, 20, s * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // Ojos
    for (const s of [-1, 1]) {
      const ex = s * 23, ey = -46;
      const ry = 15 + (v.ojos - 1) * 4;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(ex, ey, 13 + (v.ojos - 1) * 3, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = P.ojo; ctx.fill();
      ctx.clip();
      ctx.fillStyle = P.pupila;
      ctx.beginPath(); ctx.arc(ex + clamp(v.pupX, -6, 6), ey + clamp(v.pupY, -6, 6), 6 * clamp(v.ojos, 0.6, 1.8) * (v.ojos > 1.3 ? 0.7 : 1), 0, Math.PI * 2); ctx.fill();
      // párpado
      const pp = clamp(v.parpados, 0, 1);
      if (pp > 0.01) {
        ctx.fillStyle = piel;
        ctx.fillRect(ex - 20, ey - ry - 2, 40, (ry * 2 + 4) * pp);
        ctx.strokeStyle = P.contorno; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(ex - 18, ey - ry + (ry * 2) * pp); ctx.lineTo(ex + 18, ey - ry + (ry * 2) * pp); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = P.contorno; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(ex, ey, 13 + (v.ojos - 1) * 3, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // Cejas
    ctx.strokeStyle = P.pelo; ctx.lineWidth = 8; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const exterior = -66 - Math.max(0, v.cejas) * 8;
      const interior = -66 - v.cejas * 10;
      ctx.beginPath(); ctx.moveTo(s * 38, exterior); ctx.lineTo(s * 10, interior); ctx.stroke();
    }

    // Rubor
    if (v.rubor > 0.05) {
      ctx.fillStyle = `rgba(226,91,75,${0.5 * v.rubor})`;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 38, -24, 12, 8, 0, 0, Math.PI * 2); ctx.fill(); }
    }

    // Boca
    this.dibujarBoca(ctx, v);

    // Nariz
    ctx.fillStyle = P.pielSombra; ctx.strokeStyle = P.contorno; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, -27, 15, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(-5, -31, 4, 0, Math.PI * 2); ctx.fill();

    // Bigote
    ctx.fillStyle = P.pelo;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.bezierCurveTo(-18, -24, -40, -18, -42, -6);
    ctx.bezierCurveTo(-30, -10, -16, -8, 0, -11);
    ctx.bezierCurveTo(16, -8, 30, -10, 42, -6);
    ctx.bezierCurveTo(40, -18, 18, -24, 0, -17);
    ctx.fill();

    // Gorra
    ctx.fillStyle = P.gorra; ctx.strokeStyle = P.contorno; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, -86, 63, 50, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.blanco;
    ctx.beginPath(); ctx.arc(0, -108, 15, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = P.gorra;
    ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('L', 0, -107);
    ctx.fillStyle = P.gorra;
    ctx.beginPath(); ctx.arc(0, -136, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.gorraOscura; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, -84, 74, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Burbuja de moco al dormir
    if (this.dormido) {
      const r = 5 + 15 * (0.5 + 0.5 * Math.sin(this.reloj * 1.3));
      ctx.fillStyle = P.moco; ctx.strokeStyle = 'rgba(120,180,220,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(10 + r * 0.6, -20 + r * 0.3, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(10 + r * 0.3, -20 - r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }

    // Puntos de pantalla para partículas/burbuja
    const m = ctx.getTransform();
    this.pCabeza = m.transformPoint(new DOMPoint(0, -60));
    this.pBoca = m.transformPoint(new DOMPoint(0, -5));
    ctx.restore();
  }

  dibujarBoca(ctx, v) {
    const b = clamp(v.boca, 0, 1.3);
    const s = clamp(v.sonrisa, -1, 1);
    ctx.strokeStyle = P.contorno; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (b < 0.07) {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-15, -3 - s * 3); ctx.quadraticCurveTo(0, -3 + s * 10, 15, -3 - s * 3); ctx.stroke();
      return;
    }
    const w = 15 + b * 6;
    const h = 4 + b * 24;
    const esquina = -2 - s * 5;
    ctx.beginPath();
    ctx.moveTo(-w, esquina);
    ctx.quadraticCurveTo(0, -6 + s * 3, w, esquina);
    ctx.quadraticCurveTo(w * 0.8, esquina + h * 1.4, 0, esquina + h * 1.3);
    ctx.quadraticCurveTo(-w * 0.8, esquina + h * 1.4, -w, esquina);
    ctx.closePath();
    ctx.fillStyle = P.boca; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = P.lengua;
    ctx.beginPath(); ctx.ellipse(0, esquina + h * 1.25, w * 0.6, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.lineWidth = 4; ctx.stroke();
  }

  dibujarBrazo(ctx, lado, h, c, conTaza) {
    ctx.save();
    ctx.translate(68 * lado, -150);
    ctx.scale(lado, 1);
    ctx.rotate(-h);
    ctx.lineCap = 'round';
    // Brazo superior: contorno, piel y manga
    trazo(ctx, [[0, 0], [0, 75]], 38, P.contorno);
    trazo(ctx, [[0, 0], [0, 75]], 28, P.piel);
    ctx.fillStyle = P.polo; ctx.strokeStyle = P.contorno; ctx.lineWidth = 5;
    roundRectPath(ctx, -21, -16, 42, 58, 14);
    ctx.fill(); ctx.stroke();
    ctx.translate(0, 75);
    ctx.rotate(c);
    // Antebrazo
    trazo(ctx, [[0, 0], [0, 66]], 32, P.contorno);
    trazo(ctx, [[0, 0], [0, 66]], 24, P.piel);
    // Mano
    ctx.fillStyle = P.piel; ctx.strokeStyle = P.contorno; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 72, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (conTaza) {
      ctx.translate(0, 84);
      ctx.fillStyle = P.taza;
      roundRectPath(ctx, -18, -8, 36, 40, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(20, 10, 9, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = P.cafe;
      ctx.fillRect(-14, -4, 28, 7);
    }
    ctx.restore();
  }

  dibujarManta(ctx) {
    // Frazada a rayas tipo andina; cae desde arriba al aparecer.
    const caida = (1 - suave(this.mantaCaida)) * -260;
    ctx.save();
    ctx.translate(0, caida);
    ctx.beginPath();
    ctx.moveTo(-100, -150);
    ctx.quadraticCurveTo(0, -185, 100, -150);
    ctx.quadraticCurveTo(122, 40, 112, 175);
    ctx.quadraticCurveTo(0, 195, -112, 175);
    ctx.quadraticCurveTo(-122, 40, -100, -150);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const colores = P.manta;
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = colores[i % colores.length];
      ctx.fillRect(-130, -190 + i * 28, 260, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = -120; x < 130; x += 26) {
        ctx.beginPath(); ctx.moveTo(x, -176 + i * 28); ctx.lineTo(x + 8, -170 + i * 28); ctx.lineTo(x + 16, -176 + i * 28); ctx.fill();
      }
    }
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = P.contorno; ctx.stroke();
    ctx.restore();
  }

  dibujarMesa(ctx) {
    ctx.strokeStyle = P.contorno; ctx.lineJoin = 'round';
    // Patas
    ctx.fillStyle = P.mesaOscura;
    ctx.fillRect(140, 70, 14, 120); ctx.strokeRect(140, 70, 14, 120);
    ctx.fillRect(236, 70, 14, 120); ctx.strokeRect(236, 70, 14, 120);
    // Tablero
    ctx.fillStyle = P.mesa; ctx.lineWidth = 6;
    roundRectPath(ctx, 120, 52, 150, 26, 8); ctx.fill(); ctx.stroke();
    // Soporte del micro con cuello de ganso
    ctx.lineCap = 'round';
    trazo(ctx, [[205, 52], [205, -90]], 14, P.contorno);
    trazo(ctx, [[205, 52], [205, -90]], 7, '#9aa0b5');
    ctx.strokeStyle = P.contorno; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(205, -90); ctx.quadraticCurveTo(205, -170, 150, -180); ctx.stroke();
    ctx.strokeStyle = '#9aa0b5'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(205, -90); ctx.quadraticCurveTo(205, -170, 150, -180); ctx.stroke();
    // Base
    ctx.fillStyle = P.micro;
    ctx.beginPath(); ctx.ellipse(205, 50, 32, 9, 0, 0, Math.PI * 2); ctx.fill();
    // Cabeza del micro
    ctx.save();
    ctx.translate(138, -184);
    ctx.rotate(-0.5);
    ctx.fillStyle = P.micro; ctx.lineWidth = 5; ctx.strokeStyle = P.contorno;
    roundRectPath(ctx, -18, -30, 36, 60, 18); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = P.microRejilla; ctx.lineWidth = 2;
    for (let i = -18; i <= 0; i += 6) { ctx.beginPath(); ctx.moveTo(-14, i); ctx.lineTo(14, i); ctx.stroke(); }
    ctx.fillStyle = P.peligro;
    ctx.beginPath(); ctx.arc(0, 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Radio vieja en la mesa
    ctx.fillStyle = '#5c6b73'; ctx.strokeStyle = P.contorno; ctx.lineWidth = 4;
    roundRectPath(ctx, 228, 18, 38, 34, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9d1d9';
    ctx.beginPath(); ctx.arc(241, 35, 8, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- ayudas de dibujo

function trazo(ctx, puntos, grosor, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(puntos[0][0], puntos[0][1]);
  for (let i = 1; i < puntos.length; i++) ctx.lineTo(puntos[i][0], puntos[i][1]);
  ctx.stroke();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Mezcla dos colores hex. */
function mezclar(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, k));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
  const bl = Math.round(lerp(pa & 255, pb & 255, k));
  return `rgb(${r},${g},${bl})`;
}
