// Formato legible de fecha/hora para correos y mensajes salientes del
// backend. "fecha" llega de Postgres (columna date) como un objeto Date
// en UTC medianoche -- se usan los componentes UTC (no locales) para que
// no se corra un dia segun la zona horaria del proceso de Node.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatearFechaLarga(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

// hora: string "HH:MM:SS" o "HH:MM" (columna time de Postgres).
function formatoAmPm(hora) {
  const [horaStr, minutoStr] = String(hora).split(':');
  let horas = parseInt(horaStr, 10);
  const minutos = minutoStr || '00';
  const sufijo = horas >= 12 ? 'p.m.' : 'a.m.';
  horas = horas % 12 || 12;
  return `${horas}:${minutos} ${sufijo}`;
}

module.exports = { formatearFechaLarga, formatoAmPm };
