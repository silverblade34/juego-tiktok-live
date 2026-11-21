# El Paradero Final — Plan completo y traspaso

> Documento para que **cualquier IA o persona** continúe el proyecto sin contexto previo.
> Léelo entero antes de tocar código. `CLAUDE.md` describe lo que YA está hecho (arquitectura,
> decisiones, cómo correr); este archivo describe **qué se busca, qué falta y cómo hacerlo**.
> Última actualización: 2026-11-21 (Fases 1, 1.5, voz, 2, 3, 4 y 5 terminadas).

---

## 1. Qué es el producto

Un juego que corre solo dentro de un **TikTok LIVE** (MacBook, capturado con OBS en vertical 1080×1920).
**No hay streamer jugando: el público ES el jugador.** Cada espectador que comenta entra como un auto en
una carrera y lo controla con comandos de chat. Un narrador cómico, **Don Lucho**, mantiene vivo el live
incluso cuando no hay nadie.

Objetivos, en orden de importancia:
1. Que comentar tenga un efecto **visible e inmediato** (el usuario ve SU auto con SU nombre).
2. Que haya **decisiones de estrategia** (recursos limitados), no solo spam ni reflejos.
3. Que el live **nunca se vea muerto** (Don Lucho entretiene en la espera).
4. Rondas **cortas** y con momentos **clipeables** (explosiones, venganzas, flatulencias).
5. Arquitectura lista para: regalos/donaciones, voz y narración con IA.

### Personalidad de Don Lucho (IMPORTANTE, el dueño insiste en esto)
- Cómico **ambulante, chacotero, de doble sentido** (pícaro, nunca explícito ni grosero). Peruano en
  jerga, voz de **señor cubano** (clonada, ver §4).
- **Molesta al público por su nombre**: saluda a quien entra ("¡Hola Juanito Alimaña!"), si está dormido
  lo bota ("ey tú María, vete que estoy durmiendo"), pica a los mirones que no comentan.
- Todo lo que pase en pantalla debe tener **sonido de apoyo** y, si aplica, una **frase**.
- **Nada puede sentirse lento**: las reacciones deben sonar al instante (ver regla de frases §4).

---

## 2. Restricciones técnicas (obligatorias)

- Node.js 20+, JavaScript ESM. **Sin TypeScript, sin bundlers, sin frameworks** (nada de React/Phaser).
- Servidor: HTTP estático + WebSocket (`ws`) en el **mismo puerto** (3000). OBS captura `http://localhost:3000`.
- Overlay: HTML + **Canvas 2D puro** + JS vanilla (módulos ES).
- **Todo el arte se dibuja con código**: prohibido PNG/SVG/sprites/fuentes descargadas. Solo formas,
  gradientes, sombras y fuentes del sistema. Los **sonidos** también se sintetizan (WebAudio); se permite
  reemplazarlos por archivos en `overlay/sonidos/` si el dueño los provee.
- Dependencias npm permitidas: `ws`, `tiktok-live-connector`. Nada más sin justificar.
  (La voz usa Python aparte en `.venv-xtts`, ya justificado en CLAUDE.md.)
- 60 fps (mínimo 30) con 30 autos + partículas en un MacBook.
- **Estado autoritativo en el servidor** (tick 30 Hz). El overlay solo recibe snapshots (20 Hz),
  interpola y dibuja. Si se recarga el overlay, se re-sincroniza solo.
- Todo texto visible al público **en español**.

## 3. Reglas de trabajo

- **Trabajar por fases.** Al terminar cada una: ejecutarla, verificar criterios, resumir y **DETENERSE**
  para que el dueño pruebe. No avanzar solo a la siguiente.
