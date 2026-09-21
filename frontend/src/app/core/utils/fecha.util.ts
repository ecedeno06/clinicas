// "Hoy" en formato YYYY-MM-DD segun la fecha LOCAL del navegador.
//
// Nunca usar new Date().toISOString().substring(0, 10) para esto:
// toISOString() convierte a UTC primero, y en cualquier zona horaria con
// offset negativo (todo el continente americano, incluido Panama en
// UTC-5) eso da la fecha de MANANA durante las horas de la noche local
// (ej. de 7pm a medianoche en UTC-5, cuando en UTC ya es el dia
// siguiente).
export function hoyISO(): string {
  const d = new Date();
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// "Hace N dias" (fecha LOCAL, mismo criterio que hoyISO) -- para
// defaults de filtros de rango como el de Auditoria.
export function haceDiasISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// dd/MMM/aaaa (ej. "21/sep/2001") -- usado en columnas de fecha de
// nacimiento, donde el mes abreviado se lee mas rapido que el numero.
export function formatoFechaDiaMesAbrAnio(iso: string | null | undefined): string {
  if (!iso) return '';
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${MESES_CORTO[Number(mes) - 1]}/${anio}`;
}
