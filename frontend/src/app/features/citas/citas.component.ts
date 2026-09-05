import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CitasService } from '../../core/services/citas.service';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { AuthService } from '../../core/services/auth.service';
import { Cita, Disponibilidad, Doctor, EstadoCita, EstadoLaboratorio, FranjaHoraria, HistoriaClinica, OrdenLaboratorio, Paciente, Receta, SignosVitales } from '../../core/models/models';
import { clasificarImc } from '../../core/utils/imc.util';
import { clasificarPresion } from '../../core/utils/presion.util';
import { clasificarGlucosa } from '../../core/utils/glucosa.util';
import { combinar12, formatoAmPm, HORAS_12, MINUTOS_60, partes12 } from '../../core/utils/hora12.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';

@Component({
  selector: 'app-citas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SelectorFotoComponent],
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
  tabHistoria = signal<'consulta' | 'signos' | 'antecedentes' | 'recetas' | 'laboratorios'>('consulta');
  pacienteDeHistoria = signal<Paciente | null>(null);
  signosVitalesDeHistoria = signal<SignosVitales[]>([]);
  // El endpoint devuelve ascendente (para calcular tendencias en Pacientes);
  // aqui se muestra como lista, mas reciente primero.
  signosVitalesDeHistoriaDesc = computed(() => [...this.signosVitalesDeHistoria()].reverse());
  cargandoSignosHistoria = signal(false);
  // Ultimo registro (cronologicamente) que SI tenga peso -- puede no ser el
  // mas reciente si esa consulta no tomo signos vitales. Mismo patron que
  // tendenciaPeso() en Pacientes.
  ultimoPeso = computed<number | null>(() => {
    const lista = this.signosVitalesDeHistoria(); // asc por fecha
    for (let i = lista.length - 1; i >= 0; i--) {
      if (lista[i].peso != null) return lista[i].peso!;
    }
    return null;
  });

  pesoLibras(kg: number): number {
    return Math.round(kg * 2.20462 * 10) / 10;
  }
  recetasDeHistoria = signal<Receta[]>([]);
  cargandoRecetasHistoria = signal(false);
  laboratoriosDeHistoria = signal<OrdenLaboratorio[]>([]);
  cargandoLaboratoriosHistoria = signal(false);

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

  // Una cita puede tener varias ordenes de laboratorio.
  citaLaboratorio = signal<Cita | null>(null);
  ordenesLaboratorio = signal<OrdenLaboratorio[]>([]);
  cargandoLaboratorio = signal(false);
  laboratorioEditando = signal<OrdenLaboratorio | null>(null); // null = formulario de orden nueva
  mostrarFormularioLaboratorio = signal(false);

  // Disponibilidad del doctor seleccionado para la fecha del formulario:
  // se recalcula al cambiar doctor_id o fecha, y clicar una franja libre
  // rellena hora_inicio/hora_fin (siguen siendo editables a mano tambien).
  disponibilidad = signal<Disponibilidad | null>(null);
  cargandoDisponibilidad = signal(false);

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

  laboratorioForm = this.fb.group({
    estado: ['pendiente' as EstadoLaboratorio],
    observaciones: [''],
    examenes: this.fb.array([this.crearExamenGroup()]),
  });

  constructor(
    private fb: FormBuilder,
    private srv: CitasService,
    private pacientesSrv: PacientesService,
    private doctoresSrv: DoctoresService,
    private route: ActivatedRoute,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.pacientesSrv.listar().subscribe((data) => this.pacientes.set(data));
    this.doctoresSrv.listar().subscribe((data) => this.doctores.set(data));

    this.form.get('doctor_id')!.valueChanges.subscribe(() => this.actualizarDisponibilidad());
    this.form.get('fecha')!.valueChanges.subscribe(() => this.actualizarDisponibilidad());

    // Llegar aqui desde otra pantalla (ej. "Agenda del dia" o "Laboratorios
    // pendientes" del tablero) puede traer ?fecha=dd/mm/aaaa&paciente=...
    // &doctor=... para acotar la lista a esa cita puntual.
    const params = this.route.snapshot.queryParamMap;
    if (params.get('fecha')) this.filtroFecha.set(params.get('fecha')!);
    if (params.get('paciente')) this.filtroPaciente.set(params.get('paciente')!);
    if (params.get('doctor')) this.filtroDoctor.set(params.get('doctor')!);
    if (params.get('estado')) this.filtroEstado.set(params.get('estado')!);
  }

  actualizarDisponibilidad(): void {
    const doctorId = this.form.get('doctor_id')?.value;
    const fecha = this.form.get('fecha')?.value;
    if (!doctorId || !fecha) { this.disponibilidad.set(null); return; }
    this.cargandoDisponibilidad.set(true);
    this.doctoresSrv.disponibilidad(doctorId, fecha).subscribe({
      next: (data) => { this.disponibilidad.set(data); this.cargandoDisponibilidad.set(false); },
      error: () => { this.disponibilidad.set(null); this.cargandoDisponibilidad.set(false); },
    });
  }

  elegirFranja(f: FranjaHoraria): void {
    this.form.patchValue({ hora_inicio: f.hora_inicio, hora_fin: f.hora_fin });
  }

  franjaSeleccionada(f: FranjaHoraria): boolean {
    return this.form.get('hora_inicio')?.value === f.hora_inicio && this.form.get('hora_fin')?.value === f.hora_fin;
  }

  ocupadosTexto(disp: Disponibilidad): string {
    return disp.ocupados.map((o) => `${formatoAmPm(o.hora_inicio)}–${formatoAmPm(o.hora_fin)}`).join(', ');
  }

  // Al editar una cita existente sin tocar doctor/fecha/horario, siempre se
  // puede guardar (ej. solo cambiar el estado o el motivo) aunque hoy ese
  // horario ya no aparezca disponible -- el horario del doctor pudo cambiar
  // despues de agendada. El bloqueo de disponibilidad solo aplica cuando se
  // esta fijando/moviendo el horario de la cita.
  private horarioSinCambios(): boolean {
    const original = this.editando();
    if (!original) return false;
    const v = this.form.getRawValue();
    return v.doctor_id === original.doctor_id
      && v.fecha === original.fecha?.substring(0, 10)
      && v.hora_inicio === original.hora_inicio?.substring(0, 5)
      && v.hora_fin === original.hora_fin?.substring(0, 5);
  }

  // Solo bloquea Guardar cuando el doctor SI tiene un horario configurado
  // (al menos un bloque, en cualquier dia) pero ese dia no atiende o ya
  // esta completo. Un doctor sin ningun horario cargado todavia sigue
  // pudiendo recibir citas con total libertad, como antes de este tablero.
  sinDisponibilidad(): boolean {
    if (this.horarioSinCambios()) return false;
    const disp = this.disponibilidad();
    if (!disp || !disp.tiene_horario_configurado) return false;
    return !disp.atiende || disp.libres.length === 0;
  }

  formatoAmPm = formatoAmPm;

  // ---------- Hora de inicio/fin en formato 12h (los <select> no dependen
  // del locale del navegador, a diferencia de <input type="time">) ----------
  readonly horas12 = HORAS_12;
  readonly minutos60 = MINUTOS_60;

  partesHora(campo: 'hora_inicio' | 'hora_fin'): { h: number | null; m: string | null; periodo: 'a.m.' | 'p.m.' | null } {
    const valor = this.form.get(campo)?.value;
    if (!valor) return { h: null, m: null, periodo: null };
    return partes12(valor);
  }

  actualizarHora12(campo: 'hora_inicio' | 'hora_fin', parte: 'h' | 'm' | 'periodo', valor: number | string): void {
    const actual = this.partesHora(campo);
    const h12 = parte === 'h' ? Number(valor) : actual.h ?? 12;
    const m = parte === 'm' ? String(valor) : actual.m ?? '00';
    const periodo = (parte === 'periodo' ? valor : actual.periodo ?? 'a.m.') as 'a.m.' | 'p.m.';
    const hora24 = combinar12(h12, m, periodo);
    if (campo === 'hora_inicio') this.form.patchValue({ hora_inicio: hora24 });
    else this.form.patchValue({ hora_fin: hora24 });
  }

  cargar(): void { this.srv.listar().subscribe((data) => this.citas.set(data)); }

  puedeVerHistoria(): boolean {
    const rol = this.auth.usuario()?.rol;
    return this.auth.esSuperAdmin() || rol === 'admin' || rol === 'doctor';
  }

  // La cita no se llego a atender: no tiene sentido esperar que aparezca
  // un registro de signos/consulta/receta, asi que se marca con una X en
  // vez de dejar el icono en blanco.
  citaCancelada(c: Cita): boolean {
    return c.estado === 'cancelada' || c.estado === 'no_asistio';
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
    this.tabHistoria.set('consulta');
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

    this.pacienteDeHistoria.set(null);
    this.pacientesSrv.obtener(c.paciente_id).subscribe({
      next: (data) => this.pacienteDeHistoria.set(data),
      error: () => this.pacienteDeHistoria.set(null),
    });

    this.laboratoriosDeHistoria.set([]);
    this.cargandoLaboratoriosHistoria.set(true);
    this.pacientesSrv.laboratorioHistorial(c.paciente_id).subscribe({
      next: (data) => { this.laboratoriosDeHistoria.set(data); this.cargandoLaboratoriosHistoria.set(false); },
      error: () => this.cargandoLaboratoriosHistoria.set(false),
    });

    this.signosVitalesDeHistoria.set([]);
    this.cargandoSignosHistoria.set(true);
    this.pacientesSrv.signosVitalesHistorial(c.paciente_id).subscribe({
      next: (data) => { this.signosVitalesDeHistoria.set(data); this.cargandoSignosHistoria.set(false); },
      error: () => this.cargandoSignosHistoria.set(false),
    });

    this.recargarRecetasDeHistoria(c);
    this.mostrarFormularioReceta.set(false);
    this.recetaEditando.set(null);

    // Signos vitales propios de esta cita (para el formulario de agregar/editar
    // dentro del tab), separado de signosVitalesDeHistoria (lista de solo lectura
    // con TODAS las citas del paciente).
    this.signosVitales.set(null);
    this.signosForm.reset();
    this.srv.obtenerSignosVitales(c.id).subscribe({
      next: (data) => { this.signosVitales.set(data); this.signosForm.reset({ ...data }); },
      error: () => {}, // 404: esta cita todavia no tiene signos vitales
    });
  }

  private recargarSignosDeHistoria(c: Cita): void {
    this.signosVitalesDeHistoria.set([]);
    this.cargandoSignosHistoria.set(true);
    this.pacientesSrv.signosVitalesHistorial(c.paciente_id).subscribe({
      next: (data) => { this.signosVitalesDeHistoria.set(data); this.cargandoSignosHistoria.set(false); },
      error: () => this.cargandoSignosHistoria.set(false),
    });
  }

  private recargarRecetasDeHistoria(c: Cita): void {
    this.recetasDeHistoria.set([]);
    this.cargandoRecetasHistoria.set(true);
    this.pacientesSrv.recetasHistorial(c.paciente_id).subscribe({
      next: (data) => { this.recetasDeHistoria.set(data); this.cargandoRecetasHistoria.set(false); },
      error: () => this.cargandoRecetasHistoria.set(false),
    });
  }

  cerrarHistoria(): void {
    this.citaHistoria.set(null);
  }

  inicialesPaciente(nombre: string | undefined): string {
    return (nombre || '')
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }

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

  // Igual que estadoImc(): vista previa en vivo mientras se escribe.
  estadoPresion(): { etiqueta: string; clase: string } | null {
    const sistolica = Number(this.signosForm.get('presion_sistolica')?.value);
    const diastolica = Number(this.signosForm.get('presion_diastolica')?.value);
    if (!sistolica || !diastolica) return null;
    return clasificarPresion(sistolica, diastolica);
  }

  estadoGlucosa(): { etiqueta: string; clase: string } | null {
    const glucosa = Number(this.signosForm.get('glucosa')?.value);
    if (!glucosa) return null;
    return clasificarGlucosa(glucosa);
  }

  // Solo se puede registrar/editar signos vitales el mismo dia de la
  // consulta o el dia siguiente; pasado eso el backend tambien lo rechaza
  // (esto es solo para deshabilitar el formulario antes de intentarlo).
  diasDesdeConsulta(cita: Cita): number {
    const hoy = new Date().toISOString().substring(0, 10);
    const msPorDia = 24 * 60 * 60 * 1000;
    return Math.round((new Date(hoy).getTime() - new Date(cita.fecha).getTime()) / msPorDia);
  }

  signosBloqueado(cita: Cita | null | undefined): boolean {
    if (!cita) return false;
    return this.diasDesdeConsulta(cita) > 1;
  }

  guardarSignos(): void {
    const desdeDrawer = this.citaSignos();
    const desdeConsulta = this.citaHistoria();
    const cita = desdeDrawer ?? desdeConsulta;
    if (!cita || this.signosBloqueado(cita)) return;
    const data = this.signosForm.getRawValue();
    const existente = this.signosVitales();
    const req = existente ? this.srv.actualizarSignosVitales(cita.id, data) : this.srv.crearSignosVitales(cita.id, data);
    req.subscribe({
      next: (sv) => {
        this.signosVitales.set(sv);
        this.cargar();
        if (desdeDrawer) this.cerrarSignos();
        else if (desdeConsulta) this.recargarSignosDeHistoria(desdeConsulta);
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

  // El formulario de receta se reusa en dos lugares: el drawer dedicado
  // "Receta" (citaReceta) y el tab "Recetas" dentro de "Consulta"
  // (citaHistoria) -- solo uno de los dos esta abierto a la vez.
  guardarReceta(): void {
    const desdeDrawer = this.citaReceta();
    const desdeConsulta = this.citaHistoria();
    const cita = desdeDrawer ?? desdeConsulta;
    if (!cita || this.recetaForm.invalid) return;
    const data = this.recetaForm.getRawValue();
    const existente = this.recetaEditando();
    const req = existente ? this.srv.actualizarReceta(existente.id, data) : this.srv.crearReceta(cita.id, data);
    req.subscribe({
      next: () => {
        this.mostrarFormularioReceta.set(false);
        this.recetaEditando.set(null);
        if (desdeDrawer) this.abrirRecetas(desdeDrawer);
        else if (desdeConsulta) this.recargarRecetasDeHistoria(desdeConsulta);
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

  crearExamenGroup(e?: Partial<{ nombre_examen: string; valor_referencia: string; resultado: string; unidad: string }>) {
    return this.fb.group({
      nombre_examen: [e?.nombre_examen ?? '', Validators.required],
      valor_referencia: [e?.valor_referencia ?? ''],
      resultado: [e?.resultado ?? ''],
      unidad: [e?.unidad ?? ''],
    });
  }

  get examenesArray(): FormArray {
    return this.laboratorioForm.get('examenes') as FormArray;
  }

  agregarExamen(): void {
    this.examenesArray.push(this.crearExamenGroup());
  }

  quitarExamen(i: number): void {
    if (this.examenesArray.length > 1) this.examenesArray.removeAt(i);
  }

  abrirLaboratorio(c: Cita): void {
    this.citaLaboratorio.set(c);
    this.ordenesLaboratorio.set([]);
    this.mostrarFormularioLaboratorio.set(false);
    this.laboratorioEditando.set(null);
    this.cargandoLaboratorio.set(true);
    this.srv.listarLaboratorio(c.id).subscribe({
      next: (data) => { this.ordenesLaboratorio.set(data); this.cargandoLaboratorio.set(false); },
      error: () => this.cargandoLaboratorio.set(false),
    });
  }

  cerrarLaboratorio(): void { this.citaLaboratorio.set(null); }

  nuevaOrdenLaboratorio(): void {
    this.laboratorioEditando.set(null);
    this.laboratorioForm.reset({ estado: 'pendiente', observaciones: '' });
    this.examenesArray.clear();
    this.examenesArray.push(this.crearExamenGroup());
    this.mostrarFormularioLaboratorio.set(true);
  }

  editarOrdenLaboratorio(o: OrdenLaboratorio): void {
    this.laboratorioEditando.set(o);
    this.laboratorioForm.reset({ estado: o.estado, observaciones: o.observaciones ?? '' });
    this.examenesArray.clear();
    o.examenes.forEach((e) => this.examenesArray.push(this.crearExamenGroup(e as any)));
    this.mostrarFormularioLaboratorio.set(true);
  }

  cancelarFormularioLaboratorio(): void {
    this.mostrarFormularioLaboratorio.set(false);
    this.laboratorioEditando.set(null);
  }

  guardarOrdenLaboratorio(): void {
    const cita = this.citaLaboratorio();
    if (!cita || this.laboratorioForm.invalid) return;
    const data = this.laboratorioForm.getRawValue();
    const existente = this.laboratorioEditando();
    const req = existente ? this.srv.actualizarLaboratorio(existente.id, data) : this.srv.crearLaboratorio(cita.id, data);
    req.subscribe({
      next: () => {
        this.mostrarFormularioLaboratorio.set(false);
        this.laboratorioEditando.set(null);
        this.abrirLaboratorio(cita);
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la orden de laboratorio'),
    });
  }

  eliminarOrdenLaboratorio(o: OrdenLaboratorio): void {
    if (!confirm('Eliminar esta orden de laboratorio?')) return;
    this.srv.eliminarLaboratorio(o.id).subscribe({
      next: () => {
        const cita = this.citaLaboratorio();
        if (cita) this.abrirLaboratorio(cita);
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la orden de laboratorio'),
    });
  }
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}
