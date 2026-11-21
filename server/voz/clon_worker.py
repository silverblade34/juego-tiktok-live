"""Worker de voz CLONADA (XTTS-v2, Coqui) — replica la voz de una muestra (voz-referencia/*.wav).

Lo arranca server/voz.js con:  python clon_worker.py <referencia.wav> <dispositivo cpu|mps>
Protocolo por líneas JSON:
  stdin : {"id": 1, "texto": "...", "archivo": "/ruta/x.wav", "prioridad": "vivo"|"fondo",
           "velocidad": 1.0, "temperatura": 0.55, "segmentos": ["Hola.", "¿Qué tal?"],
           "pausaMs": 120, "semilla": 42, "bordeMs": 5}
  stdout: {"listo": true, "carga_s": 29.1}  al terminar de cargar el modelo
          {"id": 1, "ok": true, "seg_audio": 3.7, "seg_gen": 3.0} | {"id": 1, "ok": false, "error": "..."}
Genera de a una frase (el modelo usa todo el CPU) y SIEMPRE atiende primero las de prioridad "vivo".
"""
import json
import os
import queue
import sys
import threading
import time
import wave

os.environ.setdefault("COQUI_TOS_AGREED", "1")  # licencia CPML aceptada para uso no comercial
import warnings  # noqa: E402

warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402
import torch  # noqa: E402
from sintesis import generar_segmento  # noqa: E402
from TTS.api import TTS  # noqa: E402

SR = 24000
cola = queue.PriorityQueue()
seq = 0
lock_salida = threading.Lock()


def salida(obj):
    with lock_salida:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def guardar_wav(ruta, muestras):
    """Guarda float32 [-1,1] como WAV PCM 16 bits mono (lo reproduce cualquier navegador)."""
    pcm = (np.clip(muestras, -1.0, 1.0) * 32767).astype("<i2")
    tmp = ruta + ".tmp"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    os.replace(tmp, ruta)


def lector():
    """Lee peticiones de stdin y las encola (vivo antes que fondo)."""
    global seq
    for linea in sys.stdin:
        try:
            req = json.loads(linea)
        except json.JSONDecodeError:
            continue
        seq += 1
        prio = 0 if req.get("prioridad") == "vivo" else 1
        cola.put((prio, seq, req))
    cola.put((9, 10**12, None))  # stdin cerrado: terminar


def main():
    referencia, dispositivo = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "cpu")
    t0 = time.time()
    api = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False).to(dispositivo)
    modelo = api.synthesizer.tts_model
    gpt, spk = modelo.get_conditioning_latents(audio_path=[referencia])
    # Calentamiento: la primera inferencia siempre es más lenta.
    modelo.inference("Hola.", "es", gpt, spk)
    salida({"listo": True, "carga_s": round(time.time() - t0, 1)})

    threading.Thread(target=lector, daemon=True).start()
    while True:
        _, _, req = cola.get()
        if req is None:
            break
        t = time.time()
        try:
            segmentos = req.get("segmentos") or [req["texto"]]
            pausa = np.zeros(round(SR * req.get("pausaMs", 120) / 1000), dtype=np.float32)
            partes = []
            for segmento in segmentos:
                # Reinicia el muestreo de cada oración manteniendo la MISMA huella vocal.
                # Las inferencias cortas evitan arrastrar una deriva hasta el final del remate.
                def sintetizar(texto, intento):
                    torch.manual_seed(int(req.get("semilla", 42)) + intento)
                    out = modelo.inference(
                        texto, "es", gpt, spk,
                        temperature=float(req.get("temperatura", 0.55)),
                        speed=float(req.get("velocidad", 1.0)),
                        enable_text_splitting=False,
                    )
                    return out["wav"]

                fragmento = generar_segmento(sintetizar, segmento, req.get("controlDuracion", {}), SR)
                # Microbordes solo contra clics de unión: NO desvanecer palabras ni cambiar tono.
                n = min(round(SR * req.get("bordeMs", 5) / 1000), len(fragmento) // 2)
                if n:
                    fragmento[:n] *= np.linspace(0, 1, n, dtype=np.float32)
                    fragmento[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
                if partes:
                    partes.append(pausa)
                partes.append(fragmento)
            wav = np.concatenate(partes)
            guardar_wav(req["archivo"], wav)
            salida({"id": req["id"], "ok": True, "seg_audio": round(len(wav) / SR, 2), "seg_gen": round(time.time() - t, 2)})
        except Exception as e:  # noqa: BLE001
            salida({"id": req.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}"[:300]})


if __name__ == "__main__":
    torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
    main()
