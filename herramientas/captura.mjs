// Capturas automáticas del overlay con un navegador Chromium headless (Chrome o Brave) vía CDP.
// Sirve para verificar visualmente sin un humano. No se usa en producción.
//
// 1) Arranca el juego en OTRO puerto (no toques el 3000 del dueño), leyendo comandos de un FIFO:
//      mkfifo /tmp/paradero-in && (tail -f /dev/null > /tmp/paradero-in &)
//      node server/index.js --sim --sin-voz --puerto 3100 < /tmp/paradero-in &
// 2) Arranca el navegador headless con depuración remota (ejemplo con Brave; Chrome igual):
//      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --headless=new --hide-scrollbars \
//        --autoplay-policy=no-user-gesture-required --window-size=1080,1920 \
//        --user-data-dir=/tmp/paradero-nav --remote-debugging-port=9333 about:blank &
// 3) Corre pasos en orden:
//      node herramientas/captura.mjs "espera:1500" "say:ana: !balde" "espera:700" "shot:balde" \
//        "say:!fase lobby" "eval:document.title"
//    Pasos:  espera:<ms>  ·  say:<línea para la consola del simulador>  ·  shot:<nombre>  ·  eval:<expresión JS>
//    Variables: PUERTO (3100), CDP (9333), FIFO (/tmp/paradero-in), SALIDA (carpeta de PNG, ./capturas),
//               NOLOAD=1 para no recargar la página.
// Las excepciones y errores de la consola del navegador se imprimen como "EXCEPCION:" / "CONSOLA:".
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const PUERTO = process.env.PUERTO ?? '3100';
const CDP = process.env.CDP ?? '9333';
const FIFO = process.env.FIFO ?? '/tmp/paradero-in';
const SALIDA = process.env.SALIDA ?? 'capturas';
fs.mkdirSync(SALIDA, { recursive: true });

const paginas = await (await fetch(`http://localhost:${CDP}/json/list`)).json();
const pagina = paginas.find((p) => p.type === 'page');
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));

let id = 0;
const pendientes = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPCION:', JSON.stringify(m.params.exceptionDetails).slice(0, 600));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    console.log('CONSOLA:', m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pendientes.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
if (!process.env.NOLOAD) {
  await cmd('Page.navigate', { url: `http://localhost:${PUERTO}/?depurar` });
  await new Promise((r) => setTimeout(r, 1500));
}
const fifo = fs.existsSync(FIFO) ? fs.openSync(FIFO, 'w') : null;

for (const paso of process.argv.slice(2)) {
  const [tipo, ...resto] = paso.split(':');
  const arg = resto.join(':');
  if (tipo === 'espera') await new Promise((r) => setTimeout(r, Number(arg)));
  else if (tipo === 'say') { if (fifo) fs.writeSync(fifo, `${arg}\n`); else console.log('(sin FIFO, no puedo enviar:', arg, ')'); }
  else if (tipo === 'eval') {
    const r = await cmd('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
    console.log('eval:', JSON.stringify(r.result.result.value));
  } else if (tipo === 'shot') {
    const r = await cmd('Page.captureScreenshot', { format: 'png' });
    const archivo = path.join(SALIDA, `${arg}.png`);
    fs.writeFileSync(archivo, Buffer.from(r.result.data, 'base64'));
    console.log('captura', archivo);
  }
}
process.exit(0);
