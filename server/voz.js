// Voz de Don Lucho: convierte texto en audio y lo deja en caché (data/voz-cache).
// Motores (config voz.motor):
//  - "clon": voz CLONADA de una muestra (voz-referencia/*.wav) con XTTS-v2, local y gratis.
//            1–3 s por frase corta. Instalar: npm run voz:instalar-clon
//  - "edge": voces neurales de Microsoft (requiere internet). Instalar: npm run voz:instalar
//  - "mac" : `say` de macOS (offline, instantáneo, robótico).
// Pregrabado: las frases fijas se generan en segundo plano (prioridad "fondo"); las frases en
// vivo (con nombres) tienen prioridad "vivo" y pasan adelante.
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Prepara un texto de pantalla para ser leído en voz alta. Devuelve null si no hay nada que decir. */
export function limpiarParaVoz(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto
    .replace(/\bz{2,}\b/gi, ' ')          // "zzz" no se lee
    .replace(/!(?=[a-záéíóúñ])/gi, '')     // "!balde" -> "balde"
    .replace(/(\d+)s\b/g, '$1 segundos')   // "12s" -> "12 segundos"
    .replace(/[_@#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[a-záéíóúñ0-9]/i.test(limpio) ? limpio : null;
}

/** Frases sin variables (se pueden pregrabar) con el estilo de voz más probable. */
export function frasesFijas(frases) {
  // DEBE coincidir con el estilo que usa Lucho al decirlas (lucho.estiloVoz):
  // prioridad "importante" => grito; dormido => dormido; con café => cafe.
  const estiloDe = {
    hablaDormido: 'dormido', dormirse: 'dormido', manta: 'dormido',
    cafeCharla: 'cafe',
    pacienciaLlena: 'grito', lobbyUltimos: 'grito', lobbyVacio: 'grito', lobbyAbre: 'grito',
    carreraCuenta: 'grito', carreraArranque: 'grito', carreraFin: 'grito',
  };
  const lista = [];
  for (const [evento, plantillas] of Object.entries(frases)) {
    if (!Array.isArray(plantillas)) continue;
    for (const texto of plantillas) if (!texto.includes('{')) lista.push({ texto, estilo: estiloDe[evento] ?? 'normal' });
  }
  return lista;
}

/** Duración (ms) de un mp3 CBR de 48 kbps (formato de Edge TTS). */
export function duracionMp3Ms(bytes, kbps = 48) {
  return (bytes * 8) / kbps;
}

/** Duración (ms) de un WAV PCM leyendo su cabecera. */
function duracionWavMs(archivo) {
  const b = fs.readFileSync(archivo);
  const bytesPorSeg = b.readUInt32LE(28) || b.readUInt32LE(24) * 2;
  return ((b.length - 44) / bytesPorSeg) * 1000;
}

/** Proceso Python persistente que habla JSON por líneas (edge_worker.py / clon_worker.py). */
class WorkerPython {
  constructor({ nombre, python, script, args = [], log, esperaListoMs }) {
    Object.assign(this, { nombre, python, script, args, log, esperaListoMs });
    this.proc = null;
    this.listo = false;
    this.seq = 0;
    this.pendientes = new Map(); // id -> {resolve, reject, timer}
    this.deteniendo = false;
  }

  arrancar() {
    return new Promise((resolver) => {
      const w = spawn(this.python, [this.script, ...this.args], { stdio: ['pipe', 'pipe', 'pipe'] });
      this.proc = w;
      let buffer = '';
      const tope = setTimeout(() => { this.log(`[voz] ${this.nombre} no terminó de cargar a tiempo (sigo esperando en segundo plano).`); resolver(); }, this.esperaListoMs);
      w.stdout.on('data', (d) => {
        buffer += d.toString();
        let i;
        while ((i = buffer.indexOf('\n')) >= 0) {
          const linea = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          let msg;
          try { msg = JSON.parse(linea); } catch { continue; }
          if (msg.listo) {
            this.listo = true;
            clearTimeout(tope);
            this.log(`[voz] ${this.nombre}: lista${msg.carga_s ? ` (cargó en ${msg.carga_s} s)` : ''}.`);
            this.alListo?.();
            resolver();
          } else this.alRespuesta(msg);
        }
      });
      // Python escribe avisos por stderr; solo mostramos errores reales.
      w.stderr.on('data', (d) => {
        const t = d.toString();
        if (/Traceback|Error|error:/.test(t)) this.log(`[voz] ${this.nombre}: ${t.trim().slice(-400)}`);
      });
      w.on('exit', (codigo) => {
        this.listo = false;
        this.proc = null;
        clearTimeout(tope);
        resolver();
        for (const p of this.pendientes.values()) { clearTimeout(p.timer); p.reject(new Error('worker cerrado')); }
        this.pendientes.clear();
        if (this.deteniendo) return;
        this.log(`[voz] ${this.nombre} se cerró (código ${codigo}). Reintento en 30 s.`);
        setTimeout(() => this.arrancar(), 30000);
      });
    });
  }

  alRespuesta(msg) {
    const p = this.pendientes.get(msg.id);
    if (!p) return;
    this.pendientes.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.error || 'error del worker'));
  }

  pedir(datos, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!this.listo || !this.proc) { reject(new Error(`${this.nombre} no está listo`)); return; }
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pendientes.delete(id); reject(new Error('timeout')); }, timeoutMs);
      this.pendientes.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ id, ...datos }) + '\n');
    });
  }

  detener() {
    this.deteniendo = true;
    this.proc?.kill();
  }
}

