// Clasificacion estandar de IMC (adultos). "Desnutricion" corresponde a
// delgadez severa (IMC < 16) segun la clasificacion de la OMS.
export function clasificarImc(imc: number): { etiqueta: string; clase: string } {
  if (imc < 16) return { etiqueta: 'Desnutricion', clase: 'badge-red' };
  if (imc < 18.5) return { etiqueta: 'Bajo peso', clase: 'badge-amber' };
  if (imc < 25) return { etiqueta: 'Peso normal', clase: 'badge-green' };
  if (imc < 30) return { etiqueta: 'Sobrepeso', clase: 'badge-amber' };
  if (imc < 35) return { etiqueta: 'Obesidad grado I', clase: 'badge-red' };
  if (imc < 40) return { etiqueta: 'Obesidad grado II', clase: 'badge-red' };
  return { etiqueta: 'Obesidad grado III', clase: 'badge-red' };
}
