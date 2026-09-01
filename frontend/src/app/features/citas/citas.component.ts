import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CitasService } from '../../core/services/citas.service';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { AuthService } from '../../core/services/auth.service';
import { Cita, Doctor, EstadoCita, HistoriaClinica, Paciente } from '../../core/models/models';

@Component({
  selector: 'app-citas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './citas.component.html',
  styleUrl: './citas.component.css',
})
export class CitasComponent implements OnInit {
  citas = signal<Cita[]>([]);
  pacientes = signal<Paciente[]>([]);
  doctores = signal<Doctor[]>([]);
  panelAbierto = signal(false);
  editando = signal<Cita | null>(null);
  errorGuardar = signal<string | null>(null);

  citaHistoria = signal<Cita | null>(null);
  historia = signal<HistoriaClinica | null>(null);
  cargandoHistoria = signal(false);

  filtroFecha = signal('');
  filtroPaciente = signal('');
  filtroDoctor = signal('');
  filtroEstado = signal('');

  hayFiltros = computed(() => !!(this.filtroFecha() || this.filtroPaciente() || this.filtroDoctor() || this.filtroEstado()));

  limpiarFiltros(): void {
    this.filtroFecha.set('');
    this.filtroPaciente.set('');
    this.filtroDoctor.set('');
    this.filtroEstado.set('');
  }

  citasFiltradas = computed(() => {
    const fecha = this.filtroFecha().trim().toLowerCase();
    const paciente = this.filtroPaciente().trim().toLowerCase();
    const doctor = this.filtroDoctor().trim().toLowerCase();
    const estado = this.filtroEstado().trim().toLowerCase();

    return this.citas().filter((c) => {
      if (fecha && !formatearFecha(c.fecha).includes(fecha)) return false;
      if (paciente && !(c.paciente_nombre ?? '').toLowerCase().includes(paciente)) return false;
      if (doctor && !(c.doctor_nombre ?? '').toLowerCase().includes(doctor)) return false;
      if (estado && !c.estado.toLowerCase().includes(estado)) return false;
      return true;
    });
  });

  form = this.fb.group({
    paciente_id: ['', Validators.required],
    doctor_id: ['', Validators.required],
    fecha: [new Date().toISOString().substring(0, 10), Validators.required],
    hora_inicio: ['', Validators.required],
    hora_fin: ['', Validators.required],
    motivo: [''],
    observaciones: [''],
    estado: ['pendiente' as EstadoCita],
  });

  historiaForm = this.fb.group({
    motivo_consulta: [''],
    diagnostico: [''],
    tratamiento: [''],
    notas: [''],
  });

  constructor(
    private fb: FormBuilder,
    private srv: CitasService,
    private pacientesSrv: PacientesService,
    private doctoresSrv: DoctoresService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.pacientesSrv.listar().subscribe((data) => this.pacientes.set(data));
    this.doctoresSrv.listar().subscribe((data) => this.doctores.set(data));
  }

  cargar(): void { this.srv.listar().subscribe((data) => this.citas.set(data)); }

  puedeVerHistoria(): boolean {
    const rol = this.auth.usuario()?.rol;
    return this.auth.esSuperAdmin() || rol === 'admin' || rol === 'doctor';
  }

  abrirNuevo(): void {
    this.editando.set(null);
    this.form.reset({ fecha: new Date().toISOString().substring(0, 10), estado: 'pendiente' });
    this.errorGuardar.set(null);
    this.panelAbierto.set(true);
  }

  abrirEditar(c: Cita): void {
    this.editando.set(c);
    this.form.reset({
      paciente_id: c.paciente_id,
      doctor_id: c.doctor_id,
      fecha: c.fecha.substring(0, 10),
      hora_inicio: c.hora_inicio?.substring(0, 5),
      hora_fin: c.hora_fin?.substring(0, 5),
      motivo: c.motivo ?? '',
      observaciones: c.observaciones ?? '',
      estado: c.estado,
    });
    this.errorGuardar.set(null);
    this.panelAbierto.set(true);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  guardar(): void {
    if (this.form.invalid) return;
    this.errorGuardar.set(null);
    const actual = this.editando();
    const data = this.form.getRawValue();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => this.errorGuardar.set(err?.error?.mensaje || 'No se pudo guardar la cita'),
    });
  }

  eliminar(c: Cita): void {
    if (!confirm('Eliminar esta cita?')) return;
    this.srv.eliminar(c.id).subscribe(() => this.cargar());
  }

  abrirHistoria(c: Cita): void {
    this.citaHistoria.set(c);
    this.historia.set(null);
    this.historiaForm.reset();
    this.cargandoHistoria.set(true);
    this.srv.obtenerHistoria(c.id).subscribe({
      next: (data) => {
        this.historia.set(data);
        this.historiaForm.reset({ ...data });
        this.cargandoHistoria.set(false);
      },
      error: () => this.cargandoHistoria.set(false), // 404: todavia no tiene historia, se crea desde cero
    });
  }

  cerrarHistoria(): void { this.citaHistoria.set(null); }

  guardarHistoria(): void {
    const cita = this.citaHistoria();
    if (!cita) return;
    const data = this.historiaForm.getRawValue();
    const existente = this.historia();
    const req = existente ? this.srv.actualizarHistoria(cita.id, data) : this.srv.crearHistoria(cita.id, data);
    req.subscribe({
      next: (h) => {
        this.historia.set(h);
        this.cargar(); // refleja el cambio de estado a "atendida" en la tabla
        this.cerrarHistoria();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la historia clinica'),
    });
  }
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}
