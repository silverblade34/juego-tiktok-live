# El Paradero Final — guía del proyecto

Juego de carreras para TikTok LIVE controlado por el chat. Corre solo: el público es el jugador.

> **¿Vas a continuar el proyecto? Lee primero `docs/PLAN.md`**: visión completa, lecciones aprendidas,
> preferencias del dueño y el paso a paso de las fases pendientes (6: TikTok/OBS, 7: IA).

Don Lucho (narrador cómico) mantiene el live vivo. Se captura con OBS (Browser Source 1080×1920).

## Cómo correr

```bash
npm install                     # solo instala `ws` (tiktok-live-connector llega en Fase 6)
npm run sim                     # servidor + simulador con consola interactiva
npm run sim -- --bots 25        # + 25 bots que comentan con lag de 1–6 s
npm run sim -- --bots 25 --fast # tiempo ×3 (config.simulador.factorRapido)
npm start                       # servidor + fuente TikTok (Fase 6; hoy solo avisa)
npm test                        # pruebas node:test de la lógica pura
npm run sim -- --puerto 3001    # otro puerto (si el 3000 está ocupado)
npm run voz:instalar-clon       # una vez: instala la voz clonada (XTTS-v2, ~1.2 GB + modelo ~1.9 GB)
npm run voz:pregrabar           # graba todas las frases fijas antes de salir en vivo
npm run sim -- --sin-voz        # sin voz (pruebas rápidas, no carga el modelo)
```

Abrir **http://localhost:3000** (o capturarlo en OBS). El canvas mide 1080×1920 y se escala
para caber en la ventana; en OBS a 1080×1920 se ve a escala 1.

### Consola del simulador
| Entrada | Efecto |
|---|---|
| `ana: !balde` | inyecta un comentario del usuario `ana` (sin lag) |
| `ana: hola` | comentario normal (en ESPERA abre el lobby) |
| `+maria_lopez` | ese usuario ENTRA a mirar el live (Don Lucho lo saluda) |
| `!espectadores 4` | fija el conteo de espectadores (< 10 ⇒ saluda a todos) |
| `!estado` | resumen del estado del juego |
| `!fase espera` / `!fase lobby` / `!fase carrera` | fuerza una fase (`carrera` cierra el lobby ya) |
| `!reset` | reinicia el juego |
| `!bots on` / `!bots off` | activa/pausa los bots |
| `!ayuda` | lista de atajos |

## Arquitectura

```
config.json        balance y parámetros (TODO valor ajustable vive aquí)
frases.json        plantillas del narrador (≥ 8 por evento) + textos del feed
server/
  index.js         HTTP estático (overlay/) + WebSocket en el MISMO puerto, loop 30 Hz, snapshots 20 Hz
  bus.js           bus de eventos normalizados {tipo, userId, nickname, texto?, valor?}
  game.js          máquina de estados ESPERA → LOBBY → CARRERA → RESULTADOS → ESPERA/LOBBY
  track.js         pista por tramos + obstáculos con semilla (reproducible)
  race.js          simulación de la carrera (liga, separación, daño, chatarra, ranking)
  lucho.js         estado autoritativo de Don Lucho (pose, acciones, sueño, paciencia, habla)
  commands.js      parseo de comandos, cooldowns (global/usuario), anti-spam — lógica pura
  voz.js           texto -> audio (say de macOS / Edge TTS), caché en data/voz-cache
  voz/clon_worker.py  worker XTTS-v2 (voz clonada) con colas vivo/fondo
  voz/edge_worker.py  worker Python persistente para Edge TTS (opcional)
  voz-pregrabar.js / voz-probar.js  utilidades de voz
  narrator.js      plantillas con variables y anti-repetición; `generate()` async (Fase 7)
  users.js         perfiles persistentes, rangos, cosméticos y rankings diarios/globales
  publico.js       espectadores: llegadas, cola de saludos, apodos chacoteros, mirones
  util.js          RNG con semilla (mulberry32), helpers
  sources/simulator.js  consola + bots
  sources/tiktok.js     adaptador TikTok (Fase 6)
  tests/           node:test
overlay/
  index.html, main.js   conexión ws (reconexión sola), loop de render, despacho de eventos
  render/palette.js     paleta única + layout
  render/texto.js       texto con contorno, envoltura, roundRect
  render/scene.js       fondo (cielo, ciudad), vereda, garita
  render/lucho.js       Don Lucho con huesos, poses interpoladas, acciones, mesa y micro
  render/fx.js          partículas (pool limitado) + efectos de escena (balde, corneta, café)
  render/iconos.js      íconos dibujados de la leyenda
  render/voz.js         reproduce la voz y mide el volumen para la boca
  render/sonidos.js     efectos y ambiente SINTETIZADOS con WebAudio (balde, corneta, pedo, motores…)
  render/cars.js        modelos de auto como datos + dibujarAuto() con daño por niveles
  render/track.js       pista: 5 tramos, decorados, 13 obstáculos, señales ⚠, salida y meta
  render/camera.js      cámara única (60 % líder / 40 % pelotón) con zoom dinámico
  render/hudCarrera.js  barra (tiempo, vivos, top 3), minimapa, cuenta, nombres/vida, podio
  render/hud.js         barra superior, burbuja, paciencia, leyenda, feed, lobby, banners
```

