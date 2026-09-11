import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Usuario } from '../../core/models/models';

type Paso = 'inicial' | 'enrolando' | 'desactivando';

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './seguridad.component.html',
  styleUrl: './seguridad.component.css',
})
export class SeguridadComponent implements OnInit {
  usuario = signal<Usuario | null>(null);
  paso = signal<Paso>('inicial');
  cargando = signal(false);
  error = signal<string | null>(null);

  // Enrolamiento: secreto + QR generados por el backend, pendientes de
  // confirmar con un codigo antes de guardarse (setup2FA no persiste nada).
  secretoTemporal = signal<string | null>(null);
  qrTemporal = signal<string | null>(null);

  codeForm = this.fb.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  // Un solo FormGroup para el paso de enrolamiento (codigo + frase-reto):
  // dos FormGroup hermanos bajo el mismo <form> daban problemas de
  // deteccion de validez en el template. frase_reto es un segundo secreto,
  // independiente de la contrasena, exigido para activar el 2FA -- siempre
  // en blanco, nunca se autocompleta con una anterior (ver
  // auth.service.ts#enable2FA).
  enrolarForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    frase_reto: ['', [Validators.required, Validators.minLength(4)]],
  });

  constructor(private fb: FormBuilder, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargarEstado();
  }

  cargarEstado(): void {
    this.auth.obtenerMe().subscribe({
      next: (u) => this.usuario.set(u),
      error: (err) => this.error.set(err?.error?.mensaje || 'No se pudo cargar el estado de seguridad'),
    });
  }

  iniciarEnrolamiento(): void {
    this.error.set(null);
    this.cargando.set(true);
    this.auth.setup2FA().subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.secretoTemporal.set(res.secret);
        this.qrTemporal.set(res.qrCode);
        this.enrolarForm.reset();
        this.paso.set('enrolando');
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo iniciar el enrolamiento');
      },
    });
  }

  confirmarEnrolamiento(): void {
    if (this.enrolarForm.invalid || !this.secretoTemporal()) return;
    this.error.set(null);
    this.cargando.set(true);
    const { code, frase_reto } = this.enrolarForm.getRawValue();
    this.auth.enable2FA(this.secretoTemporal()!, code!, frase_reto!).subscribe({
      next: () => {
        this.cargando.set(false);
        this.cancelarEnrolamiento();
        this.cargarEstado();
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'Codigo invalido');
      },
    });
  }

  cancelarEnrolamiento(): void {
    this.paso.set('inicial');
    this.secretoTemporal.set(null);
    this.qrTemporal.set(null);
    this.enrolarForm.reset();
    this.error.set(null);
  }

  iniciarDesactivacion(): void {
    this.error.set(null);
    this.codeForm.reset();
    this.paso.set('desactivando');
  }

  confirmarDesactivacion(): void {
    if (this.codeForm.invalid) return;
    this.error.set(null);
    this.cargando.set(true);
    this.auth.disable2FA(this.codeForm.getRawValue().code!).subscribe({
      next: () => {
        this.cargando.set(false);
        this.paso.set('inicial');
        this.cargarEstado();
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'Codigo invalido');
      },
    });
  }

  cancelarDesactivacion(): void {
    this.paso.set('inicial');
    this.error.set(null);
  }
}
