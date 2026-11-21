"""Control de calidad antes de guardar segmentos de XTTS. No altera su tono ni volumen."""
import re
import numpy as np


def generar_segmento(generar, texto, control, sr):
    palabras = len(re.findall(r"\w+", texto, re.UNICODE))
    limite = max(control.get("minLimiteSegmentoSeg", 4),
                 palabras * control.get("segPorPalabraMax", 0.9) + control.get("margenSegmentoSeg", 1.5))
    for intento in range(control.get("reintentos", 2) + 1):
        audio = np.asarray(generar(texto, intento), dtype=np.float32)
        if (len(audio) > 0 and np.all(np.isfinite(audio)) and
                np.max(np.abs(audio)) > 0.0001 and len(audio) / sr <= limite):
            return audio
    raise ValueError("XTTS produjo un segmento inválido o anormalmente largo; se conserva el audio anterior")