### Decisiones tomadas
- **Reloj de juego propio** (`juego.t`, ms). El servidor avanza `dt × escalaTiempo`; todos los
  cooldowns/fases usan ese reloj → `--fast` acelera todo de forma coherente y las pruebas
  avanzan el tiempo sin esperar. El overlay recibe `escalaTiempo` y acelera sus animaciones igual.
- **Servidor autoritativo**: el overlay no decide nada. Recibe snapshots completos (fase, Lucho,
  cooldowns, lobby, feed, eventos recientes). Al recargar, el primer snapshot reconstruye todo.
- **Eventos puntuales** (balde, corneta, cooldown…) viajan dentro del snapshot con `id` creciente
  durante `servidor.eventosVisiblesSeg`. El cliente procesa solo ids nuevos; al (re)conectar
  marca los existentes como vistos para no repetir efectos.
- **Don Lucho**: el servidor decide la *pose* (aburrido, dormido, susto, enojado, hiperactivo,
  mojado, animado) y las *acciones* puntuales (bostezo, rascarse, golpearMicro, salto, caida,
  sorbo, arropar) con id y duración. El cliente interpola huesos hacia la pose objetivo
  (suavizado exponencial) y superpone la acción con una envolvente.
- **Prioridad de habla**: charla(1) < reacción(2) < importante(3). Un mensaje no pisa a otro de
  mayor prioridad, ni a uno de igual prioridad con menos de 1.2 s en pantalla. Hay una cola de 1
  mensaje pendiente (p. ej. "paciencia media" espera a que termine la reacción).
- **Cooldown con humor**: la frase de cooldown se limita a una cada `lucho.avisoCooldownCadaSeg`
  para no tapar todo, pero SIEMPRE hay feedback visual (el chip de la leyenda tiembla y muestra
  los segundos + texto flotante con el nombre).
- **Comandos inválidos o fuera de fase**: se ignoran en silencio (no cuentan como comentario
  normal, no abren el lobby). En LOBBY cualquier mensaje inscribe (incluidos comandos).
- **Anti-spam**: más de `maxMensajes` en `ventanaSeg` ⇒ silencio `silencioSeg`. Cuenta todos los
  mensajes. Los mensajes de un silenciado se descartan antes de cualquier otra lógica.
- **Paciencia**: cada molestia suma `comandos.<cmd>.paciencia`; decae `pacienciaDecaePorSeg`.
  Solo sube en ESPERA. Al llenarse, Don Lucho grita y se abre el LOBBY.
- **Fase 1, fin de LOBBY**: aún no hay carrera; Don Lucho anuncia "pista en construcción" y
  vuelve a ESPERA. En Fase 2/3 aquí arranca la CARRERA.
