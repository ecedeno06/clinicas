import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, Validators, AbstractControl } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { redimensionarImagen } from '../../core/utils/imagen.util';

const SIDEBAR_STORAGE_KEY = 'clinica_sidebar_colapsado';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent {
  anioActual = new Date().getFullYear();
  menuAbierto = signal(false);
  panelPasswordAbierto = signal(false);
  sidebarColapsado = signal(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');

  passwordForm = this.fb.group(
    {
      password_actual: ['', Validators.required],
      password_nueva: ['', [Validators.required, Validators.minLength(6)]],
      password_confirmar: ['', Validators.required],
    },
    { validators: passwordsCoincidenValidator }
  );

  constructor(public auth: AuthService, public theme: ThemeService, private fb: FormBuilder) {}

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

  onArchivoSeleccionado(event: Event): void {
    this.menuAbierto.set(false);
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      alert('Selecciona un archivo de imagen valido.');
      return;
    }

    redimensionarImagen(archivo, 200).then((base64) => {
      this.auth.actualizarAvatar(base64).subscribe({
        next: () => {},
        error: (err) => alert(err?.error?.mensaje || 'No se pudo actualizar la foto de perfil'),
      });
    });

    input.value = '';
  }

  eliminarFotoPerfil(): void {
    this.menuAbierto.set(false);
    if (!confirm('Eliminar tu foto de perfil?')) return;
    this.auth.actualizarAvatar(null).subscribe({
      next: () => {},
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la foto de perfil'),
    });
  }

  abrirCambioPassword(): void {
    this.menuAbierto.set(false);
    this.passwordForm.reset();
    this.panelPasswordAbierto.set(true);
  }

  cerrarCambioPassword(): void { this.panelPasswordAbierto.set(false); }

  guardarPassword(): void {
    if (this.passwordForm.invalid) return;
    const { password_actual, password_nueva } = this.passwordForm.getRawValue();
    this.auth.cambiarPassword(password_actual!, password_nueva!).subscribe({
      next: () => {
        this.cerrarCambioPassword();
        alert('Contrasena actualizada correctamente.');
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo cambiar la contrasena'),
    });
  }
}

function passwordsCoincidenValidator(group: AbstractControl): ValidationErrors | null {
  const nueva = group.get('password_nueva')?.value;
  const confirmar = group.get('password_confirmar')?.value;
  if (!nueva || !confirmar) return null;
  return nueva === confirmar ? null : { noCoincide: true };
}
