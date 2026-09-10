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

  // Login detenido esperando el codigo de la app autenticadora.
  usuarioId2FA = signal<string | null>(null);
  codeForm = this.fb.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });

  // "Olvidaste tu pista" -- consulta publica antes de autenticarse.
  cargandoPista = signal(false);
  pista = signal<string | null>(null);
  pistaError = signal<string | null>(null);

  // "Olvidaste tu contrasena" -- envia un enlace de restablecimiento por
  // correo. mensajeOlvido siempre es el mensaje generico del backend
  // (nunca revela si el correo existe), tanto en exito como en error de
  // formato -- solo un fallo real de red muestra algo distinto.
  mostrarOlvidoPassword = signal(false);
  emailOlvidoForm = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  cargandoOlvido = signal(false);
  mensajeOlvido = signal<string | null>(null);

  // "Perdi acceso a mi 2FA" -- desde la pantalla que pide el codigo de la
  // app autenticadora. usuarioId ya viene validado por contrasena (lo puso
  // el login al detectar 2FA activo), asi que no hace falta pedir el email.
  // mensajeRecuperacion2FA siempre es el mensaje generico del backend.
  mostrarRecuperacion2FA = signal(false);
  cargandoRecuperacion2FA = signal(false);
  mensajeRecuperacion2FA = signal<string | null>(null);

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
        if ('requiere2FA' in res) {
          this.usuarioId2FA.set(res.usuarioId);
          this.codeForm.reset();
        } else if ('requiereSeleccionEmpresa' in res) {
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

  enviarCodigo2FA(): void {
    if (this.codeForm.invalid || !this.usuarioId2FA()) return;
    this.cargando.set(true);
    this.error.set(null);
    this.auth.verificar2FA(this.usuarioId2FA()!, this.codeForm.getRawValue().code!).subscribe({
      next: (res) => {
        this.cargando.set(false);
        if ('requiereSeleccionEmpresa' in res) {
          this.usuarioId2FA.set(null);
          this.empresasParaElegir.set(res.empresas);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'Codigo invalido');
      },
    });
  }

  cancelar2FA(): void {
    this.usuarioId2FA.set(null);
    this.codeForm.reset();
    this.error.set(null);
    this.mostrarRecuperacion2FA.set(false);
    this.mensajeRecuperacion2FA.set(null);
  }

  abrirRecuperacion2FA(): void {
    this.mostrarRecuperacion2FA.set(true);
    this.mensajeRecuperacion2FA.set(null);
  }

  cerrarRecuperacion2FA(): void {
    this.mostrarRecuperacion2FA.set(false);
    this.mensajeRecuperacion2FA.set(null);
  }

  enviarRecuperacion2FA(): void {
    if (!this.usuarioId2FA()) return;
    this.cargandoRecuperacion2FA.set(true);
    this.mensajeRecuperacion2FA.set(null);
    this.auth.solicitarRecuperacion2FA(this.usuarioId2FA()!).subscribe({
      next: (res) => {
        this.cargandoRecuperacion2FA.set(false);
        this.mensajeRecuperacion2FA.set(res.mensaje);
      },
      error: (err) => {
        this.cargandoRecuperacion2FA.set(false);
        this.mensajeRecuperacion2FA.set(err?.error?.mensaje || 'No se pudo procesar la solicitud. Intenta de nuevo.');
      },
    });
  }

  verPista(): void {
    const email = this.form.getRawValue().email;
    if (!email) {
      this.pistaError.set('Escribe tu correo primero.');
      return;
    }
    this.pista.set(null);
    this.pistaError.set(null);
    this.cargandoPista.set(true);
    this.auth.obtenerPista(email).subscribe({
      next: (res) => {
        this.cargandoPista.set(false);
        this.pista.set(res.pista);
      },
      error: (err) => {
        this.cargandoPista.set(false);
        this.pistaError.set(err?.error?.mensaje || 'No se pudo obtener la pista');
      },
    });
  }

  abrirOlvidoPassword(): void {
    this.mostrarOlvidoPassword.set(true);
    this.emailOlvidoForm.reset({ email: this.form.getRawValue().email || '' });
    this.mensajeOlvido.set(null);
  }

  cerrarOlvidoPassword(): void {
    this.mostrarOlvidoPassword.set(false);
    this.mensajeOlvido.set(null);
  }

  enviarOlvidoPassword(): void {
    if (this.emailOlvidoForm.invalid) return;
    this.cargandoOlvido.set(true);
    this.mensajeOlvido.set(null);
    this.auth.olvidarPassword(this.emailOlvidoForm.getRawValue().email!).subscribe({
      next: (res) => {
        this.cargandoOlvido.set(false);
        this.mensajeOlvido.set(res.mensaje);
      },
      error: (err) => {
        this.cargandoOlvido.set(false);
        this.mensajeOlvido.set(err?.error?.mensaje || 'No se pudo procesar la solicitud. Intenta de nuevo.');
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