- **Público (cómico ambulante)**: eventos `join` (alguien entra) y `viewers` (conteo). Con menos de
  `publico.maxEspectadoresParaSaludarTodos` (10) saluda a TODOS al entrar; con más, solo a una
  fracción (`probSaludoConMuchos`). Saludos espaciados (`saludoCadaSeg`), cola corta (`colaMax`) y
  se descartan los viejos (`saludoMaxEdadSeg`). Variantes: nuevo, regreso, "somos tú y yo" (≤ 2
  espectadores), en lobby ("¡comenta y entras!") y DORMIDO ("vete de acá que estoy durmiendo":
  entreabre un ojo y SIGUE durmiendo; mirar no cuenta como interacción). Apodo = diminutivo +
  apellido cómico neutro ("Juanito Alimaña", "Marita Turbo"). **Mirones**: quien entró hace
  `molestarMironTrasSeg` y no comenta recibe una pulla (una vez) con Don Lucho señalándolo.
  Entrar a mirar NO abre el lobby (solo comentar).
- **Gifts/likes/follows** llegan al bus y a `juego.manejarEvento` pero no tienen efecto aún.
- **Frases** en `frases.json` (separadas de config.json para no inflarlo). `npm test` valida que
  cada evento tenga ≥ 8 frases.
- **Fuente**: "Arial Rounded MT Bold" (viene con macOS) con respaldo Arial Black / sans-serif.
- Sin imágenes: todo con rect/arc/path/gradientes del Canvas 2D.

## Carrera (Fases 2 y 3)
- Inscripción: cada inscrito recibe cupo, número, modelo (`carrera.modelos`, con pesos por repetición)
  y color (índice de `P.autos`, sin repetir hasta agotar). Si hay menos de `fases.rellenarHasta` (6)
  humanos, se rellena con bots de `bots.nombres`. Con 0 humanos vuelve a ESPERA.
- Comentar durante CARRERA/RESULTADOS anota para la próxima (lista de espera, entran primero).
- Pista: `carrera.largo` 12000 u, 6 carriles, 5 tramos (meta 60 % más corta). Obstáculos son datos en
  `obstaculos` (daño, ancho en carriles, mov fijo/cruza/lento, tramos donde aparecen); la densidad sube
  de `densidadInicialCada` a `densidadFinalCada`. Los de `obstaculosConAviso` se anuncian `avisoSeg`
  antes de que llegue el líder (señal ⚠ + Don Lucho + sonido).
- Simulación a 30 Hz: velocidad base ± variación cada segundo, efecto liga, freno cosmético al chocar,
  más lento con vida < 40 %, deriva lateral aleatoria + separación. HP 0 ⇒ explota y deja chatarra
  (obstáculo chico, no daña a su dueño). Termina cuando no quedan vivos, a `maxSeg`, o `trasPrimeroSeg`
  después del primero. Ranking: llegados (orden) > vivos (avance) > destruidos (avance).
- Balance medido (20 carreras × 30 autos): ~73 s, ~9.5 explotan, ~20 llegan, ~5 golpes por auto.
  Script de ajuste rápido: simular con `Carrera` en un bucle (ver server/tests/race.test.js).
- Snapshot: autos compactos `[id,y,x,hp,estado,pos]` a 20 Hz; pista y nombres (estáticos) solo al conectar
  y 1 vez por segundo. El overlay interpola autos ~100 ms atrás y calcula la cámara.
- Estrategia y fantasmas implementados en Fase 4 (ver abajo).

## Sonido (sintetizado, sin archivos)
- `overlay/render/sonidos.js`: cada efecto es una función WebAudio (`sfx_balde`, `sfx_flatulencia`…).
  Ambiente de calle bajito (tráfico, autos que pasan, pajaritos, bocinas lejanas) que baja cuando Don
  Lucho habla; ronquido cuando duerme; motores durante la carrera.
