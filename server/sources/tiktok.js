// Adaptador de TikTok LIVE (Fase 6). Por ahora solo avisa.
// Cuando se implemente: usar tiktok-live-connector (revisar el README de la versión
// instalada), normalizar a { tipo, userId, nickname, texto?, valor? } y emitir en bus 'evento'.

export function iniciarTikTok({ config }) {
  const usuario = config.tiktok.usuario || '(sin configurar)';
  console.log(`[tiktok] Adaptador pendiente (Fase 6). Usuario: ${usuario}.`);
  console.log('[tiktok] Para probar sin TikTok usa:  npm run sim -- --bots 25');
  return { detener() {} };
}
