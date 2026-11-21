// Simulación AUTORITATIVA de la carrera: autos que avanzan solos, efecto liga, separación lateral,
// daño por obstáculos, explosión y chatarra, llegada a la meta y ranking.
// update() deja eventos en this.eventos para que game.js los narre y los mande al overlay.
import { posicionObstaculo } from './track.js';
import { entre } from './util.js';

export class Carrera {
  /**
   * @param {{config: object, pista: object, pilotos: object[], rng: () => number}} deps
   * pilotos: [{ id, userId, nombre, modelo, color, numero, bot }]
   */
  constructor({ config, pista, pilotos, rng }) {
    this.cfg = config.carrera;
    this.pista = pista;
    this.rng = rng;
    this.t = 0;               // ms desde que se creó (incluye la cuenta regresiva)
    this.estado = 'cuenta';   // cuenta | corriendo | final
    this.eventos = [];
    this.llegadas = 0;
    this.primeroEnSeg = null;
    this.liderId = null;
    this.obstaculos = pista.obstaculos.map((o) => ({ ...o }));
    this.chatarra = [];
    const c = this.cfg;
    const cols = c.parrillaColumnas;
    this.autos = pilotos.map((p, i) => {
      const col = i % cols;
      const fila = Math.floor(i / cols);
      const x = (col + 0.5) * (c.carriles / cols);
      return {
        ...p, x, xObjetivo: x, y: -fila * c.parrillaSeparacion - 60, yPrev: 0, vel: 0,
        hp: 100, estado: 'vivo', factorVar: 1, proxVar: 0, proxRumbo: entre(rng, ...c.cambioRumboCadaSeg),
        frenoHastaSeg: 0, llegada: null, tiempoMetaSeg: null, golpes: 0, danoRecibido: 0,
      };
    });
  }

  get tSeg() {
    return Math.max(0, (this.t - this.cfg.cuentaSeg * 1000) / 1000);
  }

  emitir(tipo, datos = {}) {
    this.eventos.push({ tipo, ...datos });
  }

  vivos() {
    return this.autos.filter((a) => a.estado === 'vivo');
  }

  update(dt) {
    if (this.estado === 'final') return;
    this.t += dt;
    if (this.estado === 'cuenta') {
      if (this.t >= this.cfg.cuentaSeg * 1000) {
        this.estado = 'corriendo';
        this.emitir('ya');
      }
      return;
    }
    const c = this.cfg;
    const tSeg = this.tSeg;
    const vivos = this.vivos();
    const yLider = vivos.reduce((m, a) => Math.max(m, a.y), -Infinity);

    for (const a of vivos) {
      this.moverAuto(a, dt, tSeg, yLider);
    }
    this.separarAutos(vivos, dt);
    for (const a of vivos) {
      if (a.estado !== 'vivo') continue;
      this.revisarChoques(a, tSeg, dt);
      if (a.estado === 'vivo' && a.y >= this.pista.largo) this.llegarMeta(a, tSeg);
    }
    this.revisarAvisos(tSeg, yLider);
    this.revisarLider(tSeg);
    this.revisarFin(tSeg);
  }

  moverAuto(a, dt, tSeg, yLider) {
    const c = this.cfg;
    if (tSeg >= a.proxVar) {
      a.factorVar = 1 + (this.rng() * 2 - 1) * c.variacion;
      a.proxVar = tSeg + c.variacionCadaSeg;
    }
    // Efecto liga: los de atrás ganan un poco de velocidad
    const atraso = Math.min(1, Math.max(0, (yLider - a.y) / c.ligaDistancia));
    const liga = 1 + c.ligaFuerza * atraso;
    const vida = a.hp / 100 < c.vidaBajaUmbral ? c.vidaBajaFactor : 1;
    const freno = tSeg < a.frenoHastaSeg ? c.golpeFrenoFactor : 1;
    a.vel = c.velocidadBase * a.factorVar * liga * vida * freno;
    a.yPrev = a.y;
    a.y += (a.vel * dt) / 1000;

    // Deriva lateral suave hacia un rumbo que cambia cada tanto
    if (tSeg >= a.proxRumbo) {
      const m = c.anchoAuto / 2;
      a.xObjetivo = m + this.rng() * (c.carriles - 2 * m);
      a.proxRumbo = tSeg + entre(this.rng, ...c.cambioRumboCadaSeg);
    }
    const paso = (c.derivaCarrilesPorSeg * dt) / 1000;
    const d = a.xObjetivo - a.x;
    a.x += Math.abs(d) <= paso ? d : Math.sign(d) * paso;
  }

  /** Empuja lateralmente a los autos que están muy pegados para que no se superpongan. */
  separarAutos(vivos, dt) {
    const c = this.cfg;
    const k = (dt / 1000) * 3;
    for (let i = 0; i < vivos.length; i++) {
      for (let j = i + 1; j < vivos.length; j++) {
        const a = vivos[i], b = vivos[j];
        if (Math.abs(a.y - b.y) > c.separacionLargo) continue;
        const dx = a.x - b.x;
        const solape = c.separacionCarriles - Math.abs(dx);
        if (solape <= 0) continue;
        const dir = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
        a.x += dir * solape * k;
        b.x -= dir * solape * k;
      }
    }
    const m = c.anchoAuto / 2;
    for (const a of vivos) a.x = Math.min(c.carriles - m, Math.max(m, a.x));
  }