- Cada evento del servidor tiene su sonido (ver `procesarEvento` en overlay/main.js).
- Para usar un archivo real: ponerlo en `overlay/sonidos/` y mapearlo en `ARCHIVOS`.
- Flatulencias: `lucho.probFlatulenciaCorneta` (tras la caída) y `probFlatulenciaAburrido` (en la espera).

## Frases y voz instantánea
- Regla: las REACCIONES (balde, café, corneta, manta, cooldown, spam, jugar, explosión, avisos…) NO
  llevan `{nombre}`: así se pregraban y suenan al instante; el nombre sale en pantalla (feed/flotantes).
  Solo llevan nombre los saludos, pullas a mirones, líder, ganador y último lugar; esos se pre-generan
  en cuanto se puede (al entrar la persona, cuando el líder pasa el 85 %, al terminar la carrera).
- `frasesFijas()` (server/voz.js) asigna el estilo de voz de cada evento y DEBE coincidir con
  `lucho.estiloVoz()` (importante ⇒ grito). Si no coincide, `enCache` usa la versión de otro estilo
  antes que generar en vivo. Hay una prueba que lo verifica.
- Humor: señor pícaro de doble sentido, sin groserías explícitas.

## Cómo ajustar balance (config.json)
- `fases.lobbySeg`, `fases.maxJugadores`, `fases.abrirLobbyConComentario`
- `lucho.durmiendoTrasSeg`, `lucho.pacienciaMax`, `lucho.pacienciaDecaePorSeg`, duraciones de
  susto/café/mojado/caída, cadencias de charla (`[min, max]` en segundos)
- `comandos.<cmd>`: `cooldownGlobalSeg`, `cooldownUsuarioSeg`, `paciencia`, `fases` permitidas
- `antiSpam`: `maxMensajes`, `ventanaSeg`, `silencioSeg`
- `simulador`: lag, cadencia de bots, olas de actividad (activa/quieta) para ver a Lucho dormirse
- Frases: editar `frases.json` (variables `{nombre}`, `{seg}`, `{cmd}`, `{n}`)

## Voz de Don Lucho — VOZ CLONADA de una muestra cubana (decidido 2026-11-21)
- El usuario rechazó las voces de Microsoft ("todas suenan igual, no son caribeñas") y entregó una
  muestra libre de 12 s de un señor cubano → `voz-referencia/cubano.wav` (24 kHz mono).
- Motor `voz.motor: "clon"` = **XTTS-v2** (coqui-tts) local, en CPU, clona la voz a partir de la muestra.
  Medido en M3 Pro: carga ~21 s al arrancar; frase corta ~1–3 s; frase larga ~5–7 s; caché ~0 ms.
  Se probó Chatterbox Multilingual (MPS): 18–61 s por frase → descartado y desinstalado.
  En MPS (GPU) XTTS rinde parecido a CPU; se dejó CPU (`voz.clon.dispositivo`).
- Instalar: `npm run voz:instalar-clon` (venv `.venv-xtts` con Python 3.11 y versiones FIJAS en
  `server/voz/requirements-clon.txt`; ojo: coqui-tts 0.28 falla con transformers 5.x, se fijó 4.55.4).
- Worker `server/voz/clon_worker.py`: carga el modelo una vez, calcula la huella de la muestra,
  genera de a una frase con dos colas: **vivo** (frases con nombre) siempre antes que **fondo**.
- Pregrabado: las ~129 frases fijas se graban con la voz clonada en segundo plano al arrancar
  (≈10 min SOLO la primera vez) o antes de salir en vivo con `npm run voz:pregrabar`. El pregrabado
  cede el turno si hay una frase en vivo esperando. Cambiar la muestra invalida la caché (huella en la clave).
- Frases en vivo (con {nombre}/{seg}): ~2–4 s comentario→voz con la caché completa (7–10 s si el
  pregrabado está corriendo). Los saludos se empiezan a generar cuando la persona ENTRA.
- `voz.esperaMaxSeg` (12 s): si el audio no llega, la frase sale solo con texto. Mientras carga el
  modelo, `voz.clon.respaldo: "texto"` (no cambia a otra voz).
