import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PacientesService } from '../../core/services/pacientes.service';
import { AuthService } from '../../core/services/auth.service';
import { HistoriaClinica, Paciente } from '../../core/models/models';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.css',
})
export class PacientesComponent implements OnInit {
  pacientes = signal<Paciente[]>([]);
  panelAbierto = signal(false);
  editando = signal<Paciente | null>(null);

  pacienteHistorial = signal<Paciente | null>(null);
  historial = signal<HistoriaClinica[]>([]);
  cargandoHistorial = signal(false);

  filtroNombre = signal('');
  filtroIdentificacion = signal('');
  filtroTelefono = signal('');

  hayFiltros = computed(() => !!(this.filtroNombre() || this.filtroIdentificacion() || this.filtroTelefono()));

  limpiarFiltros(): void {
    this.filtroNombre.set('');
    this.filtroIdentificacion.set('');
    this.filtroTelefono.set('');
  }

  pacientesFiltrados = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    const identificacion = this.filtroIdentificacion().trim().toLowerCase();
    const telefono = this.filtroTelefono().trim().toLowerCase();

    return this.pacientes().filter((p) => {
      if (nombre && !p.nombre.toLowerCase().includes(nombre)) return false;
      if (identificacion && !(p.identificacion ?? '').toLowerCase().includes(identificacion)) return false;
      if (telefono && !(p.telefono ?? '').toLowerCase().includes(telefono)) return false;
      return true;
    });
  });

  form = this.fb.group({
    nombre: ['', Validators.required],
    identificacion: [''],
    fecha_nacimiento: [''],
    sexo: [''],
    telefono: [''],
    email: [''],
    direccion: [''],
    alergias: [''],
    contacto_emergencia: this.fb.group({
      nombre: [''],
      telefono: [''],
      parentesco: [''],
    }),
    activo: [true],
  });

  constructor(private fb: FormBuilder, private srv: PacientesService, public auth: AuthService) {}

  ngOnInit(): void { this.cargar(); }
  cargar(): void { this.srv.listar().subscribe((data) => this.pacientes.set(data)); }

  abrirNuevo(): void {
    this.editando.set(null);
    this.form.reset({ activo: true, contacto_emergencia: { nombre: '', telefono: '', parentesco: '' } });
    this.panelAbierto.set(true);
  }

  abrirEditar(p: Paciente): void {
    this.editando.set(p);
    this.form.reset({
      ...p,
      fecha_nacimiento: p.fecha_nacimiento?.substring(0, 10) ?? '',
      contacto_emergencia: {
        nombre: p.contacto_emergencia?.nombre ?? '',
        telefono: p.contacto_emergencia?.telefono ?? '',
        parentesco: p.contacto_emergencia?.parentesco ?? '',
      },
    });
    this.panelAbierto.set(true);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  guardar(): void {
    if (this.form.invalid) return;
    const data = this.form.getRawValue();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el paciente'),
    });
  }

  eliminar(p: Paciente): void {
    if (!confirm(`Eliminar al paciente "${p.nombre}"?`)) return;
    this.srv.eliminar(p.id).subscribe(() => this.cargar());
  }

  verHistorial(p: Paciente): void {
    this.pacienteHistorial.set(p);
    this.historial.set([]);
    this.cargandoHistorial.set(true);
    this.srv.historial(p.id).subscribe({
      next: (data) => { this.historial.set(data); this.cargandoHistorial.set(false); },
      error: () => this.cargandoHistorial.set(false),
    });
  }

  cerrarHistorial(): void { this.pacienteHistorial.set(null); }
}
