import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Pantalla publica (fuera del authGuard): se llega aqui desde el enlace
// que manda POST /auth/cambiar-email/solicitar al correo NUEVO, con
// ?token=... en la URL. A diferencia de restablecer-password, no pide
// nada al usuario -- confirma el token apenas carga la pagina.
@Component({
  selector: 'app-confirmar-cambio-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './confirmar-cambio-email.component.html',
})
export class ConfirmarCambioEmailComponent implements OnInit {
  cargando = signal(true);
  error = signal<string | null>(null);
  exito = signal(false);

  constructor(private auth: AuthService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.cargando.set(false);
      this.error.set('El enlace no es valido. Solicita el cambio de correo de nuevo desde tu cuenta.');
      return;
    }
    this.auth.confirmarCambioEmail(token).subscribe({
      next: () => {
        this.cargando.set(false);
        this.exito.set(true);
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo confirmar el cambio de correo');
      },
    });
  }

  irALogin(): void {
    this.router.navigate(['/login']);
  }
}