- Decisiones menores: tomarlas y **documentarlas en CLAUDE.md** (no preguntar detalles menores).
- **Todo valor de balance en `config.json`** (tiempos, daños, cooldowns, cantidades). Nunca hardcodear.
- Código modular, **comentado en español**, funciones pequeñas.
- **Pruebas `node:test`** para la lógica pura (`npm test`). Hoy hay 85, todas pasan; mantenerlas verdes.
- Todo debe poder probarse **sin TikTok** (`npm run sim`).
- Frases nuevas en `frases.json` (≥ 8 por evento; los `aviso_*` ≥ 4). Hay una prueba que lo verifica.

---

## 4. Lecciones aprendidas (léelas, evitan repetir errores)

1. **Regla de frases y voz instantánea.** La voz es CLONADA (XTTS-v2, 1–7 s por frase nueva). Por eso:
   - Las **reacciones** (a comandos, explosiones, avisos, cooldowns…) **NO llevan `{nombre}`** → se
     pregraban y suenan al instante. El nombre del usuario se muestra **en pantalla** (feed, texto
     flotante sobre su auto).
   - Solo llevan nombre: saludos, mirones, líder, ganador, último lugar. Esos se **pre-generan** antes
     de necesitarlos con `lucho.prepararFrase(evento, vars, estilo)` / `lucho.prepararSaludo`.
   - El estilo con que se pregraba (`frasesFijas()` en `server/voz.js`) **debe coincidir** con el que usa
     `lucho.estiloVoz()` al hablar (prioridad `importante` ⇒ `grito`). Si agregas un evento importante,
     agrégalo al mapa `estiloDe`. Hay una prueba en `server/tests/voz.test.js`.
   - Después de cambiar frases: `npm run voz:pregrabar` (tarda ~10 s por frase la primera vez).
   - Si el texto es igual pero el audio es defectuoso o cambió la síntesis: `npm run voz:regenerar -- balde baldeDormido` (o los eventos afectados). Ver corrección de voz en `CLAUDE.md`.
2. **El dueño corre su propio servidor en el puerto 3000.** NO lo mates. Para tus pruebas usa
   `--puerto 3100` (y `--sin-voz` para no cargar otro modelo de voz de 3.5 GB de RAM).
3. **Disco casi lleno** (~25 GB libres). No descargues modelos grandes sin necesidad y borra lo que descartes.
4. `coqui-tts 0.28` falla con `transformers` 5.x: las versiones están fijadas en
   `server/voz/requirements-clon.txt`. No las actualices a ciegas.
5. Los comentarios de TikTok llegan con **3–6 s de retraso**: ninguna mecánica puede depender de reflejos.
   Ventanas generosas y "el comando se aplica al siguiente obstáculo no resuelto".
6. El dueño se frustra con opciones que suenan iguales o con propuestas no probadas: **mide y prueba
   antes de ofrecer**. No pongas trabas de licencias: el proyecto NO se monetiza.
7. Para verificar visualmente sin intervención humana: ver `herramientas/captura.mjs` (§10).
8. En zsh, `set -- $var` no separa palabras; cuidado con scripts de shell que editan `config.json`
   (rompimos el JSON así una vez). Preferir editar JSON con Node/Python.

---

## 5. Estado actual (resumen; detalle en CLAUDE.md)

| Fase | Estado | Qué hay |
|---|---|---|
| 1 Don Lucho y la espera | ✅ | Huesos + poses interpoladas, acciones, sueño/ronquido, comandos !balde !cafe !corneta !manta !jugar, cooldowns, anti-spam, paciencia → lobby |
| 1.5 Cómico con el público | ✅ | Eventos `join`/`viewers`, saludos con apodo, saludo dormido, mirones, contador de espectadores |
| Voz | ✅ | Voz clonada de `voz-referencia/cubano.wav` (XTTS-v2 local), caché + pregrabado, colas vivo/fondo, boca sincronizada al volumen |
| Sonidos | ✅ | `overlay/render/sonidos.js` sintetiza todo; ambiente de calle, motores, flatulencias |
| 2 Lobby y autos | ✅ | 30 cupos, lista de espera, bots de relleno, 5 modelos de auto como datos, parrilla 6×5 |
| 3 Carrera automática | ✅ | Pista con semilla (5 tramos, 13 obstáculos), liga, separación, daño visual, explosión, chatarra, cámara, minimapa, top 3, podio |
| 4 Estrategia y narración | ✅ | Comandos, recursos, fantasmas, equipos opcionales, efectos y narración (§6) |
| 5 Persistencia y ranking | ✅ | Perfiles seguros, rangos, rankings día/global y cosméticos (§7) |
| 6 TikTok real + OBS | ⏳ | **siguiente** (§8) |
| 7 Preparar IA + regalos | ⏳ | §9 |

