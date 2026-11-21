// Paleta y layout ÚNICOS del overlay. Cambia colores/posiciones aquí.

export const ANCHO = 1080;
export const ALTO = 1920;

export const P = {
  contorno: '#1d1530',
  texto: '#fff8e7',
  blanco: '#ffffff',
  acento: '#ffd23f',
  peligro: '#ff3b5c',
  ok: '#3ddc84',
  info: '#4cc3ff',

  // fondo
  cieloA: '#3fb6ff',
  cieloB: '#ffe3a3',
  sol: '#ffd23f',
  nube: '#ffffff',
  edificios: ['#7d6bd6', '#5aa9e6', '#f28fad', '#6cc3a0', '#f4a259', '#9b8de8'],
  ventana: 'rgba(255,255,255,0.35)',
  pista: '#5d6070',
  vereda: '#b9bcc6',
  veredaLinea: '#9a9daa',
  bordillo: '#f5d000',

  // garita
  garitaPared: '#3fb8af',
  garitaParedOscura: '#2c8f88',
  garitaTecho: '#e84a5f',
  garitaTechoOscuro: '#b7344a',
  letrero: '#2a3b8f',
  vidrio: '#bfe9ff',
  vidrioBrillo: 'rgba(255,255,255,0.55)',
  poste: '#d9d9e3',
  senal: '#1f9d55',

  // Don Lucho
  piel: '#c98d5b',
  pielSombra: '#a86f42',
  pielRubor: '#e25b4b',
  pelo: '#2b1d14',
  gorra: '#e63946',
  gorraOscura: '#a4161a',
  polo: '#f6f3e8',
  poloSombra: '#d8d3c2',
  chaleco: '#ff7b1c',
  reflectivo: '#e9f5f2',
  pantalon: '#2f4a8a',
  pantalonOscuro: '#22386c',
  zapato: '#2a2a2a',
  boca: '#5a1a1a',
  lengua: '#e86a6a',
  ojo: '#ffffff',
  pupila: '#1d1530',
  silla: '#e23d3d',
  sillaOscura: '#b02525',
  mesa: '#a0673a',
  mesaOscura: '#7a4a25',
  micro: '#2d2d38',
  microRejilla: '#77778a',
  manta: ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#264653', '#f28fad'],
  agua: '#59c3ff',
  aguaClara: '#bdeaff',
  moco: 'rgba(190,235,255,0.55)',
  taza: '#ffffff',
  cafe: '#6b3e1f',
  balde: '#3a86ff',
  baldeOscuro: '#2667cc',
  corneta: '#ffbe0b',
  cornetaOscura: '#d49a00',

  // HUD
  hudFondo: 'rgba(22,14,48,0.86)',
  hudFondoClaro: 'rgba(255,255,255,0.94)',
  hudBorde: '#ffd23f',
  burbuja: '#ffffff',
  burbujaDormido: '#e8ecff',
  autos: ['#e63946', '#3a86ff', '#ffbe0b', '#2ec4b6', '#ff70a6', '#8338ec', '#fb5607', '#06d6a0',
    '#118ab2', '#ef476f', '#a7c957', '#ff9f1c'],
};

/** Posiciones de los bloques en el canvas 1080x1920. */
export const L = {
  barraAlto: 190,
  pisoY: 1735,
  lucho: { x: 470, y: 1505, escala: 1.2 },
  garita: { x: 300, y: 1130, ancho: 660, techoY: 1085 },
  burbuja: { x: 540, abajo: 1105, anchoMax: 500 },
  paciencia: { x: 72, y: 1210, ancho: 76, alto: 450 },
  leyenda: { y: 1752, alto: 150, margen: 24 },
  centro: { arriba: 215, abajo: 870 },
};
