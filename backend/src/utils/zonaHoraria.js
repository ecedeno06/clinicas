const ZONA_HORARIA_DEFAULT = 'America/Panama';

// Fecha/hora actual como 'YYYY-MM-DDTHH:mm:ss', segun la zona horaria
// indicada -- NO la del servidor (en produccion corre en UTC, distinta de
// la de la clinica).
function ahoraComoTexto(zonaHoraria) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria || ZONA_HORARIA_DEFAULT,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${valores.year}-${valores.month}-${valores.day}T${valores.hour}:${valores.minute}:${valores.second}`;
}

// Compara "fecha" (YYYY-MM-DD) + "horaTexto" (HH:mm) contra el momento actual
// en la zona horaria de la sucursal. Comparacion lexicografica de strings con
// el mismo formato -- valida porque ambos usan ceros a la izquierda.
function esFechaHoraPasada(fecha, horaTexto, zonaHoraria) {
  return `${fecha}T${horaTexto}:00` <= ahoraComoTexto(zonaHoraria);
}

module.exports = { ZONA_HORARIA_DEFAULT, ahoraComoTexto, esFechaHoraPasada };