- Estilos por estado (`voz.estilos`): `velocidad`/`temperatura` para XTTS; rate/pitch para Edge; factorMac.
- Otros motores disponibles en config: `"edge"` (Microsoft, `npm run voz:instalar`) y `"mac"` (say).
- Probar: `npm run voz:probar -- "¡Hola Juanito Alimaña!"` (o `ESTILO=cafe ...`).
- Overlay (`render/voz.js`): `<audio>` + WebAudio para mover la boca; "..." mientras se genera; en
  OBS activar "Controlar audio vía OBS". `?depurar` expone `window.__voz` (solo pruebas).

## Protocolo WebSocket
- servidor → cliente `{tipo:'hola', cliente:{...config visible}}` al conectar.
- servidor → cliente `{tipo:'snap', t, escalaTiempo, fase, faseRestanteMs, lucho, cooldowns, lobby, feed, eventos}` a 20 Hz.
- El cliente no envía nada (por ahora).

## Estado por fases
- [x] **Fase 1** — Don Lucho y la espera.
- [x] Fase 1.5 — Don Lucho cómico con el público (saludos, apodos, mirones).
- [x] Voz de Don Lucho: clonada de muestra cubana con XTTS-v2 (Edge y Mac como alternativas).
- [x] Fase 2 — Lobby y autos.
- [x] Fase 3 — Carrera automática (+ sonidos sintetizados).
- [x] Fase 4 — Estrategia y narración.
- [x] Fase 5 — Persistencia y ranking.
- [ ] Fase 6 — Conexión real a TikTok + guía OBS.
- [ ] Fase 7 — (preparar) narrador IA/voz y regalos.

## Qué falta / notas
- Perfiles guardados en `data/profiles.json`; el simulador usa archivos separados por puerto.
- `sources/tiktok.js` es un stub hasta Fase 6. Mapear: `member` → `join`, `roomUser.viewerCount` → `viewers`.
- Los nombres pueden superponerse con el pelotón muy agrupado (mejora visual pendiente).

## Estrategia y narración (Fase 4, 2026-11-21)

- `!turbo`: 2 cargas, velocidad ×1.4 durante 3 s; los golpes hacen ×1.5 de daño.
- `!escudo`: absorbe un golpe durante 8 s; cooldown individual de 30 s.
- `!reparar`: +25 puntos de vida (máximo 100), una vez por carrera; frena 2 s.
- `!esquivar`: el siguiente obstáculo dentro de una ventana de 4 s, con rumbo prioritario
  hasta pasarlo; anticipa su movimiento. Cooldown individual de 8 s.
- `!bomba`: golpe al vivo más cercano por delante; daño 18 y freno 2 s. Cooldown 25 s.
  El escudo también bloquea el freno. Se detecta la venganza al devolver una bomba al atacante.
- `!aceite`: mancha detrás, dura 15 s, derrape lateral y freno sin daño; cooldown 20 s.
- Los destruidos aparecen en las gradas y pueden `!lanzar [1–6]` cada 40 s. Sin argumento
  se elige un carril al azar; un carril inválido no consume cooldown. El proyectil aparece
  600 unidades por delante del líder, permanece 12 s y hace 8 de daño.
- `!ceviche` / `!chifa`: una elección por carrera y marcador de puntos según posición.
  Solo funciona con `equipos.activo: true` (OFF por defecto). `!rezar` se dejó fuera por ser opcional.
- Todo el balance vive en `config.comandos`; los cooldowns se reinician por carrera y solo
  se registran tras una acción válida. No inscritos, llegados y comandos incompatibles con el
  estado vivo/fantasma se ignoran; los no inscritos conservan su lugar para la próxima.
- Snapshot: `recursos`, `dinamicos` y `equipos` viajan siempre, incluso sin datos estáticos.
  Recargar reconstruye escudos, cargas y trampas. Los avisos usan `obstaculoId` para no
  sobrescribir el `id` numérico del evento de red.
