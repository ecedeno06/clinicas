import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmpresasService } from '../../core/services/empresas.service';
import { Empresa, UsuarioGlobal, UsuarioDeEmpresa, Rol } from '../../core/models/models';
import { redimensionarImagen } from '../../core/utils/imagen.util';

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './empresas.component.html',
  styleUrl: './empresas.component.css',
})
export class EmpresasComponent implements OnInit {
  empresas = signal<Empresa[]>([]);
  panelAbierto = signal(false);
  editando = signal<Empresa | null>(null);

  filtroNombre = signal('');
  filtroIdentificacion = signal('');
  filtroEmail = signal('');

  hayFiltros = computed(() => !!(this.filtroNombre() || this.filtroIdentificacion() || this.filtroEmail()));

  limpiarFiltros(): void {
    this.filtroNombre.set('');
    this.filtroIdentificacion.set('');
    this.filtroEmail.set('');
  }

  empresasFiltradas = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    const identificacion = this.filtroIdentificacion().trim().toLowerCase();
    const email = this.filtroEmail().trim().toLowerCase();

    return this.empresas().filter((e) => {
      if (nombre && !e.nombre.toLowerCase().includes(nombre)) return false;
      if (identificacion && !(e.identificacion ?? '').toLowerCase().includes(identificacion)) return false;
      if (email && !(e.email ?? '').toLowerCase().includes(email)) return false;
      return true;
    });
  });

  usuariosGlobales = signal<UsuarioGlobal[]>([]);
  usuariosDeEmpresa = signal<UsuarioDeEmpresa[]>([]);
  usuarioParaAsociar = '';
  rolParaAsociar: Rol = 'recepcionista';

  // Solo ofrece en el selector a los usuarios que todavia no estan asociados
  usuariosDisponibles = computed(() => {
    const yaAsociados = new Set(this.usuariosDeEmpresa().map((u) => u.id));
    return this.usuariosGlobales().filter((u) => !yaAsociados.has(u.id));
  });

  form = this.fb.group({
    nombre: ['', Validators.required],
    identificacion: [''],
    email: [''],
    telefono: [''],
    direccion: [''],
    logo: [null as string | null],
    activo: [true],
  });

  constructor(private fb: FormBuilder, private srv: EmpresasService) {}

  ngOnInit(): void {
    this.cargar();
    this.srv.usuariosGlobales().subscribe((data) => this.usuariosGlobales.set(data));
  }

  cargar(): void { this.srv.listar().subscribe((data) => this.empresas.set(data)); }

  abrirNuevo(): void {
    this.editando.set(null);
    this.usuariosDeEmpresa.set([]);
    this.form.reset({ activo: true });
    this.panelAbierto.set(true);
  }

  abrirEditar(e: Empresa): void {
    this.editando.set(e);
    this.form.reset({ ...e });
    this.usuarioParaAsociar = '';
    this.rolParaAsociar = 'recepcionista';
    this.cargarUsuariosDeEmpresa(e.id);
    this.panelAbierto.set(true);
  }

  cargarUsuariosDeEmpresa(empresaId: string): void {
    this.srv.usuariosDeEmpresa(empresaId).subscribe((data) => this.usuariosDeEmpresa.set(data));
  }

  asociarUsuario(empresaId: string): void {
    if (!this.usuarioParaAsociar) return;
    this.srv.asociarUsuario(empresaId, { usuario_id: this.usuarioParaAsociar, rol: this.rolParaAsociar }).subscribe({
      next: () => {
        this.usuarioParaAsociar = '';
        this.rolParaAsociar = 'recepcionista';
        this.cargarUsuariosDeEmpresa(empresaId);
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo asociar el usuario'),
    });
  }

  desasociarUsuario(empresaId: string, u: UsuarioDeEmpresa): void {
    if (!confirm(`Quitar a "${u.nombre}" de esta clinica?`)) return;
    this.srv.desasociarUsuario(empresaId, u.id).subscribe({
      next: () => this.cargarUsuariosDeEmpresa(empresaId),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo quitar al usuario'),
    });
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  onLogoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      alert('Selecciona un archivo de imagen valido.');
      return;
    }

    redimensionarImagen(archivo, 300).then((base64) => {
      this.form.get('logo')?.setValue(base64);
    });

    input.value = '';
  }

  quitarLogo(): void {
    this.form.get('logo')?.setValue(null);
  }

  guardar(): void {
    if (this.form.invalid) return;
    const data = this.form.getRawValue();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la clinica'),
    });
  }

  eliminar(e: Empresa): void {
    if (!confirm(`Eliminar la clinica "${e.nombre}"?`)) return;
    this.srv.eliminar(e.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la clinica'),
    });
  }
}
