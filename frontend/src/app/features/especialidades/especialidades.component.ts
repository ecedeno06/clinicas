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

  constructor(private fb: FormBuilder, private srv: EspecialidadesService, public auth: AuthService) {}

  ngOnInit(): void { this.cargar(); }
  cargar(): void { this.srv.listar().subscribe((data) => this.especialidades.set(data)); }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  abrirNuevo(): void { this.editando.set(null); this.form.reset({ activo: true }); this.panelAbierto.set(true); }
  abrirEditar(e: Especialidad): void { this.editando.set(e); this.form.reset({ ...e }); this.panelAbierto.set(true); }
  cerrarPanel(): void { this.panelAbierto.set(false); }

  guardar(): void {
    if (this.form.invalid) return;
    const data = this.form.getRawValue();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe(() => { this.cerrarPanel(); this.cargar(); });
  }

  eliminar(e: Especialidad): void {
    if (!confirm(`Eliminar la especialidad "${e.nombre}"?`)) return;
    this.srv.eliminar(e.id).subscribe(() => this.cargar());
  }
}
