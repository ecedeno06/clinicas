import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { SessionService } from '../../core/services/session.service';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';
import { InactividadComponent } from '../../core/components/inactividad/inactividad.component';
import { SeguridadComponent } from '../seguridad/seguridad.component';
import { passwordsCoincidenValidator } from '../../core/utils/password.util';

const SIDEBAR_STORAGE_KEY = 'clinica_sidebar_colapsado';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterOutlet, RouterLink, RouterLinkActive, SelectorFotoComponent, InactividadComponent, SeguridadComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent implements OnInit, OnDestroy {
  anioActual = new Date().getFullYear();
  menuAbierto = signal(false);
  panelPasswordAbierto = signal(false);
  panelSeguridadAbierto = signal(false);
  verPasswordNueva = signal(false);
  verPasswordConfirmar = signal(false);
  // Un admin marco esta cuenta con debe_cambiar_password (al crearla o al
  // resetearle la contrasena) -- se fuerza el formulario, sin poder
  // cancelarlo, hasta que el usuario ponga una contrasena propia.
  cambioPasswordObligatorio = computed(() => !!this.auth.usuario()?.debe_cambiar_password);
  reportesAbierto = signal(false);
  sidebarColapsado = signal(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');

  // Cronometro de tiempo conectado (HH:MM:SS desde que se emitio el JWT
  // final), mostrado en el header. Puramente informativo -- no tiene
  // relacion con la expiracion real del token.
  tiempoConectado = signal('00:00:00');
  private timerTiempoConectado: ReturnType<typeof setInterval> | null = null;

  passwordForm = this.fb.group(
    {
      password_actual: ['', Validators.required],
      password_nueva: ['', [Validators.required, Validators.minLength(6)]],
      password_confirmar: ['', Validators.required],
      pista: [''],
    },
    { validators: passwordsCoincidenValidator }
  );

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public sessionService: SessionService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.sessionService.init();

    const inicio = this.auth.sessionStart ?? Date.now();
    this.actualizarTiempoConectado(inicio);
    this.timerTiempoConectado = setInterval(() => this.actualizarTiempoConectado(inicio), 1000);

    // Trae base_datos (no viene en el token del login) para mostrarla en el
    // header -- evita confundir en que entorno se esta trabajando
    // (ej. clinica_medica local vs neondb en la nube).
    this.auth.obtenerMe().subscribe({ error: () => {} });
  }

  ngOnDestroy(): void {
    this.sessionService.detener();
    if (this.timerTiempoConectado) clearInterval(this.timerTiempoConectado);
  }

  private actualizarTiempoConectado(inicio: number): void {
    const totalSegundos = Math.floor((Date.now() - inicio) / 1000);
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    this.tiempoConectado.set(`${pad(horas)}:${pad(minutos)}:${pad(segundos)}`);
  }

  toggleSidebar(): void {
    const nuevo = !this.sidebarColapsado();
    this.sidebarColapsado.set(nuevo);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, nuevo ? '1' : '0');
  }

  iniciales(): string {
    const nombre = this.auth.usuario()?.nombre || '';
    return nombre
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }

  onFotoPerfilCambiada(base64: string): void {
    this.auth.actualizarAvatar(base64).subscribe({
      next: () => {},
      error: (err) => alert(err?.error?.mensaje || 'No se pudo actualizar la foto de perfil'),
    });
  }

  eliminarFotoPerfil(): void {
    this.menuAbierto.set(false);
    if (!confirm('Eliminar tu foto de perfil?')) return;
    this.auth.actualizarAvatar(null).subscribe({
      next: () => {},
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la foto de perfil'),
    });
  }

  // El selector de foto ya pregunta su propia confirmacion antes de emitir
  // esto -- no se vuelve a confirmar aqui (a diferencia de
  // eliminarFotoPerfil(), llamado directo desde el item de menu).
  onFotoPerfilEliminada(): void {
    this.auth.actualizarAvatar(null).subscribe({
      next: () => {},
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la foto de perfil'),
    });
  }

  abrirCambioPassword(): void {
    this.menuAbierto.set(false);
    this.passwordForm.reset();
    this.verPasswordNueva.set(false);
    this.verPasswordConfirmar.set(false);
    this.panelPasswordAbierto.set(true);
  }

  cerrarCambioPassword(): void {
    if (this.cambioPasswordObligatorio()) return;
    this.panelPasswordAbierto.set(false);
  }

  abrirSeguridad(): void {
    this.menuAbierto.set(false);
    this.panelSeguridadAbierto.set(true);
  }

  cerrarSeguridad(): void { this.panelSeguridadAbierto.set(false); }

  guardarPassword(): void {
    if (this.passwordForm.invalid) return;
    const { password_actual, password_nueva, pista } = this.passwordForm.getRawValue();
    // Si se deja en blanco, no se toca la pista ya guardada (undefined).
    const pistaTexto = pista?.trim() ? pista.trim() : undefined;
    this.auth.cambiarPassword(password_actual!, password_nueva!, pistaTexto).subscribe({
      next: () => {
        this.cerrarCambioPassword();
        alert('Contrasena actualizada correctamente.');
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo cambiar la contrasena'),
    });
  }
}
