import { Component, OnInit, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, forkJoin, map, of } from 'rxjs';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CitasService } from '../../core/services/citas.service';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { CampanasService } from '../../core/services/campanas.service';
import { EspecialidadesService } from '../../core/services/especialidades.service';
import { AuthService } from '../../core/services/auth.service';
import { CategoriasAntecedentesService } from '../../core/services/categoriasAntecedentes.service';
import { AntecedentesPatologicosService } from '../../core/services/antecedentesPatologicos.service';
import { PacienteAntecedentesService } from '../../core/services/pacienteAntecedentes.service';
import { CategoriasExamenesLaboratorioService } from '../../core/services/categoriasExamenesLaboratorio.service';
import { ExamenesLaboratorioCatalogoService } from '../../core/services/examenesLaboratorioCatalogo.service';
import { Campana, CampanaDoctor, Cita, Disponibilidad, Doctor, Especialidad, EstadoCita, EstadoCitaMostrado, EstadoLaboratorio, ExamenLaboratorio, FamiliarPaciente, FranjaHoraria, HistoriaClinica, OrdenLaboratorio, Paciente, PacienteAntecedente, Receta, SignosVitales, Sucursal, CategoriaAntecedente, AntecedentePatologico, CategoriaExamenLaboratorio, ExamenLaboratorioCatalogo } from '../../core/models/models';
import { clasificarImc } from '../../core/utils/imc.util';
import { clasificarPresion } from '../../core/utils/presion.util';
import { clasificarGlucosa } from '../../core/utils/glucosa.util';
import { combinar12, combinarHoraFin12, formatoAmPm, HORAS_12, MINUTOS_60, partes12 } from '../../core/utils/hora12.util';
import { hoyISO } from '../../core/utils/fecha.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';
import { BuscadorAntecedenteComponent } from '../../core/components/buscador-antecedente/buscador-antecedente.component';
import { BuscadorPacienteComponent } from '../../core/components/buscador-paciente/buscador-paciente.component';
import { PacienteRapidoFormComponent } from '../../core/components/paciente-rapido-form/paciente-rapido-form.component';
import { extraerLatLng } from '../../core/components/mapa-selector/mapa-selector.component';
import { direccionPrincipal } from '../../core/utils/direccion.util';
import { generarPdf, encabezadoClinica, formatoFechaCorta } from '../../core/utils/pdf.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { MiniCalendarioMesComponent } from './calendario/mini-calendario-mes.component';
import { CalendarioDiaComponent, CeldaVaciaClick } from './calendario/calendario-dia.component';
import { CitaDetallePopoverComponent } from './calendario/cita-detalle-popover.component';
import { colorEstadoCita, estadoEfectivo, iniciales } from './calendario/calendario.util';

@Component({
  selector: 'app-citas',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SelectorFotoComponent,
    BuscadorAntecedenteComponent,
    BuscadorPacienteComponent,
    PacienteRapidoFormComponent,
    MiniCalendarioMesComponent,
    CalendarioDiaComponent,
    CitaDetallePopoverComponent,
  ],
  templateUrl: './citas.component.html',
  styleUrl: './citas.component.css',
})
export class CitasComponent implements OnInit {
  citas = signal<Cita[]>([]);

  // Popup con la foto del paciente (300x300) al hacer clic en el icono
  // junto a su nombre en la tabla (Lista). "fixed" con posicion calculada
  // en JS (no un simple CSS :hover/absolute) porque la tabla vive dentro
  // de .table-wrap { overflow: auto }, que recortaria un popup
  // posicionado "absolute" -- mismo problema y misma solucion que el menu
  // de WhatsApp en pacientes.component.ts.
  pacienteFotoAbierta = signal<Cita | null>(null);
  pacienteFotoPos = signal<{ top: number; left: number } | null>(null);

