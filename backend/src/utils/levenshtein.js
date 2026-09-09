// Distancia de edicion entre dos strings, usada para rechazar una pista de
// contrasena demasiado parecida a la contrasena real (ver
// PASSWORD_HINT_MAX_SIMILARITY y auth.controller.js#cambiarPassword).
function distancia(a, b) {
  const filas = a.length + 1;
  const columnas = b.length + 1;
  const matriz = Array.from({ length: filas }, () => new Array(columnas).fill(0));

  for (let i = 0; i < filas; i++) matriz[i][0] = i;
  for (let j = 0; j < columnas; j++) matriz[0][j] = j;

  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }
  return matriz[filas - 1][columnas - 1];
}

// Porcentaje de similitud (0-100) entre dos strings, basado en la distancia
// de Levenshtein normalizada por la longitud del mas largo.
function porcentajeSimilitud(a, b) {
  const longitudMaxima = Math.max(a.length, b.length);
  if (longitudMaxima === 0) return 0;
  return (1 - distancia(a, b) / longitudMaxima) * 100;
}

module.exports = { distancia, porcentajeSimilitud };
