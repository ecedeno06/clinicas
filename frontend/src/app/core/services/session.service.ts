import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';

// Cierra la sesion automaticamente tras un periodo de inactividad del
// usuario (sin clicks/teclas/scroll), avisando unos minutos antes con una
// cuenta regresiva. Los limites vienen del backend (GET /auth/session-config,
// configurables por env) -- ver DISENO-AUTENTICACION-2FA-SESION.md.
@Injectable({ providedIn: 'root' })
export class SessionService {
  private inicializado = false;

  private limiteInactividadMs = 15 * 60 * 1000;
  private avisoAntesMs = 2 * 60 * 1000;

  private readonly eventosActividad = ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'];
  private readonly manejadorActividad = () => this.reiniciarTemporizador();

  private timerAviso: ReturnType<typeof setTimeout> | null = null;
  private timerCierre: ReturnType<typeof setTimeout> | null = null;
  private timerCountdown: ReturnType<typeof setInterval> | null = null;
  private expiraEn = 0;

  mostrarAviso = signal(false);
  countdownTexto = signal('00:00');

  constructor(private auth: AuthService) {}

  init(): void {
    if (this.inicializado) return;
    this.inicializado = true;
    this.mostrarAviso.set(false);
    this.countdownTexto.set('00:00');

    this.auth.sessionConfig().subscribe({
      next: (config) => {
        this.limiteInactividadMs = config.inactivityLimitMinutes * 60 * 1000;
        this.avisoAntesMs = config.warningBeforeMinutes * 60 * 1000;
        this.reiniciarTemporizador();
      },
      // Si el backend no responde, se sigue con los valores por defecto
      // en vez de dejar la sesion sin ningun control de inactividad.
      error: () => this.reiniciarTemporizador(),
    });

    this.eventosActividad.forEach((evento) =>
      document.addEventListener(evento, this.manejadorActividad, { passive: true })
    );
  }

  detener(): void {
    this.inicializado = false;
    this.eventosActividad.forEach((evento) => document.removeEventListener(evento, this.manejadorActividad));
    this.limpiarTemporizadores();
  }

  extenderSesion(): void {
    this.mostrarAviso.set(false);
    this.reiniciarTemporizador();
  }

  cerrarPorInactividad(): void {
    this.limpiarTemporizadores();
    this.mostrarAviso.set(false);
    this.auth.logout('inactividad');
  }

  private reiniciarTemporizador(): void {
    // Una vez mostrado el aviso, solo "Continuar trabajando" (extenderSesion)
    // lo reinicia -- si no, cualquier movimiento de mouse detras del modal
    // lo cerraria sin que el usuario llegue a verlo.
    if (this.mostrarAviso()) return;

    this.limpiarTemporizadores();
    this.expiraEn = Date.now() + this.limiteInactividadMs;

    this.timerAviso = setTimeout(() => {
      this.mostrarAviso.set(true);
      this.iniciarCountdown();
    }, Math.max(this.limiteInactividadMs - this.avisoAntesMs, 0));

    this.timerCierre = setTimeout(() => this.cerrarPorInactividad(), this.limiteInactividadMs);
  }

  private iniciarCountdown(): void {
    this.actualizarCountdown();
    this.timerCountdown = setInterval(() => this.actualizarCountdown(), 1000);
  }

  private actualizarCountdown(): void {
    const restanteMs = this.expiraEn - Date.now();
    if (restanteMs <= 0) {
      this.countdownTexto.set('00:00');
      if (this.timerCountdown) clearInterval(this.timerCountdown);
      return;
    }
    const totalSegundos = Math.floor(restanteMs / 1000);
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    this.countdownTexto.set(`${pad(minutos)}:${pad(segundos)}`);
  }

  private limpiarTemporizadores(): void {
    if (this.timerAviso) clearTimeout(this.timerAviso);
    if (this.timerCierre) clearTimeout(this.timerCierre);
    if (this.timerCountdown) clearInterval(this.timerCountdown);
    this.timerAviso = null;
    this.timerCierre = null;
    this.timerCountdown = null;
  }
}