  toggleFotoPaciente(c: Cita, event: MouseEvent): void {
    if (this.pacienteFotoAbierta()?.id === c.id) {
      this.pacienteFotoAbierta.set(null);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // 300px de foto + 10px de padding a cada lado (ver .paciente-foto-popup-grande).
    const ladoPopup = 320;
    // Si no cabe hacia abajo (fila cerca del borde inferior de la pantalla),
    // se abre hacia arriba en su lugar -- igual que un tooltip/dropdown que
    // se "voltea" cuando no hay espacio.
    const espacioAbajo = window.innerHeight - rect.bottom;
    const top = espacioAbajo >= ladoPopup + 6 ? rect.bottom + 6 : Math.max(8, rect.top - ladoPopup - 6);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - ladoPopup - 8));
    this.pacienteFotoPos.set({ top, left });
    this.pacienteFotoAbierta.set(c);
  }

  cerrarFotoPaciente(): void {
    this.pacienteFotoAbierta.set(null);
  }

  pacientes = signal<Paciente[]>([]);
  // Mini-formulario de creacion rapida de paciente (ver
  // abrirPacienteRapido()), disparado desde app-buscador-paciente cuando
  // no encuentra a nadie entre los pacientes ya vinculados a esta clinica.
  pacienteRapidoAbierto = signal(false);
  nombreParaPacienteRapido = signal('');
  @ViewChild(BuscadorPacienteComponent) buscadorPaciente?: BuscadorPacienteComponent;
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
  tabHistoria = signal<'consulta' | 'signos' | 'antecedentes' | 'recetas' | 'laboratorios' | 'familiares'>('consulta');
  pacienteDeHistoria = signal<Paciente | null>(null);
  antecedenteSeleccionado = signal<PacienteAntecedente | null>(null);

  // ---------- Agregar antecedente patologico desde la consulta ----------
  categoriasCatalogo = signal<CategoriaAntecedente[]>([]);
  antecedentesCatalogo = signal<AntecedentePatologico[]>([]);
  mostrarFormAntecedenteConsulta = signal(false);
  antecedenteConsultaForm = this.fb.group({
    antecedente_id: ['', Validators.required],
    fecha_inicio: [''],
    tratamiento: [''],
    observacion: [''],
  });

  // Excluye los que el paciente ya tiene registrados (unique(paciente_id,
  // antecedente_id) en el backend).
  catalogoAgrupadoConsulta = computed(() => {
    const yaRegistrados = new Set((this.pacienteDeHistoria()?.antecedentes ?? []).map((a) => a.antecedente_id));
    const disponibles = this.antecedentesCatalogo().filter((a) => a.activo && !yaRegistrados.has(a.id));
    const grupos = new Map<string, AntecedentePatologico[]>();
    for (const a of disponibles) {
      const nombreCategoria = a.categoria_nombre || 'Otros';
      if (!grupos.has(nombreCategoria)) grupos.set(nombreCategoria, []);
      grupos.get(nombreCategoria)!.push(a);
    }
    return [...grupos.entries()].map(([categoria, items]) => ({ categoria, items }));
  });

  // ---------- Catalogo de examenes de laboratorio (checklist en la orden) ----------
  categoriasExamenesLabCatalogo = signal<CategoriaExamenLaboratorio[]>([]);
  examenesLabCatalogo = signal<ExamenLaboratorioCatalogo[]>([]);
  catalogoAgrupadoExamenes = computed(() => {
    const activos = this.examenesLabCatalogo().filter((e) => e.activo);
    const grupos = new Map<string, ExamenLaboratorioCatalogo[]>();
    for (const e of activos) {
      const nombreCategoria = e.categoria_nombre || 'Otros';
      if (!grupos.has(nombreCategoria)) grupos.set(nombreCategoria, []);
      grupos.get(nombreCategoria)!.push(e);
    }
    return [...grupos.entries()].map(([categoria, items]) => ({ categoria, items }));
  });
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

  // Mismo patron: metodo normal (no computed), depende de un FormControl.
  sucursalSeleccionada() {
    const sucursalId = this.form.get('sucursal_id')?.value;
    if (!sucursalId) return null;
    return this.sucursales().find((s) => s.id === sucursalId) ?? null;
  }

  filtroFecha = signal('');
  filtroPaciente = signal('');
  filtroDoctor = signal('');
  filtroSucursal = signal('');
  filtroCampana = signal('');
  filtroEstado = signal('');

  // Selector rapido en el encabezado de la Lista: "Todas" (default, sin
  // acotar por fecha) o "Rango de fechas" (desde/hasta, ambos inclusive --
  // un solo dia se logra poniendo la misma fecha en los dos). Independiente
  // del filtro de texto de la columna Fecha (filtroFecha), que sigue
  // sirviendo para busquedas por substring.
  filtroFechaModo = signal<'todas' | 'seleccionada'>('todas');
  fechaListaDesde = signal(hoyISO());
  fechaListaHasta = signal(hoyISO());

  // Un usuario con rol 'doctor' solo puede ver SUS propias citas -- no es
  // un simple filtro de conveniencia que se pueda quitar, sino el alcance
  // real de lo que se le pide al backend (ver cargar()/cargarCalendario()),
  // asi que el campo "Doctor" queda fijo con su propio nombre y no cuenta
  // como "hay filtros" ni se toca al Limpiar. miDoctorId se resuelve una
  // sola vez via doctoresSrv.miPerfil() (ver ngOnInit).
  miDoctorId = signal<string | null>(null);
  filtroDoctorBloqueado = computed(() => this.auth.usuario()?.rol === 'doctor');

  hayFiltros = computed(() => !!(this.filtroFecha() || this.filtroPaciente() || (!this.filtroDoctorBloqueado() && this.filtroDoctor()) || this.filtroSucursal() || this.filtroCampana() || this.filtroEstado()));

  limpiarFiltros(): void {
    this.filtroFecha.set('');
    this.filtroPaciente.set('');
    if (!this.filtroDoctorBloqueado()) this.filtroDoctor.set('');
    this.filtroSucursal.set('');
    this.filtroCampana.set('');
    this.filtroEstado.set('');
  }

  // ---------- Vista Calendario (dia, por doctor) ----------
  vista = signal<'lista' | 'calendario'>('lista');
  // 'vencida' es un estado derivado (ver calendario.util.ts#estadoEfectivo),
  // no una opcion real de estado -- se incluye aca solo para poder
  // filtrar/mostrar en la leyenda del calendario, nunca para escribirla.
  readonly estadosCita: EstadoCitaMostrado[] = ['pendiente', 'vencida', 'confirmada', 'atendida', 'cancelada', 'no_asistio', 'reagendar'];
  iniciales = iniciales;
  colorEstadoCita = colorEstadoCita;
  estadoEfectivo = estadoEfectivo;

  fechaCalendario = signal(hoyISO());
  citasCalendario = signal<Cita[]>([]);
  cargandoCalendario = signal(false);
  // Sucursal es el unico filtro que se manda al backend (junto con la
  // fecha); doctor y estado se aplican en cliente sobre lo ya cargado del
  // dia (ver seccion 4/5 del plan) -- el calendario nunca deja de mostrar
  // "todos" solo porque se agrego un doctor nuevo despues.
  filtroCalSucursal = signal('');
  // Solo filtra que doctores se muestran como columna (client-side, igual
  // que filtroCalDoctorIds) -- no es un parametro de GET /citas, la
  // especialidad de una cita puntual puede diferir de con cual la agendaron.
  filtroCalEspecialidad = signal('');
  filtroCalDoctorIds = signal<Set<string>>(new Set());
  filtroCalEstados = signal<Set<EstadoCitaMostrado>>(new Set(this.estadosCita));

  citaPopover = signal<Cita | null>(null);
  origenPopover = signal<HTMLElement | null>(null);

  // Disponibilidad de cada doctor activo para la fecha mostrada -- una
  // llamada por doctor (igual que sugiere el plan para no necesitar un
  // endpoint batch nuevo), usada por CalendarioDiaComponent para sombrear
  // las horas en que no atiende y para bloquear el clic en una celda vacia
  // fuera de su horario.
  disponibilidadCalendarioPorDoctor = signal<Map<string, Disponibilidad>>(new Map());

  fechaCalendarioLegible = computed(() => {
    const [anio, mes, dia] = this.fechaCalendario().split('-').map(Number);
    const texto = new Date(anio, mes - 1, dia).toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  doctoresActivos = computed(() => this.doctores().filter((d) => d.activo));

  // Conjunto vacio = "todos" (asi un doctor nuevo aparece sin tener que
  // tocar el filtro); ver toggleFiltroCalDoctor().
  doctoresVisiblesCalendario = computed(() => {
    // Un doctor solo ve su propia columna -- ni el resto de sus colegas
    // aparecen en el calendario (mismo alcance que ya aplica al dato via
    // cargarCalendario(), aca ademas se refleja en las columnas mostradas).
    if (this.filtroDoctorBloqueado()) {
      return this.doctoresActivos().filter((d) => d.id === this.miDoctorId());
    }
    const seleccionados = this.filtroCalDoctorIds();
    const especialidadId = this.filtroCalEspecialidad();
    let lista = seleccionados.size === 0 ? this.doctoresActivos() : this.doctoresActivos().filter((d) => seleccionados.has(d.id));
    if (especialidadId) lista = lista.filter((d) => d.especialidades.some((e) => e.especialidad_id === especialidadId));
    return lista;
  });

  citasCalendarioFiltradas = computed(() => {
    const doctorIds = this.filtroCalDoctorIds();
    const estados = this.filtroCalEstados();
    return this.citasCalendario().filter((c) => {
      if (doctorIds.size > 0 && !doctorIds.has(c.doctor_id)) return false;
      if (!estados.has(estadoEfectivo(c))) return false;
      return true;
    });
  });

  cambiarVista(v: 'lista' | 'calendario'): void {
    this.vista.set(v);
    if (v === 'calendario') this.cargarCalendario();
  }

  cargarCalendario(): void {
    this.cargandoCalendario.set(true);
    const filtros: Record<string, string> = { desde: this.fechaCalendario(), hasta: this.fechaCalendario() };
    if (this.filtroCalSucursal()) filtros['sucursal_id'] = this.filtroCalSucursal();
    if (this.miDoctorId()) filtros['doctor_id'] = this.miDoctorId()!;
    this.srv.listar(filtros).subscribe({
      next: (data) => { this.citasCalendario.set(data); this.cargandoCalendario.set(false); },
      error: () => this.cargandoCalendario.set(false),
    });
    this.cargarDisponibilidadCalendario();
  }

  // Un llamado por doctor activo (no hay endpoint batch), en paralelo con
  // forkJoin -- aceptable para un dia con pocos doctores visibles (ver
  // "Fuera de alcance de esta v1" del plan). Si algun doctor individual
  // falla, se le deja sin restriccion en vez de romper todo el calendario.
  private cargarDisponibilidadCalendario(): void {
    const doctores = this.doctoresActivos();
    if (doctores.length === 0) { this.disponibilidadCalendarioPorDoctor.set(new Map()); return; }
    const fecha = this.fechaCalendario();
    forkJoin(
      doctores.map((d) =>
        this.doctoresSrv.disponibilidad(d.id, fecha).pipe(
          map((disp) => [d.id, disp] as const),
          catchError(() => of([d.id, null] as const))
        )
      )
    ).subscribe((resultados) => {
      const mapa = new Map<string, Disponibilidad>();
      for (const [doctorId, disp] of resultados) {
        if (disp) mapa.set(doctorId, disp);
      }
      this.disponibilidadCalendarioPorDoctor.set(mapa);
    });
  }

  irAHoy(): void { this.fechaCalendario.set(hoyISO()); this.cargarCalendario(); }

  irADia(delta: number): void {
    const [anio, mes, dia] = this.fechaCalendario().split('-').map(Number);
    this.fechaCalendario.set(fechaISO(new Date(anio, mes - 1, dia + delta)));
    this.cargarCalendario();
  }

  seleccionarFechaCalendario(fecha: string): void {
    this.fechaCalendario.set(fecha);
    this.cargarCalendario();
  }

  onFiltroCalSucursalChange(sucursalId: string): void {
    this.filtroCalSucursal.set(sucursalId);
    this.cargarCalendario();
  }

  // Vacio representa "todos" -- si al desmarcar uno quedan todos los demas
  // marcados, se vuelve a vaciar el set (ver doctoresVisiblesCalendario).
  toggleFiltroCalDoctor(doctorId: string): void {
    const idsActivos = this.doctoresActivos().map((d) => d.id);
    const actuales = this.filtroCalDoctorIds().size === 0 ? new Set(idsActivos) : new Set(this.filtroCalDoctorIds());
    if (actuales.has(doctorId)) actuales.delete(doctorId); else actuales.add(doctorId);
    this.filtroCalDoctorIds.set(actuales.size === idsActivos.length ? new Set() : actuales);
  }

  toggleFiltroCalEstado(estado: EstadoCitaMostrado): void {
    const actuales = new Set(this.filtroCalEstados());
    if (actuales.has(estado)) actuales.delete(estado); else actuales.add(estado);
    this.filtroCalEstados.set(actuales);
  }

  imprimirCalendario(): void { window.print(); }

  abrirPopover(cita: Cita, origen: HTMLElement): void {
    this.citaPopover.set(cita);
    this.origenPopover.set(origen);
  }

  cerrarPopover(): void {
    this.citaPopover.set(null);
    this.origenPopover.set(null);
  }

  cambiarEstadoDesdePopover(estado: EstadoCita): void {
    const cita = this.citaPopover();
    if (!cita) return;
    this.srv.actualizar(cita.id, { estado }).subscribe({
      // cargar() (no cargarCalendario() directo) para que la vista Lista
      // tambien quede al dia -- ver el comentario en cargar().
      next: (actualizada) => { this.citaPopover.set(actualizada); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo actualizar el estado'),
    });
  }

  // Clic en una celda vacia del calendario: mismo formulario de "Nueva
  // cita" de siempre, solo que ya viene con doctor/fecha/horario
  // precargados (mismo patron que elegirFranja()).
  abrirNuevoDesdeCelda(c: CeldaVaciaClick): void {
    this.abrirNuevo();
    // Precarga tambien la especialidad del doctor (si tiene alguna) junto
    // con el resto -- sin esto quedaba en "Todas", y si el usuario la
    // elegia a mano despues, onCambioEspecialidad() borraba el doctor que
    // se acababa de precargar (obligando a volver a elegirlo). Al venir
    // en el mismo patchValue con emitEvent:false, no dispara ese efecto.
    const doctor = this.doctores().find((d) => d.id === c.doctorId);
    const especialidadId = doctor?.especialidades[0]?.especialidad_id ?? '';
    // emitEvent:false por el mismo motivo que en abrirNuevo(): evitar que
    // doctor_id y fecha disparen actualizarDisponibilidad() por separado,
    // uno con el otro campo todavia sin el valor nuevo.
    this.form.patchValue({ especialidad_id: especialidadId, doctor_id: c.doctorId, fecha: this.fechaCalendario(), hora_inicio: c.hora_inicio, hora_fin: c.hora_fin }, { emitEvent: false });
    this.actualizarDisponibilidad();
  }

  // Arrastrar y soltar una cita a otra hora dentro de su misma columna --
  // el backend ya valida choques de horario/paciente al actualizar, igual
  // que el formulario de edicion normal.
  moverCita(ev: { cita: Cita; hora_inicio: string; hora_fin: string }): void {
    this.srv.actualizar(ev.cita.id, { hora_inicio: ev.hora_inicio, hora_fin: ev.hora_fin }).subscribe({
      // cargar() (no cargarCalendario() directo) para que la vista Lista
      // tambien quede al dia -- ver el comentario en cargar().
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo reagendar la cita'),
    });
  }

  // Las acciones del popover reutilizan tal cual los metodos que ya usa la
  // tabla -- solo hay que cerrar el popover primero.
  editarDesdePopover(c: Cita): void { this.cerrarPopover(); this.abrirEditar(c); }
  eliminarDesdePopover(c: Cita): void { this.cerrarPopover(); this.eliminar(c); }
  abrirHistoriaDesdePopover(c: Cita): void { this.cerrarPopover(); this.abrirHistoria(c); }
  abrirSignosDesdePopover(c: Cita): void { this.cerrarPopover(); this.abrirSignos(c); }
  abrirRecetasDesdePopover(c: Cita): void { this.cerrarPopover(); this.abrirRecetas(c); }
  abrirLaboratorioDesdePopover(c: Cita): void { this.cerrarPopover(); this.abrirLaboratorio(c); }

  citasFiltradas = computed(() => {
    const fecha = this.filtroFecha().trim().toLowerCase();
    const paciente = this.filtroPaciente().trim().toLowerCase();
    const doctor = this.filtroDoctor().trim().toLowerCase();
    const sucursal = this.filtroSucursal().trim().toLowerCase();
    const campana = this.filtroCampana().trim().toLowerCase();
    const estado = this.filtroEstado().trim().toLowerCase();
    const modoFecha = this.filtroFechaModo();
    const desde = this.fechaListaDesde();
    const hasta = this.fechaListaHasta();

    return this.citas().filter((c) => {
      if (modoFecha === 'seleccionada') {
        const fechaCita = c.fecha.substring(0, 10);
        if (fechaCita < desde || fechaCita > hasta) return false;
      }
      if (fecha && !formatearFecha(c.fecha).includes(fecha)) return false;
      if (paciente && !(c.paciente_nombre ?? '').toLowerCase().includes(paciente)) return false;
      if (doctor && !(c.doctor_nombre ?? '').toLowerCase().includes(doctor)) return false;
      if (sucursal && !(c.sucursal_nombre ?? '').toLowerCase().includes(sucursal)) return false;
      if (campana && !(c.campana_nombre || 'Normal').toLowerCase().includes(campana)) return false;
      if (estado && !estadoEfectivo(c).toLowerCase().includes(estado)) return false;
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
    // Solo controla si al guardar se abre el chat de WhatsApp con el
    // mensaje de confirmacion -- no es un campo de la cita en si, se
    // saca del payload antes de enviarlo al backend (ver guardar()).
    enviar_whatsapp: [false],
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
    private categoriasAntecedentesSrv: CategoriasAntecedentesService,
    private antecedentesPatologicosSrv: AntecedentesPatologicosService,
    private pacienteAntecedentesSrv: PacienteAntecedentesService,
    private categoriasExamenesLabSrv: CategoriasExamenesLaboratorioService,
    private examenesLabCatalogoSrv: ExamenesLaboratorioCatalogoService,
    private route: ActivatedRoute,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    if (this.auth.usuario()?.rol === 'doctor') {
      // Resuelve el doctor_id propio ANTES del primer cargar(): asi la
      // primera consulta que sale ya viaja acotada a "mis citas", sin un
      // parpadeo donde se ven citas de otros doctores.
      this.doctoresSrv.miPerfil().subscribe({
        next: (p) => {
          this.miDoctorId.set(p.doctor.id);
          this.filtroDoctor.set(p.doctor.nombre);
          this.cargar();
        },
        error: () => this.cargar(),
      });
    } else {
      this.cargar();
    }
    this.pacientesSrv.listar().subscribe((data) => this.pacientes.set(data));
    this.doctoresSrv.listar().subscribe((data) => this.doctores.set(data));
    this.categoriasAntecedentesSrv.listar().subscribe((data) => this.categoriasCatalogo.set(data));
    this.antecedentesPatologicosSrv.listar().subscribe((data) => this.antecedentesCatalogo.set(data));
    this.categoriasExamenesLabSrv.listar().subscribe((data) => this.categoriasExamenesLabCatalogo.set(data));
    this.examenesLabCatalogoSrv.listar().subscribe((data) => this.examenesLabCatalogo.set(data));
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
    if (params.get('doctor') && !this.filtroDoctorBloqueado()) this.filtroDoctor.set(params.get('doctor')!);
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
  // sucursal elegida, o ya esta completo ahi. Un doctor que nunca
  // configuro NINGUN horario, en ninguna clinica, sigue pudiendo recibir
  // citas con total libertad, como antes de este tablero. Pero si SI
  // configuro horario, solo que en OTRA clinica (no esta), se bloquea
  // igual que si no atendiera ese dia -- que trabaje en otro lado no dice
  // nada sobre su disponibilidad aca (ver tiene_horario_en_otra_clinica).
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
    if (!disp) return false;
    if (!disp.tiene_horario_configurado) return disp.tiene_horario_en_otra_clinica;
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

  // "Hora de fin" usa combinarHoraFin12(): "12:00 a.m." solo tiene sentido
  // como fin del dia (24:00, ver hora12.util.ts) -- ej. una cita de
  // 11:30pm a 12:00am (medianoche) sin necesitar partirla en dos dias.
  actualizarHora12(campo: 'hora_inicio' | 'hora_fin', parte: 'h' | 'm' | 'periodo', valor: number | string): void {
    const actual = this.partesHora(campo);
    const h12 = parte === 'h' ? Number(valor) : actual.h ?? 12;
    const m = parte === 'm' ? String(valor) : actual.m ?? '00';
    const periodo = (parte === 'periodo' ? valor : actual.periodo ?? 'a.m.') as 'a.m.' | 'p.m.';
    const hora24 = campo === 'hora_fin' ? combinarHoraFin12(h12, m, periodo) : combinar12(h12, m, periodo);
    if (campo === 'hora_inicio') this.form.patchValue({ hora_inicio: hora24 });
    else this.form.patchValue({ hora_fin: hora24 });
  }

  // Al marcar "Es una urgencia" se rellena la hora con la del sistema
  // (una urgencia es siempre "ahora mismo") -- el usuario igual puede
  // corregirla a mano despues. No hace nada al desmarcar.
  onToggleUrgencia(): void {
    if (!this.form.get('es_urgencia')?.value) return;
    const ahora = new Date();
    const fin = new Date(ahora.getTime() + 30 * 60000);
    const aTexto = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    this.form.patchValue({ hora_inicio: aTexto(ahora), hora_fin: aTexto(fin) });
  }

  cargar(): void {
    const filtros: Record<string, string> = {};
    if (this.miDoctorId()) filtros['doctor_id'] = this.miDoctorId()!;
    this.srv.listar(filtros).subscribe((data) => this.citas.set(data));
    // Mismo dato, dos vistas: si la vista Calendario esta activa se
    // refresca tambien con su propio filtro de fecha/sucursal (ver
    // cargarCalendario()), asi que cualquier guardar/eliminar existente que
    // ya llama a cargar() mantiene ambas vistas al dia sin tocarlos.
    if (this.vista() === 'calendario') this.cargarCalendario();
  }

  puedeVerHistoria(): boolean {
    const rol = this.auth.usuario()?.rol;
    return this.auth.esSuperAdmin() || rol === 'admin' || rol === 'doctor';
  }

  // auth.puedeEditar() (admin/recepcionista/super admin) no incluye
  // 'doctor' a proposito -- es el gate generico que tambien usan Pacientes
  // y Catalogo de examenes de laboratorio, donde un doctor no deberia
  // poder editar. Aca, en Citas, un doctor SI puede editar (y cambiar
  // estado), pero solo de SUS PROPIAS citas. cargar()/cargarCalendario()
  // ya piden al backend solo sus propias citas, asi que en la practica
  // c.doctor_id siempre es el suyo -- este chequeo por fila es la misma
  // regla aplicada donde se decide mostrar el boton, en vez de confiar en
  // que el dato que llego ya viene filtrado (la validacion real, que evita
  // que alguien edite otra cita llamando la API directo, vive en el
  // backend -- ver citas.controller.js#actualizar).
  puedeEditarCita(c: Cita): boolean {
    if (this.auth.puedeEditar()) return true;
    return this.auth.usuario()?.rol === 'doctor' && c.doctor_id === this.miDoctorId();
  }

  // Mismo criterio que puedeEditarCita(), pero para el boton "+ Nueva
  // cita" (todavia no hay una cita puntual que revisar). El formulario
  // bloquea Sucursal/Especialidad/Doctor para un doctor (ver
  // abrirNuevo()/plantilla), y el backend fuerza doctor_id al propio de
  // todos modos (crear()).
  puedeCrearCita(): boolean {
    return this.auth.puedeEditar() || this.auth.usuario()?.rol === 'doctor';
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

  // Solo quien creo el antecedente puede eliminarlo (null = autor
  // desconocido, sin restriccion) -- mismo criterio que puedeModificarReceta.
  puedeModificarAntecedente(a: PacienteAntecedente): boolean {
    return !a.creado_por || a.creado_por === this.auth.usuario()?.id;
  }

  abrirFormAntecedenteConsulta(): void {
    this.antecedenteConsultaForm.reset({ antecedente_id: '', fecha_inicio: hoyISO(), tratamiento: '', observacion: '' });
    this.mostrarFormAntecedenteConsulta.set(true);
  }

  cerrarFormAntecedenteConsulta(): void {
    this.mostrarFormAntecedenteConsulta.set(false);
  }

  guardarAntecedenteConsulta(): void {
    if (this.antecedenteConsultaForm.invalid) return;
    const pacienteId = this.pacienteDeHistoria()?.id;
    if (!pacienteId) return;

    const valor = this.antecedenteConsultaForm.getRawValue();
    const data = {
      antecedente_id: valor.antecedente_id,
      fecha_inicio: valor.fecha_inicio || null,
      tratamiento: valor.tratamiento || null,
      observacion: valor.observacion || null,
      // El doctor que diagnostica es el que atiende esta consulta -- se
      // toma de la cita, no se pide de nuevo en el formulario.
      doctor_id: this.citaHistoria()?.doctor_id ?? null,
    };
    this.pacienteAntecedentesSrv.crear(pacienteId, data).subscribe({
      next: () => {
        this.cerrarFormAntecedenteConsulta();
        this.pacientesSrv.obtener(pacienteId).subscribe((p) => this.pacienteDeHistoria.set(p));
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo agregar el antecedente'),
    });
  }

  eliminarAntecedenteConsulta(a: PacienteAntecedente): void {
    if (!a.id) return;
    const pacienteId = this.pacienteDeHistoria()?.id;
    this.pacienteAntecedentesSrv.eliminar(a.id).subscribe({
      next: () => {
        this.antecedenteSeleccionado.set(null);
        if (pacienteId) this.pacientesSrv.obtener(pacienteId).subscribe((p) => this.pacienteDeHistoria.set(p));
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el antecedente'),
    });
  }

  // Solo tiene sentido ofrecer "compartir ubicacion" si hay a donde
  // mandarlo (telefono del paciente, marcado explicitamente como que
  // recibe WhatsApp) y que mandar (enlace de la sucursal).
  puedeCompartirUbicacion(c: Cita): boolean {
    return !!c.paciente_telefono && !!c.paciente_acepta_whatsapp && !!c.sucursal_google_maps_url;
  }

  // Mismo criterio que puedeCompartirUbicacion(), pero evaluado ANTES de
  // guardar (todavia no existe una Cita, solo el paciente elegido en el
  // formulario) -- controla si se muestra el checkbox "Enviar Mensaje
  // WhatsApp".
  puedeEnviarWhatsappForm(): boolean {
    const pacienteId = this.form.get('paciente_id')?.value;
    const paciente = this.pacientes().find((p) => p.id === pacienteId);
    return !!paciente?.telefono && !!paciente?.acepta_whatsapp;
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
      `Hora: ${formatoAmPm(c.hora_inicio)}`,
      `Doctor: ${c.doctor_nombre} (${c.especialidad_nombre})`,
      `Sucursal: ${c.sucursal_nombre}`,
    ];
    if (c.sucursal_direccion) lineas.push(c.sucursal_direccion);
    if (c.sucursal_hora_apertura && c.sucursal_hora_cierre) {
      lineas.push(`Horario de atencion de la sucursal: ${formatoAmPm(c.sucursal_hora_apertura)} - ${formatoAmPm(c.sucursal_hora_cierre)}`);
    }
    if (c.sucursal_telefono) {
      lineas.push(`Telefono: ${c.sucursal_telefono}${c.sucursal_acepta_whatsapp ? ' (WhatsApp)' : ''}`);
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
    // Un doctor no elige a mano doctor_id/especialidad_id (el formulario
    // los deja bloqueados, ver plantilla) -- se precargan con los suyos,
    // igual que ya hace abrirNuevoDesdeCelda() al hacer clic en una celda.
    const miId = this.miDoctorId();
    const miDoctor = miId ? this.doctores().find((d) => d.id === miId) : null;
    const doctorId = miId ?? '';
    const especialidadId = miDoctor?.especialidades[0]?.especialidad_id ?? '';
    // emitEvent:false para no disparar actualizarDisponibilidad() a mitad del
    // reset (doctor_id y fecha cambiarian en dos eventos separados, el
    // primero con el otro campo todavia con el valor viejo) -- se llama una
    // sola vez, ya con el formulario completo, justo debajo.
    this.form.reset({ sucursal_id: this.sucursales()[0]?.id ?? '', especialidad_id: especialidadId, doctor_id: doctorId, campana_id: '', es_domicilio: false, es_urgencia: false, enviar_whatsapp: false, fecha: hoyISO(), estado: 'pendiente' }, { emitEvent: false });
    this.aplicarBloqueoCamposDoctor();
    this.errorGuardar.set(null);
    this.panelAbierto.set(true);
    this.actualizarDisponibilidad();
    this.cargarDoctoresCampana(null);
    this.actualizarBloqueoFecha(null);
  }

  // Un doctor no puede cambiar Especialidad/Doctor/Sucursal (ni al crear
  // ni al editar) -- [attr.disabled] en la plantilla no alcanza porque el
  // ControlValueAccessor de <select> reactivo lo ignora; hay que
  // deshabilitar el FormControl en si. form.reset() no toca el estado
  // disabled de un control (solo su valor), asi que esto se llama aparte
  // cada vez que se abre el formulario. getRawValue() (usado en
  // guardar()) SI incluye el valor de un control deshabilitado, asi que
  // el valor precargado se sigue enviando igual.
  private aplicarBloqueoCamposDoctor(): void {
    const bloqueado = this.filtroDoctorBloqueado();
    for (const nombre of ['especialidad_id', 'doctor_id', 'sucursal_id']) {
      const control = this.form.get(nombre);
      if (bloqueado) control?.disable({ emitEvent: false });
      else control?.enable({ emitEvent: false });
    }
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
      enviar_whatsapp: false,
      fecha: c.fecha.substring(0, 10),
      hora_inicio: c.hora_inicio?.substring(0, 5),
      hora_fin: c.hora_fin?.substring(0, 5),
      motivo: c.motivo ?? '',
      observaciones: c.observaciones ?? '',
      estado: c.estado,
    }, { emitEvent: false });
    this.aplicarBloqueoCamposDoctor();
    this.errorGuardar.set(null);
    this.panelAbierto.set(true);
    this.actualizarDisponibilidad();
    this.cargarDoctoresCampana(c.campana_id ?? null);
    this.actualizarBloqueoFecha(c.campana_id ?? null);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  // El buscador no encontro a nadie con ese nombre (ni en esta clinica ni
  // en el resto de la red) -- se abre el mini-formulario de creacion
  // rapida, precargado con lo que ya se escribio.
  abrirPacienteRapido(nombre: string): void {
    this.nombreParaPacienteRapido.set(nombre);
    this.pacienteRapidoAbierto.set(true);
  }

  cerrarPacienteRapido(): void {
    this.pacienteRapidoAbierto.set(false);
  }

  onPacienteRapidoCreado(paciente: Paciente): void {
    this.agregarPacienteALista(paciente);
    // fijarSeleccion() en vez de form.patchValue(): el buscador es un
    // ControlValueAccessor, y su @Input pacientesConocidos (con el que
    // resuelve el nombre a mostrar) recien se actualiza en el PROXIMO
    // ciclo de deteccion de cambios -- form.patchValue() llamaria a
    // writeValue() ahora mismo, cuando esa lista todavia no incluye al
    // paciente recien creado, y el campo quedaria vacio.
    this.buscadorPaciente?.fijarSeleccion(paciente.id, paciente.nombre);
    this.cerrarPacienteRapido();
  }

  private agregarPacienteALista(paciente: Paciente): void {
    this.pacientes.update((lista) => [...lista.filter((p) => p.id !== paciente.id), paciente].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  guardar(): void {
    if (this.form.invalid) return;
    this.errorGuardar.set(null);
    const actual = this.editando();
    const esNueva = !actual;
    // enviar_whatsapp es solo una preferencia de esta pantalla, no un
    // campo de la cita -- se saca del payload antes de mandarlo al backend.
    const { enviar_whatsapp, ...data } = this.form.getRawValue();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: (citaGuardada) => {
        this.cerrarPanel();
        this.cargar();
        // Solo al crear (no al editar/reagendar), y solo si se marco el
        // checkbox: si ademas se puede compartir la ubicacion por WhatsApp,
        // se abre el chat con el mensaje ya redactado -- falta un clic
        // humano en "Enviar" (WhatsApp no permite enviar sin esa
        // confirmacion sin la API de negocio).
        if (esNueva && enviar_whatsapp && this.puedeCompartirUbicacion(citaGuardada)) {
          window.open(this.whatsappUrl(citaGuardada), '_blank');
        }
      },
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
    this.antecedenteSeleccionado.set(null);
    this.mostrarFormAntecedenteConsulta.set(false);
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

  imprimirOrdenLaboratorio(o: OrdenLaboratorio): void {
    const empresa = this.auth.empresaActiva();
    const citaCtx = this.citaLaboratorio();
    const doctorNombre = o.doctor_nombre || citaCtx?.doctor_nombre || this.citaHistoria()?.doctor_nombre || '';
    const pacienteNombre = citaCtx?.paciente_nombre || this.pacienteDeHistoria()?.nombre || '';
    const fecha = o.fecha_cita || citaCtx?.fecha || o.created_at;
    const idCorto = o.id.slice(0, 8).toUpperCase();

    const body: any[] = [
      ['Examen', 'Valor de referencia', 'Resultado', 'Unidad'].map((t) => ({ text: t, bold: true })),
    ];
    for (const [categoria, examenes] of this.agruparExamenesPorCategoria(o.examenes)) {
      body.push([{ text: categoria, colSpan: 4, bold: true, fillColor: '#f1f5f9', margin: [0, 3, 0, 3] }, {}, {}, {}]);
      for (const e of examenes) {
        body.push([e.nombre_examen, e.valor_referencia || '-', e.resultado || '-', e.unidad || '-']);
      }
    }

    const doc: TDocumentDefinitions = {
      pageMargins: [30, 30, 30, 30],
      content: [
        ...(encabezadoClinica(empresa?.empresa_logo, empresa?.empresa_nombre, 'Orden de laboratorio') as any[]),
        { text: `Orden: #${idCorto}`, margin: [0, 0, 0, 2] },
        { text: doctorNombre, margin: [0, 0, 0, 2] },
        { text: `Paciente: ${pacienteNombre}`, margin: [0, 0, 0, 2] },
        { text: `Fecha: ${fecha ? formatoFechaCorta(fecha) : ''}`, color: '#64748b', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body,
          },
          layout: 'lightHorizontalLines',
        },
        ...(o.observaciones ? [{ text: `Observaciones: ${o.observaciones}`, margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
      ],
      defaultStyle: { fontSize: 9 },
    };

    generarPdf(doc);
  }

  // Agrupa los examenes de una orden por categoria del catalogo (mismo
  // criterio que el checklist al crearla y que el PDF impreso) -- los
  // examenes fuera del catalogo (sin examen_id) caen en un grupo aparte.
  private agruparExamenesPorCategoria(examenes: ExamenLaboratorio[]): [string, ExamenLaboratorio[]][] {
    const categoriaPorExamenId = new Map(this.examenesLabCatalogo().map((e) => [e.id, e.categoria_nombre || 'Otros']));
    const grupos = new Map<string, ExamenLaboratorio[]>();
    for (const e of examenes) {
      const categoria = (e.examen_id && categoriaPorExamenId.get(e.examen_id)) || 'Otros examenes';
      if (!grupos.has(categoria)) grupos.set(categoria, []);
      grupos.get(categoria)!.push(e);
    }
    return [...grupos.entries()];
  }

  // Solo tiene sentido ofrecer "enviar por WhatsApp" si hay a donde
  // mandarlo -- mismo criterio que puedeCompartirUbicacion(), pero el
  // telefono/paciente puede venir de la cita (drawer de Laboratorio) o del
  // paciente de la consulta (tab Laboratorios del historial).
  puedeEnviarWhatsappLaboratorio(): boolean {
    const c = this.citaLaboratorio();
    const p = this.pacienteDeHistoria();
    const telefono = c?.paciente_telefono || p?.telefono;
    const aceptaWhatsapp = c?.paciente_acepta_whatsapp ?? p?.acepta_whatsapp;
    return !!telefono && !!aceptaWhatsapp;
  }

  // wa.me abre WhatsApp Web/app con el mensaje precargado -- no requiere
  // API ni cuenta de WhatsApp Business (mismo mecanismo que whatsappUrl()).
  whatsappOrdenLaboratorioUrl(o: OrdenLaboratorio): string {
    const c = this.citaLaboratorio();
    const p = this.pacienteDeHistoria();
    const telefono = (c?.paciente_telefono || p?.telefono || '').replace(/\D/g, '');
    const empresa = this.auth.empresaActiva()?.empresa_nombre;
    const pacienteNombre = c?.paciente_nombre || p?.nombre || '';
    const doctorNombre = o.doctor_nombre || c?.doctor_nombre || this.citaHistoria()?.doctor_nombre || '';
    const sucursalNombre = c?.sucursal_nombre || this.citaHistoria()?.sucursal_nombre || '';
    const fecha = o.fecha_cita || c?.fecha || o.created_at;
    const idCorto = o.id.slice(0, 8).toUpperCase();

    const lineas = [
      `Hola ${pacienteNombre}, esta es tu orden de laboratorio de ${empresa}:`,
      '',
      `Orden: #${idCorto}`,
      `Doctor: ${doctorNombre}`,
      ...(sucursalNombre ? [`Sucursal: ${sucursalNombre}`] : []),
      `Fecha: ${fecha ? formatoFechaCorta(fecha) : ''}`,
      '',
    ];
    for (const [categoria, examenes] of this.agruparExamenesPorCategoria(o.examenes)) {
      // Sin negrita (*texto*): con varias categorias en un mismo mensaje
      // WhatsApp a veces no cierra bien cada negrita y deja asteriscos
      // sueltos en medio de las palabras.
      lineas.push(categoria.toUpperCase());
      for (const e of examenes) {
        const resultado = e.resultado ? `: ${e.resultado}${e.unidad ? ' ' + e.unidad : ''}` : '';
        lineas.push(`- ${e.nombre_examen}${resultado}`);
      }
      lineas.push('');
    }
    if (o.observaciones) lineas.push(`Observaciones: ${o.observaciones}`);

    return `https://wa.me/${telefono}?text=${encodeURIComponent(lineas.join('\n'))}`;
  }

  crearExamenGroup(e?: Partial<{ examen_id: string | null; nombre_examen: string; valor_referencia: string; resultado: string; unidad: string }>) {
    return this.fb.group({
      examen_id: [e?.examen_id ?? null],
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
    this.laboratorioForm.markAsDirty();
  }

  quitarExamen(i: number): void {
    this.examenesArray.removeAt(i);
    this.laboratorioForm.markAsDirty();
  }

  // Checklist del catalogo: marca/desmarca un examen agregando o quitando
  // su fila correspondiente en examenesArray (identificada por examen_id).
  examenMarcado(examenId: string): boolean {
    return this.examenesArray.controls.some((c) => c.get('examen_id')?.value === examenId);
  }

  toggleExamenCatalogo(ex: ExamenLaboratorioCatalogo): void {
    const idx = this.examenesArray.controls.findIndex((c) => c.get('examen_id')?.value === ex.id);
    if (idx >= 0) {
      this.examenesArray.removeAt(idx);
    } else {
      this.examenesArray.push(this.crearExamenGroup({
        examen_id: ex.id,
        nombre_examen: ex.nombre,
        valor_referencia: ex.valor_referencia ?? '',
        unidad: ex.unidad ?? '',
      }));
    }
    this.laboratorioForm.markAsDirty();
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

  soloDigitos(telefono: string | null | undefined): string {
    return (telefono || '').replace(/\D/g, '');
  }

  // Mensaje de WhatsApp para un familiar (tab Familiares de Consulta
  // Medica): cabecera con el contexto de la consulta abierta -- a
  // diferencia del paciente (que puede tener citas con varios doctores
  // en varias sucursales), aqui SI hay una cita puntual de referencia
  // (citaHistoria), asi que no hace falta pedir nada aparte.
  whatsappUrlFamiliar(f: FamiliarPaciente): string {
    const c = this.citaHistoria();
    const empresa = this.auth.empresaActiva()?.empresa_nombre || '';
    const idCorto = (c?.paciente_id || '').split('-')[0];
    const lineas = [
      `Clinica: ${empresa}`,
      `Sucursal: ${c?.sucursal_nombre || ''}`,
      `Doctor: ${c?.doctor_nombre || ''}`,
      `Paciente: ${c?.paciente_nombre || ''}`,
      `ID: ${idCorto}`,
    ];
    if (c?.sucursal_telefono) lineas.push(`Telefono sucursal: ${c.sucursal_telefono}${c.sucursal_acepta_whatsapp ? ' (WhatsApp)' : ''}`);
    if (c?.sucursal_google_maps_url) {
      lineas.push('', `Ubicacion (Google Maps): ${c.sucursal_google_maps_url}`);
      const coords = extraerLatLng(c.sucursal_google_maps_url);
      if (coords) lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
    }
    return `https://wa.me/${this.soloDigitos(f.telefono)}?text=${encodeURIComponent(lineas.join('\n'))}`;
  }
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

function fechaISO(d: Date): string {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
