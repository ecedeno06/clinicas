export const HORAS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
export const MINUTOS_60 = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export interface Partes12 {
  h: number;
  m: string;
  periodo: 'a.m.' | 'p.m.';
}

export function partes12(hora24: string | null | undefined): Partes12 {
  const [hh, mm] = (hora24 || '00:00').split(':').map(Number);
  const periodo: 'a.m.' | 'p.m.' = hh >= 12 ? 'p.m.' : 'a.m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { h: h12, m: (mm || 0).toString().padStart(2, '0'), periodo };
}

export function combinar12(h: number, m: string, periodo: 'a.m.' | 'p.m.'): string {
  let h24 = h % 12;
  if (periodo === 'p.m.') h24 += 12;
  return `${h24.toString().padStart(2, '0')}:${m}`;
}

export function formatoAmPm(hora24: string): string {
  const { h, m, periodo } = partes12(hora24);
  return `${h}:${m} ${periodo}`;
}
