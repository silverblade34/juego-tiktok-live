// Perfiles de usuario (en memoria). La persistencia en data/profiles.json llega en Fase 5.

export class Usuarios {
  constructor() {
    this.perfiles = new Map();
  }

  /** Registra un comentario y devuelve el perfil (lo crea si no existe). */
  tocar(userId, nickname) {
    let p = this.perfiles.get(userId);
    if (!p) {
      p = { userId, nombre: nickname, comentarios: 0, baldazos: 0, cafes: 0, cornetazos: 0, mantas: 0 };
      this.perfiles.set(userId, p);
    }
    p.nombre = nickname;
    p.comentarios += 1;
    return p;
  }

  sumar(userId, campo, n = 1) {
    const p = this.perfiles.get(userId);
    if (p && campo) p[campo] = (p[campo] ?? 0) + n;
  }

  obtener(userId) {
    return this.perfiles.get(userId) ?? null;
  }
}
