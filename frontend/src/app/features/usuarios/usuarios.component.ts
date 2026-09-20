import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { UsuariosService } from '../../core/services/usuarios.service';
import { AuthService } from '../../core/services/auth.service';
import { PoliticaPasswordService } from '../../core/services/politicaPassword.service';
import { Usuario, Rol, PoliticaPassword } from '../../core/models/models';
import { TelefonoInputComponent } from '../../core/components/telefono-input/telefono-input.component';
import { PasswordChecklistComponent } from '../../core/components/password-checklist/password-checklist.component';
import { construirValidadorPolitica, generarPasswordSegunPolitica } from '../../core/utils/password.util';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TelefonoInputComponent, PasswordChecklistComponent],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css',
})
export class UsuariosComponent implements OnInit {
  usuarios = signal<Usuario[]>([]);
  panelAbierto = signal(false);
  editando = signal<Usuario | null>(null);
  usuarioExistente = signal<{ nombre: string } | null>(null);

  filtroNombre = signal('');
  filtroEmail = signal('');
  filtroRol = signal('');

  hayFiltros = computed(() => !!(this.filtroNombre() || this.filtroEmail() || this.filtroRol()));

  limpiarFiltros(): void {
    this.filtroNombre.set('');
    this.filtroEmail.set('');
    this.filtroRol.set('');
  }

  usuariosFiltrados = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    const email = this.filtroEmail().trim().toLowerCase();
    const rol = this.filtroRol().trim().toLowerCase();

    return this.usuarios().filter((u) => {
      if (nombre && !(u.nombre ?? '').toLowerCase().includes(nombre)) return false;
      if (email && !u.email.toLowerCase().includes(email)) return false;
      if (rol && !(u.rol ?? '').toLowerCase().includes(rol)) return false;
      return true;
    });
  });

  form = this.fb.group({
    nombre: [''],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    telefono: [''],
    acepta_whatsapp: [false],
    rol: ['recepcionista' as Rol],
    activo: [true],
    es_super_admin: [false],
    acepta_correo_super_admin: [true],
  });

  politica = signal<PoliticaPassword | null>(null);
  verPassword = signal(false);
  passwordGenerada = signal(false);

  constructor(
    private fb: FormBuilder,
    private srv: UsuariosService,
    public auth: AuthService,
    private politicaPasswordSrv: PoliticaPasswordService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.politicaPasswordSrv.obtener().subscribe({
      next: (p) => {
        this.politica.set(p);
        this.form.get('password')?.addValidators(construirValidadorPolitica(p));
        this.form.get('password')?.updateValueAndValidity();
      },
      error: () => {},
    });
  }
  cargar(): void { this.srv.listar().subscribe((data) => this.usuarios.set(data)); }

  // Se incrementa cada vez que se abre el panel (nuevo o editar) para que
  // una respuesta tardia de buscarPorEmail() (si el usuario cierra y
  // reabre el panel mientras esa consulta seguia en curso) no contamine
  // un formulario que ya se reseteo -- ver onEmailBlur().
  private tokenBusquedaEmail = 0;

  abrirNuevo(): void {
    this.tokenBusquedaEmail++;
    this.editando.set(null);
    this.usuarioExistente.set(null);
    this.verPassword.set(false);
    this.passwordGenerada.set(false);
    this.form.reset({ rol: 'recepcionista', activo: true, es_super_admin: false, acepta_correo_super_admin: true });
    // nombre/password no son obligatorios aqui: si el email ya existe en el
    // sistema (otra clinica), el backend solo lo asocia a esta clinica (como
    // recepcionista por defecto; el rol se ajusta despues editando).
    this.panelAbierto.set(true);
  }

  abrirEditar(u: Usuario): void {
    this.tokenBusquedaEmail++;
    this.editando.set(u);
    this.usuarioExistente.set(null);
    this.verPassword.set(false);
    this.passwordGenerada.set(false);
    this.form.reset({ ...u, password: '' });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.panelAbierto.set(true);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  generarPassword(): void {
    const pol = this.politica();
    if (!pol) return;
    const nueva = generarPasswordSegunPolitica(pol);
    this.form.patchValue({ password: nueva });
    this.form.get('password')?.markAsTouched();
    this.verPassword.set(true);
    this.passwordGenerada.set(true);
    navigator.clipboard?.writeText(nueva).catch(() => {});
  }

  onEmailBlur(): void {
    if (this.editando()) return;
    const email = this.form.get('email')?.value;
    if (!email || this.form.get('email')?.invalid) {
      this.usuarioExistente.set(null);
      return;
    }
    const token = ++this.tokenBusquedaEmail;
    this.srv.buscarPorEmail(email).subscribe({
      next: (res) => {
        if (token !== this.tokenBusquedaEmail) return;
        this.usuarioExistente.set(res.existe ? { nombre: res.nombre! } : null);
      },
      error: () => {
        if (token !== this.tokenBusquedaEmail) return;
        this.usuarioExistente.set(null);
      },
    });
  }

  guardar(): void {
    if (this.form.invalid) return;
    const data: any = { ...this.form.getRawValue() };
    if (!data.password) delete data.password;
    if (this.usuarioExistente()) { delete data.nombre; delete data.password; }

    const actual = this.editando();
    // rol_actual: cual de sus roles de staff en esta clinica se esta
    // editando -- solo importa si tiene mas de uno (ej. admin Y doctor a
    // la vez); el backend lo ignora si no hace falta.
    if (actual) data.rol_actual = actual.rol;
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el usuario'),
    });
  }

  eliminar(u: Usuario): void {
    if (!confirm(`Quitar a "${u.nombre}" de esta clinica?`)) return;
    this.srv.eliminar(u.id, u.rol ?? undefined).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo quitar al usuario'),
    });
  }

  reseteandoPassword = signal<string | null>(null);

  resetearPassword(u: Usuario): void {
    if (!confirm(`Se generara una nueva contrasena para "${u.nombre}" y se enviara a ${u.email}. Continuar?`)) return;
    this.reseteandoPassword.set(u.id);
    this.srv.resetearPassword(u.id).subscribe({
      next: (res) => {
        this.reseteandoPassword.set(null);
        alert(res.mensaje);
      },
      error: (err) => {
        this.reseteandoPassword.set(null);
        alert(err?.error?.mensaje || 'No se pudo resetear la contrasena');
      },
    });
  }
}
