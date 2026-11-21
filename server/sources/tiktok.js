// API verificada con README y tipos de tiktok-live-connector 2.1.0 (Node 20).
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const numero = v => {
  if (!['string', 'number', 'bigint'].includes(typeof v) || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const identificador = v => typeof v === 'bigint' && v > 0n ? String(v) : typeof v === 'string' && v && v !== '0' ? v : typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : null;

/** Los tipos actuales llevan user y giftDetails anidados; nunca identificar por nickname. */
export function normalizarTikTok(tipo, data = {}) {
  if (!data || typeof data !== 'object') return null;
  if (tipo === 'roomUser') {
    const valor = numero(data.viewerCount);
    return valor === null ? null : { tipo: 'viewers', valor };
  }
  const userId = identificador(data.user?.userId);
  if (!userId) return null;
  const base = { userId, nickname: data.user.nickname || data.user.uniqueId || userId };
  const eventoId = identificador(data.common?.msgId);
  if (eventoId) base.eventoId = eventoId;
  if (tipo === 'chat') return typeof data.comment === 'string' ? { ...base, tipo: 'chat', texto: data.comment } : null;
  if (tipo === 'member') return { ...base, tipo: 'join' };
  if (tipo === 'like') { const valor = numero(data.likeCount); return valor === null ? null : { ...base, tipo: 'like', valor }; }
  if (tipo === 'follow' || (tipo === 'social' && typeof data.common?.displayText?.displayType === 'string' && data.common.displayText.displayType.includes('follow'))) return { ...base, tipo: 'follow' };
  if (tipo !== 'gift') return null;
  const giftType = data.giftDetails?.giftType;
  // repeatEnd es número en los tipos instalados: 0/1; también aceptar booleano.
  if (giftType === 1 && !(data.repeatEnd === 1 || data.repeatEnd === true)) return null;
  const regaloId = identificador(data.giftId);
  const cantidad = numero(data.repeatCount);
  if (!regaloId || cantidad === null || cantidad < 1) return null;
  return { ...base, tipo: 'gift', regaloId, cantidad, valor: cantidad, grupoId: giftType === 1 ? identificador(data.groupId) ?? undefined : undefined };
}

/** Dependencias inyectables para probar caídas, carreras de promesas y cierres sin TikTok. */
export function iniciarTikTok({ config, bus, log = console.log,
  crearConexion = (usuario, opciones) => new TikTokLiveConnection(usuario, opciones),
  temporizadores = { setTimeout, clearTimeout }, ahora = Date.now,
  signApiKey = process.env.TIKTOK_SIGN_API_KEY } = {}) {
  const cfg = config.tiktok;
  const usuario = cfg.usuario.trim().replace(/^@/, '');
  let estado = usuario ? 'conectando' : 'sinConfig';
  let actual = null, temporizador = null, intento = 0, detenido = false, terminado = false;
  const vistos = new Map();
  const limites = new WeakMap();
  const logEstado = texto => log(`[tiktok] ${texto}`);
  const cerrarConexion = c => {
    if (!c) return;
    if (limites.has(c)) { temporizadores.clearTimeout(limites.get(c)); limites.delete(c); }
    c.removeAllListeners();
    c.on(ControlEvent.ERROR, () => {}); // errores tardíos de una conexión retirada
    try { Promise.resolve(c.disconnect()).catch(() => {}); } catch { /* cierre idempotente */ }
  };
  const errorNombre = e => e?.exception?.name || e?.name || 'error de conexión';

  function reintentar(error) {
    if (detenido || terminado || temporizador !== null) return;
    const vieja = actual; actual = null; cerrarConexion(vieja);
    estado = 'reintentando';
    const seg = Math.min(cfg.reconexionMaxSeg, cfg.reconexionBaseSeg * 2 ** Math.min(intento++, 30));
    logEstado(`Conexión caída (${errorNombre(error)}). Reintentando en ${seg} s.`);
    temporizador = temporizadores.setTimeout(() => { temporizador = null; conectar(); }, seg * 1000);
  }

  function emitir(tipo, data) {
    const ev = normalizarTikTok(tipo, data);
    if (!ev) return;
    // Acotar duplicados por ID de mensaje; rachas finalizadas también por grupo estable.
    const clave = ev.tipo === 'gift' && ev.grupoId ? `gift:${ev.userId}:${ev.regaloId}:${ev.grupoId}` : ev.eventoId ? `${ev.tipo}:${ev.eventoId}` : null;
    const t = ahora();
    for (const [k, hasta] of vistos) { if (hasta > t) break; vistos.delete(k); }
    if (clave) {
      if (vistos.has(clave)) return;
      vistos.set(clave, t + cfg.deduplicarSeg * 1000);
      if (vistos.size > cfg.maxEventosRecordados) vistos.delete(vistos.keys().next().value);
    }
    bus.emit('evento', ev);
  }

  async function conectar() {
    if (detenido || terminado) return;
    estado = 'conectando'; logEstado(`Conectando a @${usuario}…`);
    let c;
    try {
      c = crearConexion(usuario, {
        processInitialData: false, enableExtendedGiftInfo: false,
        fetchRoomInfoOnConnect: true,
        webClientOptions: { timeout: cfg.timeoutMs },
        wsClientOptions: { handshakeTimeout: cfg.timeoutMs },
        ...(signApiKey ? { signApiKey } : {}),
      });
      actual = c;
      const vigente = () => actual === c && !detenido && !terminado;
      const conectado = () => {
        if (!vigente() || estado === 'conectado') return;
        if (limites.has(c)) { temporizadores.clearTimeout(limites.get(c)); limites.delete(c); }
        estado = 'conectado'; intento = 0; logEstado(`Conectado al LIVE de @${usuario}.`);
      };
      for (const [ev, tipo] of [[WebcastEvent.CHAT,'chat'],[WebcastEvent.MEMBER,'member'],[WebcastEvent.ROOM_USER,'roomUser'],[WebcastEvent.GIFT,'gift'],[WebcastEvent.LIKE,'like'],[WebcastEvent.FOLLOW,'follow'],[WebcastEvent.SOCIAL,'social']]) {
        c.on(ev, data => { if (vigente()) emitir(tipo, data); });
      }
      c.on(ControlEvent.CONNECTED, conectado);
      c.on(ControlEvent.DISCONNECTED, () => { if (vigente()) reintentar(); });
      c.on(ControlEvent.ERROR, e => { if (vigente()) reintentar(e); });
      c.on(WebcastEvent.STREAM_END, () => {
        if (!vigente()) return;
        terminado = true; estado = 'finalizado'; actual = null;
        logEstado('El LIVE terminó. Reinicia el servidor cuando abras el siguiente LIVE.');
        cerrarConexion(c);
      });
      limites.set(c, temporizadores.setTimeout(() => { if (vigente()) reintentar({ name: 'tiempo de conexión agotado' }); }, cfg.timeoutMs));
      await c.connect();
      if (vigente()) conectado(); else cerrarConexion(c);
    } catch (e) { if (!c || actual === c) reintentar(e); }
  }

  if (usuario) void conectar();
  else logEstado('Usuario sin configurar: escribe tiktok.usuario en config.json. El overlay sigue disponible; prueba con npm run sim.');
  return {
    estado: () => ({ tipo: 'tiktok', estado, usuario }),
    detener() {
      if (detenido) return;
      detenido = true; estado = 'detenido';
      if (temporizador !== null) temporizadores.clearTimeout(temporizador);
      temporizador = null; const c = actual; actual = null; cerrarConexion(c); vistos.clear();
    },
  };
}