export class Voz {
  /**
   * @param {{config: object, raiz: string, log?: (...a: any[]) => void}} deps
   */
  constructor({ config, raiz, log = console.log }) {
    this.cfg = config.voz;
    this.raiz = raiz;
    this.log = log;
    this.motor = this.cfg.motor;
    this.dirCache = path.join(raiz, 'data', 'voz-cache');
    this.worker = null;
    this.enCurso = new Map();      // clave -> Promise (evita pedir dos veces lo mismo)
    this.fallosSeguidos = 0;
    this.pausadoHasta = 0;
    this.huellaReferencia = '';
    this.vivoPendientes = 0;       // frases en vivo esperando audio (el pregrabado les cede el turno)
    this.deteniendo = false;
  }

  async iniciar() {
    fs.mkdirSync(this.dirCache, { recursive: true });
    this.podarCache();
    if (this.motor === 'clon') await this.iniciarClon();
    else if (this.motor === 'edge') await this.iniciarEdge();
    if (this.motor === 'mac' || (!this.worker && this.respaldo() === 'mac')) {
      if (process.platform === 'darwin') this.log(`[voz] Voz de la Mac: ${this.cfg.mac.voz}.`);
      else this.log('[voz] Sin motor de voz disponible: Don Lucho hablará solo con texto.');
    }
  }

  /** Qué hacer si el motor principal no está disponible: "mac" o "texto". */
  respaldo() {
    return this.cfg[this.motor]?.respaldo ?? 'mac';
  }

  python(venv) {
    const p = path.join(this.raiz, venv, 'bin', 'python');
    return fs.existsSync(p) ? p : null;
  }

  async iniciarClon() {
    const c = this.cfg.clon;
    const ref = path.join(this.raiz, c.referencia);
    const python = this.python('.venv-xtts');
    if (!fs.existsSync(ref)) { this.log(`[voz] No encuentro la muestra de voz ${c.referencia}.`); return; }
    if (!python) { this.log('[voz] La voz clonada no está instalada. Ejecuta:  npm run voz:instalar-clon'); return; }
    // Si cambias la muestra, la caché vieja deja de valer (la huella entra en la clave).
    this.huellaReferencia = crypto.createHash('sha1').update(fs.readFileSync(ref)).digest('hex').slice(0, 12);
    this.log('[voz] Cargando la voz clonada (XTTS-v2)… mientras tanto Don Lucho habla con texto.');
    this.worker = new WorkerPython({
      nombre: 'Voz clonada', python, script: path.join(this.raiz, 'server', 'voz', 'clon_worker.py'),
      args: [ref, c.dispositivo], log: this.log, esperaListoMs: 5 * 60000,
    });
    // No bloqueamos el arranque del juego: el modelo tarda ~30 s en cargar.
    this.worker.arrancar();
  }

