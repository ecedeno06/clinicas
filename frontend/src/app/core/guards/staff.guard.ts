import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Protege las pantallas de gestion clinica STAFF-ONLY de los roles
// 'paciente' y 'doctor' -- ninguno de los dos deberia ver Pacientes,
// Doctores, Usuarios, etc. Cada uno se redirige a su propio portal en vez
// de dejarlo ver una pantalla a medio cargar (403s). La proteccion real
// es la del backend (requireRol en cada router de staff); esto es solo
// UI. "Citas" es la unica pantalla de staff que un doctor SI puede ver --
// esa usa citasGuard (mas permisivo), no este.
export const staffGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const rol = auth.usuario()?.rol;
  if (rol === 'paciente') {
    router.navigate(['/portal/perfil']);
    return false;
  }
  if (rol === 'doctor') {
    router.navigate(['/portal-doctor/perfil']);
    return false;
  }
  return true;
};
