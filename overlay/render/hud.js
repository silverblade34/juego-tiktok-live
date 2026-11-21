// HUD: barra superior, burbuja de diálogo, medidor de paciencia, leyenda de comandos,
// feed del chat, tarjeta de "comenta para jugar", panel del lobby, banners y textos flotantes.
import { P, L, ANCHO } from './palette.js';
import { textoContorno, envolver, rrect, panel, fuente, clamp, lerp, easeBack } from './texto.js';
import { dibujarIcono } from './iconos.js';
import { dibujarAuto, colorAuto } from './cars.js';

// ================================================================ burbuja de diálogo

class Burbuja {
  constructor() {
    this.id = null;
    this.texto = '';
    this.t = 0;          // segundos desde que empezó
    this.rapido = false;
    this.escala = 0;     // animación de aparición
    this.visible = false;
    this.preparando = false; // esperando el audio: muestra "..."
    this.cps = 40;           // caracteres por segundo de la máquina de escribir
  }

  sincronizar(habla) {
    if (habla && habla.id !== this.id) {
      this.id = habla.id;
      this.texto = habla.texto;
      this.t = habla.transcurridoMs / 1000;
      this.rapido = habla.rapido;
      this.escala = this.t > 0.3 ? 1 : 0;
      this.preparando = !!habla.preparando;
      this.ajustarRitmo(habla);
    } else if (habla && this.preparando && !habla.preparando) {
      // Llegó el audio: el texto arranca sincronizado con la voz.
      this.preparando = false;
      this.t = habla.transcurridoMs / 1000;
      this.ajustarRitmo(habla);
    }
    this.visible = !!habla;
  }

  /** Con audio, el texto se escribe al ritmo de la voz; sin audio, a ritmo fijo. */
  ajustarRitmo(habla) {
    if (habla.audio && habla.durMs > 0) this.cps = Math.max(12, this.texto.length / ((habla.durMs / 1000) * 0.85));
    else this.cps = this.rapido ? 80 : 40;
  }

  update(dt) {
    this.t += dt;
    this.escala = clamp(this.escala + (this.visible ? dt * 5 : -dt * 6), 0, 1);
  }

  /** ¿Sigue escribiéndose? (para mover la boca de Lucho) */
  escribiendo() {
    return this.visible && !this.preparando && this.caracteres() < this.texto.length;
  }

  caracteres() {
    return Math.floor(this.t * this.cps);
  }

