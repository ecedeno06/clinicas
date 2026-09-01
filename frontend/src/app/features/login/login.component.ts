import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { EmpresaSeleccionable } from '../../core/models/models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  cargando = signal(false);
  error = signal<string | null>(null);
  empresasParaElegir = signal<EmpresaSeleccionable[] | null>(null);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  enviar() {
    if (this.form.invalid) return;
    this.cargando.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email!, password!).subscribe({
      next: (res) => {
        this.cargando.set(false);
        if ('requiereSeleccionEmpresa' in res) {
          this.empresasParaElegir.set(res.empresas);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo iniciar sesion');
      },
    });
  }

  elegirEmpresa(empresaId: string) {
    this.cargando.set(true);
    this.error.set(null);
    this.auth.seleccionarEmpresa(empresaId).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo seleccionar la clinica');
      },
    });
  }

  cancelarSeleccion() {
    this.empresasParaElegir.set(null);
    this.error.set(null);
  }
}