Máquina de estados: `ESPERA → LOBBY → CARRERA → RESULTADOS → ESPERA` (o `LOBBY` directo si hay lista de espera).

Mapa rápido del código donde vas a trabajar:
- `server/game.js` — `manejarChat()` (entrada de todo comando), `ejecutarComando()` (hoy maneja `tipo: molestia|jugar`),
  `atenderCarrera()` (traduce eventos de la simulación a narración/feed/eventos del overlay), `terminarCarrera()`.
- `server/race.js` — clase `Carrera`: `update()`, `moverAuto()`, `revisarChoques()`, `golpear()`, `destruir()`,
  `ranking()`, `snapshot()`. Cada auto es un objeto con `id, userId, nombre, y, x, xObjetivo, vel, hp, estado…`.
- `server/commands.js` — `parsearComando`, `Cooldowns` (global/usuario), `AntiSpam`. Lógica pura.
- `server/lucho.js` — habla con prioridades (`charla < reaccion < importante`), `narrar`, `encolar`, `prepararFrase`.
- `overlay/main.js` — `procesarEvento()` (evento → efecto + sonido), `dibujarAutos()`, layouts.
- `overlay/render/hudCarrera.js`, `cars.js`, `track.js`, `fx.js`, `sonidos.js`.

---

## 6. FASE 4 — Estrategia y narración  ✅ COMPLETADA

**Objetivo:** que el chat tome **decisiones** que cambien el resultado. La estrategia nace de recursos
limitados: ¿gasto las 2 cargas de turbo al inicio o las guardo? ¿uso la única reparación ya? ¿bomba al de
adelante (que puede vengarse)? Mantener eso intacto.

Implementada el 2026-11-21. Ver decisiones y verificación en `CLAUDE.md`, apartado
"Estrategia y narración". `!rezar` (opcional) se omitió. Equipos disponibles y OFF por defecto.
Validación: 67 pruebas, diez rondas de 25 pilotos y revisión visual headless a 1080×1920.
La fase 5 también está completada; ver §7.

### 6.1 Comandos (solo jugadores inscritos y VIVOS en la carrera actual)
| Comando | Efecto | Límite (config) |
|---|---|---|
| `!esquivar` | Cambia de carril justo antes del **próximo obstáculo no resuelto** que tenga delante | cd 8 s por usuario |
| `!escudo` | Absorbe el próximo golpe (dura 8 s) | cd 30 s por usuario |
| `!reparar` | +25 % de vida pero frena 2 s | 1 uso por carrera |
| `!turbo` | +40 % velocidad 3 s, pero **más daño** si choca mientras dura (p. ej. ×1.5) | 2 cargas por carrera |
| `!bomba` | Daña/frena al auto **justo adelante** (el más cercano con mayor `y`) | cd 25 s por usuario |
| `!aceite` | Deja una mancha detrás; quien pase **derrapa** (desvío lateral + freno breve, poco o nada de daño) | cd 20 s por usuario |
| `!lanzar [carril]` | **Solo fantasmas** (eliminados): lanza tomate/cáscara/piedra a un carril, delante del líder | cd 40 s por usuario |
| `!rezar` (opcional, config) | Muy baja probabilidad de revivir a uno de los últimos eliminados | cd largo |
| `!ceviche` / `!chifa` | Elegir bando una vez por ronda; marcador de equipos. **Módulo desactivable, OFF por defecto** (`config.equipos.activo`) | 1 vez |

