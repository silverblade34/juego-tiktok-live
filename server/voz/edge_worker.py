"""Worker de voz persistente (Edge TTS). Lo arranca server/voz.js.

Protocolo por líneas JSON:
  stdin : {"id": 1, "texto": "...", "voz": "es-PE-AlexNeural", "rate": "+0%", "pitch": "+0Hz", "archivo": "/ruta/x.mp3"}
  stdout: {"listo": true} al arrancar; luego {"id": 1, "ok": true, "bytes": 12345} o {"id": 1, "ok": false, "error": "..."}
Atiende varias peticiones a la vez. Usa la librería edge-tts (mantenida por la comunidad).
"""
import asyncio
import json
import os
import sys

import edge_tts


def salida(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


async def sintetizar(req):
    archivo = req["archivo"]
    tmp = archivo + ".tmp"
    try:
        com = edge_tts.Communicate(req["texto"], req["voz"], rate=req.get("rate", "+0%"), pitch=req.get("pitch", "+0Hz"))
        total = 0
        with open(tmp, "wb") as f:
            async for trozo in com.stream():
                if trozo["type"] == "audio":
                    f.write(trozo["data"])
                    total += len(trozo["data"])
        if total == 0:
            raise RuntimeError("sin audio")
        os.replace(tmp, archivo)
        salida({"id": req["id"], "ok": True, "bytes": total})
    except Exception as e:  # noqa: BLE001 — cualquier fallo se reporta y el servidor usa el respaldo
        try:
            os.remove(tmp)
        except OSError:
            pass
        salida({"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}"[:300]})


async def main():
    loop = asyncio.get_running_loop()
    lector = asyncio.StreamReader()
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(lector), sys.stdin)
    salida({"listo": True})
    tareas = set()
    while True:
        linea = await lector.readline()
        if not linea:
            break
        try:
            req = json.loads(linea)
        except json.JSONDecodeError:
            continue
        t = asyncio.create_task(sintetizar(req))
        tareas.add(t)
        t.add_done_callback(tareas.discard)
    if tareas:
        await asyncio.gather(*tareas, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
