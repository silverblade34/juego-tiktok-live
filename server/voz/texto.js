// XTTS conserva mejor la voz con unidades cortas que con varios remates en una sola pasada.
export function segmentarVoz(texto, maxCaracteres, minCaracteres = 0) {
  const oraciones = texto.match(/[^.!?;…]+(?:[.!?;…]+|$)/gu) ?? [];
  const segmentos = [];
  for (const oracion of oraciones) {
    const palabras = oracion.trim().split(/\s+/u);
    let actual = '';
    for (const palabra of palabras) {
      if (actual && actual.length + palabra.length + 1 > maxCaracteres) {
        segmentos.push(actual); actual = '';
      }
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
    if (actual) segmentos.push(actual);
  }
  const resultado = [];
  let pendiente = '';
  for (const segmento of segmentos.filter(s => /[\p{L}\p{N}]/u.test(s))) {
    const unido = pendiente ? `${pendiente} ${segmento}` : segmento;
    if (pendiente && unido.length > maxCaracteres) resultado.push(pendiente);
    pendiente = pendiente && unido.length > maxCaracteres ? segmento : unido;
    if (pendiente.length >= minCaracteres) { resultado.push(pendiente); pendiente = ''; }
  }
  if (pendiente) {
    const ultimo = resultado.at(-1);
    if (ultimo && ultimo.length + pendiente.length + 1 <= maxCaracteres) resultado[resultado.length-1] += ` ${pendiente}`;
    else resultado.push(pendiente);
  }
  return resultado;
}
