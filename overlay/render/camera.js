// Cámara de la carrera: UNA sola, enfoca al grupo (60 % líder, 40 % centro del pelotón vivo)
// y hace zoom out si se dispersan / zoom in si se juntan, todo suavizado.
import { clamp } from './texto.js';

export const VISTA = {
  arriba: 200,        // borde superior del área de pista en pantalla
  abajo: 1560,        // borde inferior (abajo está el panel de Don Lucho)
  focoY: 930,         // dónde queda el punto de foco en pantalla
  centroX: 515,       // centro de la pista en pantalla (a la derecha va el minimapa)
  anchoCarril: 130,   // px por carril con zoom 1
  zoomMin: 0.34,
  zoomMax: 1.0,
};

export class Camara {
  constructor() {
    this.y = -300;
    this.zoom = 0.8;
  }

  /** @param {{y:number}[]} vivos autos vivos (posiciones interpoladas) */
  update(dt, vivos, liderY, cuenta) {
    let objetivoY, objetivoZoom;
    if (cuenta || !vivos.length) {
      // Antes de largar: mostrar la parrilla completa.
      objetivoY = vivos.length ? (Math.max(...vivos.map((a) => a.y)) + Math.min(...vivos.map((a) => a.y))) / 2 + 150 : this.y;
      objetivoZoom = 0.75;
    } else {
      const centro = vivos.reduce((s, a) => s + a.y, 0) / vivos.length;
      objetivoY = 0.6 * liderY + 0.4 * centro;
      const minY = Math.min(...vivos.map((a) => a.y));
      const maxY = Math.max(...vivos.map((a) => a.y));
      // Lo que tiene que caber: del último vivo al líder, con margen.
      const alto = VISTA.abajo - VISTA.arriba - 220;
      objetivoZoom = clamp(alto / (maxY - minY + 300), VISTA.zoomMin, VISTA.zoomMax);
      // Que el líder no se salga por arriba ni el último por abajo.
      const arriba = (VISTA.focoY - VISTA.arriba - 80) / objetivoZoom;
      const abajo = (VISTA.abajo - VISTA.focoY - 60) / objetivoZoom;
      objetivoY = clamp(objetivoY, maxY - arriba, minY + abajo);
    }
    const k = 1 - Math.exp(-dt * 2.2);
    this.y += (objetivoY - this.y) * k;
    this.zoom += (objetivoZoom - this.zoom) * (1 - Math.exp(-dt * 1.2));
  }

  /** Mundo -> pantalla. x en carriles, y en unidades de pista. */
  aPantalla(x, y, carriles) {
    return {
      x: VISTA.centroX + (x - carriles / 2) * VISTA.anchoCarril * this.zoom,
      y: VISTA.focoY - (y - this.y) * this.zoom,
    };
  }

  /** Rango de y del mundo visible. */
  rangoVisible() {
    return {
      desde: this.y - (VISTA.abajo - VISTA.focoY) / this.zoom - 200,
      hasta: this.y + (VISTA.focoY - VISTA.arriba) / this.zoom + 200,
    };
  }
}
