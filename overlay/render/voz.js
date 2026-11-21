// Reproduce la voz de Don Lucho que manda el servidor y mide su volumen para mover la boca.
// En OBS: Browser Source con "Controlar audio vía OBS" para capturar este sonido.

export class VozCliente {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.idActual = null;
    this.ctx = null;
    this.analizador = null;
    this.muestras = null;
    this.nivel = 0;          // 0..1 volumen suavizado
    this.bloqueado = false;  // el navegador bloqueó el autoplay (pide un clic)
    window.addEventListener('pointerdown', () => this.desbloquear());
    window.addEventListener('keydown', () => this.desbloquear());
  }

  /** Crea el AudioContext y el analizador (una sola vez). */
  prepararAnalisis() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      const fuente = this.ctx.createMediaElementSource(this.audio);
      this.analizador = this.ctx.createAnalyser();
      this.analizador.fftSize = 512;
      this.muestras = new Uint8Array(this.analizador.fftSize);
      fuente.connect(this.analizador);
      this.analizador.connect(this.ctx.destination);
    } catch {
      this.ctx = null; // sin análisis: la boca usa la animación de siempre
    }
  }

  desbloquear() {
    this.prepararAnalisis();
    this.ctx?.resume?.();
    if (this.bloqueado && this.audio.src) {
      this.bloqueado = false;
      this.audio.play().catch(() => { this.bloqueado = true; });
    }
  }

  /**
   * @param {object|null} habla snapshot.lucho.habla
   * @param {number} escala escalaTiempo del servidor (para convertir tiempos de juego a reales)
   */
  sincronizar(habla, escala) {
    if (!habla?.audio) {
      // Otra frase sin audio reemplazó a la actual: se calla.
      if (habla && habla.id !== this.idActual && !this.audio.paused) this.audio.pause();
      return;
    }
    if (habla.id === this.idActual) return;
    this.idActual = habla.id;
    this.prepararAnalisis();
    this.audio.pause();
    this.audio.src = habla.audio;
    // Si recargamos a mitad de frase, retomamos donde va.
    const offset = habla.transcurridoMs / 1000 / (escala || 1);
    if (offset > 0.4) this.audio.currentTime = offset;
    this.ctx?.resume?.();
    this.audio.play().then(() => { this.bloqueado = false; }, () => { this.bloqueado = true; });
  }

  sonando() {
    return !this.audio.paused && !this.audio.ended;
  }

  update(dt) {
    let objetivo = 0;
    if (this.analizador && this.sonando()) {
      this.analizador.getByteTimeDomainData(this.muestras);
      let suma = 0;
      for (const m of this.muestras) { const v = (m - 128) / 128; suma += v * v; }
      objetivo = Math.min(1, Math.sqrt(suma / this.muestras.length) * 4);
    }
    // Abre rápido y cierra un poco más lento, como una boca de verdad.
    const k = 1 - Math.exp(-dt * (objetivo > this.nivel ? 30 : 14));
    this.nivel += (objetivo - this.nivel) * k;
  }
}
