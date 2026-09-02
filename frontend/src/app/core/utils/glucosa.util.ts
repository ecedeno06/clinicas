// Clasificacion estandar de glucosa en sangre (mg/dL), segun los rangos
// de referencia de la American Diabetes Association (ADA) para glucosa
// en ayunas.
export function clasificarGlucosa(glucosa: number): { etiqueta: string; clase: string } {
  if (glucosa < 54) return { etiqueta: 'Hipoglucemia severa', clase: 'badge-red' };
  if (glucosa < 70) return { etiqueta: 'Baja (hipoglucemia)', clase: 'badge-amber' };
  if (glucosa <= 99) return { etiqueta: 'Normal', clase: 'badge-green' };
  if (glucosa <= 125) return { etiqueta: 'Elevada (prediabetes)', clase: 'badge-amber' };
  if (glucosa <= 300) return { etiqueta: 'Alta (diabetes)', clase: 'badge-red' };
  return { etiqueta: 'Muy alta (hiperglucemia severa)', clase: 'badge-red' };
}