### 6.2 Pasos sugeridos
1. **Config**: agregar a `config.comandos` entradas `tipo: "carrera"` (y `"fantasma"` para `lanzar`) con
   `fases: ["CARRERA"]`, `cooldownUsuarioSeg`, `cargas` (turbo 2, reparar 1), duraciones y multiplicadores
   (`turboFactor 1.4`, `turboSeg 3`, `turboDanoFactor 1.5`, `escudoSeg 8`, `repararPorc 25`, `repararFrenoSeg 2`,
   `bombaDano`, `bombaFrenoSeg`, `aceiteSeg`, `aceiteAncho`, `esquivarVentanaSeg` ~4, `lanzarDano`, etc.).
   Nada hardcodeado.
2. **`server/race.js`** — agregar estado por auto: `escudoHastaSeg`, `turboHastaSeg`, `cargasTurbo`,
   `reparoUsado`, `derrapeHastaSeg`… y métodos puros y testeables:
   `aplicarTurbo(autoId)`, `aplicarEscudo(autoId)`, `reparar(autoId)`, `esquivar(autoId)`,
   `bomba(autoId)`, `soltarAceite(autoId)`, `lanzar(carril)`. Cada uno devuelve `{ ok, motivo }`
   (`motivo`: 'sinCargas' | 'muerto' | 'sinObjetivo'…) y emite eventos para el overlay.
   - `golpear()`: si hay escudo activo → lo consume y no hay daño (evento `escudoRoto`); si hay turbo → daño × factor.
   - `moverAuto()`: aplicar turbo (velocidad), reparar (freno), derrape.
   - `esquivar`: buscar el siguiente obstáculo con `y` > auto.y que el auto NO haya cruzado, dentro de
     `esquivarVentanaSeg × vel`; elegir un `x` libre (fuera de `o.x ± (o.ancho/2 + anchoAuto/2)`) y fijarlo
     como `xObjetivo` con deriva rápida hasta pasarlo (no reemplazarlo por la deriva aleatoria).
   - Aceite y lanzar crean obstáculos dinámicos (igual que la chatarra) con `duenoId` y tipo nuevo.
3. **`server/game.js` → `ejecutarComando()`**: rama `tipo === 'carrera'`: validar que el usuario esté en la
   carrera y vivo (si no: ignorar en silencio; si es fantasma y el comando no es `lanzar`, ignorar).
   Cooldown por usuario + cargas. Si falla por cooldown/cargas: evento `cooldown` con `{cmd, seg, nombre, autoId}`
   para mostrar el texto **sobre su auto** y, como mucho, una frase fija de Don Lucho (rate-limited).
   Comandos de un no inscrito: ignorados con elegancia (ya se anotan para la próxima).
4. **Narración (frases fijas, sin nombre en la voz)**: nuevos eventos en `frases.json`, ≥ 8 cada uno:
   `turbo`, `escudo`, `escudoRoto`, `reparar`, `bomba`, `venganza` (B bombardea a quien lo bombardeó),
   `aceite`, `derrape`, `esquivar`, `esquivarExito`, `fantasmaLanza`, `adelantamiento`, `ultimoPuesto`
   (narra el último lugar durante la carrera), `rezarMilagro`. Mantener el tono pícaro.
   Agregar los importantes a `estiloDe` en `frasesFijas()` si usan prioridad `importante`.
   Limitar la narración (no más de una frase de reacción cada ~2 s) para que no se pisen.
   El nombre del autor va en el feed y en texto flotante sobre su auto.
5. **Overlay**: efectos visuales y **sonidos** para cada comando (en `procesarEvento`):
   burbuja de escudo alrededor del auto, llamas de turbo detrás, mancha de aceite en la pista, bomba que vuela
   del auto A al B + explosión chica, flecha de esquive, tomate/cáscara que cae desde la tribuna para fantasmas.
   Agregar `sfx_turbo`, `sfx_escudo`, `sfx_bomba`, `sfx_aceite`, `sfx_derrape`, `sfx_lanzar`, `sfx_reparar` en `sonidos.js`.
   Indicadores en la etiqueta del auto: cargas de turbo (2 rayitos), escudo activo, reparación disponible.
