import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Endpoints publicos/de auth propios: un 401 aqui nunca debe disparar un
// intento de refresh (no tiene sentido "renovar" un login que fallo, ni
// reintentar el propio /auth/refresh si el refresh token ya no sirve).
const RUTAS_SIN_REINTENTO = ['/auth/login', '/auth/refresh', '/auth/2fa/verify-login', '/auth/session-config', '/auth/pista'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;

  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const esRutaExcluida = RUTAS_SIN_REINTENTO.some((ruta) => req.url.includes(ruta));

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // El access token dura poco a proposito (ver JWT_EXPIRES_IN) -- si
      // vencio a mitad de una sesion activa, se intenta renovar una sola
      // vez con el refresh token y se reintenta la peticion original.
      if (err.status === 401 && !esRutaExcluida && auth.refreshToken) {
        return auth.refrescarToken().pipe(
          switchMap((res) => {
            const reintento = req.clone({ setHeaders: { Authorization: `Bearer ${res.token}` } });
            return next(reintento);
          }),
          catchError((errRefresh) => {
            auth.logout();
            router.navigate(['/login']);
            return throwError(() => errRefresh);
          })
        );
      }

      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
