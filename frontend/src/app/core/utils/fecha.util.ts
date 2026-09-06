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
