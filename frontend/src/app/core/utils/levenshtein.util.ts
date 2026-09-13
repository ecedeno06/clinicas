// Copia exacta de backend/src/utils/levenshtein.js (funcion pura, sin
// dependencias) -- usada para replicar en el frontend la misma regla de
// "la pista no puede parecerse demasiado a la contrasena" que ya aplica
// el backend, y mostrar el error antes de enviar el formulario.

function distancia(a: string, b: string): number {
  const filas = a.length + 1;
  const columnas = b.length + 1;
  const matriz: number[][] = Array.from({ length: filas }, () => new Array(columnas).fill(0));

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
export function porcentajeSimilitud(a: string, b: string): number {
  const longitudMaxima = Math.max(a.length, b.length);
  if (longitudMaxima === 0) return 0;
  return (1 - distancia(a, b) / longitudMaxima) * 100;
}
