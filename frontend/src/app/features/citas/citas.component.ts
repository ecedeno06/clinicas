import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CitasService } from '../../core/services/citas.service';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { AuthService } from '../../core/services/auth.service';
import { Cita, Doctor, EstadoCita, HistoriaClinica, Paciente, Receta, SignosVitales } from '../../core/models/models';
import { clasificarImc } from '../../core/utils/imc.util';

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
  menuAbiertoId = signal<string | null>(null);
  menuPos = signal<{ top: number; right: number } | null>(null);

  citaHistoria = signal<Cita | null>(null);
  historia = signal<HistoriaClinica | null>(null);
  cargandoHistoria = signal(false);

  citaSignos = signal<Cita | null>(null);
  signosVitales = signal<SignosVitales | null>(null);
  cargandoSignos = signal(false);

  // Una cita puede tener varias recetas.
  citaReceta = signal<Cita | null>(null);
  recetas = signal<Receta[]>([]);
  cargandoRecetas = signal(false);
  recetaEditando = signal<Receta | null>(null); // null = formulario de receta nueva
  mostrarFormularioReceta = signal(false);
  recetaParaImprimir = signal<Receta | null>(null);

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

  signosForm = this.fb.group({
    temperatura: [null as number | null],
    peso: [null as number | null],
    talla: [null as number | null],
    presion_sistolica: [null as number | null],
    presion_diastolica: [null as number | null],
    glucosa: [null as number | null],
    glucosa_glicosilada: [null as number | null],
  });

  recetaForm = this.fb.group({
    indicaciones_generales: [''],
    medicamentos: this.fb.array([this.crearMedicamentoGroup()]),
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

  toggleMenu(event: MouseEvent, id: string): void {
    if (this.menuAbiertoId() === id) { this.menuAbiertoId.set(null); return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    this.menuAbiertoId.set(id);
  }

  puedeVerHistoria(): boolean {
    const rol = this.auth.usuario()?.rol;
    return this.auth.esSuperAdmin() || rol === 'admin' || rol === 'doctor';
  }

  puedeRegistrarSignos(): boolean {
    const rol = this.auth.usuario()?.rol;
    return this.auth.esSuperAdmin() || rol === 'admin' || rol === 'doctor' || rol === 'recepcionista';
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

  abrirSignos(c: Cita): void {
    this.citaSignos.set(c);
    this.signosVitales.set(null);
    this.signosForm.reset();
    this.cargandoSignos.set(true);
    this.srv.obtenerSignosVitales(c.id).subscribe({
      next: (data) => {
        this.signosVitales.set(data);
        this.signosForm.reset({ ...data });
        this.cargandoSignos.set(false);
      },
      error: () => this.cargandoSignos.set(false), // 404: todavia no se han tomado
    });
  }

  cerrarSignos(): void { this.citaSignos.set(null); }

  // Se recalcula en cada deteccion de cambios mientras se escribe peso/talla,
  // para mostrar el IMC y su clasificacion antes de guardar (el IMC real se
  // calcula y persiste en la base de datos; esto es solo la vista previa).
  estadoImc(): { valor: number; etiqueta: string; clase: string } | null {
    const peso = Number(this.signosForm.get('peso')?.value);
    const talla = Number(this.signosForm.get('talla')?.value);
    if (!peso || !talla) return null;

    const tallaM = talla / 100;
    const valor = Math.round((peso / (tallaM * tallaM)) * 100) / 100;
    return { valor, ...clasificarImc(valor) };
  }

  guardarSignos(): void {
    const cita = this.citaSignos();
    if (!cita) return;
    const data = this.signosForm.getRawValue();
    const existente = this.signosVitales();
    const req = existente ? this.srv.actualizarSignosVitales(cita.id, data) : this.srv.crearSignosVitales(cita.id, data);
    req.subscribe({
      next: (sv) => {
        this.signosVitales.set(sv);
        this.cargar();
        this.cerrarSignos();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudieron guardar los signos vitales'),
    });
  }

  crearMedicamentoGroup(m?: Partial<{ medicamento: string; dosis: string; frecuencia: string; duracion: string; indicaciones: string }>) {
    return this.fb.group({
      medicamento: [m?.medicamento ?? '', Validators.required],
      dosis: [m?.dosis ?? ''],
      frecuencia: [m?.frecuencia ?? ''],
      duracion: [m?.duracion ?? ''],
      indicaciones: [m?.indicaciones ?? ''],
    });
  }

  get medicamentosArray(): FormArray {
    return this.recetaForm.get('medicamentos') as FormArray;
  }

  agregarMedicamento(): void {
    this.medicamentosArray.push(this.crearMedicamentoGroup());
  }

  quitarMedicamento(i: number): void {
    if (this.medicamentosArray.length > 1) this.medicamentosArray.removeAt(i);
  }

  abrirRecetas(c: Cita): void {
    this.citaReceta.set(c);
    this.recetas.set([]);
    this.mostrarFormularioReceta.set(false);
    this.recetaEditando.set(null);
    this.recetaParaImprimir.set(null);
    this.cargandoRecetas.set(true);
    this.srv.listarRecetas(c.id).subscribe({
      next: (data) => { this.recetas.set(data); this.cargandoRecetas.set(false); },
      error: () => this.cargandoRecetas.set(false),
    });
  }

  cerrarRecetas(): void { this.citaReceta.set(null); }

  nuevaReceta(): void {
    this.recetaEditando.set(null);
    this.recetaForm.reset({ indicaciones_generales: '' });
    this.medicamentosArray.clear();
    this.medicamentosArray.push(this.crearMedicamentoGroup());
    this.mostrarFormularioReceta.set(true);
  }

  editarReceta(r: Receta): void {
    this.recetaEditando.set(r);
    this.recetaForm.reset({ indicaciones_generales: r.indicaciones_generales ?? '' });
    this.medicamentosArray.clear();
    r.medicamentos.forEach((m) => this.medicamentosArray.push(this.crearMedicamentoGroup(m as any)));
    this.mostrarFormularioReceta.set(true);
  }

  cancelarFormularioReceta(): void {
    this.mostrarFormularioReceta.set(false);
    this.recetaEditando.set(null);
  }

  guardarReceta(): void {
    const cita = this.citaReceta();
    if (!cita || this.recetaForm.invalid) return;
    const data = this.recetaForm.getRawValue();
    const existente = this.recetaEditando();
    const req = existente ? this.srv.actualizarReceta(existente.id, data) : this.srv.crearReceta(cita.id, data);
    req.subscribe({
      next: () => {
        this.mostrarFormularioReceta.set(false);
        this.recetaEditando.set(null);
        this.abrirRecetas(cita);
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la receta'),
    });
  }

  eliminarReceta(r: Receta): void {
    if (!confirm('Eliminar esta receta?')) return;
    this.srv.eliminarReceta(r.id).subscribe({
      next: () => {
        const cita = this.citaReceta();
        if (cita) this.abrirRecetas(cita);
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la receta'),
    });
  }

  imprimirReceta(r: Receta): void {
    this.recetaParaImprimir.set(r);
    setTimeout(() => window.print(), 0);
  }
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}