  revisarChoques(a, tSeg, dt) {
    const c = this.cfg;
    const tPrev = Math.max(0, tSeg - dt / 1000);
    for (const o of this.obstaculos) {
      if (o.duenoId === a.id) continue; // su propia chatarra
      const ahora = posicionObstaculo(o, tSeg, c.carriles);
      // ¿El auto cruzó la línea del obstáculo en este tick?
      const antes = posicionObstaculo(o, tPrev, c.carriles);
      if (!(a.yPrev < antes.y && a.y >= ahora.y)) continue;
      if (Math.abs(a.x - ahora.x) >= o.ancho / 2 + c.anchoAuto / 2) continue;
      this.golpear(a, o, tSeg);
      if (a.estado !== 'vivo') return;
    }
  }

  golpear(a, o, tSeg) {
    const c = this.cfg;
    a.hp = Math.max(0, a.hp - o.dano);
    a.golpes += 1;
    a.danoRecibido += o.dano;
    a.frenoHastaSeg = tSeg + c.golpeFrenoSeg;
    this.emitir('golpe', { autoId: a.id, obstaculo: o.tipo, dano: o.dano });
    if (a.hp <= 0) this.destruir(a);
  }

  /** Explota y queda como chatarra (obstáculo pequeño para los de atrás). */
  destruir(a) {
    const c = this.cfg;
    a.estado = 'destruido';
    a.hp = 0;
    const chatarra = {
      id: `c${a.id}`, tipo: 'chatarra', y: Math.round(a.y), x: +a.x.toFixed(2), ancho: c.chatarraAncho,
      dano: c.chatarraDano, mov: 'fijo', vel: 0, dir: 1, aviso: false, duenoId: a.id,
    };
    this.obstaculos.push(chatarra);
    this.chatarra.push(chatarra);
    this.emitir('explosion', { autoId: a.id });
  }

  llegarMeta(a, tSeg) {
    a.estado = 'meta';
    a.y = this.pista.largo;
    a.llegada = ++this.llegadas;
    a.tiempoMetaSeg = tSeg;
    if (a.llegada === 1) this.primeroEnSeg = tSeg;
    this.emitir('meta', { autoId: a.id, pos: a.llegada });
  }

  /** Avisa ~avisoSeg antes de que el líder llegue a un obstáculo importante. */
  revisarAvisos(tSeg, yLider) {
    if (!Number.isFinite(yLider)) return;
    const alcance = yLider + this.cfg.velocidadBase * this.cfg.avisoSeg;
    for (const o of this.obstaculos) {
      if (!o.aviso || o.avisado) continue;
      const { y } = posicionObstaculo(o, tSeg, this.cfg.carriles);
      if (y <= alcance && y > yLider) {
        o.avisado = true;
        this.emitir('aviso', { obstaculo: o.tipo, id: o.id });
      }
    }
  }

  revisarLider(tSeg) {
    const lider = this.ranking()[0];
    if (!lider || lider.id === this.liderId) return;
    const anterior = this.liderId;
    this.liderId = lider.id;
    if (anterior !== null && tSeg > 3) this.emitir('lider', { autoId: lider.id });
  }

  revisarFin(tSeg) {
    const c = this.cfg;
    const quedan = this.vivos().length;
    const tiempoAgotado = tSeg >= c.maxSeg;
    const esperaPrimero = this.primeroEnSeg !== null && tSeg - this.primeroEnSeg >= c.trasPrimeroSeg;
    if (quedan === 0 || tiempoAgotado || esperaPrimero) {
      this.estado = 'final';
      this.emitir('fin');
    }
  }

  /** Orden: llegaron (por orden de llegada) > vivos (por avance) > destruidos (por avance). */
  ranking() {
    const grupo = (a) => (a.estado === 'meta' ? 0 : a.estado === 'vivo' ? 1 : 2);
    return [...this.autos].sort((a, b) => grupo(a) - grupo(b) || (grupo(a) === 0 ? a.llegada - b.llegada : b.y - a.y));
  }

  autoPorId(id) {
    return this.autos.find((a) => a.id === id);
  }

  snapshot(incluirEstatico) {
    const rk = this.ranking();
    const posDe = new Map(rk.map((a, i) => [a.id, i + 1]));
    const tSeg = this.tSeg;
    const s = {
      t: Math.round(this.t),
      tSeg: +tSeg.toFixed(2),
      estado: this.estado,
      cuentaMs: Math.max(0, Math.round(this.cfg.cuentaSeg * 1000 - this.t)),
      largo: this.pista.largo,
      carriles: this.pista.carriles,
      // [id, y, x, hp, estado(0 vivo, 1 destruido, 2 meta), posición]
      autos: this.autos.map((a) => [a.id, Math.round(a.y), +a.x.toFixed(2), Math.round(a.hp), a.estado === 'vivo' ? 0 : a.estado === 'destruido' ? 1 : 2, posDe.get(a.id)]),
      vivos: this.vivos().length,
      top: rk.slice(0, 3).map((a) => a.id),
      // obstáculos que se mueven: [id, x, y]
      moviles: this.obstaculos.filter((o) => o.mov !== 'fijo').map((o) => {
        const p = posicionObstaculo(o, tSeg, this.cfg.carriles);
        return [o.id, +p.x.toFixed(2), Math.round(p.y)];
      }),
      chatarra: this.chatarra.map((o) => [o.duenoId, o.y, o.x]),
    };
    if (incluirEstatico) {
      s.info = this.autos.map((a) => ({ id: a.id, nombre: a.nombre, modelo: a.modelo, color: a.color, numero: a.numero, bot: !!a.bot }));
      s.pista = { semilla: this.pista.semilla, tramos: this.pista.tramos, obstaculos: this.pista.obstaculos.map(({ id, tipo, y, x, ancho, mov }) => ({ id, tipo, y, x, ancho, mov })) };
    }
    return s;
  }
}
