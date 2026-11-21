// Perfiles y rankings. El reloj civil (fecha local) es independiente del tiempo acelerado del juego.
import fs from 'node:fs';
import path from 'node:path';

const CAMPOS = ['comentarios', 'victorias', 'carreras', 'puntos', 'danoCausado', 'baldazos', 'cafes', 'cornetazos', 'mantas', 'explosiones'];
const ceros = () => Object.fromEntries(CAMPOS.map(c => [c, 0]));

export class Usuarios {
  constructor({ config, archivo = null, reloj = () => new Date(), log = console.error } = {}) {
    this.cfg = config.perfiles;
    this.archivo = archivo;
    this.reloj = reloj;
    this.log = log;
    this.perfiles = new Map();
    this.formatoFecha = new Intl.DateTimeFormat('en-CA', { timeZone: this.cfg.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' });
    this.fecha = this.hoy();
    this.pendiente = false;
    this.temporizador = null;
    this.cacheRanking = null;
    if (archivo) this.cargar();
  }

  hoy() { return this.formatoFecha.format(this.reloj()); }

  actualizarDia() {
    const fecha = this.hoy();
    if (fecha === this.fecha) return;
    this.fecha = fecha;
    for (const p of this.perfiles.values()) p.diario = ceros();
    this.cambiar();
  }

  actualizarRango(p) {
    const rangos = this.cfg.rangos.filter(r => p.comentarios >= r.comentarios);
    p.rango = (rangos.at(-1) ?? this.cfg.rangos[0]).nombre;
    const nivel = this.cfg.rangos.findIndex(r => r.nombre === p.rango);
    p.cosmeticos = this.cfg.cosmeticos.filter(c => nivel >= this.cfg.rangos.findIndex(r => r.nombre === c.rango) && this.cfg.rangos.some(r => r.nombre === c.rango)).map(c => c.id);
  }

  tocar(userId, nombre) {
    this.actualizarDia();
    let p = this.perfiles.get(userId);
    if (!p) {
      p = { userId, nombre, ...ceros(), diario: ceros() };
      this.perfiles.set(userId, p);
    }
    p.nombre = nombre;
    p.comentarios++; p.diario.comentarios++;
    this.actualizarRango(p);
    this.cambiar();
    return p;
  }

  sumar(userId, campo, n = 1) {
    this.actualizarDia();
    const p = this.perfiles.get(userId);
    if (!p || !CAMPOS.includes(campo) || !Number.isFinite(n) || n < 0) return;
    p[campo] += n; p.diario[campo] += n;
    this.cambiar();
  }

  obtener(userId) { return this.perfiles.get(userId) ?? null; }

  apariencia(userId) {
    const p = this.obtener(userId);
    return { rango: p?.rango ?? this.cfg.rangos[0].nombre,
      cosmeticos: this.cfg.cosmeticos.filter(c => p?.cosmeticos.includes(c.id)).map(c => ({ ...c })) };
  }

  rankings() {
    this.actualizarDia();
    if (this.cacheRanking) return this.cacheRanking;
    const ordenar = (campo, diario) => [...this.perfiles.values()]
      .filter(p => (diario ? p.diario[campo] : p[campo]) > 0)
      .sort((a, b) => (diario ? b.diario[campo] - a.diario[campo] : b[campo] - a[campo]) || a.userId.localeCompare(b.userId))
      .slice(0, this.cfg.top).map(p => ({ userId: p.userId, nombre: p.nombre, valor: diario ? p.diario[campo] : p[campo], rango: p.rango }));
    const tabla = diario => Object.fromEntries(['puntos', 'victorias', 'baldazos'].map(c => [c, ordenar(c, diario)]));
    this.cacheRanking = { fecha: this.fecha, diario: tabla(true), global: tabla(false), rotacionSeg: this.cfg.rotacionSeg };
    return this.cacheRanking;
  }

  // Agrupa cambios durante dos segundos sin posponer indefinidamente con un chat activo.
  cambiar() {
    this.cacheRanking = null;
    this.pendiente = true;
    if (!this.archivo || this.temporizador) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      if (!this.guardar()) this.cambiar();
    }, this.cfg.guardadoSeg * 1000);
    this.temporizador.unref();
  }

  leer(archivo) {
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (d.version !== 1 || !Array.isArray(d.perfiles) || typeof d.fecha !== 'string') throw new Error('Formato de perfiles inválido');
    const ids = new Set();
    for (const p of d.perfiles) {
      if (!p || typeof p.userId !== 'string' || !p.userId || typeof p.nombre !== 'string' || ids.has(p.userId)) throw new Error('Perfil inválido');
      ids.add(p.userId);
      for (const c of CAMPOS) if (!Number.isFinite(p[c] ?? 0) || (p[c] ?? 0) < 0 || !Number.isFinite(p.diario?.[c] ?? 0) || (p.diario?.[c] ?? 0) < 0) throw new Error('Estadística inválida');
    }
    return d;
  }

  cargar() {
    let datos;
    let desdeRespaldo = false;
    for (const archivo of [this.archivo, `${this.archivo}.bak`]) {
      if (!fs.existsSync(archivo)) continue;
      try { datos = this.leer(archivo); desdeRespaldo = archivo !== this.archivo; break; }
      catch (e) { this.log(`[perfiles] No se pudo leer ${archivo}: ${e.message}`); }
    }
    if (!datos) return;
    for (const original of datos.perfiles) {
      const p = { ...ceros(), ...original, diario: { ...ceros(), ...(datos.fecha === this.fecha ? original.diario : {}) } };
      this.actualizarRango(p); this.perfiles.set(p.userId, p);
    }
    if (desdeRespaldo || datos.fecha !== this.fecha) this.cambiar();
  }

  guardar() {
    if (!this.archivo || !this.pendiente) return true;
    try {
      fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
      const tmp = `${this.archivo}.tmp`;
      const datos = JSON.stringify({ version: 1, fecha: this.fecha, perfiles: [...this.perfiles.values()] }, null, 2);
      // No sobrescribir el respaldo válido con un principal corrupto.
      if (fs.existsSync(this.archivo)) {
        try { this.leer(this.archivo); fs.copyFileSync(this.archivo, `${this.archivo}.bak`); }
        catch (e) { if (e.code) throw e; }
      }
      const fd = fs.openSync(tmp, 'w');
      try { fs.writeFileSync(fd, datos); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, this.archivo);
      // Primer guardado: también deja una copia válida para recuperar después.
      try { this.leer(`${this.archivo}.bak`); }
      catch { fs.copyFileSync(this.archivo, `${this.archivo}.bak`); }
      this.pendiente = false;
      return true;
    } catch (e) { this.log(`[perfiles] Error guardando: ${e.message}`); return false; }
  }

  cerrar() {
    clearTimeout(this.temporizador); this.temporizador = null;
    this.actualizarDia();
    const ok = this.guardar();
    clearTimeout(this.temporizador); this.temporizador = null;
    return ok;
  }
}