- `overlay/render/estrategia.js`: burbujas, llamas, manchas, proyectiles, bomba en arco,
  mensajes junto al auto, gradas y leyenda permanente con iconos dibujados. Los tiempos y
  cargas de la leyenda proceden de la config enviada por el servidor.
- Cada acción tiene sonido WebAudio; las reacciones nuevas son fijas, sin nombres en la voz,
  con 8 variantes por evento. Nombre/objetivo en feed y etiqueta del auto. Cadencia mínima
  `carrera.narrarReaccionCadaSeg` (2 s), con narración periódica del último vivo.
- Los bots del simulador deciden durante toda la carrera, aunque la ola de actividad esté
  quieta; mantienen cadencia humana y lag configurable de 1–6 s. Priorizan reparar si están heridos.
- Verificación: 67 pruebas verdes; 10 carreras de 25 pilotos con decisiones y estado válido;
  comparación determinista de llegada/posición con y sin escudo + turbo; navegador headless
  sin errores reportados y muestras de 60 fps durante 1.2 s con 25 autos y 1.5 s con 30 autos. Es una medición breve,
  no una garantía de rendimiento sostenido bajo cualquier carga.
- Voz: ejecutado `npm run voz:pregrabar`; generó 108 audios pendientes en 319 s.
  Verificadas las 104 nuevas reacciones en caché con estilo exacto. Las 412 frases fijas
  tienen audio disponible (cuatro anteriores usan el respaldo de otro estilo ya previsto).
- Para probar: `npm run sim -- --bots 25 --fast --puerto 3100 --sin-voz`. Reiniciar el servidor
  existente para cargar los cambios; refrescar el overlay.

## Persistencia, rangos y ranking (Fase 5, 2026-11-21)

- `Usuarios` guarda por ID estable: nombre, comentarios, carreras, victorias, puntos,
  daño efectivo causado, baldazos, cafés, cornetazos, mantas, explosiones, rango y cosméticos.
  Los bots de relleno no tienen perfil; los usuarios simulados quedan en su propio archivo.
- LIVE: `data/profiles.json`. Simulador: `data/profiles-sim-<puerto>.json`.
  `--perfiles /ruta/archivo.json` permite aislar datos de prueba o elegir otro archivo.
  Las pruebas automáticas usan directorios temporales y no alteran datos del LIVE.
- Guardado agrupado cada `perfiles.guardadoSeg` (2 s reales, sin aceleración): se escribe
  `.tmp`, se hace `fsync` y se reemplaza el principal con `rename`. El `.bak` conserva la
  versión válida anterior; el primer guardado también crea respaldo. Un archivo inválido
  no sobreescribe el respaldo válido. Al recuperar desde `.bak`, se repara el principal.
  Si ambos fallan, inicia vacío y registra el problema. Los errores de escritura conservan
  los cambios pendientes y se reintentan. `SIGINT`/`SIGTERM` cancelan el temporizador y
  guardan sincrónicamente; un fallo de guardado final termina con código 1.
- `!reset` reinicia el juego, conservando perfiles y rankings acumulados.
- Rangos por comentarios aceptados (los mensajes silenciados no cuentan): Curioso (0),
  Habitual (5), Fiel (20), Leyenda (50), configurables en `perfiles.rangos`.
  El ascenso dispara banner con nombre, feed, confeti y sonido. La frase fija sin nombre
  espera su turno de voz para que abrir el lobby no la interrumpa. Ascensos simultáneos
  comparten una celebración de voz; los banners de cada persona se conservan con tope.
- Rankings diario y global de puntos, victorias y baldazos (mayor aguador), con empates
  resueltos por ID estable. Se cachean hasta el siguiente cambio. El diario se reinicia
  al cambiar la fecha civil en `perfiles.zonaHoraria` (`America/Lima`), incluso sin chat,
  y al arrancar otro día. `--fast` no acelera los días ni el guardado.
