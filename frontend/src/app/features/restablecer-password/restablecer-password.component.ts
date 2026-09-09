import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { passwordsCoincidenValidator } from '../../core/utils/password.util';

// Pantalla publica (fuera del authGuard): se llega aqui desde el enlace
// que manda POST /auth/forgot-password por correo, con ?token=... en la URL.
@Component({
  selector: 'app-restablecer-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './restablecer-password.component.html',
  styleUrl: './restablecer-password.component.css',
})
export class RestablecerPasswordComponent {
  token: string | null = null;
  cargando = signal(false);
  error = signal<string | null>(null);
  exito = signal(false);

  form = this.fb.group(
    {
      password_nueva: ['', [Validators.required, Validators.minLength(6)]],
      password_confirmar: ['', Validators.required],
    },
    { validators: passwordsCoincidenValidator }
  );

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.error.set('El enlace no es valido. Solicita uno nuevo desde la pantalla de inicio de sesion.');
    }
  }

  enviar(): void {
    if (this.form.invalid || !this.token) return;
    this.cargando.set(true);
    this.error.set(null);
    this.auth.restablecerPassword(this.token, this.form.getRawValue().password_nueva!).subscribe({
      next: () => {
        this.cargando.set(false);
        this.exito.set(true);
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo restablecer la contrasena');
      },
    });
  }

  irALogin(): void {
    this.router.navigate(['/login']);
  }
}
