import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { EspecialidadesService } from '../../core/services/especialidades.service';
import { AuthService } from '../../core/services/auth.service';
import { Especialidad } from '../../core/models/models';

@Component({
  selector: 'app-especialidades',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './especialidades.component.html',
  styleUrl: './especialidades.component.css',
})
export class EspecialidadesComponent implements OnInit {
  especialidades = signal<Especialidad[]>([]);
  // Catalogo global completo, para el selector de "activar especialidad"
  // -- excluye las que esta clinica ya tiene (global o privada legado
  // con el mismo nombre no aplica, se compara por id).
  catalogoGlobal = signal<Especialidad[]>([]);
  catalogoGlobalDisponible = computed(() => {
    const yaActivas = new Set(this.especialidades().map((e) => e.id));
    return this.catalogoGlobal().filter((e) => !yaActivas.has(e.id));
  });

  panelActivarAbierto = signal(false);
  panelGlobalAbierto = signal(false);
  editando = signal<Especialidad | null>(null);

  filtroNombre = signal('');
  filtroDescripcion = signal('');

  hayFiltros = computed(() => !!(this.filtroNombre() || this.filtroDescripcion()));

  limpiarFiltros(): void {
    this.filtroNombre.set('');
    this.filtroDescripcion.set('');
  }

  especialidadesFiltradas = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    const descripcion = this.filtroDescripcion().trim().toLowerCase();

    return this.especialidades().filter((e) => {
      if (nombre && !e.nombre.toLowerCase().includes(nombre)) return false;
      if (descripcion && !(e.descripcion ?? '').toLowerCase().includes(descripcion)) return false;
      return true;
    });
  });

  // Formulario para activar una especialidad global existente.
  activarForm = this.fb.group({
    especialidad_id: ['', Validators.required],
  });

  // Formulario libre, solo para que un super admin cree una especialidad
  // NUEVA en el catalogo GLOBAL (o edite una global existente).
  form = this.fb.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    activo: [true],
  });

  constructor(private fb: FormBuilder, private srv: EspecialidadesService, public auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
    this.srv.listarCatalogoGlobal().subscribe((data) => this.catalogoGlobal.set(data));
  }
  cargar(): void { this.srv.listar().subscribe((data) => this.especialidades.set(data)); }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  // Renombrar/editar la descripcion solo tiene sentido para: una privada
  // legado propia de mi clinica, o (si soy super admin) cualquier global.
  puedeEditarNombre(fila: Especialidad): boolean {
    if (!this.esAdmin()) return false;
    if (!fila.empresa_id) return this.auth.esSuperAdmin();
    return fila.empresa_id === this.auth.empresaActiva()?.empresa_id;
  }

  // Cualquier fila que aparezca en MI lista la puedo "quitar" -- el
  // backend decide si eso borra la especialidad global de raiz (solo si
  // soy super admin) o solo mi propia activacion (admin normal).
  puedeQuitar(fila: Especialidad): boolean {
    return this.esAdmin();
  }

  // ---------- Activar especialidad del catalogo global ----------

  abrirActivar(): void {
    this.activarForm.reset({ especialidad_id: '' });
    this.panelActivarAbierto.set(true);
  }
  cerrarActivar(): void { this.panelActivarAbierto.set(false); }

  activar(): void {
    if (this.activarForm.invalid) return;
    const { especialidad_id } = this.activarForm.getRawValue();
    this.srv.crear({ especialidad_id }).subscribe({
      next: () => { this.cerrarActivar(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo activar la especialidad'),
    });
  }

  // ---------- Catalogo global: crear nueva / editar (solo super admin para crear) ----------

  abrirNuevaGlobal(): void {
    this.editando.set(null);
    this.form.reset({ activo: true });
    this.panelGlobalAbierto.set(true);
  }
  abrirEditar(e: Especialidad): void {
    this.editando.set(e);
    this.form.reset({ ...e });
    this.panelGlobalAbierto.set(true);
  }
  cerrarPanel(): void { this.panelGlobalAbierto.set(false); }

  guardar(): void {
    if (this.form.invalid) return;
    const actual = this.editando();
    const data: any = this.form.getRawValue();
    if (!actual) data.global = true;
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => {
        this.cerrarPanel();
        this.cargar();
        if (!actual) this.srv.listarCatalogoGlobal().subscribe((d) => this.catalogoGlobal.set(d));
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la especialidad'),
    });
  }

  eliminar(e: Especialidad): void {
    const mensaje = !e.empresa_id && this.auth.esSuperAdmin()
      ? `"${e.nombre}" es una especialidad global -- esto la eliminara para TODA la red, no solo tu clinica. Continuar?`
      : `Quitar "${e.nombre}" de tu clinica?`;
    if (!confirm(mensaje)) return;
    this.srv.eliminar(e.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la especialidad'),
    });
  }
}
