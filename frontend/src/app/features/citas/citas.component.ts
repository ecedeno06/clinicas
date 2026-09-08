import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CitasService } from '../../core/services/citas.service';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { CampanasService } from '../../core/services/campanas.service';
import { EspecialidadesService } from '../../core/services/especialidades.service';
import { AuthService } from '../../core/services/auth.service';
import { Campana, CampanaDoctor, Cita, Disponibilidad, Doctor, Especialidad, EstadoCita, EstadoLaboratorio, FranjaHoraria, HistoriaClinica, OrdenLaboratorio, Paciente, Receta, SignosVitales, Sucursal } from '../../core/models/models';
import { clasificarImc } from '../../core/utils/imc.util';
import { clasificarPresion } from '../../core/utils/presion.util';
import { clasificarGlucosa } from '../../core/utils/glucosa.util';
import { combinar12, formatoAmPm, HORAS_12, MINUTOS_60, partes12 } from '../../core/utils/hora12.util';
import { hoyISO } from '../../core/utils/fecha.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';
import { extraerLatLng } from '../../core/components/mapa-selector/mapa-selector.component';
import { direccionPrincipal } from '../../core/utils/direccion.util';
import { generarPdf, encabezadoClinica, formatoFechaCorta } from '../../core/utils/pdf.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

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
  sucursales = signal<Sucursal[]>([]);
  especialidades = signal<Especialidad[]>([]);
  // Campanas donde ya tiene sentido agendar: aprobadas (pre-agendar antes
  // del dia del evento) o en_curso. El backend vuelve a validar esto al
  // guardar.
  campanasElegibles = signal<Campana[]>([]);
  // Doctores invitados (invitado o confirmado, no rechazado) de la
  // campana elegida en el formulario -- si hay una campana seleccionada,
  // solo ellos pueden agendarse; el backend vuelve a validar esto de
  // todas formas, este filtro es solo comodidad de UI.
  doctoresConfirmadosCampana = signal<CampanaDoctor[] | null>(null);
  panelAbierto = signal(false);
  tabCita = signal<'cita' | 'historial'>('cita');
  editando = signal<Cita | null>(null);
  logDeCitaDesc = computed(() => [...(this.editando()?.log ?? [])].reverse());
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
  // Franja/bloques del doctor en la sucursal elegida en el formulario --
  // "ocupados" es a nivel de doctor completo (ver disponibilidad(), no
  // depende de la sucursal), pero atiende/libres si dependen de cual sede.
  // Metodo normal (no computed): depende de un FormControl, no de una senal,
  // asi que se recalcula en cada deteccion de cambios (mismo patron que
  // sinDisponibilidad()/horarioSinCambios() mas abajo).
  disponibilidadSucursalActual() {
    const disp = this.disponibilidad();
    const sucursalId = this.form.get('sucursal_id')?.value;
    if (!disp || !sucursalId) return null;
    return disp.sucursales.find((s) => s.sucursal_id === sucursalId) ?? null;
  }

  filtroFecha = signal('');
  filtroPaciente = signal('');
  filtroDoctor = signal('');
  filtroSucursal = signal('');
  filtroCampana = signal('');
  filtroEstado = signal('');

  hayFiltros = computed(() => !!(this.filtroFecha() || this.filtroPaciente() || this.filtroDoctor() || this.filtroSucursal() || this.filtroCampana() || this.filtroEstado()));

  limpiarFiltros(): void {
    this.filtroFecha.set('');
    this.filtroPaciente.set('');
    this.filtroDoctor.set('');
    this.filtroSucursal.set('');
    this.filtroCampana.set('');
    this.filtroEstado.set('');
  }

  citasFiltradas = computed(() => {
    const fecha = this.filtroFecha().trim().toLowerCase();
    const paciente = this.filtroPaciente().trim().toLowerCase();
    const doctor = this.filtroDoctor().trim().toLowerCase();
    const sucursal = this.filtroSucursal().trim().toLowerCase();
    const campana = this.filtroCampana().trim().toLowerCase();
    const estado = this.filtroEstado().trim().toLowerCase();

    return this.citas().filter((c) => {
      if (fecha && !formatearFecha(c.fecha).includes(fecha)) return false;
      if (paciente && !(c.paciente_nombre ?? '').toLowerCase().includes(paciente)) return false;
      if (doctor && !(c.doctor_nombre ?? '').toLowerCase().includes(doctor)) return false;
      if (sucursal && !(c.sucursal_nombre ?? '').toLowerCase().includes(sucursal)) return false;
      if (campana && !(c.campana_nombre || 'Normal').toLowerCase().includes(campana)) return false;
      if (estado && !c.estado.toLowerCase().includes(estado)) return false;
      return true;
    });
  });

  form = this.fb.group({
    paciente_id: ['', Validators.required],
    especialidad_id: [''],
    doctor_id: ['', Validators.required],
    sucursal_id: ['', Validators.required],
    campana_id: [''],
    es_domicilio: [false],
    es_urgencia: [false],
    fecha: [hoyISO(), Validators.required],
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
    estado: ['atendida' as EstadoCita],
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
    private sucursalesSrv: SucursalesService,
    private campanasSrv: CampanasService,
    private especialidadesSrv: EspecialidadesService,
    private route: ActivatedRoute,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.pacientesSrv.listar().subscribe((data) => this.pacientes.set(data));
    this.doctoresSrv.listar().subscribe((data) => this.doctores.set(data));
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
    this.especialidadesSrv.listar().subscribe((data) => this.especialidades.set(data.filter((e) => e.activo)));
    this.campanasSrv.listar().subscribe((data) => {
      this.campanasElegibles.set(data.filter((c) => c.estado === 'aprobada' || c.estado === 'en_curso'));
    });

    this.form.get('doctor_id')!.valueChanges.subscribe(() => this.actualizarDisponibilidad());
    this.form.get('fecha')!.valueChanges.subscribe(() => this.actualizarDisponibilidad());
    this.form.get('campana_id')!.valueChanges.subscribe((campanaId) => this.onCambioCampana(campanaId));
    this.form.get('especialidad_id')!.valueChanges.subscribe(() => this.onCambioEspecialidad());

    // Llegar aqui desde otra pantalla (ej. "Agenda del dia" o "Laboratorios
    // pendientes" del tablero) puede traer ?fecha=dd/mm/aaaa&paciente=...
    // &doctor=...&sucursal=... para acotar la lista a esa cita puntual, o
    // respetar el filtro de sucursal que tenia activo el tablero.
    const params = this.route.snapshot.queryParamMap;
    if (params.get('fecha')) this.filtroFecha.set(params.get('fecha')!);
    if (params.get('paciente')) this.filtroPaciente.set(params.get('paciente')!);
    if (params.get('doctor')) this.filtroDoctor.set(params.get('doctor')!);
    if (params.get('sucursal')) this.filtroSucursal.set(params.get('sucursal')!);
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

  // Cuando el usuario elige/quita una campana a proposito, el doctor
  // seleccionado se limpia siempre. No es solo prolijidad: al cambiar la
  // lista de opciones del <select> de Doctor, el navegador puede quedarse
  // mostrando visualmente la primera opcion disponible aunque Angular
  // nunca haya registrado ese cambio -- el formulario queda con
  // doctor_id desactualizado (invalido) sin que se note, y ni el boton
  // Guardar ni la disponibilidad reaccionan hasta que el usuario hace
  // clic de verdad en algun campo. Limpiar el control fuerza una eleccion
  // real y evita ese "fantasma".
  onCambioCampana(campanaId: string | null): void {
    this.form.patchValue({ doctor_id: '' });
    this.cargarDoctoresCampana(campanaId);
    this.actualizarBloqueoFecha(campanaId);
  }

  // La fecha de una cita de campana la define la campana, no el usuario --
  // se fija (a fecha_inicio, por si la campana dura varios dias) y se
  // bloquea el campo. Al volver a "Ninguna", se libera y vuelve a hoy.
  private actualizarBloqueoFecha(campanaId: string | null): void {
    const fechaCtrl = this.form.get('fecha')!;
    if (!campanaId) {
      fechaCtrl.enable({ emitEvent: false });
      return;
    }
    const campana = this.campanasElegibles().find((c) => c.id === campanaId);
    if (campana) {
      fechaCtrl.setValue(campana.fecha_inicio.substring(0, 10), { emitEvent: false });
    }
    fechaCtrl.disable({ emitEvent: false });
  }

  campanaSeleccionada(): Campana | null {
    const id = this.form.get('campana_id')?.value;
    return id ? this.campanasElegibles().find((c) => c.id === id) ?? null : null;
  }

  // Solo carga la lista de doctores invitados (incluye "invitado" y
  // "confirmado", excluye "rechazado"), sin tocar el doctor ya elegido --
  // para usar desde abrirNuevo()/abrirEditar(), donde el doctor_id que se
  // acaba de fijar (o que viene de una cita existente) debe conservarse.
  private cargarDoctoresCampana(campanaId: string | null): void {
    if (!campanaId) { this.doctoresConfirmadosCampana.set(null); return; }
    this.campanasSrv.listarDoctores(campanaId).subscribe({
      next: (data) => this.doctoresConfirmadosCampana.set(data.filter((d) => d.estado !== 'rechazado')),
      error: () => this.doctoresConfirmadosCampana.set([]),
    });
  }

  // Si hay una campana elegida, solo sus doctores invitados aparecen como
  // opcion -- el backend vuelve a exigir esto al guardar, esto es solo UI.
  // Ademas, si se eligio una especialidad puntual (no "Todas"), se acota a
  // los doctores que la tengan -- especialidad_id es solo un filtro de UI,
  // no se valida en el backend (ver migracion 019_doctor_especialidades.sql).
  doctoresParaCita(): Doctor[] {
    const confirmados = this.doctoresConfirmadosCampana();
    let lista = confirmados
      ? this.doctores().filter((d) => new Set(confirmados.map((c) => c.doctor_id)).has(d.id))
      : this.doctores();

    const especialidadId = this.form.get('especialidad_id')?.value;
    if (especialidadId) {
      lista = lista.filter((d) => d.especialidades.some((e) => e.especialidad_id === especialidadId));
    }
    return lista;
  }

  // Cambiar la especialidad a proposito limpia el doctor elegido, mismo
  // motivo que onCambioCampana: el <select> de Doctor cambia sus opciones y
  // el navegador puede quedarse mostrando una opcion que Angular nunca
  // registro como seleccionada.
  onCambioEspecialidad(): void {
    this.form.patchValue({ doctor_id: '' });
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
      && v.sucursal_id === original.sucursal_id
      && v.fecha === original.fecha?.substring(0, 10)
      && v.hora_inicio === original.hora_inicio?.substring(0, 5)
      && v.hora_fin === original.hora_fin?.substring(0, 5);
  }

  // Solo bloquea Guardar cuando el doctor SI tiene un horario configurado
  // (al menos un bloque, en cualquier dia) pero ese dia no atiende en la
  // sucursal elegida, o ya esta completo ahi. Un doctor sin ningun horario
  // cargado todavia sigue pudiendo recibir citas con total libertad, como
  // antes de este tablero.
  //
  // Si la cita es de una campana, este chequeo NO aplica: una campana
  // puede reclutar doctores que no trabajan regularmente en esa sucursal
  // (ver DISENO-CAMPANAS-MEDICAS.md seccion 9) -- lo que manda ahi es que
  // el doctor este confirmado en la campana, ya validado por el backend
  // (y el chequeo de choque campana-vs-horario, ver choqueCampana.js).
  sinDisponibilidad(): boolean {
    if (this.form.get('campana_id')?.value) return false;
    if (this.form.get('es_urgencia')?.value) return false;
    if (this.horarioSinCambios()) return false;
    const disp = this.disponibilidad();
    if (!disp || !disp.tiene_horario_configurado) return false;
    const sucursalDisp = this.disponibilidadSucursalActual();
    if (!sucursalDisp) return true;
    return !sucursalDisp.atiende || sucursalDisp.libres.length === 0;
  }

  formatoAmPm = formatoAmPm;
  direccionPrincipal = direccionPrincipal;

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

  // Solo quien creo la receta puede editarla/eliminarla. Las recetas de
  // antes de este campo (creado_por null, autor desconocido) quedan sin
  // restriccion para no bloquear registros historicos.
  puedeModificarReceta(r: Receta): boolean {
    return !r.creado_por || r.creado_por === this.auth.usuario()?.id;
  }

  // Solo tiene sentido ofrecer "compartir ubicacion" si hay a donde
  // mandarlo (telefono del paciente, marcado explicitamente como que
  // recibe WhatsApp) y que mandar (enlace de la sucursal).
  puedeCompartirUbicacion(c: Cita): boolean {
    return !!c.paciente_telefono && !!c.paciente_acepta_whatsapp && !!c.sucursal_google_maps_url;
  }

  // wa.me abre WhatsApp Web/app con el mensaje precargado para ese numero
  // -- no requiere API ni cuenta de WhatsApp Business.
  whatsappUrl(c: Cita): string {
    const telefono = (c.paciente_telefono || '').replace(/\D/g, '');
    const empresa = this.auth.empresaActiva()?.empresa_nombre;

    const lineas = [
      `Hola ${c.paciente_nombre}, te confirmamos los datos de tu cita en ${empresa}:`,
      '',
      `Fecha: ${formatearFecha(c.fecha)}`,
      `Hora: ${formatoAmPm(c.hora_inicio)} - ${formatoAmPm(c.hora_fin)}`,
      `Doctor: ${c.doctor_nombre} (${c.especialidad_nombre})`,
      `Sucursal: ${c.sucursal_nombre}${c.sucursal_direccion ? ' - ' + c.sucursal_direccion : ''}`,
    ];
    if (c.sucursal_hora_apertura && c.sucursal_hora_cierre) {
      lineas.push(`Horario de atencion de la sucursal: ${formatoAmPm(c.sucursal_hora_apertura)} - ${formatoAmPm(c.sucursal_hora_cierre)}`);
    }
    lineas.push('', `Ubicacion (Google Maps): ${c.sucursal_google_maps_url}`);

    // Waze es muy usado en la region junto a Google Maps -- si se puede
    // extraer lat/lng del enlace guardado, se ofrece tambien el link
    // directo para abrir la navegacion en Waze.
    const coords = extraerLatLng(c.sucursal_google_maps_url);
    if (coords) {
      lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
    }

    return `https://wa.me/${telefono}?text=${encodeURIComponent(lineas.join('\n'))}`;
  }

  abrirNuevo(): void {
    this.editando.set(null);
    this.disponibilidad.set(null);
    this.tabCita.set('cita');
    // emitEvent:false para no disparar actualizarDisponibilidad() a mitad del
    // reset (doctor_id y fecha cambiarian en dos eventos separados, el
    // primero con el otro campo todavia con el valor viejo) -- se llama una
    // sola vez, ya con el formulario completo, justo debajo.
    this.form.reset({ sucursal_id: this.sucursales()[0]?.id ?? '', especialidad_id: '', campana_id: '', es_domicilio: false, es_urgencia: false, fecha: hoyISO(), estado: 'pendiente' }, { emitEvent: false });
    this.errorGuardar.set(null);
    this.panelAbierto.set(true);
    this.actualizarDisponibilidad();
    this.cargarDoctoresCampana(null);
    this.actualizarBloqueoFecha(null);
  }

  abrirEditar(c: Cita): void {
    this.editando.set(c);
    this.disponibilidad.set(null);
    this.tabCita.set('cita');
    this.form.reset({
      paciente_id: c.paciente_id,
      especialidad_id: c.especialidad_id ?? '',
      doctor_id: c.doctor_id,
      sucursal_id: c.sucursal_id ?? this.sucursales()[0]?.id ?? '',
      campana_id: c.campana_id ?? '',
      es_domicilio: c.es_domicilio ?? false,
      es_urgencia: c.es_urgencia ?? false,
      fecha: c.fecha.substring(0, 10),
      hora_inicio: c.hora_inicio?.substring(0, 5),
      hora_fin: c.hora_fin?.substring(0, 5),
      motivo: c.motivo ?? '',
      observaciones: c.observaciones ?? '',
      estado: c.estado,
    }, { emitEvent: false });
    this.errorGuardar.set(null);
    this.panelAbierto.set(true);
    this.actualizarDisponibilidad();
    this.cargarDoctoresCampana(c.campana_id ?? null);
    this.actualizarBloqueoFecha(c.campana_id ?? null);
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
    // El dropdown de estado maneja los 3 desenlaces de una consulta
    // (atendida/cancelada/reagendar), mas "pendiente" si la cita todavia
    // esta vigente -- si la cita esta en otro estado (confirmada,
    // no_asistio) o "pendiente" ya no aplica (cita vencida), se ofrece
    // "Atendida" por defecto en vez de un valor que el dropdown no puede
    // representar.
    const estadosValidos: EstadoCita[] = this.citaVigente(c)
      ? ['pendiente', 'atendida', 'cancelada', 'reagendar']
      : ['atendida', 'cancelada', 'reagendar'];
    const estadoInicial = estadosValidos.includes(c.estado) ? c.estado : 'atendida';
    // Si todavia no existe historia clinica para esta cita, se precarga el
    // motivo que ya quedo anotado al agendarla (c.motivo) para que el
    // doctor no tenga que volver a escribirlo -- si ya hay una historia
    // guardada, se respeta tal cual lo que el doctor escribio ahi.
    this.historiaForm.reset({ motivo_consulta: c.motivo ?? '', estado: estadoInicial });
    this.cargandoHistoria.set(true);
    this.srv.obtenerHistoria(c.id).subscribe({
      next: (data) => {
        this.historia.set(data);
        this.historiaForm.reset({ ...data, estado: estadoInicial });
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
    const hoy = hoyISO();
    const msPorDia = 24 * 60 * 60 * 1000;
    return Math.round((new Date(hoy).getTime() - new Date(cita.fecha).getTime()) / msPorDia);
  }

  // La opcion "Pendiente" del estado de la cita solo tiene sentido si la
  // cita todavia no paso en el tiempo (hoy o una fecha futura).
  citaVigente(cita: Cita | null | undefined): boolean {
    if (!cita) return false;
    return cita.fecha.substring(0, 10) >= hoyISO();
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
        const desdeDrawer = this.citaReceta();
        const desdeConsulta = this.citaHistoria();
        if (desdeDrawer) this.abrirRecetas(desdeDrawer);
        else if (desdeConsulta) this.recargarRecetasDeHistoria(desdeConsulta);
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la receta'),
    });
  }

  imprimirReceta(r: Receta): void {
    const empresa = this.auth.empresaActiva();
    const doctorNombre = r.doctor_nombre || this.citaReceta()?.doctor_nombre || '';
    const especialidad = this.citaReceta()?.especialidad_nombre;
    const pacienteNombre = this.citaReceta()?.paciente_nombre || this.pacienteDeHistoria()?.nombre || '';

    const filas = r.medicamentos.map((m) => [
      m.medicamento,
      m.dosis || '-',
      m.frecuencia || '-',
      m.duracion || '-',
      m.indicaciones || '-',
    ]);

    const doc: TDocumentDefinitions = {
      pageMargins: [30, 30, 30, 30],
      content: [
        ...(encabezadoClinica(empresa?.empresa_logo, empresa?.empresa_nombre, 'Receta médica') as any[]),
        { text: especialidad ? `${doctorNombre}  ·  ${especialidad}` : doctorNombre, margin: [0, 0, 0, 2] },
        { text: `Paciente: ${pacienteNombre}`, margin: [0, 0, 0, 2] },
        { text: `Fecha: ${r.created_at ? formatoFechaCorta(r.created_at) : ''}`, color: '#64748b', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', '*'],
            body: [
              ['Medicamento', 'Dosis', 'Frecuencia', 'Duración', 'Indicaciones'].map((t) => ({ text: t, bold: true })),
              ...filas,
            ],
          },
          layout: 'lightHorizontalLines',
        },
        ...(r.indicaciones_generales ? [{ text: `Indicaciones generales: ${r.indicaciones_generales}`, margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
      ],
      defaultStyle: { fontSize: 9 },
    };

    generarPdf(doc);
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
