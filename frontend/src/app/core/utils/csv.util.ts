// Exporta filas a un archivo .csv que Excel abre directamente. Se usa
// un BOM UTF-8 al inicio porque Excel, sin el, interpreta el archivo con
// la codificacion del sistema y rompe los acentos/enies.
const BOM_UTF8 = '﻿';

function escaparCeldaCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function exportarCsv(nombreArchivo: string, encabezados: string[], filas: unknown[][]): void {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(escaparCeldaCsv).join(','));
  // "sep=," como primera linea le indica a Excel el separador a usar sin
  // importar la configuracion regional de Windows -- sin esto, con
  // Windows en español (donde el separador de listas suele ser ";"),
  // Excel interpreta todo el archivo como una sola columna.
  const contenido = BOM_UTF8 + 'sep=,\r\n' + lineas.join('\r\n');

  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}
