// Bus de eventos normalizados. Todas las fuentes (TikTok, simulador) emiten aquí:
//   bus.emit('evento', { tipo: 'chat'|'gift'|'like'|'follow'|'join'|'viewers', userId, nickname, texto?, valor? })
//   'join'    = alguien entró al live (TikTok: evento member)
//   'viewers' = conteo de espectadores en valor (TikTok: roomUser.viewerCount); no lleva userId
import { EventEmitter } from 'node:events';

export function crearBus() {
  const bus = new EventEmitter();
  bus.setMaxListeners(20);
  return bus;
}

/** Valida y normaliza un evento crudo. Devuelve null si no sirve. */
export function normalizarEvento(e) {
  if (!e || typeof e !== 'object') return null;
  const tipos = ['chat', 'gift', 'like', 'follow', 'join', 'viewers'];
  if (!tipos.includes(e.tipo)) return null;
  if (e.tipo === 'viewers') return typeof e.valor === 'number' ? { tipo: 'viewers', valor: e.valor } : null;
  if (!e.userId) return null;
  return {
    tipo: e.tipo,
    userId: String(e.userId),
    nickname: e.nickname ? String(e.nickname) : String(e.userId),
    texto: typeof e.texto === 'string' ? e.texto : undefined,
    valor: typeof e.valor === 'number' ? e.valor : undefined,
  };
}