6. **Leyenda de comandos SIEMPRE visible durante la carrera** (panel inferior, a la derecha de Don Lucho o
   en una franja propia), con íconos dibujados (`render/iconos.js`) — reemplaza el texto "Comenta para
   entrar a la PRÓXIMA carrera" o compártelo.
7. **Fantasmas**: los destruidos pasan "a las gradas": mostrar su nombre en una franja de gradas al costado,
   pueden usar `!lanzar`, NO pueden ganar. Don Lucho los menciona ("desde las gradas todavía puede molestar").
8. **Simulador**: los bots deben usar comandos de carrera con cadencia humana y lag 1–6 s
   (`server/sources/simulator.js`, función `actuarBot`): turbo (a veces al inicio, a veces guardado),
   escudo antes de obstáculos anunciados, bomba, etc.
9. **Pruebas** (`server/tests/`): cargas de turbo se agotan; escudo absorbe 1 golpe; reparar 1 vez y no
   supera 100; bomba elige al auto de adelante correcto; esquivar evita el próximo obstáculo; fantasma solo
   puede `lanzar`; no inscrito/muerto se ignora; cooldown por usuario.

**Criterio de aceptación:** con `npm run sim -- --bots 25 --fast` las decisiones (turbo/escudo/reparar/bomba)
**cambian visiblemente el resultado**. Agrega una prueba determinista: misma semilla, un auto usa escudo +
turbo en el momento correcto y termina mejor que sin usarlos.

---

## 7. FASE 5 — Persistencia y ranking ✅ COMPLETADA

Implementada el 2026-11-21. Ver decisiones de archivos, recuperación, calendario local,
cosméticos y pruebas en `CLAUDE.md`, apartado "Persistencia, rangos y ranking".
Validación: 82 pruebas, diez rondas de 25 jugadores, guardado/recarga y cierre real con
SIGINT/SIGTERM. Siguiente: fase 6. Detenerse aquí para la prueba del dueño.

1. `server/users.js`: perfil por userId de TikTok: `nombre, comentarios, victorias, carreras, puntos,
   danoCausado, baldazos, cafes, cornetazos, mantas, rango, cosmeticos` (ya suma algunos campos en memoria).
2. Guardar en `data/profiles.json` con **escritura diferida (debounce ~2 s)** y **guardado seguro**
   (escribir a `.tmp` y `rename`), y guardado final en `SIGINT/SIGTERM` (ver `cerrar()` en `server/index.js`).
   Cargar al arrancar. Tolerar archivo corrupto (respaldo `.bak`).
3. **Rangos por comentarios acumulados** (en config): Curioso (0) → Habitual (5) → Fiel (20) → Leyenda (50).
   Al subir de rango: evento en pantalla (banner con el nombre) + frase fija de Don Lucho (el nombre en pantalla).
4. **Ranking diario y global** (diario se reinicia por fecha local). Estadísticas: "mayor aguador del día"
   (más baldazos), más victorias, más puntos.
5. Pantalla de **resultados** ampliada con estadísticas (ya hay base en `terminarCarrera()`); y en la ESPERA,
   un panel rotativo con el top del día y el "mayor aguador".
6. **Cosméticos como datos extensibles** (config): por rango, p. ej. estela de color (Fiel), techo dorado
   (Leyenda), bocina propia. Implementar 2–3 de ejemplo y dibujarlos en `cars.js`.
7. Pruebas: debounce, guardado seguro, subida de rango, reinicio diario.

---

## 8. FASE 6 — Conexión real a TikTok + OBS

1. `npm install tiktok-live-connector`. **La API de esa librería cambió entre versiones y no es oficial:
   lee el README de la versión instalada (`node_modules/tiktok-live-connector/README.md`) y adapta el
   código a ESA versión; no asumas nombres de clases/eventos.**
