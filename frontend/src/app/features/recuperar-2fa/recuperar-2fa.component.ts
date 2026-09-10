import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Pantalla publica (fuera del authGuard): se llega aqui desde el enlace
// que manda POST /auth/2fa/recovery por correo, con ?token=... en la URL.
// Requiere un clic explicito (no se confirma solo al cargar la pagina) para
// que un escaner de correo que "visita" el enlace automaticamente no
// desactive el 2FA sin que el usuario lo pida.
@Component({
  selector: 'app-recuperar-2fa',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './recuperar-2fa.component.html',
  styleUrl: './recuperar-2fa.component.css',
})
export class Recuperar2faComponent {
  token: string | null = null;
  cargando = signal(false);
  error = signal<string | null>(null);
  exito = signal(false);

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.error.set('El enlace no es valido. Solicita uno nuevo desde la pantalla de inicio de sesion.');
    }
  }

  confirmar(): void {
    if (!this.token) return;
    this.cargando.set(true);
    this.error.set(null);
    this.auth.confirmarRecuperacion2FA(this.token).subscribe({
      next: () => {
        this.cargando.set(false);
        this.exito.set(true);
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo desactivar la verificacion en dos pasos');
      },
    });
  }

  irALogin(): void {
    this.router.navigate(['/login']);
  }
}