  /** Burbujita de "pensando..." mientras se genera la voz. */
  dibujarPensando(ctx, punta, dormido) {
    const { x, abajo } = L.burbuja;
    const w = 130, h = 70, by = abajo - h;
    const k = easeBack(this.escala);
    ctx.save();
    ctx.translate(x + 30, abajo); ctx.scale(k, k); ctx.translate(-(x + 30), -abajo);
    ctx.fillStyle = dormido ? P.burbujaDormido : P.burbuja;
    ctx.strokeStyle = P.contorno; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + 40, abajo - 4); ctx.lineTo(punta.x, punta.y); ctx.lineTo(x + 90, abajo - 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    rrect(ctx, x, by, w, h, 30); ctx.fill(); ctx.stroke();
    ctx.fillRect(x + 43, abajo - 9, 44, 8);
    ctx.fillStyle = P.contorno;
    for (let i = 0; i < 3; i++) {
      const salto = Math.max(0, Math.sin(this.t * 8 - i * 0.9)) * 8;
      ctx.beginPath(); ctx.arc(x + 35 + i * 30, by + h / 2 - salto, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  dibujar(ctx, punta, dormido) {
    if (this.escala <= 0.01 || !this.texto) return;
    if (this.preparando) { this.dibujarPensando(ctx, punta, dormido); return; }
    const px = 38;
    const { x, abajo, anchoMax } = L.burbuja;
    ctx.font = fuente(px);
    const lineas = envolver(ctx, this.texto, anchoMax - 50);
    const anchoTexto = Math.max(...lineas.map((l) => ctx.measureText(l).width));
    const w = Math.min(anchoMax, anchoTexto + 50);
    const h = lineas.length * 46 + 34;
    const bx = x, by = abajo - h;
    const k = easeBack(this.escala);
    const sacudida = this.rapido ? (Math.random() - 0.5) * 4 : 0;

    ctx.save();
    ctx.translate(bx + 30 + sacudida, abajo);
    ctx.scale(k, k);
    ctx.translate(-(bx + 30), -abajo);

    // cola hacia la boca
    ctx.fillStyle = dormido ? P.burbujaDormido : P.burbuja;
    ctx.strokeStyle = P.contorno; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + 40, abajo - 4);
    ctx.lineTo(punta.x, punta.y);
    ctx.lineTo(bx + 100, abajo - 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    rrect(ctx, bx, by, w, h, 30);
    ctx.fill();
    ctx.restore();
    rrect(ctx, bx, by, w, h, 30);
    ctx.stroke();
    // tapa la unión de la cola
    ctx.fillRect(bx + 43, abajo - 9, 54, 8);

    // texto con efecto máquina de escribir
    let restantes = this.caracteres();
    ctx.font = fuente(px, dormido ? 'italic bold' : 'bold');
    ctx.fillStyle = dormido ? '#5d4bb3' : P.contorno;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lineas.forEach((linea, i) => {
      if (restantes <= 0) return;
      const parte = linea.slice(0, restantes);
      restantes -= linea.length + 1;
      ctx.fillText(parte, bx + 25, by + 20 + i * 46);
    });
    ctx.restore();
  }
}

// ================================================================ HUD principal

export class Hud {
  constructor() {
    this.burbuja = new Burbuja();
    this.chips = {};         // cmd -> { sacudida, destello }
    this.flotantes = [];
    this.banners = [];
    this.pacienciaMostrada = 0;
    this.pacienciaPulso = 0;
    this.alfaEspera = 1;
    this.feedNuevo = new Map(); // id -> t de aparición
    this.tagsNuevos = new Map(); // cupo -> t
    this.ultimoSeg = null;
    this.pulsoSeg = 0;
    this.reloj = 0;
  }

  chip(cmd) {
    return (this.chips[cmd] ??= { sacudida: 0, destello: 0 });
  }

  /** Reacciona a eventos puntuales del servidor. */
  evento(ev) {
    switch (ev.tipo) {
      case 'balde': case 'cafe': case 'corneta': case 'manta':
        this.chip(ev.tipo).destello = 1;
        break;
      case 'cooldown': {
        this.chip(ev.cmd).sacudida = 1;
        const i = this.indiceLeyenda?.(ev.cmd) ?? 0;
        this.flotar(`¡${ev.nombre}, espera ${ev.seg}s!`, this.xChip(i), L.leyenda.y - 30, '#ffb3c1');
        break;
      }
      case 'paciencia':
        this.pacienciaPulso = 1;
        break;
      case 'miron':
        this.banner(`¡TE VEO, ${ev.nombre.toUpperCase()}!`, P.info);
        break;
      case 'saludo':
        this.pulsoEspectadores = 1;
        break;
      case 'spam':
        this.banner(`¡${ev.nombre.toUpperCase()} SILENCIADO ${ev.seg}s!`, P.peligro);
        break;
      case 'lobbyAbre':
        this.banner(ev.motivo === 'paciencia' ? '¡SE LE ACABÓ LA PACIENCIA!' : '¡INSCRIPCIONES ABIERTAS!', P.acento);
        break;
      case 'lobbyUltimos':
        this.banner('¡ÚLTIMOS SEGUNDOS!', P.peligro);
        break;
      case 'lobbyFin':
        this.banner(ev.inscritos > 0 ? '¡A LA PARRILLA!' : 'NADIE SE INSCRIBIÓ', ev.inscritos > 0 ? P.ok : P.info);
        break;
    }
  }

  flotar(texto, x, y, color = P.texto) {
    this.flotantes.push({ texto, x: clamp(x, 220, ANCHO - 220), y, t: 0, dur: 1.8, color });
    if (this.flotantes.length > 8) this.flotantes.shift();
  }

  banner(texto, color) {
    this.banners.push({ texto, color, t: 0, dur: 2.4 });
    if (this.banners.length > 3) this.banners.shift();
  }

  update(dt, snap) {
    this.reloj += dt;
    this.burbuja.sincronizar(snap.lucho.habla);
    this.burbuja.update(dt);
    for (const c of Object.values(this.chips)) {
      c.sacudida = Math.max(0, c.sacudida - dt * 2.5);
      c.destello = Math.max(0, c.destello - dt * 2);
    }
    for (const f of this.flotantes) f.t += dt;
    this.flotantes = this.flotantes.filter((f) => f.t < f.dur);
    if (this.banners.length) {
      this.banners[0].t += dt;
      if (this.banners[0].t >= this.banners[0].dur) this.banners.shift();
    }
    const objetivo = snap.lucho.paciencia / snap.lucho.pacienciaMax;
    this.pacienciaMostrada = lerp(this.pacienciaMostrada, objetivo, 1 - Math.exp(-dt * 6));
    this.pacienciaPulso = Math.max(0, this.pacienciaPulso - dt * 2);
    this.pulsoEspectadores = Math.max(0, (this.pulsoEspectadores ?? 0) - dt * 2);
    this.alfaEspera = clamp(this.alfaEspera + (snap.fase === 'ESPERA' ? dt : -dt) * 3, 0, 1);

    // Marca de aparición de entradas nuevas del feed y de inscritos.
    for (const f of snap.feed) if (!this.feedNuevo.has(f.id)) this.feedNuevo.set(f.id, this.reloj);
    if (this.feedNuevo.size > 40) for (const k of [...this.feedNuevo.keys()].slice(0, 20)) this.feedNuevo.delete(k);
    for (const p of snap.lobby.inscritos) if (!this.tagsNuevos.has(p.cupo)) this.tagsNuevos.set(p.cupo, this.reloj);
    if (snap.fase !== 'LOBBY') this.tagsNuevos.clear();

    const seg = snap.faseRestanteMs != null ? Math.ceil(snap.faseRestanteMs / 1000) : null;
    if (seg !== this.ultimoSeg) { this.ultimoSeg = seg; this.pulsoSeg = 1; }
    this.pulsoSeg = Math.max(0, this.pulsoSeg - dt * 3);
  }

  // ---------------------------------------------------------------- dibujo

  dibujarBarra(ctx, snap, cliente, conectado) {
    const h = L.barraAlto;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(22,14,48,0.95)');
    g.addColorStop(1, 'rgba(22,14,48,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ANCHO, h);
    ctx.fillStyle = P.acento;
    ctx.fillRect(0, h - 6, ANCHO, 6);

    const titulo = cliente?.nombre ?? 'EL PARADERO FINAL';
    const bote = Math.sin(this.reloj * 2) * 3;
    textoContorno(ctx, titulo, ANCHO / 2, 68 + bote, { px: 76, color: P.acento, grosor: 14 });

    // Chip de fase
    let texto, color;
    if (snap.fase === 'LOBBY') {
      const s = Math.ceil((snap.faseRestanteMs ?? 0) / 1000);
      texto = `INSCRIPCIONES  ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      color = s <= 10 ? P.peligro : P.ok;
    } else {
      texto = 'ESPERANDO PILOTOS';
      color = P.info;
    }
    ctx.font = fuente(36);
    const w = ctx.measureText(texto).width + 90;
    const x = ANCHO / 2 - w / 2, y = 118;
    rrect(ctx, x, y, w, 52, 26);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = P.contorno; ctx.stroke();
    const pulso = 0.6 + 0.4 * Math.sin(this.reloj * 6);
    ctx.fillStyle = `rgba(255,255,255,${pulso})`;
    ctx.beginPath(); ctx.arc(x + 32, y + 26, 10, 0, Math.PI * 2); ctx.fill();
    textoContorno(ctx, texto, x + w / 2 + 18, y + 28, { px: 34, color: P.blanco, grosor: 7 });

    // Espectadores (ojo + número)
    if (snap.espectadores != null) this.dibujarEspectadores(ctx, 70, 144, snap.espectadores);

    // Indicador de conexión
    ctx.fillStyle = conectado ? P.ok : P.peligro;
    ctx.beginPath(); ctx.arc(ANCHO - 30, 30, 9, 0, Math.PI * 2); ctx.fill();
  }

  dibujarEspectadores(ctx, x, y, n) {
    const k = 1 + (this.pulsoEspectadores ?? 0) * 0.25;
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.quadraticCurveTo(0, -24, 30, 0); ctx.quadraticCurveTo(0, 24, -30, 0);
    ctx.fillStyle = P.blanco; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = P.contorno; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = P.contorno; ctx.fill();
    ctx.restore();
    textoContorno(ctx, String(n), x + 42, y + 2, { px: 38, align: 'left', color: P.blanco, grosor: 8 });
  }

  /** Tarjeta central de la ESPERA: invita a comentar. */
  dibujarAtraccion(ctx) {
    const a = this.alfaEspera;
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    const bote = Math.sin(this.reloj * 2.2) * 6;
    const x = 60, y = 240 + bote, w = ANCHO - 120, h = 300;
    panel(ctx, x, y, w, h, { fondo: P.hudFondoClaro, borde: P.contorno, grosor: 7, r: 36 });
    // franja superior a cuadros
    ctx.save();
    rrect(ctx, x, y, w, h, 36); ctx.clip();
    for (let i = 0; i < w / 30 + 1; i++) {
      ctx.fillStyle = i % 2 ? P.contorno : P.blanco;
      ctx.fillRect(x + i * 30, y, 30, 18);
      ctx.fillStyle = i % 2 ? P.blanco : P.contorno;
      ctx.fillRect(x + i * 30, y + 18, 30, 18);
    }
    ctx.restore();
    const escala = 1 + Math.sin(this.reloj * 4) * 0.03;
    ctx.save();
    ctx.translate(ANCHO / 2, y + 105);
    ctx.scale(escala, escala);
    textoContorno(ctx, '¡COMENTA PARA JUGAR!', 0, 0, { px: 76, color: '#ff7b1c', grosor: 14 });
    ctx.restore();
    textoContorno(ctx, 'Escribe lo que sea o  !jugar', ANCHO / 2, y + 180, { px: 44, color: P.contorno, contorno: null });
    textoContorno(ctx, '30 cupos • tu nombre sobre tu auto', ANCHO / 2, y + 240, { px: 34, color: '#5a5470', contorno: null });
    ctx.restore();
  }

  /** Últimas acciones del chat (feed). */
  dibujarFeed(ctx, feed) {
    const a = this.alfaEspera;
    if (a <= 0.01 || !feed.length) return;
    ctx.save();
    ctx.globalAlpha = a;
    textoContorno(ctx, 'EN EL CHAT', 80, 590, { px: 30, color: P.acento, align: 'left', grosor: 7 });
    feed.slice(0, 5).forEach((f, i) => {
      const aparecio = this.feedNuevo.get(f.id) ?? 0;
      const k = clamp((this.reloj - aparecio) / 0.35, 0, 1);
      const x = 60 - (1 - easeBack(k)) * 400;
      const y = 620 + i * 54;
      ctx.globalAlpha = a * (1 - i * 0.15);
      ctx.font = fuente(32);
      const w = ctx.measureText(f.texto).width + 50;
      rrect(ctx, x, y, w, 46, 23);
      ctx.fillStyle = i === 0 ? 'rgba(255,210,63,0.95)' : 'rgba(22,14,48,0.8)';
      ctx.fill();
      textoContorno(ctx, f.texto, x + 25, y + 25, { px: 30, align: 'left', color: i === 0 ? P.contorno : P.texto, contorno: i === 0 ? null : P.contorno, grosor: 6 });
    });
    ctx.restore();
  }

  /** Termómetro vertical de paciencia de Don Lucho. */
  dibujarPaciencia(ctx) {
    const a = this.alfaEspera;
    if (a <= 0.01) return;
    const { x, y, ancho, alto } = L.paciencia;
    const v = clamp(this.pacienciaMostrada, 0, 1);
    const pulso = 1 + this.pacienciaPulso * 0.12 + (v > 0.8 ? Math.sin(this.reloj * 14) * 0.03 : 0);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x + ancho / 2, y + alto);
    ctx.scale(pulso, pulso);
    ctx.translate(-(x + ancho / 2), -(y + alto));
    textoContorno(ctx, 'PACIENCIA', x + ancho / 2, y - 40, { px: 28, color: P.blanco, grosor: 7 });
    // tubo
    rrect(ctx, x, y, ancho, alto, ancho / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = P.contorno; ctx.stroke();
    // relleno
    const color = v < 0.5 ? P.ok : v < 0.8 ? P.acento : P.peligro;
    const hh = (alto - 16) * v;
    if (hh > 2) {
      rrect(ctx, x + 8, y + alto - 8 - hh, ancho - 16, hh, (ancho - 16) / 2);
      ctx.fillStyle = color; ctx.fill();
    }
    // bulbo con carita
    const bx = x + ancho / 2, by = y + alto + 30;
    ctx.beginPath(); ctx.arc(bx, by, 50, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 7; ctx.stroke();
    ctx.fillStyle = P.contorno;
    ctx.beginPath(); ctx.arc(bx - 15, by - 8, 6, 0, Math.PI * 2); ctx.arc(bx + 15, by - 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    const curva = lerp(10, -10, v);
    ctx.moveTo(bx - 16, by + 16); ctx.quadraticCurveTo(bx, by + 16 + curva, bx + 16, by + 16);
    ctx.stroke();
    if (v > 0.6) { // cejas enojadas
      ctx.beginPath(); ctx.moveTo(bx - 24, by - 24); ctx.lineTo(bx - 8, by - 17); ctx.moveTo(bx + 24, by - 24); ctx.lineTo(bx + 8, by - 17); ctx.stroke();
    }
    ctx.restore();
  }

  xChip(i) {
    const n = this.nLeyenda ?? 5;
    const m = L.leyenda.margen;
    const w = (ANCHO - m * 2 - (n - 1) * 14) / n;
    return m + i * (w + 14) + w / 2;
  }

  /** Leyenda de comandos con ícono, nombre y cooldown en vivo. */
  dibujarLeyenda(ctx, snap, cliente) {
    const cmds = cliente?.leyendaEspera ?? [];
    const visibles = cmds.filter((c) => cliente.comandos[c]);
    this.nLeyenda = visibles.length;
    this.indiceLeyenda = (cmd) => Math.max(0, visibles.indexOf(cmd));
    const { y, alto, margen } = L.leyenda;
    const n = visibles.length;
    const w = (ANCHO - margen * 2 - (n - 1) * 14) / n;
    ctx.fillStyle = 'rgba(22,14,48,0.75)';
    ctx.fillRect(0, y - 14, ANCHO, alto + 40);

    visibles.forEach((cmd, i) => {
      const cx = this.xChip(i);
      const chip = this.chip(cmd);
      const sac = Math.sin(this.reloj * 60) * chip.sacudida * 10;
      const x = cx - w / 2 + sac;
      const total = (cliente.comandos[cmd].cooldownGlobalSeg ?? 0) * 1000;
      const resta = snap.cooldowns[cmd] ?? 0;
      const enFase = cliente.comandos[cmd].fases?.includes(snap.fase) ?? true;
      const disponible = enFase && resta <= 0;
      const escala = 1 + chip.destello * 0.12;
      ctx.save();
      ctx.translate(cx, y + alto / 2);
      ctx.scale(escala, escala);
      ctx.translate(-cx, -(y + alto / 2));
      rrect(ctx, x, y, w, alto, 24);
      ctx.fillStyle = chip.destello > 0 ? `rgba(255,210,63,${0.5 + chip.destello * 0.5})` : disponible ? P.hudFondoClaro : 'rgba(180,180,200,0.85)';
      ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = chip.sacudida > 0 ? P.peligro : P.contorno; ctx.stroke();
      ctx.globalAlpha = disponible ? 1 : 0.55;
      dibujarIcono(ctx, cmd, cx + sac, y + 54, 0.82);
      ctx.globalAlpha = 1;
      textoContorno(ctx, `!${cmd}`, cx + sac, y + alto - 30, { px: 32, color: P.contorno, contorno: null });
      // cooldown: tarta oscura + segundos
      if (resta > 0 && total > 0) {
        const k = clamp(resta / total, 0, 1);
        ctx.save();
        rrect(ctx, x, y, w, alto, 24); ctx.clip();
        ctx.fillStyle = 'rgba(22,14,48,0.6)';
        ctx.beginPath(); ctx.moveTo(cx + sac, y + alto / 2);
        ctx.arc(cx + sac, y + alto / 2, w, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        textoContorno(ctx, `${Math.ceil(resta / 1000)}s`, cx + sac, y + 58, { px: 54, color: P.blanco, grosor: 9 });
      }
      ctx.restore();
    });
  }

  /** Panel del LOBBY: cuenta regresiva, contador e inscritos. */
  dibujarLobby(ctx, snap) {
    if (snap.fase !== 'LOBBY') return;
    const { inscritos, espera, max } = snap.lobby;
    const ms = snap.faseRestanteMs ?? 0;
    const seg = Math.ceil(ms / 1000);
    const urgente = seg <= 10;

    textoContorno(ctx, '¡INSCRIPCIONES ABIERTAS!', ANCHO / 2, 255, { px: 62, color: P.acento, grosor: 12 });
    textoContorno(ctx, 'Comenta lo que sea para entrar', ANCHO / 2, 318, { px: 38, color: P.blanco, grosor: 8 });

    // Cuenta regresiva circular
    const cx = 230, cy = 470, r = 105;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = P.hudFondo; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = P.contorno; ctx.stroke();
    const total = (this.lobbySeg ?? 45) * 1000;
    ctx.beginPath(); ctx.arc(cx, cy, r - 14, -Math.PI / 2, -Math.PI / 2 + (ms / total) * Math.PI * 2);
    ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.strokeStyle = urgente ? P.peligro : P.ok; ctx.stroke();
    const ps = 1 + this.pulsoSeg * (urgente ? 0.35 : 0.15);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(ps, ps);
    textoContorno(ctx, String(seg), 0, 6, { px: 110, color: urgente ? P.peligro : P.blanco, grosor: 14 });
    ctx.restore();

    // Contador de inscritos con barra
    const bx = 380, by = 400, bw = 640;
    textoContorno(ctx, `INSCRITOS ${inscritos.length}/${max}`, bx, by, { px: 54, align: 'left', color: P.blanco, grosor: 11 });
    rrect(ctx, bx, by + 45, bw, 40, 20);
    ctx.fillStyle = 'rgba(22,14,48,0.8)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = P.contorno; ctx.stroke();
    const kk = inscritos.length / max;
    if (kk > 0) { rrect(ctx, bx + 6, by + 51, (bw - 12) * kk, 28, 14); ctx.fillStyle = P.acento; ctx.fill(); }
    if (espera > 0) textoContorno(ctx, `+${espera} en lista de espera`, bx, by + 125, { px: 32, align: 'left', color: '#ffb3c1', grosor: 7 });

    // Parrilla 6x5: el auto de cada inscrito con su nombre
    const cols = 6, cw = 160, ch = 64, gx = 8, gy = 6;
    const x0 = (ANCHO - (cols * cw + (cols - 1) * gx)) / 2, y0 = 590;
    for (let i = 0; i < max; i++) {
      const col = i % cols, fila = Math.floor(i / cols);
      const x = x0 + col * (cw + gx), y = y0 + fila * (ch + gy);
      const p = inscritos[i];
      rrect(ctx, x, y, cw, ch, 14);
      if (!p) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
        ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(29,21,48,0.45)'; ctx.stroke(); ctx.setLineDash([]);
        textoContorno(ctx, String(i + 1), x + cw / 2, y + ch / 2, { px: 24, color: 'rgba(29,21,48,0.35)', contorno: null });
        continue;
      }
      const t0 = this.tagsNuevos.get(p.cupo) ?? 0;
      const k = easeBack(clamp((this.reloj - t0) / 0.35, 0, 1));
      ctx.save();
      ctx.translate(x + cw / 2, y + ch / 2); ctx.scale(k, k); ctx.translate(-(x + cw / 2), -(y + ch / 2));
      rrect(ctx, x, y, cw, ch, 14);
      ctx.fillStyle = P.hudFondoClaro; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = colorAuto(p.color ?? p.cupo - 1); ctx.stroke();
      // auto de costado (rotado) a la izquierda de la celda
      ctx.save(); ctx.translate(x + 36, y + ch / 2); ctx.rotate(Math.PI / 2); ctx.scale(0.46, 0.46);
      dibujarAuto(ctx, { modelo: p.modelo, color: p.color ?? p.cupo - 1, numero: p.cupo, hp: 100 });
      ctx.restore();
      textoContorno(ctx, p.nombre, x + 70, y + ch / 2 + 1, { px: 21, align: 'left', color: P.contorno, contorno: null, maxAncho: cw - 76 });
      ctx.restore();
    }
  }

  /** Solo en un navegador normal (OBS no bloquea el audio): pide un clic para activar el sonido. */
  dibujarAvisoSonido(ctx) {
    const y = 1690;
    ctx.save();
    ctx.globalAlpha = 0.75 + Math.sin(this.reloj * 5) * 0.25;
    rrect(ctx, ANCHO / 2 - 330, y - 34, 660, 68, 34);
    ctx.fillStyle = P.peligro; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = P.contorno; ctx.stroke();
    textoContorno(ctx, 'Haz clic para activar la voz', ANCHO / 2, y + 2, { px: 36, color: P.blanco, grosor: 7 });
    ctx.restore();
  }

  dibujarBurbuja(ctx, punta, dormido) {
    this.burbuja.dibujar(ctx, punta, dormido);
  }

  dibujarFlotantesYBanners(ctx) {
    for (const f of this.flotantes) {
      const k = f.t / f.dur;
      ctx.globalAlpha = 1 - clamp((k - 0.6) / 0.4, 0, 1);
      textoContorno(ctx, f.texto, f.x, f.y - k * 70, { px: 34, color: f.color, grosor: 8 });
    }
    ctx.globalAlpha = 1;
    const b = this.banners[0];
    if (b) {
      const k = b.t / b.dur;
      const entrada = easeBack(clamp(b.t / 0.35, 0, 1));
      const salida = clamp((k - 0.8) / 0.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = 1 - salida;
      ctx.translate(ANCHO / 2, 960);
      ctx.rotate(-0.04);
      ctx.scale(entrada, entrada);
      ctx.font = fuente(64);
      const w = Math.min(ANCHO - 40, ctx.measureText(b.texto).width + 90);
      rrect(ctx, -w / 2, -60, w, 120, 30);
      ctx.fillStyle = b.color; ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = P.contorno; ctx.stroke();
      textoContorno(ctx, b.texto, 0, 4, { px: 64, color: P.blanco, grosor: 12, maxAncho: w - 60 });
      ctx.restore();
    }
  }
}