  async iniciarEdge() {
    const python = this.python('.venv-voz');
    if (!python) { this.log('[voz] Edge TTS no está instalado. Ejecuta:  npm run voz:instalar'); return; }
    this.worker = new WorkerPython({
      nombre: `Edge TTS (${this.cfg.edge.voz})`, python, script: path.join(this.raiz, 'server', 'voz', 'edge_worker.py'),
      log: this.log, esperaListoMs: 15000,
    });
    await this.worker.arrancar();
  }

  workerUsable() {
    return !!this.worker?.listo && Date.now() >= this.pausadoHasta;
  }

  // ---------------------------------------------------------------- caché

  extension(motor) {
    return motor === 'edge' ? 'mp3' : 'wav';
  }

  claveCache(motor, texto, estilo) {
    const e = this.cfg.estilos[estilo] ?? {};
    const voz = motor === 'edge' ? this.cfg.edge.voz : motor === 'clon' ? `xtts:${this.huellaReferencia}` : this.cfg.mac.voz;
    return crypto.createHash('sha1').update(`${motor}|${voz}|${JSON.stringify(e)}|${texto}`).digest('hex');
  }

  archivoDe(motor, texto, estilo) {
    return path.join(this.dirCache, `${this.claveCache(motor, texto, estilo)}.${this.extension(motor)}`);
  }

  /**
   * Audio ya generado con el motor principal (o con la Mac si el principal no está disponible).
   * Si no está en el estilo pedido pero sí en otro (p. ej. "normal" en vez de "grito"), usa ese:
   * vale más que suene AL INSTANTE que con la entonación exacta.
   */
  enCache(texto, estilo, exacto = false) {
    const motores = [this.motor];
    if (this.motor !== 'mac' && !this.workerUsable() && this.respaldo() === 'mac') motores.push('mac');
    const estilos = exacto ? [estilo] : [estilo, ...Object.keys(this.cfg.estilos).filter((e) => e !== estilo)];
    for (const m of motores) {
      for (const e of estilos) {
        const archivo = this.archivoDe(m, texto, e);
        if (fs.existsSync(archivo)) return this.resultado(archivo);
      }
    }
    return null;
  }

  resultado(archivo) {
    const durMs = archivo.endsWith('.mp3') ? duracionMp3Ms(fs.statSync(archivo).size) : duracionWavMs(archivo);
    return { url: `/voz/${path.basename(archivo)}`, durMs: Math.round(durMs) };
  }

  // ---------------------------------------------------------------- API

  /**
   * Genera (o toma de la caché) el audio de un texto.
   * @param {string} textoPantalla
   * @param {string} estilo normal | cafe | dormido | grito
   * @param {'vivo'|'fondo'} prioridad
   * @returns {Promise<{url: string, durMs: number}>}
   */
  pedir(textoPantalla, estilo = 'normal', prioridad = 'vivo') {
    const texto = limpiarParaVoz(textoPantalla);
    if (!texto) return Promise.reject(new Error('nada que decir'));
    const cache = this.enCache(texto, estilo);
    if (cache) return Promise.resolve(cache);
    const clave = `${estilo}|${texto}`;
    if (this.enCurso.has(clave)) return this.enCurso.get(clave);
    if (prioridad === 'vivo') this.vivoPendientes++;
    const promesa = this.generar(texto, estilo, prioridad).finally(() => {
      this.enCurso.delete(clave);
      if (prioridad === 'vivo') this.vivoPendientes--;
    });
    this.enCurso.set(clave, promesa);
    return promesa;
  }

