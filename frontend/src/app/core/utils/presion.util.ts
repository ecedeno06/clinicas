// Clasificacion clasica de presion arterial (adultos), estilo JNC7:
// 120/80 se considera normal; hipertension etapa 1 empieza en 140/90.
// Se evalua la categoria mas alta entre sistolica y diastolica.
export function clasificarPresion(sistolica: number, diastolica: number): { etiqueta: string; clase: string } {
  if (sistolica < 90 || diastolica < 60) return { etiqueta: 'Baja (hipotension)', clase: 'badge-amber' };
  if (sistolica > 180 || diastolica > 120) return { etiqueta: 'Crisis hipertensiva', clase: 'badge-red' };
  if (sistolica >= 160 || diastolica >= 100) return { etiqueta: 'Hipertension etapa 2', clase: 'badge-red' };
  if (sistolica >= 140 || diastolica >= 90) return { etiqueta: 'Hipertension etapa 1', clase: 'badge-amber' };
  if (sistolica > 120 || diastolica > 80) return { etiqueta: 'Elevada (prehipertension)', clase: 'badge-amber' };
  return { etiqueta: 'Normal', clase: 'badge-green' };
}
