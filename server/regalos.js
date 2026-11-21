// Preparación de Fase 7: plan visual puro, todavía sin conectar al juego ni al render.
// Ningún dato del regalo puede convertirse en HP, velocidad, puntos o una victoria.
export function planificarRegalo(evento, config) {
  const cfg = config.regalos;
  if (!cfg?.activo || evento?.tipo !== 'gift' || !evento.userId ||
      !Number.isSafeInteger(evento.cantidad) || evento.cantidad < 1) return null;
  if (!Object.hasOwn(cfg.mapa, evento.regaloId)) return null;
  const id = cfg.mapa[evento.regaloId];
  if (!Object.hasOwn(cfg.efectos, id)) return null;
  const efecto = cfg.efectos[id];
  if (!['confeti', 'estela', 'techo'].includes(efecto.tipo) ||
      !/^#[a-f0-9]{6}$/i.test(efecto.color) || !Number.isFinite(efecto.duracionSeg) || efecto.duracionSeg <= 0) return null;
  return { tipo: 'regaloVisual', userId: String(evento.userId), nombre: String(evento.nickname || evento.userId),
    regaloId: String(evento.regaloId), cantidad: evento.cantidad,
    efecto: { tipo: efecto.tipo, color: efecto.color, duracionSeg: efecto.duracionSeg } };
}
