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
  panelAbierto = signal(false);
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

  form = this.fb.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    activo: [true],
  });

  // Solo un super admin puede marcar lo que crea como catalogo GLOBAL;
  // cualquier otro usuario con permiso de edicion siempre crea para su
  // propia clinica (el backend tambien lo fuerza, esto es solo la UI).
  crearComoGlobal = signal(false);

  constructor(private fb: FormBuilder, private srv: EspecialidadesService, public auth: AuthService) {}

  ngOnInit(): void { this.cargar(); }
  cargar(): void { this.srv.listar().subscribe((data) => this.especialidades.set(data)); }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  // Una fila global solo la gestiona un super admin; una fila propia de
  // la clinica activa la gestiona cualquier admin de esa clinica (o un
  // super admin); una fila de otra clinica no deberia ni llegar en el
  // listado, pero por si acaso tambien se oculta aqui.
  puedeGestionar(fila: Especialidad): boolean {
    if (!this.esAdmin()) return false;
    if (!fila.empresa_id) return this.auth.esSuperAdmin();
    return fila.empresa_id === this.auth.empresaActiva()?.empresa_id;
  }

  abrirNuevo(): void {
    this.editando.set(null);
    this.crearComoGlobal.set(false);
    this.form.reset({ activo: true });
    this.panelAbierto.set(true);
  }
  abrirEditar(e: Especialidad): void {
    this.editando.set(e);
    this.form.reset({ ...e });
    this.panelAbierto.set(true);
  }
  cerrarPanel(): void { this.panelAbierto.set(false); }

  guardar(): void {
    if (this.form.invalid) return;
    const actual = this.editando();
    const data: any = this.form.getRawValue();
    if (!actual) data.global = this.crearComoGlobal();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la especialidad'),
    });
  }

  eliminar(e: Especialidad): void {
    if (!confirm(`Eliminar la especialidad "${e.nombre}"?`)) return;
    this.srv.eliminar(e.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la especialidad'),
    });
  }
}