2. `server/sources/tiktok.js`: conectar a `config.tiktok.usuario`; normalizar todo al evento común
   `{ tipo: 'chat'|'gift'|'like'|'follow'|'join'|'viewers', userId, nickname, texto?, valor? }` y emitir en
   el bus (`bus.emit('evento', …)`). Mapeo esperado: chat → `chat`; member (alguien entra) → `join`;
   roomUser (conteo) → `viewers` con `valor`; gift → `gift` (cuidado con regalos en racha: contar al final
   de la racha); like → `like`; follow/social → `follow`. Usar un id estable del usuario (no el nickname).
3. Reconexión automática con **backoff exponencial** (`tiktok.reconexionBaseSeg` → `reconexionMaxSeg`) y logs
   claros de estado (conectando / conectado / caído / reintentando en N s / live terminó).
4. Los `gift` quedan **cableados hasta el bus** pero SIN efecto en el juego (Fase 7).
5. **Guía paso a paso en CLAUDE.md para macOS + OBS**: Browser Source con URL `http://localhost:3000`,
   1080×1920, 30 fps, **"Controlar audio vía OBS"** activado (la voz y los sonidos salen del overlay),
   "Apagar fuente cuando no sea visible" desactivado, escena vertical 1080×1920; cómo refrescar la fuente;
   permisos de macOS que apliquen; cómo salir en vivo en TikTok desde OBS (requisitos de TikTok para clave
   de transmisión / LIVE Studio) — verificar la información vigente, no inventarla.
6. **Checklist de prueba en vivo**: servidor arriba, voz pregrabada (`npm run voz:pregrabar`), overlay
   conectado (punto verde arriba a la derecha), audio en OBS, primer comentario abre lobby, etc.

---

## 9. FASE 7 — Solo dejar preparado (NO implementar)

1. `narrator.generate(evento, vars)` **asíncrona** con **timeout** y **fallback a plantilla** (ya existe el
   stub en `server/narrator.js`) para enchufar luego una IA que escriba frases + la voz clonada.
   Respetar la regla de §4: lo que dependa de IA nunca puede bloquear una reacción instantánea.
2. Regalos → **cosméticos/efectos** (mapa en config: regalo → efecto), **nunca victoria asegurada**.

---

## 10. Cómo verificar (sin humano)

- `npm test` — lógica pura (debe quedar todo en verde).
- `npm run sim -- --bots 25 --fast --puerto 3100 --sin-voz` — rondas completas sin TikTok ni voz.
  Consola: `ana: !turbo` (comentar como ana), `+maria` (entra a mirar), `!espectadores 4`,
  `!fase lobby` / `!fase carrera`, `!estado`, `!reset`, `!bots on|off`.
- Capturas automáticas del overlay: `herramientas/captura.mjs` (usa Chrome/Brave headless por CDP;
  ver instrucciones al inicio del archivo). Revisar las PNG resultantes.
- Criterios generales: **sin errores en 10 rondas seguidas con bots**, sin fugas de memoria visibles
  (partículas con tope, chatarra se limpia al terminar la ronda), recarga del overlay se re-sincroniza sin
  reiniciar la ronda, comandos de no inscritos/eliminados se ignoran con elegancia, todo el balance editable
  en `config.json`.
- Al terminar cada fase: actualizar CLAUDE.md (estado, decisiones) y este archivo (marcar ✅).

## 11. Pendientes y mejoras conocidas (no bloquean)

- Voz en streaming (empezar a sonar mientras se genera) bajaría a ~1–1.5 s las frases con nombre.
- Con zoom muy alejado las etiquetas de nombres se superponen (se podría mostrar solo top N + el propio).
- La grilla del lobby y la burbuja de Don Lucho se tocan cuando hay 5 filas y una frase larga.
- Gotitas de "mojado" siguen cayendo un instante al pasar a la escena de carrera.
- El proyecto ya tiene repositorio git; revisar `git status` antes de continuar.
