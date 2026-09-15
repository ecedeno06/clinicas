import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Citas es la unica pantalla de staff que un doctor SI puede ver (ademas
// de su propio portal) -- a diferencia de staffGuard, no lo redirige.
// Solo bloquea a 'paciente' (mismo motivo que staffGuard: la proteccion
// real es la del backend, esto es solo UI).
export const citasGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.usuario()?.rol === 'paciente') {
    router.navigate(['/portal/perfil']);
    return false;
  }
  return true;
};
