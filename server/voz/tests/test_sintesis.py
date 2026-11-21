"""Pruebas sin cargar el modelo: .venv-xtts/bin/python -m unittest discover -s server/voz/tests"""
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sintesis import generar_segmento


class CalidadSintesis(unittest.TestCase):
    def test_audio_valido_no_cambia_volumen(self):
        original = np.full(100, 0.25, dtype=np.float32)
        actual = generar_segmento(lambda texto, i: original, "Hola.", {}, 100)
        np.testing.assert_array_equal(actual, original)

    def test_reintenta_si_una_interjeccion_dura_demasiado(self):
        intentos = []
        def generar(texto, i):
            intentos.append(i)
            return np.full(2600 if i == 0 else 100, 0.2)
        audio = generar_segmento(generar, "¡Uy!", {}, 100)
        self.assertEqual(intentos, [0, 1])
        self.assertEqual(len(audio), 100)

    def test_rechaza_audio_vacio_silencioso_infinito_o_largo(self):
        for audio in [[], np.zeros(100), [float('nan')], [float('inf')], np.ones(2600)]:
            with self.subTest(audio=str(audio)[:20]):
                with self.assertRaises(ValueError):
                    generar_segmento(lambda texto, i: audio, "¡Uy!", {}, 100)

    def test_limita_numero_de_reintentos(self):
        intentos = []
        def generar(texto, i):
            intentos.append(i)
            return []
        with self.assertRaises(ValueError):
            generar_segmento(generar, "Hola.", {"reintentos": 2}, 100)
        self.assertEqual(intentos, [0, 1, 2])

    def test_permite_oracion_mas_larga_segun_numero_de_palabras(self):
        texto = "Esta oración contiene suficientes palabras para permitir una duración normal mayor."
        audio = generar_segmento(lambda texto, i: np.full(600, 0.2), texto, {}, 100)
        self.assertEqual(len(audio), 600)
