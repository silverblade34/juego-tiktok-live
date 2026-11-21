// Generación de la pista por tramos y obstáculos, reproducible con una semilla.
// Coordenadas: y = avance a lo largo de la pista (0 = salida, largo = meta);
//              x = posición lateral continua en "carriles" (0 .. carriles).
import { crearRng, elegir } from './util.js';

const PESO_TRAMO = { meta: 0.6 }; // la meta es más corta que el resto

/** Devuelve la pista: { semilla, largo, carriles, tramos:[{tipo,desde,hasta}], obstaculos:[...] } */
export function generarPista(config, semilla) {
  const c = config.carrera;
  const rng = crearRng(semilla);
  const largo = c.largo;

  // Tramos con su propio ambiente visual
  const pesos = c.tramos.map((t) => PESO_TRAMO[t] ?? 1);
  const total = pesos.reduce((a, b) => a + b, 0);
  let desde = 0;
  const tramos = c.tramos.map((tipo, i) => {
    const hasta = i === c.tramos.length - 1 ? largo : Math.round(desde + (pesos[i] / total) * largo);
    const t = { tipo, desde, hasta };
    desde = hasta;
    return t;
  });

  // Obstáculos: más seguidos a medida que se avanza (sube la dificultad)
  const obstaculos = [];
  let id = 0;
  let y = c.zonaLibreInicio;
  const fin = largo - c.zonaLibreFinal;
  while (true) {
    const p = y / largo;
    const cada = c.densidadInicialCada + (c.densidadFinalCada - c.densidadInicialCada) * p;
    y += cada * (0.7 + rng() * 0.6);
    if (y >= fin) break;
    const tramo = tramoEn({ tramos }, y);
    const posibles = Object.entries(config.obstaculos).filter(([, d]) => d.tramos.includes(tramo.tipo));
    if (!posibles.length) continue;
    // A veces dos obstáculos a la vez (más en la segunda mitad)
    const cantidad = rng() < 0.15 + p * 0.25 ? 2 : 1;
    const usados = [];
    for (let k = 0; k < cantidad; k++) {
      const [tipo, d] = elegir(rng, posibles);
      let x = d.ancho / 2 + rng() * (c.carriles - d.ancho);
      if (usados.some((u) => Math.abs(u - x) < 1.5)) x = (x + c.carriles / 2) % (c.carriles - d.ancho) + d.ancho / 2;
      usados.push(x);
      obstaculos.push({
        id: ++id, tipo, y: Math.round(y), x: +x.toFixed(2), ancho: d.ancho, dano: d.dano,
        mov: d.mov, vel: d.vel ?? 0, dir: rng() < 0.5 ? -1 : 1,
        aviso: config.obstaculosConAviso.includes(tipo),
      });
    }
  }
  return { semilla, largo, carriles: c.carriles, tramos, obstaculos };
}

export function tramoEn(pista, y) {
  return pista.tramos.find((t) => y >= t.desde && y < t.hasta) ?? pista.tramos[pista.tramos.length - 1];
}

/** Posición actual de un obstáculo (los que se mueven cruzan la pista o avanzan lento). */
export function posicionObstaculo(o, tSeg, carriles) {
  if (o.mov === 'cruza' && o.vel > 0) {
    // Va y viene de un borde a otro (onda triangular)
    const rango = carriles - o.ancho;
    const inicio = o.x - o.ancho / 2;
    let d = (inicio + o.dir * o.vel * tSeg) % (2 * rango);
    if (d < 0) d += 2 * rango;
    const xIzq = d <= rango ? d : 2 * rango - d;
    return { x: xIzq + o.ancho / 2, y: o.y };
  }
  if (o.mov === 'lento') return { x: o.x, y: o.y + o.vel * tSeg };
  return { x: o.x, y: o.y };
}
