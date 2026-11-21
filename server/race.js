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
    this.comandos = config.comandos;
    this.equipos = config.equipos;
    this.seqDinamico = 0;
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
        escudoHastaSeg: 0, turboHastaSeg: 0, cargasTurbo: config.comandos.turbo.cargas, reparoUsado: false,
        repararHastaSeg: 0, derrapeHastaSeg: 0, esquive: null, equipo: null, ultimoAtacante: null,
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
    this.obstaculos = this.obstaculos.filter((o) => !o.hastaSeg || o.hastaSeg > tSeg);
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
    const turbo = tSeg < a.turboHastaSeg ? this.comandos.turbo.turboFactor : 1;
    const reparacion = tSeg < a.repararHastaSeg ? this.comandos.reparar.repararFrenoFactor : 1;
    a.vel = c.velocidadBase * a.factorVar * liga * vida * freno * turbo * reparacion;
    a.yPrev = a.y;
    a.y += (a.vel * dt) / 1000;

    // Deriva lateral suave hacia un rumbo que cambia cada tanto
    if (a.esquive && a.y > posicionObstaculo(a.esquive, tSeg, c.carriles).y) {
      if (!a.esquiveFallo) this.emitir('esquivarExito', { autoId: a.id });
      a.esquive = null;
    }
    if (!a.esquive && tSeg >= a.derrapeHastaSeg && tSeg >= a.proxRumbo) {
      const m = c.anchoAuto / 2;
      a.xObjetivo = m + this.rng() * (c.carriles - 2 * m);
      a.proxRumbo = tSeg + entre(this.rng, ...c.cambioRumboCadaSeg);
    }
    const paso = ((a.esquive ? this.comandos.esquivar.esquivarDeriva : tSeg < a.derrapeHastaSeg ? this.comandos.aceite.derrapeDeriva : c.derivaCarrilesPorSeg) * dt) / 1000;
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
      if (a.esquive?.id === o.id) a.esquiveFallo = true;
      this.golpear(a, o, tSeg);
      if (a.estado !== 'vivo') return;
    }
  }

  golpear(a, o, tSeg) {
    const c = this.cfg;
    if (tSeg < a.escudoHastaSeg) {
      a.escudoHastaSeg = 0; this.emitir('escudoRoto', { autoId: a.id }); return;
    }
    if (o.tipo === 'aceite') {
      a.derrapeHastaSeg = tSeg + this.comandos.aceite.derrapeSeg;
      a.frenoHastaSeg = a.derrapeHastaSeg;
      a.xObjetivo = Math.max(c.anchoAuto / 2, Math.min(c.carriles - c.anchoAuto / 2,
        a.x + (a.x < c.carriles / 2 ? 1 : -1) * this.comandos.aceite.derrapeDesvio));
      this.emitir('derrape', { autoId: a.id }); return;
    }
    const dano = o.dano * (tSeg < a.turboHastaSeg ? this.comandos.turbo.turboDanoFactor : 1);
    const efectivo = Math.min(a.hp, dano);
    a.hp = Math.max(0, a.hp - dano);
    a.golpes += 1;
    a.danoRecibido += dano;
    a.frenoHastaSeg = tSeg + c.golpeFrenoSeg;
    this.emitir('golpe', { autoId: a.id, obstaculo: o.tipo, dano: efectivo, atacanteId: o.duenoId });
    if (a.hp <= 0) this.destruir(a);
  }

  // Las acciones no consumen recursos cuando fallan. El chat valida identidad y cooldown.
  accion(id, cmd, args = []) {
    const a = this.autoPorId(id);
    if (!a || this.estado !== 'corriendo') return { ok: false, motivo: 'fueraDeCarrera' };
    const d = this.comandos[cmd];
    if (cmd === 'lanzar') {
      if (a.estado !== 'destruido') return { ok: false, motivo: 'noFantasma' };
      const carril = args.length ? Number(args[0]) : Math.floor(this.rng() * this.cfg.carriles) + 1;
      if (!Number.isInteger(carril) || carril < 1 || carril > this.cfg.carriles || !this.vivos().length) return { ok: false, motivo: 'sinObjetivo' };
      const proyectil = this.dinamico(a, 'proyectil', Math.max(...this.vivos().map(a => a.y)) + d.lanzarDistancia, carril - .5, d.lanzarAncho, d.lanzarDano, d.lanzarSeg);
      this.emitir('fantasmaLanza', { autoId: id, carril, proyectilId: proyectil.id, x: proyectil.x, y: proyectil.y });
      return { ok: true };
    }
    if (a.estado !== 'vivo') return { ok: false, motivo: 'muerto' };
    if (d.tipo === 'equipo') {
      if (!this.equipos.activo || a.equipo) return { ok: false, motivo: 'equipoElegido' };
      a.equipo = cmd; this.emitir('equipo', { autoId: id, equipo: cmd }); return { ok: true };
    }
    let objetivoId;
    if (cmd === 'turbo') {
      if (!a.cargasTurbo) return { ok: false, motivo: 'sinCargas' };
      if (a.turboHastaSeg > this.tSeg) return { ok: false, motivo: 'activo' };
      a.cargasTurbo--; a.turboHastaSeg = this.tSeg + d.turboSeg;
    } else if (cmd === 'escudo') a.escudoHastaSeg = this.tSeg + d.escudoSeg;
    else if (cmd === 'reparar') {
      if (a.reparoUsado) return { ok: false, motivo: 'sinCargas' };
      if (a.hp >= 100) return { ok: false, motivo: 'vidaCompleta' };
      a.reparoUsado = true; a.hp = Math.min(100, a.hp + d.repararPorc);
      a.repararHastaSeg = this.tSeg + d.repararFrenoSeg;
    } else if (cmd === 'bomba') {
      const b = this.vivos().filter(b => b.y > a.y).sort((b,c) => b.y-c.y)[0];
      if (!b) return { ok: false, motivo: 'sinObjetivo' };
      objetivoId = b.id;
      const venganza = a.ultimoAtacante === b.id;
      const protegido = b.escudoHastaSeg > this.tSeg;
      this.golpear(b, { tipo: 'bomba', dano: d.bombaDano, duenoId: a.id }, this.tSeg);
      if (!protegido) b.frenoHastaSeg = this.tSeg + d.bombaFrenoSeg;
      b.ultimoAtacante = a.id;
      if (venganza) this.emitir('venganza', { autoId: id, objetivoId });
    } else if (cmd === 'aceite') this.dinamico(a, 'aceite', a.y - d.aceiteDistancia, a.x, d.aceiteAncho, 0, d.aceiteSeg);
    else if (cmd === 'esquivar') {
      const o = this.obstaculos.filter(o => o.duenoId !== id).map(o => ({ o, p: posicionObstaculo(o, this.tSeg, this.cfg.carriles) }))
        .filter(({p}) => p.y > a.y && p.y-a.y <= d.esquivarVentanaSeg * (a.vel || this.cfg.velocidadBase)).sort((b,c) => b.p.y-c.p.y)[0];
      if (!o) return { ok: false, motivo: 'sinObjetivo' };
      // Anticipa dónde estará al cruzarlo: los obstáculos también pueden moverse.
      const velocidad = a.vel || this.cfg.velocidadBase;
      const relativa = velocidad - (o.o.mov === 'lento' ? o.o.vel : 0);
      const cruceSeg = (o.p.y - a.y) / (relativa > 0 ? relativa : this.cfg.velocidadBase);
      const futuro = posicionObstaculo(o.o, this.tSeg + cruceSeg, this.cfg.carriles);
      const margen = o.o.ancho/2 + this.cfg.anchoAuto/2 + d.esquivarMargen;
      const opciones = [futuro.x-margen, futuro.x+margen].filter(x => x >= this.cfg.anchoAuto/2 && x <= this.cfg.carriles-this.cfg.anchoAuto/2);
      if (!opciones.length) return { ok: false, motivo: 'sinObjetivo' };
      a.xObjetivo = opciones.sort((x,y) => Math.abs(x-a.x)-Math.abs(y-a.x))[0];
      a.esquive = o.o; a.esquiveFallo = false;
    } else return { ok: false, motivo: 'desconocido' };
    this.emitir(cmd, { autoId: id, objetivoId });
    return { ok: true };
  }

  aplicarTurbo(id) { return this.accion(id, 'turbo'); }
  aplicarEscudo(id) { return this.accion(id, 'escudo'); }
  reparar(id) { return this.accion(id, 'reparar'); }
  esquivar(id) { return this.accion(id, 'esquivar'); }
  bomba(id) { return this.accion(id, 'bomba'); }
  soltarAceite(id) { return this.accion(id, 'aceite'); }
  lanzar(id, carril) { return this.accion(id, 'lanzar', carril === undefined ? [] : [carril]); }

  dinamico(a, tipo, y, x, ancho, dano, seg) {
    const o = { id: `d${++this.seqDinamico}`, tipo, y, x, ancho, dano, mov: 'fijo', duenoId: a.id, hastaSeg: this.tSeg + seg };
    this.obstaculos.push(o);
    return o;
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
      recursos: this.autos.map(a => ({ id: a.id, turbo: a.cargasTurbo, reparar: !a.reparoUsado, escudo: a.escudoHastaSeg > tSeg, acelerando: a.turboHastaSeg > tSeg, derrape: a.derrapeHastaSeg > tSeg, equipo: a.equipo })),
      dinamicos: this.obstaculos.filter(o => o.hastaSeg),
      equipos: this.equipos.activo ? this.equipos.bandos.map(bando => ({ bando, puntos: rk.reduce((n,a,i) => n + (a.equipo === bando && a.estado !== 'destruido' ? (this.cfg.puntos[i] ?? 0) : 0), 0) })) : [],
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
      s.info = this.autos.map((a) => ({ id: a.id, nombre: a.nombre, modelo: a.modelo, color: a.color, numero: a.numero, bot: !!a.bot, rango: a.rango, cosmeticos: a.cosmeticos ?? [] }));
      s.pista = { semilla: this.pista.semilla, tramos: this.pista.tramos, obstaculos: this.pista.obstaculos.map(({ id, tipo, y, x, ancho, mov }) => ({ id, tipo, y, x, ancho, mov })) };
    }
    return s;
  }
}
