import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DoctoresService } from '../../core/services/doctores.service';
import { EspecialidadesService } from '../../core/services/especialidades.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { AuthService } from '../../core/services/auth.service';
import { Doctor, DoctorEspecialidad, DoctorHorario, Especialidad, Sucursal } from '../../core/models/models';
import { combinar12, formatoAmPm, HORAS_12, MINUTOS_60, partes12 } from '../../core/utils/hora12.util';
import { TelefonoInputComponent } from '../../core/components/telefono-input/telefono-input.component';

@Component({
  selector: 'app-doctores',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TelefonoInputComponent],
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
      if (colegiado && !d.especialidades.some((e) => (e.numero_colegiado ?? '').toLowerCase().includes(colegiado))) return false;
      if (telefono && !(d.telefono ?? '').toLowerCase().includes(telefono)) return false;
      return true;
    });
  });

  form = this.fb.group({
    nombre: ['', Validators.required],
    telefono: [''],
    acepta_whatsapp: [false],
    email: [''],
    activo: [true],
    especialidades: this.fb.array([this.crearEspecialidadGroup()]),
  });

  constructor(
    private fb: FormBuilder,
    private srv: DoctoresService,
    private especialidadesSrv: EspecialidadesService,
    private sucursalesSrv: SucursalesService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.especialidadesSrv.listar().subscribe((data) => this.especialidades.set(data));
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
  }

  cargar(): void { this.srv.listar().subscribe((data) => this.doctores.set(data)); }

  colegiadosTexto(d: Doctor): string {
    const conColegiado = d.especialidades.filter((e) => e.numero_colegiado);
    if (!conColegiado.length) return '-';
    return conColegiado.map((e) => `${e.nombre}: ${e.numero_colegiado}`).join(', ');
  }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  crearEspecialidadGroup(e?: Partial<DoctorEspecialidad>) {
    return this.fb.group({
      especialidad_id: [e?.especialidad_id ?? '', Validators.required],
      numero_colegiado: [e?.numero_colegiado ?? ''],
    });
  }

  get especialidadesArray(): FormArray {
    return this.form.get('especialidades') as FormArray;
  }

  agregarEspecialidad(): void {
    this.especialidadesArray.push(this.crearEspecialidadGroup());
  }

  quitarEspecialidad(i: number): void {
    if (this.especialidadesArray.length > 1) this.especialidadesArray.removeAt(i);
  }

  abrirNuevo(): void {
    this.editando.set(null);
    this.form.reset({ activo: true });
    this.especialidadesArray.clear();
    this.especialidadesArray.push(this.crearEspecialidadGroup());
    this.panelAbierto.set(true);
  }

  abrirEditar(d: Doctor): void {
    this.editando.set(d);
    this.form.reset({ nombre: d.nombre, telefono: d.telefono, acepta_whatsapp: d.acepta_whatsapp, email: d.email, activo: d.activo });
    this.especialidadesArray.clear();
    (d.especialidades.length ? d.especialidades : [undefined]).forEach((e) => this.especialidadesArray.push(this.crearEspecialidadGroup(e)));
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
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el doctor'),
    });
  }

  eliminar(d: Doctor): void {
    if (!confirm(`Eliminar al doctor "${d.nombre}"?`)) return;
    this.srv.eliminar(d.id).subscribe(() => this.cargar());
  }

  // ---------- Horario semanal (tablero de turnos) ----------
  readonly diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

  horarioDoctor = signal<Doctor | null>(null);
  horarios = signal<DoctorHorario[]>([]);
  sucursales = signal<Sucursal[]>([]);

  horarioForm = this.fb.group({
    sucursal_id: ['', Validators.required],
    dia_semana: [1, Validators.required],
    hora_inicio: ['', Validators.required],
    hora_fin: ['', Validators.required],
  });

  readonly horas12 = HORAS_12;
  readonly minutos60 = MINUTOS_60;
  formatoAmPm = formatoAmPm;

  partesHoraHorario(campo: 'hora_inicio' | 'hora_fin'): { h: number | null; m: string | null; periodo: 'a.m.' | 'p.m.' | null } {
    const valor = this.horarioForm.get(campo)?.value;
    if (!valor) return { h: null, m: null, periodo: null };
    return partes12(valor);
  }

  actualizarHoraHorario12(campo: 'hora_inicio' | 'hora_fin', parte: 'h' | 'm' | 'periodo', valor: number | string): void {
    const actual = this.partesHoraHorario(campo);
    const h12 = parte === 'h' ? Number(valor) : actual.h ?? 12;
    const m = parte === 'm' ? String(valor) : actual.m ?? '00';
    const periodo = (parte === 'periodo' ? valor : actual.periodo ?? 'a.m.') as 'a.m.' | 'p.m.';
    const hora24 = combinar12(h12, m, periodo);
    if (campo === 'hora_inicio') this.horarioForm.patchValue({ hora_inicio: hora24 });
    else this.horarioForm.patchValue({ hora_fin: hora24 });
  }

  horariosPorDia(dia: number): DoctorHorario[] {
    return this.horarios()
      .filter((h) => h.dia_semana === dia)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }

  tieneHorarioActivo(dia: number): boolean {
    return this.horariosPorDia(dia).some((h) => h.activo);
  }

  abrirHorario(d: Doctor): void {
    this.horarioDoctor.set(d);
    this.horarioForm.reset({ sucursal_id: this.sucursales()[0]?.id ?? '', dia_semana: 1, hora_inicio: '', hora_fin: '' });
    this.cargarHorarios(d.id);
  }

  cerrarHorario(): void { this.horarioDoctor.set(null); }

  cargarHorarios(doctorId: string): void {
    this.srv.listarHorarios(doctorId).subscribe((data) => this.horarios.set(data));
  }

  agregarHorario(): void {
    if (this.horarioForm.invalid) return;
    const doctor = this.horarioDoctor();
    if (!doctor) return;
    const data = this.horarioForm.getRawValue();
    this.srv.crearHorario(doctor.id, {
      dia_semana: Number(data.dia_semana),
      hora_inicio: data.hora_inicio!,
      hora_fin: data.hora_fin!,
      sucursal_id: data.sucursal_id || undefined,
    }).subscribe({
      next: () => {
        this.horarioForm.patchValue({ hora_inicio: '', hora_fin: '' });
        this.cargarHorarios(doctor.id);
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo agregar el horario'),
    });
  }

  eliminarHorario(h: DoctorHorario): void {
    const doctor = this.horarioDoctor();
    if (!doctor) return;
    if (!confirm('Eliminar este bloque de horario?')) return;
    this.srv.eliminarHorario(h.id).subscribe({
      next: (res) => {
        this.cargarHorarios(doctor.id);
        if (res.citas_afectadas > 0) {
          alert(
            `Se elimino el bloque de horario. ${res.citas_afectadas} cita(s) quedaron sin disponibilidad y se marcaron como "Por reagendar".`
          );
        }
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el horario'),
    });
  }

  // Deshabilitar un bloque (en vez de eliminarlo) lo saca del calculo de
  // disponibilidad en Citas sin perder el bloque -- util cuando el doctor
  // esta en una campana y no se quiere que su horario regular aparezca
  // como disponible mientras tanto. Se puede volver a habilitar despues.
  toggleActivoHorario(h: DoctorHorario): void {
    const doctor = this.horarioDoctor();
    if (!doctor) return;
    this.srv.actualizarHorario(h.id, { activo: !h.activo }).subscribe({
      next: () => this.cargarHorarios(doctor.id),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo actualizar el bloque'),
    });
  }
}
