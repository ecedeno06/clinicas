import { AbstractControl, ValidationErrors } from '@angular/forms';

// Validador de FormGroup: exige que password_nueva y password_confirmar
// coincidan. Usado en el drawer de "Cambiar contrasena" y en la pantalla
// publica de "Restablecer contrasena".
export function passwordsCoincidenValidator(group: AbstractControl): ValidationErrors | null {
  const nueva = group.get('password_nueva')?.value;
  const confirmar = group.get('password_confirmar')?.value;
  if (!nueva || !confirmar) return null;
  return nueva === confirmar ? null : { noCoincide: true };
}