- En ESPERA se alternan la invitación a jugar y seis tablas (día/global × tres estadísticas).
  `perfiles.rotacionSeg` controla el intervalo y `perfiles.top` el tamaño del ranking;
  la tarjeta muestra las primeras tres filas. Resultados incluyen rango, victorias y
  puntos acumulados del primer clasificado humano, líder diario y aguador del día.
- Cosméticos acumulativos como datos en `perfiles.cosmeticos`: distintivo verde (Habitual),
  estela morada (Fiel) y techo dorado (Leyenda). Se dibujan en lobby, carrera y podio;
  no cambian velocidad, daño ni probabilidad de victoria. Los rangos se recalculan al
  cargar para aplicar cambios de configuración. Un ascenso en carrera actualiza el auto.
- Daño causado: solo daño efectivo que quitó vida (sin exceso sobre HP restante), atribuido
  por autor de bomba/proyectil/chatarra. Un escudo o un derrape sin daño no suman daño causado.
- Validación: 82 pruebas verdes, incluidos debounce, fallo de rename, corrupción/recuperación,
  medianoche de Lima, rangos, cosméticos y diez rondas de 25 jugadores con guardado/recarga.
  Verificado el ciclo real de arranque, reinicio y cierre con SIGINT/SIGTERM en el puerto 3100.
  Ocho frases nuevas de ascenso pregrabadas con XTTS-v2; revisión visual a 1080×1920.
- Para probar: reiniciar el servidor y refrescar el overlay. Los rangos se ganan comentando;
  el ranking aparece en la espera. Fase 6 (TikTok real + OBS) queda pendiente.

## Corrección de voz en remates largos (2026-11-21)

- Se reportó deriva de timbre en "¡Así no se despierta a un caballero! Primero un besito,
  después el balde." El reproductor no aplicaba fundidos ni cambios de velocidad/tono;
  la grabación venía de una única inferencia de XTTS para las dos oraciones.
- `server/voz/texto.js` divide por oración y limita la longitud por palabras. El worker
  sintetiza cada unidad con la misma huella vocal, reinicia la semilla y limita la
  temperatura. Une las unidades con pausa corta y microbordes de 5 ms contra clics.
  No se modifica el tono ni se aplica un fundido a las palabras.
- Parámetros en `voz.clon.sintesis`: máximo 85 caracteres por segmento, mínimo 12 para agrupar interjecciones cortas,
  pausa 120 ms, temperatura máxima 0.55, semilla 42 y borde 5 ms.
  Antes de guardar, se descarta audio vacío/no finito/silencioso o demasiado largo para
  su texto; hasta dos reintentos con semilla distinta. Si fallan, no se reemplaza la caché.
  Los límites de duración también están en `voz.clon.sintesis`. Se conserva el texto de pantalla.
- `npm run voz:regenerar -- balde baldeDormido` reemplaza únicamente esas grabaciones,
  incluso si ya estaban en caché o existía audio de otro estilo. `--todas` permite renovar
  todas las frases fijas. A diferencia de `voz:pregrabar`, fuerza la nueva síntesis.
  Los cambios de síntesis requieren regenerar los audios ya guardados que se quieran renovar.
- Las URL de audio incluyen `?v=<mtime>`: tras reemplazar un WAV, el navegador solicita la
  grabación nueva, aunque hubiera guardado la anterior con caché inmutable. Reiniciar el
  servidor y refrescar el overlay para cargar el código nuevo.
- Pruebas: 85 en verde, incluidas separación sin pérdida de palabras, parámetros enviados
  al worker, regeneración efectiva y cambio de URL tras reemplazar caché. La calidad de
  timbre debe confirmarse escuchando la versión nueva; las pruebas no juzgan identidad vocal.

- El control de segmentos tiene cinco pruebas Python adicionales sin cargar el modelo:
  `.venv-xtts/bin/python -m unittest discover -s server/voz/tests` (todas pasan).
- Regeneradas y verificadas las 22 reacciones de `balde` y `baldeDormido` con la nueva
  segmentación y controles. Conservada la misma muestra cubana. Comprobado HTTP 200
  con la URL versionada y que su contenido corresponde al WAV nuevo.
