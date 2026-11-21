// Efectos de sonido y ambiente, SINTETIZADOS con WebAudio (sin archivos).
// Para reemplazar uno por un archivo real: deja overlay/sonidos/<nombre>.mp3 (o .wav) y agrégalo
// a ARCHIVOS abajo; si el archivo existe se usa ese, si no, el sintetizado.
//
// Volúmenes en VOL. El ambiente baja solo cuando Don Lucho habla ("ducking").

const ARCHIVOS = {
  // balde: 'sonidos/balde.mp3',
};

const VOL = { maestro: 0.9, efectos: 0.8, ambiente: 0.14, motores: 0.16 };

export class Sonidos {
  constructor() {
    this.ctx = null;
    this.listo = false;
    this.buffers = {};
    this.ultimo = {};      // nombre -> tiempo (anti-saturación)
    this.ambiente = null;
    this.ronquido = null;
    this.motores = null;
    window.addEventListener('pointerdown', () => this.iniciar());
    window.addEventListener('keydown', () => this.iniciar());
  }

  /** Crea el contexto (en OBS funciona sin clic; en un navegador normal tras el primer clic). */
  iniciar() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return; }
      const c = this.ctx;
      this.maestro = c.createGain(); this.maestro.gain.value = VOL.maestro; this.maestro.connect(c.destination);
      this.efectos = c.createGain(); this.efectos.gain.value = VOL.efectos; this.efectos.connect(this.maestro);
      this.busAmbiente = c.createGain(); this.busAmbiente.gain.value = VOL.ambiente; this.busAmbiente.connect(this.maestro);
      this.ruido = this.crearRuido(2);
      this.ruidoMarron = this.crearRuido(4, true);
      this.cargarArchivos();
    }
    this.ctx.resume?.();
    this.listo = this.ctx.state === 'running';
  }

  activo() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume?.();
    this.listo = !!this.ctx && this.ctx.state === 'running';
    return this.listo;
  }

  crearRuido(seg, marron = false) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * seg, c.sampleRate);
    const d = b.getChannelData(0);
    let ultimo = 0;
    for (let i = 0; i < d.length; i++) {
      const blanco = Math.random() * 2 - 1;
      if (marron) { ultimo = (ultimo + 0.02 * blanco) / 1.02; d[i] = ultimo * 3.5; } else d[i] = blanco;
    }
    return b;
  }

  async cargarArchivos() {
    for (const [nombre, url] of Object.entries(ARCHIVOS)) {
      try {
        const r = await fetch(url);
        if (r.ok) this.buffers[nombre] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* usa el sintetizado */ }
    }
  }

  // ---------------------------------------------------------------- piezas básicas

  /** Fuente de ruido con filtro y envolvente. */
  ruidoFiltrado({ t0 = 0, dur = 0.5, tipo = 'bandpass', f0 = 1000, f1 = f0, q = 1, vol = 0.5, ataque = 0.01, destino = this.efectos, marron = false, pan = 0 }) {
    const c = this.ctx, t = c.currentTime + t0;
    const src = c.createBufferSource();
    src.buffer = marron ? this.ruidoMarron : this.ruido;
    src.loop = true;
    const filtro = c.createBiquadFilter();
    filtro.type = tipo; filtro.Q.value = q;
    filtro.frequency.setValueAtTime(f0, t);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    src.connect(filtro).connect(g).connect(p).connect(destino);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  /** Oscilador con barrido de tono y envolvente. */
  tono({ t0 = 0, dur = 0.3, tipo = 'sine', f0 = 440, f1 = f0, vol = 0.3, ataque = 0.01, destino = this.efectos, vibrato = 0, vibratoHz = 6 }) {
    const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vibrato) {
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = vibratoHz; lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(destino);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Reproduce un efecto por nombre (con límite de repetición). */
  tocar(nombre, opciones = {}) {
    if (!this.activo()) return;
    const ahora = performance.now();
    const minMs = opciones.minMs ?? 60;
    if (ahora - (this.ultimo[nombre] ?? 0) < minMs) return;
    this.ultimo[nombre] = ahora;
    if (this.buffers[nombre]) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buffers[nombre];
      s.connect(this.efectos); s.start();
      return;
    }
    const fn = this[`sfx_${nombre}`];
    if (fn) fn.call(this, opciones);
  }

  // ---------------------------------------------------------------- efectos

  sfx_ascenso() { for (let i=0;i<4;i++) this.tono({t0:i*.13,dur:.18,f0:440*2**(i/3),f1:440*2**(i/3),vol:.16}); }
  sfx_turbo() { this.ruidoFiltrado({dur:.7,tipo:'bandpass',f0:300,f1:3000,q:1,vol:.25}); this.tono({dur:.6,f0:140,f1:800,vol:.15}); }
  sfx_escudo() { this.tono({dur:.4,f0:700,f1:1500,vol:.18}); }
  sfx_bomba() { this.ruidoFiltrado({dur:.4,tipo:'lowpass',f0:1500,f1:80,q:1,vol:.4}); }
  sfx_aceite() { this.ruidoFiltrado({dur:.5,tipo:'bandpass',f0:500,f1:200,q:2,vol:.2}); }
  sfx_derrape() { this.tono({dur:.7,tipo:'sawtooth',f0:900,f1:300,vol:.1}); }
  sfx_lanzar() { this.tono({dur:.5,f0:1200,f1:180,vol:.15}); }
  sfx_reparar() { for(let i=0;i<3;i++) this.tono({t0:i*.12,dur:.1,f0:500+i*200,f1:600+i*200,vol:.15}); }
  sfx_esquivar() { this.ruidoFiltrado({dur:.25,tipo:'bandpass',f0:500,f1:2500,q:1,vol:.2}); }

  sfx_balde() {
    // chorro + salpicón grande
    this.ruidoFiltrado({ dur: 0.9, tipo: 'bandpass', f0: 900, f1: 2500, q: 0.8, vol: 0.5, ataque: 0.05 });
    this.ruidoFiltrado({ t0: 0.15, dur: 1.1, tipo: 'lowpass', f0: 4000, f1: 500, q: 0.5, vol: 0.7, ataque: 0.01 });
    for (let i = 0; i < 6; i++) this.tono({ t0: 0.3 + i * 0.09, dur: 0.08, f0: 1200 + Math.random() * 1500, f1: 400, vol: 0.12 });
  }

  sfx_grito() {
    this.tono({ dur: 0.7, tipo: 'sawtooth', f0: 500, f1: 900, vol: 0.12, vibrato: 30, vibratoHz: 9 });
  }

  sfx_sorbo() {
    // sorbo ruidoso: barrido de filtro sobre ruido, tres veces
    for (let i = 0; i < 3; i++) this.ruidoFiltrado({ t0: i * 0.22, dur: 0.18, tipo: 'bandpass', f0: 600, f1: 2400, q: 6, vol: 0.35, ataque: 0.03 });
    this.tono({ t0: 0.75, dur: 0.35, f0: 300, f1: 200, vol: 0.15 }); // "aaah"
  }

  sfx_corneta() {
    // bocina de estadio: dos osciladores desafinados
    for (const f of [233, 236, 466]) this.tono({ dur: 1.1, tipo: 'sawtooth', f0: f, f1: f * 0.98, vol: 0.16, ataque: 0.03 });
    this.ruidoFiltrado({ dur: 1.1, tipo: 'bandpass', f0: 800, q: 2, vol: 0.08 });
  }

  sfx_caida() {
    this.ruidoFiltrado({ dur: 0.35, tipo: 'lowpass', f0: 700, f1: 100, vol: 0.9, ataque: 0.005, marron: true });
    this.tono({ dur: 0.25, f0: 120, f1: 50, vol: 0.5 });
    this.tono({ t0: 0.12, dur: 0.12, tipo: 'square', f0: 900, f1: 500, vol: 0.06 }); // la silla de plástico
  }

  sfx_flatulencia() {
    // pedorreta clásica: sierra grave con vibrato irregular + ruido
    const c = this.ctx, t = c.currentTime;
    const dur = 0.7 + Math.random() * 0.5;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const base = 70 + Math.random() * 30;
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.exponentialRampToValueAtTime(base, t + dur);
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.type = 'square'; lfo.frequency.value = 18 + Math.random() * 10; lg.gain.value = 25;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.setValueAtTime(0.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.efectos);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.ruidoFiltrado({ dur, tipo: 'lowpass', f0: 400, f1: 150, vol: 0.15, marron: true });
  }

  sfx_manta() {
    this.ruidoFiltrado({ dur: 0.6, tipo: 'lowpass', f0: 1500, f1: 300, vol: 0.3, ataque: 0.15 });
  }

  sfx_pop() {
    this.tono({ dur: 0.12, f0: 500 + Math.random() * 300, f1: 1400, vol: 0.18 });
  }

  sfx_saludo() {
    this.tono({ dur: 0.15, f0: 880, vol: 0.12 });
    this.tono({ t0: 0.12, dur: 0.25, f0: 1320, vol: 0.12 });
  }

  sfx_psst() {
    this.ruidoFiltrado({ dur: 0.5, tipo: 'highpass', f0: 4000, q: 0.7, vol: 0.25, ataque: 0.1 });
  }

  sfx_error() {
    this.tono({ dur: 0.18, tipo: 'square', f0: 180, vol: 0.09 });
    this.tono({ t0: 0.2, dur: 0.25, tipo: 'square', f0: 140, vol: 0.09 });
  }

  sfx_silbato() {
    this.tono({ dur: 0.6, tipo: 'sine', f0: 2800, f1: 2700, vol: 0.12, vibrato: 120, vibratoHz: 30 });
  }

  sfx_paciencia() {
    this.tono({ dur: 0.15, tipo: 'triangle', f0: 300, f1: 600, vol: 0.12 });
  }

  sfx_campana() {
    // "¡ding ding!" + fanfarria corta de inscripciones
    for (let i = 0; i < 2; i++) for (const f of [1046, 1568]) this.tono({ t0: i * 0.18, dur: 0.6, tipo: 'triangle', f0: f, vol: 0.12 });
    [523, 659, 784, 1046].forEach((f, i) => this.tono({ t0: 0.45 + i * 0.11, dur: 0.3, tipo: 'square', f0: f, vol: 0.06 }));
  }

  sfx_tic() {
    this.tono({ dur: 0.05, tipo: 'square', f0: 1600, vol: 0.06 });
  }

  sfx_cuenta() {
    this.tono({ dur: 0.35, tipo: 'square', f0: 440, vol: 0.12 });
  }

  sfx_ya() {
    this.tono({ dur: 0.8, tipo: 'square', f0: 880, vol: 0.14 });
    for (const f of [220, 277]) this.tono({ t0: 0.1, dur: 0.9, tipo: 'sawtooth', f0: f, vol: 0.1 }); // bocinazo
  }

  sfx_golpe() {
    this.ruidoFiltrado({ dur: 0.25, tipo: 'lowpass', f0: 2500, f1: 200, vol: 0.45, ataque: 0.003 });
    this.tono({ dur: 0.15, tipo: 'square', f0: 160, f1: 60, vol: 0.12 });
  }

  sfx_vaca() {
    this.tono({ dur: 1.0, tipo: 'sawtooth', f0: 150, f1: 120, vol: 0.12, vibrato: 4, vibratoHz: 5, ataque: 0.15 });
  }

  sfx_perro() {
    for (let i = 0; i < 2; i++) this.tono({ t0: i * 0.22, dur: 0.12, tipo: 'sawtooth', f0: 600, f1: 350, vol: 0.12 });
  }

  sfx_explosion() {
    this.ruidoFiltrado({ dur: 1.6, tipo: 'lowpass', f0: 3000, f1: 60, vol: 0.9, ataque: 0.005, marron: true });
    this.ruidoFiltrado({ dur: 0.5, tipo: 'bandpass', f0: 1500, f1: 300, q: 0.7, vol: 0.4, ataque: 0.002 });
    this.tono({ dur: 0.9, f0: 90, f1: 30, vol: 0.6 });
  }

  sfx_meta() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tono({ t0: i * 0.12, dur: 0.25, tipo: 'square', f0: f, vol: 0.08 }));
    this.sfx_aplausos();
  }

  sfx_aplausos() {
    for (let i = 0; i < 40; i++) this.ruidoFiltrado({ t0: Math.random() * 2.2, dur: 0.05, tipo: 'bandpass', f0: 1500 + Math.random() * 2000, q: 1.5, vol: 0.12 + Math.random() * 0.1, ataque: 0.002, pan: Math.random() * 2 - 1 });
  }

  sfx_abucheo() {
    this.tono({ dur: 1.4, tipo: 'sawtooth', f0: 180, f1: 140, vol: 0.08, vibrato: 6, vibratoHz: 4, ataque: 0.2 });
    this.tono({ dur: 1.4, tipo: 'sawtooth', f0: 230, f1: 170, vol: 0.06, vibrato: 7, vibratoHz: 3, ataque: 0.25 });
  }

  // ---------------------------------------------------------------- loops

  /** Ambiente de calle: tráfico lejano + autos que pasan + pajaritos + bocinas a lo lejos. */
  ambienteCalle(activo, hablando) {
    if (!this.activo()) return;
    if (activo && !this.ambiente) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.ruidoMarron; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
      const g = c.createGain(); g.gain.value = 0.0001;
      src.connect(f).connect(g).connect(this.busAmbiente);
      src.start();
      g.gain.exponentialRampToValueAtTime(0.8, c.currentTime + 2);
      this.ambiente = { src, g, prox: 0 };
    }
    if (!activo && this.ambiente) {
      const { src, g } = this.ambiente;
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1);
      src.stop(this.ctx.currentTime + 1.1);
      this.ambiente = null;
    }
    // "Ducking": baja el ambiente cuando Don Lucho habla.
    const objetivo = VOL.ambiente * (hablando ? 0.45 : 1);
    this.busAmbiente.gain.setTargetAtTime(objetivo, this.ctx.currentTime, 0.3);
    if (!this.ambiente) return;
    const ahora = this.ctx.currentTime;
    if (ahora > this.ambiente.prox) {
      this.ambiente.prox = ahora + 2 + Math.random() * 5;
      const r = Math.random();
      const destino = this.busAmbiente;
      if (r < 0.5) { // auto que pasa (paneo de lado a lado)
        const pan = Math.random() < 0.5 ? -1 : 1;
        this.ruidoFiltrado({ dur: 2.5, tipo: 'bandpass', f0: 300, f1: 700, q: 1, vol: 0.5, ataque: 1.2, destino, marron: true, pan });
      } else if (r < 0.72) { // pajarito
        for (let i = 0; i < 3; i++) this.tono({ t0: i * 0.13, dur: 0.09, f0: 3200, f1: 4200, vol: 0.12, destino });
      } else if (r < 0.88) { // bocina lejana de combi
        for (const fr of [392, 494]) this.tono({ dur: 0.35, tipo: 'square', f0: fr, vol: 0.05, destino });
      } else { // "¡baja, baja!" lejano: murmullo
        this.ruidoFiltrado({ dur: 1.2, tipo: 'bandpass', f0: 500, f1: 900, q: 3, vol: 0.15, ataque: 0.3, destino });
      }
    }
  }

  /** Ronquido en bucle mientras duerme (inhalar ruidoso + exhalar silbado). */
  roncar(activo) {
    if (!this.activo()) return;
    const ahora = this.ctx.currentTime;
    if (!activo) { this.ronquido = null; return; }
    if (!this.ronquido) this.ronquido = { prox: ahora };
    if (ahora < this.ronquido.prox) return;
    this.ronquido.prox = ahora + 3.2;
    const c = this.ctx, t = ahora;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const lfo = c.createOscillator(); const lg = c.createGain(); lfo.frequency.value = 22; lg.gain.value = 12;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(f).connect(g).connect(this.efectos);
    o.start(t); lfo.start(t); o.stop(t + 1.4); lfo.stop(t + 1.4);
    this.tono({ t0: 1.5, dur: 1.1, f0: 900, f1: 700, vol: 0.03, ataque: 0.4 }); // silbidito al exhalar
  }

  /** Motores de la carrera: zumbido que sube con la velocidad y la cantidad de autos. */
  motoresCarrera(intensidad) {
    if (!this.activo()) return;
    const c = this.ctx;
    if (intensidad > 0 && !this.motores) {
      const g = c.createGain(); g.gain.value = 0.0001; g.connect(this.maestro);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.connect(g);
      const oscs = [70, 93, 141].map((fr) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
        const lfo = c.createOscillator(); const lg = c.createGain(); lfo.frequency.value = 7 + Math.random() * 5; lg.gain.value = fr * 0.04;
        lfo.connect(lg).connect(o.frequency); o.connect(f); o.start(); lfo.start();
        return { o, lfo, base: fr };
      });
      this.motores = { g, f, oscs };
    }
    if (!this.motores) return;
    const m = this.motores;
    if (intensidad <= 0) {
      m.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      const viejo = m; this.motores = null;
      setTimeout(() => viejo.oscs.forEach(({ o, lfo }) => { o.stop(); lfo.stop(); }), 1500);
      return;
    }
    m.g.gain.setTargetAtTime(VOL.motores * Math.min(1, intensidad), c.currentTime, 0.3);
    for (const { o, base } of m.oscs) o.frequency.setTargetAtTime(base * (0.9 + intensidad * 0.5), c.currentTime, 0.3);
  }
}
