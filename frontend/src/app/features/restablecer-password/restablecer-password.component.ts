import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PoliticaPasswordService } from '../../core/services/politicaPassword.service';
import { PoliticaPassword } from '../../core/models/models';
import { passwordsCoincidenValidator, construirValidadorPolitica, generarPasswordSegunPolitica } from '../../core/utils/password.util';
import { PasswordChecklistComponent } from '../../core/components/password-checklist/password-checklist.component';

// Pantalla publica (fuera del authGuard): se llega aqui desde el enlace
// que manda POST /auth/forgot-password por correo, con ?token=... en la URL.
@Component({
  selector: 'app-restablecer-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PasswordChecklistComponent],
  templateUrl: './restablecer-password.component.html',
  styleUrl: './restablecer-password.component.css',
})
export class RestablecerPasswordComponent implements OnInit {
  token: string | null = null;
  cargando = signal(false);
  error = signal<string | null>(null);
  exito = signal(false);
  politica = signal<PoliticaPassword | null>(null);
  verPasswordNueva = signal(false);
  verPasswordConfirmar = signal(false);
  passwordGenerada = signal(false);

  form = this.fb.group(
    {
      password_nueva: ['', [Validators.required]],
      password_confirmar: ['', Validators.required],
    },
    { validators: passwordsCoincidenValidator }
  );

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private politicaPasswordSrv: PoliticaPasswordService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.error.set('El enlace no es valido. Solicita uno nuevo desde la pantalla de inicio de sesion.');
    }
  }

  ngOnInit(): void {
    this.politicaPasswordSrv.obtener().subscribe({
      next: (p) => {
        this.politica.set(p);
        this.form.get('password_nueva')?.addValidators(construirValidadorPolitica(p));
        this.form.get('password_nueva')?.updateValueAndValidity();
      },
      error: () => {},
    });
  }

  generarPassword(): void {
    const pol = this.politica();
    if (!pol) return;
    const nueva = generarPasswordSegunPolitica(pol);
    this.form.patchValue({ password_nueva: nueva, password_confirmar: nueva });
    this.form.get('password_nueva')?.markAsTouched();
    this.form.get('password_confirmar')?.markAsTouched();
    this.verPasswordNueva.set(true);
    this.verPasswordConfirmar.set(true);
    this.passwordGenerada.set(true);
    navigator.clipboard?.writeText(nueva).catch(() => {});
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