  async generar(texto, estilo, prioridad) {
    if (this.motor !== 'mac' && this.workerUsable()) {
      const archivo = this.archivoDe(this.motor, texto, estilo);
      const e = this.cfg.estilos[estilo] ?? this.cfg.estilos.normal;
      const datos = this.motor === 'edge'
        ? { texto, voz: this.cfg.edge.voz, rate: e.rate, pitch: e.pitch, archivo }
        : { texto, archivo, prioridad, velocidad: e.velocidad ?? 1, temperatura: e.temperatura ?? 0.7 };
      const timeout = prioridad === 'fondo' ? this.cfg.timeoutFondoMs : this.cfg.timeoutMs;
      try {
        await this.worker.pedir(datos, timeout);
        this.fallosSeguidos = 0;
        return this.resultado(archivo);
      } catch (err) {
        this.fallosSeguidos += 1;
        if (this.fallosSeguidos >= 3) {
          this.pausadoHasta = Date.now() + 60000;
          this.fallosSeguidos = 0;
          this.log(`[voz] El motor ${this.motor} falla seguido (${err.message}). Lo pauso 60 s.`);
        }
        if (this.respaldo() !== 'mac') throw err;
      }
    } else if (this.motor !== 'mac' && this.respaldo() !== 'mac') {
      throw new Error('voz principal no disponible (respaldo: solo texto)');
    }
    const archivo = this.archivoDe('mac', texto, estilo);
    await this.pedirSay(texto, estilo, archivo);
    return this.resultado(archivo);
  }

  pedirSay(texto, estilo, archivo) {
    return new Promise((resolve, reject) => {
      if (process.platform !== 'darwin') { reject(new Error('say solo existe en macOS')); return; }
      const m = this.cfg.mac;
      const ppm = Math.round(m.palabrasPorMinuto * (this.cfg.estilos[estilo]?.factorMac ?? 1));
      execFile('say', ['-v', m.voz, '-r', String(ppm), '-o', archivo, '--file-format=WAVE', '--data-format=LEI16@22050', texto],
        { timeout: 10000 }, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Pregraba en segundo plano frases fijas para que suenen al instante.
   * Con la voz clonada espera a que el modelo termine de cargar.
   */
  async precalentar(lista) {
    if (this.motor !== 'mac') {
      const inicio = Date.now();
      while (!this.worker?.listo) {
        if (this.deteniendo || !this.worker || Date.now() - inicio > 10 * 60000) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const faltan = lista.filter(({ texto, estilo }) => {
      const limpio = limpiarParaVoz(texto);
      return limpio && !this.enCache(limpio, estilo, true);
    });
    if (!faltan.length) return;
    this.log(`[voz] Pregrabando ${faltan.length} frases fijas en segundo plano (solo la primera vez)…`);
    const t0 = Date.now();
    let hechas = 0;
    for (const { texto, estilo } of faltan) {
      if (this.deteniendo) return;
      // Si Don Lucho necesita decir algo en vivo, el pregrabado espera.
      while (this.vivoPendientes > 0 && !this.deteniendo) await new Promise((r) => setTimeout(r, 200));
      try { await this.pedir(texto, estilo, 'fondo'); hechas++; } catch { /* sigue con la próxima */ }
      if (hechas && hechas % 20 === 0) this.log(`[voz] Pregrabadas ${hechas}/${faltan.length}…`);
    }
    this.log(`[voz] Pregrabado listo: ${hechas} frases en ${Math.round((Date.now() - t0) / 1000)} s.`);
  }

  /** Borra los audios más viejos si la caché pasa del máximo. */
  podarCache() {
    try {
      const archivos = fs.readdirSync(this.dirCache)
        .filter((f) => /\.(mp3|wav)$/.test(f))
        .map((f) => ({ f, t: fs.statSync(path.join(this.dirCache, f)).mtimeMs }));
      if (archivos.length <= this.cfg.cacheMaxArchivos) return;
      archivos.sort((a, b) => a.t - b.t);
      for (const { f } of archivos.slice(0, archivos.length - this.cfg.cacheMaxArchivos)) fs.unlinkSync(path.join(this.dirCache, f));
    } catch { /* caché opcional */ }
  }

  detener() {
    this.deteniendo = true;
    this.worker?.detener();
  }
}
