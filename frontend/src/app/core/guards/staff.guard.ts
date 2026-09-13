import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Protege las pantallas de gestion clinica (staff) de un usuario con rol
// 'paciente' -- lo redirige a su propio portal en vez de dejarlo ver una
// pantalla de staff a medio cargar (403s). La proteccion real es la del
// backend (requireRol en cada router de staff); esto es solo UI.
export const staffGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.usuario()?.rol === 'paciente') {
    router.navigate(['/portal/perfil']);
    return false;
  }
  return true;
};
