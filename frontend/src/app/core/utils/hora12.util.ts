export const HORAS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
export const MINUTOS_60 = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export interface Partes12 {
  h: number;
  m: string;
  periodo: 'a.m.' | 'p.m.';
}

export function partes12(hora24: string | null | undefined): Partes12 {
  const [hh, mm] = (hora24 || '00:00').split(':').map(Number);
  // 24:xx representa el FIN del dia (ej. una cita o un bloque de horario
  // que termina justo a medianoche, ver combinarHoraFin12) -- se lee
  // "12:xx a.m.", nunca "12:xx p.m." como daria el calculo de abajo.
  // hora_inicio nunca llega a valer 24:xx (violaria hora_fin >
  // hora_inicio), asi que esta lectura es siempre correcta sin importar
  // de que campo venga el valor.
  if (hh >= 24) return { h: 12, m: (mm || 0).toString().padStart(2, '0'), periodo: 'a.m.' };
  const periodo: 'a.m.' | 'p.m.' = hh >= 12 ? 'p.m.' : 'a.m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { h: h12, m: (mm || 0).toString().padStart(2, '0'), periodo };
}

export function combinar12(h: number, m: string, periodo: 'a.m.' | 'p.m.'): string {
  let h24 = h % 12;
  if (periodo === 'p.m.') h24 += 12;
  return `${h24.toString().padStart(2, '0')}:${m}`;
}

// Para un campo de hora de FIN (hora_fin de una cita o de un bloque de
// horario): elegir "12:00 a.m." solo tiene sentido como fin del dia
// (24:00), nunca como su inicio (00:00) -- no puede terminar en el mismo
// instante en que empezaria el dia. Postgres acepta 24:00 como valor
// valido de time, mayor que cualquier hora_inicio del mismo dia, asi que
// no hace falta partir en dos registros algo que termina justo a
// medianoche (solo lo que de verdad se extiende MAS ALLA, ej. un turno
// 11pm-3am). hora_inicio sigue usando combinar12() a secas.
export function combinarHoraFin12(h: number, m: string, periodo: 'a.m.' | 'p.m.'): string {
  if (h === 12 && m === '00' && periodo === 'a.m.') return '24:00';
  return combinar12(h, m, periodo);
}

export function formatoAmPm(hora24: string): string {
  const { h, m, periodo } = partes12(hora24);
  return `${h}:${m} ${periodo}`;
}
