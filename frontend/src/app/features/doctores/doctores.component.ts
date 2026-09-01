import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DoctoresService } from '../../core/services/doctores.service';
import { EspecialidadesService } from '../../core/services/especialidades.service';
import { AuthService } from '../../core/services/auth.service';
import { Doctor, Especialidad } from '../../core/models/models';

@Component({
  selector: 'app-doctores',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './doctores.component.html',
  styleUrl: './doctores.component.css',
})
export class DoctoresComponent implements OnInit {
  doctores = signal<Doctor[]>([]);
  especialidades = signal<Especialidad[]>([]);
  panelAbierto = signal(false);
  editando = signal<Doctor | null>(null);

  filtroNombre = signal('');
  filtroEspecialidad = signal('');
  filtroColegiado = signal('');
  filtroTelefono = signal('');

  hayFiltros = computed(() => !!(this.filtroNombre() || this.filtroEspecialidad() || this.filtroColegiado() || this.filtroTelefono()));

  limpiarFiltros(): void {
    this.filtroNombre.set('');
    this.filtroEspecialidad.set('');
    this.filtroColegiado.set('');
    this.filtroTelefono.set('');
  }

  doctoresFiltrados = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    const especialidad = this.filtroEspecialidad().trim().toLowerCase();
    const colegiado = this.filtroColegiado().trim().toLowerCase();
    const telefono = this.filtroTelefono().trim().toLowerCase();

    return this.doctores().filter((d) => {
      if (nombre && !d.nombre.toLowerCase().includes(nombre)) return false;
      if (especialidad && !(d.especialidad_nombre ?? '').toLowerCase().includes(especialidad)) return false;
      if (colegiado && !(d.numero_colegiado ?? '').toLowerCase().includes(colegiado)) return false;
      if (telefono && !(d.telefono ?? '').toLowerCase().includes(telefono)) return false;
      return true;
    });
  });

  form = this.fb.group({
    nombre: ['', Validators.required],
    especialidad_id: ['', Validators.required],
    numero_colegiado: [''],
    telefono: [''],
    email: [''],
    activo: [true],
  });

  constructor(
    private fb: FormBuilder,
    private srv: DoctoresService,
    private especialidadesSrv: EspecialidadesService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.especialidadesSrv.listar().subscribe((data) => this.especialidades.set(data));
  }

  cargar(): void { this.srv.listar().subscribe((data) => this.doctores.set(data)); }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  abrirNuevo(): void { this.editando.set(null); this.form.reset({ activo: true }); this.panelAbierto.set(true); }
  abrirEditar(d: Doctor): void { this.editando.set(d); this.form.reset({ ...d }); this.panelAbierto.set(true); }
  cerrarPanel(): void { this.panelAbierto.set(false); }

  guardar(): void {
    if (this.form.invalid) return;
    const data = this.form.getRawValue();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el doctor'),
    });
  }

  eliminar(d: Doctor): void {
    if (!confirm(`Eliminar al doctor "${d.nombre}"?`)) return;
    this.srv.eliminar(d.id).subscribe(() => this.cargar());
  }
}
