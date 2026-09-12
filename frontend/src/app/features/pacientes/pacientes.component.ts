import { Component, OnInit, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PacientesService } from '../../core/services/pacientes.service';
import { CitasService } from '../../core/services/citas.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { GeocodificacionService } from '../../core/services/geocodificacion.service';
import { AuthService } from '../../core/services/auth.service';
import { CategoriasAntecedentesService } from '../../core/services/categoriasAntecedentes.service';
import { AntecedentesPatologicosService } from '../../core/services/antecedentesPatologicos.service';
import { PacienteAntecedentesService } from '../../core/services/pacienteAntecedentes.service';
import { DireccionPaciente, Doctor, EstadoCita, FamiliarPaciente, HistoriaClinica, OrdenLaboratorio, Paciente, PacienteAntecedente, Receta, SignosVitales, Sucursal, CategoriaAntecedente, AntecedentePatologico } from '../../core/models/models';
import { formatoFechaCorta } from '../../core/utils/pdf.util';
import { hoyISO } from '../../core/utils/fecha.util';
import { formatoAmPm } from '../../core/utils/hora12.util';
import { clasificarImc } from '../../core/utils/imc.util';
import { clasificarPresion } from '../../core/utils/presion.util';
import { clasificarGlucosa } from '../../core/utils/glucosa.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';
import { EscanerDocumentoComponent, DatosDocumentoDetectados } from '../../core/components/escaner-documento/escaner-documento.component';
import { MapaSelectorComponent, UbicacionSeleccionada, extraerLatLng } from '../../core/components/mapa-selector/mapa-selector.component';
import { TelefonoInputComponent } from '../../core/components/telefono-input/telefono-input.component';
import { BuscadorAntecedenteComponent } from '../../core/components/buscador-antecedente/buscador-antecedente.component';
import { direccionPrincipal } from '../../core/utils/direccion.util';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SelectorFotoComponent, EscanerDocumentoComponent, MapaSelectorComponent, TelefonoInputComponent, BuscadorAntecedenteComponent],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.css',
})
export class PacientesComponent implements OnInit {
  pacientes = signal<Paciente[]>([]);
  panelAbierto = signal(false);
  editando = signal<Paciente | null>(null);
  pacienteExistente = signal<Paciente | null>(null);

  private readonly camposIdentidad = ['nombre', 'fecha_nacimiento', 'sexo', 'telefono', 'email', 'direcciones', 'alergias'];

  pacienteHistorial = signal<Paciente | null>(null);
  antecedenteHistorialSeleccionado = signal<PacienteAntecedente | null>(null);
  historial = signal<HistoriaClinica[]>([]);
  cargandoHistorial = signal(false);

  filtroHistorialFecha = signal('');
  filtroHistorialDoctor = signal('');
  filtroHistorialSucursal = signal('');
  filtroHistorialEstado = signal('');

  hayFiltrosHistorial = computed(() => !!(
    this.filtroHistorialFecha() || this.filtroHistorialDoctor() || this.filtroHistorialSucursal() || this.filtroHistorialEstado()
  ));

  limpiarFiltrosHistorial(): void {
    this.filtroHistorialFecha.set('');
    this.filtroHistorialDoctor.set('');
    this.filtroHistorialSucursal.set('');
    this.filtroHistorialEstado.set('');
  }

  historialFiltrado = computed(() => {
    const fecha = this.filtroHistorialFecha().trim().toLowerCase();
    const doctor = this.filtroHistorialDoctor().trim().toLowerCase();
    const sucursal = this.filtroHistorialSucursal().trim().toLowerCase();
    const estado = this.filtroHistorialEstado().trim().toLowerCase();

    return this.historial().filter((h) => {
      if (fecha && !formatoFechaCorta(h.fecha_cita || '').includes(fecha)) return false;
      if (doctor && !(h.doctor_nombre ?? '').toLowerCase().includes(doctor)) return false;
      if (sucursal && !(h.sucursal_nombre ?? '').toLowerCase().includes(sucursal)) return false;
      if (estado && !this.estadoEtiquetaHistorial(h.estado).toLowerCase().includes(estado)) return false;
      return true;
    });
  });

  estadoEtiquetaHistorial(estado: EstadoCita | undefined): string {
    const etiquetas: Record<string, string> = {
      pendiente: 'Pendiente',
      confirmada: 'Confirmada',
      atendida: 'Atendida',
      cancelada: 'Cancelada',
      no_asistio: 'No asistió',
      reagendar: 'Reagendar',
    };
    return estado ? (etiquetas[estado] ?? estado) : '';
  }

  historialSeleccionado = signal<HistoriaClinica | null>(null);
  // Dos grupos de tabs independientes: arriba (lista/antecedentes del
  // paciente) y abajo (detalle de la consulta seleccionada).
  tabSuperior = signal<'consultas' | 'antecedentes'>('consultas');
  tabInferior = signal<'signos' | 'receta' | 'laboratorio'>('signos');
  // Tabs del formulario de nuevo/editar paciente.
  tabFormulario = signal<'generales' | 'familiares' | 'antecedentes'>('generales');

  signosVitalesSeleccionado = signal<SignosVitales | null>(null);
  cargandoSignosSeleccionado = signal(false);
  // Historial completo de signos vitales del paciente (asc por fecha), para
  // calcular tendencias (ej. peso subio/bajo respecto a la consulta anterior).
  signosVitalesHistorialLista = signal<SignosVitales[]>([]);

  recetasSeleccionadas = signal<Receta[]>([]);
  cargandoRecetaSeleccionada = signal(false);

  ordenesLaboratorioSeleccionadas = signal<OrdenLaboratorio[]>([]);
  cargandoLaboratorioSeleccionado = signal(false);

  sucursales = signal<Sucursal[]>([]);

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
    foto: [null as string | null],
    identificacion: [''],
    fecha_nacimiento: [''],
    sexo: [''],
    estado_civil: [''],
    estado_laboral: [''],
    tipo_trabajo: [''],
    lugar_trabajo: [''],
    telefono: [''],
    acepta_whatsapp: [false],
    email: [''],
    direcciones: this.fb.array([this.crearDireccionGroup()]),
    alergias: [''],
    activo: [true],
  });

  // ---------- Familiares (lista + card de agregar/editar, no un FormArray:
  // vive en memoria y se manda completa al guardar el paciente, igual que
  // direcciones -- ver reemplazarFamiliares en el backend). ----------
  familiares = signal<FamiliarPaciente[]>([]);
  mostrarFormFamiliar = signal(false);
  familiarEditandoIndex = signal<number | null>(null);
  familiarForm = this.fb.group({
    nombre: ['', Validators.required],
    telefono: [''],
    parentesco: [''],
  });

  // ---------- Antecedentes patologicos: a diferencia de Familiares, cada
  // fila tiene su propio autor (creado_por) y su propio CRUD independiente
  // (crear/editar/eliminar pegan directo al backend, no se reemplaza como
  // conjunto al guardar el paciente) -- ver
  // pacienteAntecedentes.controller.js. El catalogo (categorias +
  // antecedentes disponibles) se carga una vez en ngOnInit. ----------
  categoriasCatalogo = signal<CategoriaAntecedente[]>([]);
  antecedentesCatalogo = signal<AntecedentePatologico[]>([]);

  antecedentes = signal<PacienteAntecedente[]>([]);
  mostrarFormAntecedente = signal(false);
  antecedenteEditandoIndex = signal<number | null>(null);
  antecedenteForm = this.fb.group({
    antecedente_id: ['', Validators.required],
    doctor_id: [''],
    fecha_inicio: [''],
    tratamiento: [''],
    observacion: [''],
  });
  // Para el selector de doctor del formulario de antecedente (aqui no hay
  // una consulta de la que tomarlo automaticamente, a diferencia de
  // citas.component.ts).
  doctoresParaAntecedente = signal<Doctor[]>([]);

  constructor(
    private fb: FormBuilder,
    private srv: PacientesService,
    private citasSrv: CitasService,
    private sucursalesSrv: SucursalesService,
    private geocodificacionSrv: GeocodificacionService,
    private categoriasAntecedentesSrv: CategoriasAntecedentesService,
    private antecedentesPatologicosSrv: AntecedentesPatologicosService,
    private pacienteAntecedentesSrv: PacienteAntecedentesService,
    private doctoresSrv: DoctoresService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.categoriasAntecedentesSrv.listar().subscribe((data) => this.categoriasCatalogo.set(data));
    this.antecedentesPatologicosSrv.listar().subscribe((data) => this.antecedentesCatalogo.set(data));
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
    this.doctoresSrv.listar().subscribe((data) => this.doctoresParaAntecedente.set(data));
  }
  cargar(): void { this.srv.listar().subscribe((data) => this.pacientes.set(data)); }

  // Se incrementa cada vez que se abre el panel (nuevo o editar) para que
  // una respuesta tardia de buscarPorIdentificacion() (si el usuario cierra
  // y reabre el panel mientras esa consulta seguia en curso) no contamine
  // un formulario que ya se reseteo -- ver onIdentificacionBlur().
  private tokenBusquedaIdentificacion = 0;

  abrirNuevo(): void {
    this.tokenBusquedaIdentificacion++;
    this.editando.set(null);
    this.pacienteExistente.set(null);
    this.tabFormulario.set('generales');
    this.form.reset({ activo: true });
    this.direccionesArray.clear();
    this.direccionesArray.push(this.crearDireccionGroup());
    this.familiares.set([]);
    this.cerrarFormFamiliar();
    this.antecedentes.set([]);
    this.cerrarFormAntecedente();
    this.habilitarCamposIdentidad();
    this.panelAbierto.set(true);
  }

  abrirEditar(p: Paciente): void {
    this.tokenBusquedaIdentificacion++;
    this.editando.set(p);
    this.pacienteExistente.set(null);
    this.tabFormulario.set('generales');
    this.form.reset({
      ...p,
      direcciones: undefined,
      fecha_nacimiento: p.fecha_nacimiento?.substring(0, 10) ?? '',
    });
    this.direccionesArray.clear();
    (p.direcciones?.length ? p.direcciones : [undefined]).forEach((d) => this.direccionesArray.push(this.crearDireccionGroup(d)));
    this.familiares.set(p.familiares ?? []);
    this.cerrarFormFamiliar();
    this.antecedentes.set(p.antecedentes ?? []);
    this.cerrarFormAntecedente();
    this.habilitarCamposIdentidad();
    this.panelAbierto.set(true);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  // ---------- Direcciones (lista repetible, una marcada como principal) ----------

  crearDireccionGroup(d?: DireccionPaciente) {
    return this.fb.group({
      direccion: [d?.direccion ?? ''],
      google_maps_url: [d?.google_maps_url ?? ''],
      pais: [d?.pais ?? ''],
      provincia: [d?.provincia ?? ''],
      distrito: [d?.distrito ?? ''],
      corregimiento: [d?.corregimiento ?? ''],
      comparte_ubicacion: [d?.comparte_ubicacion ?? false],
      es_principal: [d?.es_principal ?? false],
    });
  }

  get direccionesArray(): FormArray {
    return this.form.get('direcciones') as FormArray;
  }

  agregarDireccion(): void {
    this.direccionesArray.push(this.crearDireccionGroup());
  }

  quitarDireccion(i: number): void {
    this.direccionesArray.removeAt(i);
  }

  // Solo una direccion puede ser la principal -- desmarca todas las demas.
  marcarPrincipal(i: number): void {
    this.direccionesArray.controls.forEach((c, idx) => c.get('es_principal')?.setValue(idx === i));
  }

  // ---------- Familiares (lista en memoria + card de agregar/editar) ----------

  abrirNuevoFamiliar(): void {
    this.familiarEditandoIndex.set(null);
    this.familiarForm.reset({ nombre: '', telefono: '', parentesco: '' });
    this.mostrarFormFamiliar.set(true);
  }

  editarFamiliar(i: number): void {
    this.familiarEditandoIndex.set(i);
    this.familiarForm.reset(this.familiares()[i]);
    this.mostrarFormFamiliar.set(true);
  }

  guardarFamiliar(): void {
    if (this.familiarForm.invalid) return;
    const valor = this.familiarForm.getRawValue() as FamiliarPaciente;
    const indice = this.familiarEditandoIndex();
    if (indice === null) {
      this.familiares.update((arr) => [...arr, valor]);
    } else {
      this.familiares.update((arr) => arr.map((f, idx) => (idx === indice ? valor : f)));
    }
    this.cerrarFormFamiliar();
  }

  cerrarFormFamiliar(): void {
    this.mostrarFormFamiliar.set(false);
    this.familiarEditandoIndex.set(null);
    this.familiarForm.reset({ nombre: '', telefono: '', parentesco: '' });
  }

  eliminarFamiliar(i: number): void {
    this.familiares.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  // ---------- Antecedentes patologicos: catalogo agrupado + CRUD ----------

  // Antecedentes del catalogo agrupados por categoria (en el orden ya
  // definido por el catalogo), para el <optgroup> del selector. Excluye
  // los que el paciente ya tiene registrados, para no ofrecer duplicados
  // (la tabla tiene un unique(paciente_id, antecedente_id)).
  catalogoAgrupado = computed(() => {
    const indiceEditando = this.antecedenteEditandoIndex();
    const idEditando = indiceEditando !== null ? this.antecedentes()[indiceEditando]?.antecedente_id : null;
    const yaRegistrados = new Set(this.antecedentes().map((a) => a.antecedente_id).filter((id) => id !== idEditando));
    const disponibles = this.antecedentesCatalogo().filter((a) => a.activo && !yaRegistrados.has(a.id));
    const grupos = new Map<string, AntecedentePatologico[]>();
    for (const a of disponibles) {
      const nombreCategoria = a.categoria_nombre || 'Otros';
      if (!grupos.has(nombreCategoria)) grupos.set(nombreCategoria, []);
      grupos.get(nombreCategoria)!.push(a);
    }
    return [...grupos.entries()].map(([categoria, items]) => ({ categoria, items }));
  });

  abrirNuevoAntecedente(): void {
    // Requiere un paciente ya guardado -- un antecedente se crea con una
    // llamada real al backend (no se puede diferir hasta el "Guardar" del
    // paciente como direcciones/familiares, porque necesita autoria).
    if (!this.editando()) return;
    this.antecedenteEditandoIndex.set(null);
    this.antecedenteForm.reset({ antecedente_id: '', doctor_id: '', fecha_inicio: hoyISO(), tratamiento: '', observacion: '' });
    this.mostrarFormAntecedente.set(true);
  }

  editarAntecedente(i: number): void {
    this.antecedenteEditandoIndex.set(i);
    const a = this.antecedentes()[i];
    this.antecedenteForm.reset({
      antecedente_id: a.antecedente_id,
      doctor_id: a.doctor_id ?? '',
      fecha_inicio: a.fecha_inicio?.substring(0, 10) ?? '',
      tratamiento: a.tratamiento ?? '',
      observacion: a.observacion ?? '',
    });
    this.mostrarFormAntecedente.set(true);
  }

  // A diferencia de familiares/direcciones, cada antecedente tiene su
  // propio autor (creado_por) y CRUD independiente (no se puede reemplazar
  // como conjunto sin perder esa autoria) -- ver
  // pacienteAntecedentes.controller.js. Por eso requiere un paciente ya
  // guardado (con id real): el boton de agregar se deshabilita mientras
  // se este creando un paciente nuevo (ver abrirNuevoAntecedente()).
  guardarAntecedente(): void {
    if (this.antecedenteForm.invalid) return;
    const pacienteId = this.editando()?.id;
    if (!pacienteId) return;

    const valor = this.antecedenteForm.getRawValue();
    const data = {
      antecedente_id: valor.antecedente_id,
      doctor_id: valor.doctor_id || null,
      fecha_inicio: valor.fecha_inicio || null,
      tratamiento: valor.tratamiento || null,
      observacion: valor.observacion || null,
    };
    const indice = this.antecedenteEditandoIndex();
    const req = indice === null
      ? this.pacienteAntecedentesSrv.crear(pacienteId, data)
      : this.pacienteAntecedentesSrv.actualizar(this.antecedentes()[indice].id!, data);

    req.subscribe({
      next: (guardado) => {
        if (indice === null) {
          this.antecedentes.update((arr) => [...arr, guardado]);
        } else {
          this.antecedentes.update((arr) => arr.map((a, idx) => (idx === indice ? guardado : a)));
        }
        this.cerrarFormAntecedente();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el antecedente'),
    });
  }

  cerrarFormAntecedente(): void {
    this.mostrarFormAntecedente.set(false);
    this.antecedenteEditandoIndex.set(null);
    this.antecedenteForm.reset({ antecedente_id: '', doctor_id: '', fecha_inicio: '', tratamiento: '', observacion: '' });
  }

  eliminarAntecedente(i: number): void {
    const a = this.antecedentes()[i];
    if (!a.id) return;
    this.pacienteAntecedentesSrv.eliminar(a.id).subscribe({
      next: () => this.antecedentes.update((arr) => arr.filter((_, idx) => idx !== i)),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el antecedente'),
    });
  }

  // Solo quien creo el antecedente puede editarlo/eliminarlo (null =
  // autor desconocido, sin restriccion) -- mismo criterio que
  // puedeModificarReceta en citas.component.ts.
  puedeModificarAntecedente(a: PacienteAntecedente): boolean {
    return !a.creado_por || a.creado_por === this.auth.usuario()?.id;
  }

  @ViewChild(MapaSelectorComponent) mapaSelector?: MapaSelectorComponent;

  // Como el mapa es un unico componente compartido, hay que recordar CUAL
  // fila de direcciones se estaba editando cuando se abrio.
  private indiceDireccionMapa: number | null = null;

  abrirMapa(i: number): void {
    this.indiceDireccionMapa = i;
    this.mapaSelector?.abrir(this.direccionesArray.at(i).get('google_maps_url')?.value);
  }

  onUbicacionElegida(u: UbicacionSeleccionada): void {
    if (this.indiceDireccionMapa === null) return;
    const grupo = this.direccionesArray.at(this.indiceDireccionMapa);
    grupo.patchValue({ google_maps_url: u.url });
    grupo.markAsDirty();
  }

  // Llama a nuestro backend (nunca directo a Google -- la API key nunca
  // sale del servidor) para traer provincia/distrito de esa direccion.
  // Corregimiento no se autocompleta (Google no lo provee para Panama,
  // ver DISENO-GEOCODIFICACION-INVERSA.md) -- se escribe a mano.
  detectandoDireccion = signal<number | null>(null);

  detectarDivisionPolitica(i: number): void {
    const grupo = this.direccionesArray.at(i);
    const coords = extraerLatLng(grupo.get('google_maps_url')?.value);
    if (!coords) {
      alert('Primero elige una ubicacion en el mapa.');
      return;
    }
    this.detectandoDireccion.set(i);
    this.geocodificacionSrv.reverse(coords[0], coords[1]).subscribe({
      next: (d) => {
        grupo.patchValue({ pais: d.pais ?? grupo.get('pais')?.value, provincia: d.provincia ?? grupo.get('provincia')?.value, distrito: d.distrito ?? grupo.get('distrito')?.value });
        this.detectandoDireccion.set(null);
      },
      error: (err) => {
        alert(err?.error?.mensaje || 'No se pudo detectar la division politica para ese punto.');
        this.detectandoDireccion.set(null);
      },
    });
  }

  direccionPrincipal = direccionPrincipal;

  // Para que el medico pueda navegar hacia una visita a domicilio con la
  // app que prefiera, igual que en Sucursales.
  wazeUrl(p: Paciente): string | null {
    const coords = extraerLatLng(direccionPrincipal(p)?.google_maps_url);
    return coords ? `https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes` : null;
  }

  // El paciente es global (puede atenderse en varias sucursales) y el
  // usuario logueado no tiene una "sucursal actual" en el sistema -- se le
  // pregunta desde cual esta llamando justo antes de abrir WhatsApp, para
  // poder incluirla en el mensaje.
  pacienteWhatsappAbierto = signal<string | null>(null);
  sucursalWhatsapp = signal('');
  // La tabla de pacientes scrollea (.table-wrap { overflow: auto }), lo que
  // recorta cualquier dropdown "position: absolute" que se salga de esa
  // caja -- por eso este menu se posiciona "fixed" segun el boton que lo
  // abrio, en vez de depender del contenedor de la tabla.
  whatsappMenuPos = signal<{ top: number; left: number } | null>(null);

  abrirSelectorWhatsapp(p: Paciente, event: MouseEvent): void {
    const boton = event.currentTarget as HTMLElement;
    const rect = boton.getBoundingClientRect();
    const anchoMenu = 220;
    this.whatsappMenuPos.set({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - anchoMenu, window.innerWidth - anchoMenu - 8)),
    });
    this.pacienteWhatsappAbierto.set(p.id);
    this.sucursalWhatsapp.set(this.sucursales()[0]?.id ?? '');
  }

  cerrarSelectorWhatsapp(): void {
    this.pacienteWhatsappAbierto.set(null);
    this.whatsappMenuPos.set(null);
  }

  enviarWhatsapp(p: Paciente): void {
    const telefono = (p.telefono || '').replace(/\D/g, '');
    const empresa = this.auth.empresaActiva()?.empresa_nombre;
    const sucursal = this.sucursales().find((s) => s.id === this.sucursalWhatsapp());
    const usuario = this.auth.usuario()?.nombre;
    const ahora = new Date();
    const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()}`;
    const hora = formatoAmPm(`${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`);

    const lineas = [
      `Hola ${p.nombre}, le escribimos de ${empresa || 'la clinica'}${sucursal ? ' - ' + sucursal.nombre : ''}.`,
      `Atiende: ${usuario || 'Personal de la clinica'}`,
      `Fecha: ${fecha} · Hora: ${hora}`,
    ];
    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(lineas.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
    this.cerrarSelectorWhatsapp();
  }

  // Solo tiene sentido ofrecer "compartir ubicacion con el doctor" si la
  // consulta fue marcada como visita a domicilio, hay a donde mandarlo
  // (telefono del doctor, marcado explicitamente como que recibe
  // WhatsApp) y que mandar (enlace guardado en el paciente).
  puedeCompartirUbicacionDoctor(h: HistoriaClinica): boolean {
    const direccion = direccionPrincipal(this.pacienteHistorial());
    return !!h.es_domicilio && !!h.doctor_telefono && !!h.doctor_acepta_whatsapp && !!direccion?.google_maps_url && !!direccion?.comparte_ubicacion;
  }

  whatsappUrlDoctor(h: HistoriaClinica): string {
    const paciente = this.pacienteHistorial()!;
    const direccion = direccionPrincipal(paciente)!;
    const telefono = (h.doctor_telefono || '').replace(/\D/g, '');
    const lineas = [
      `Hola ${h.doctor_nombre}, visita a domicilio de ${paciente.nombre}:`,
      '',
      `Fecha: ${formatoFechaCorta(h.fecha_cita || '')}`,
    ];
    if (h.hora_cita) {
      lineas.push(`Hora: ${formatoAmPm(h.hora_cita)}${h.hora_fin_cita ? ' - ' + formatoAmPm(h.hora_fin_cita) : ''}`);
    }
    if (h.especialidad_nombre) lineas.push(`Especialidad: ${h.especialidad_nombre}`);
    if (h.motivo_cita) lineas.push(`Motivo: ${h.motivo_cita}`);
    lineas.push('', `Ubicacion (Google Maps): ${direccion.google_maps_url}`);
    const coords = extraerLatLng(direccion.google_maps_url);
    if (coords) lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
    return `https://wa.me/${telefono}?text=${encodeURIComponent(lineas.join('\n'))}`;
  }

  // A diferencia de Citas (que edita un paciente ya existente y guarda la
  // foto de inmediato), aqui solo se guarda cuando se envia el formulario
  // completo -- por eso solo se actualiza el control, sin llamar al backend.
  onFotoSeleccionada(base64: string): void {
    this.form.patchValue({ foto: base64 });
    this.form.get('foto')?.markAsDirty();
  }

  onFotoEliminada(): void {
    this.form.patchValue({ foto: null });
    this.form.get('foto')?.markAsDirty();
  }

  // Solo rellena los campos que el escaneo si detecto -- nunca borra lo
  // que el usuario ya haya escrito a mano con un valor vacio.
  onDatosEscaneados(datos: DatosDocumentoDetectados): void {
    const cambios: Record<string, string> = {};
    if (datos.identificacion) cambios['identificacion'] = datos.identificacion;
    if (datos.nombre) cambios['nombre'] = datos.nombre;
    if (datos.fecha_nacimiento) cambios['fecha_nacimiento'] = datos.fecha_nacimiento;
    if (datos.sexo) cambios['sexo'] = datos.sexo;
    if (Object.keys(cambios).length === 0) {
      alert('No se detectaron datos reconocibles en el documento.');
      return;
    }
    this.form.patchValue(cambios);
    if (cambios['identificacion']) this.onIdentificacionBlur();
  }

  // Solo aplica al registrar un paciente nuevo: busca en TODA la red (no
  // solo esta clinica) si la identificacion ya pertenece a alguien. Si es
  // asi, reutiliza sus datos globales (alergias, contacto de emergencia,
  // etc.) en vez de dejar que se vuelvan a capturar distinto por error.
  onIdentificacionBlur(): void {
    if (this.editando()) return;
    const identificacion = (this.form.get('identificacion')?.value || '').trim();
    if (!identificacion) {
      this.pacienteExistente.set(null);
      this.habilitarCamposIdentidad();
      return;
    }
    const token = ++this.tokenBusquedaIdentificacion;
    this.srv.buscarPorIdentificacion(identificacion).subscribe({
      next: (res) => {
        if (token !== this.tokenBusquedaIdentificacion) return;
        if (res.existe && res.paciente) {
          this.pacienteExistente.set(res.paciente);
          this.form.patchValue({
            nombre: res.paciente.nombre,
            foto: res.paciente.foto ?? null,
            fecha_nacimiento: res.paciente.fecha_nacimiento?.substring(0, 10) ?? '',
            sexo: res.paciente.sexo ?? '',
            telefono: res.paciente.telefono ?? '',
            acepta_whatsapp: res.paciente.acepta_whatsapp ?? false,
            email: res.paciente.email ?? '',
            alergias: res.paciente.alergias ?? '',
          });
          this.direccionesArray.clear();
          (res.paciente.direcciones?.length ? res.paciente.direcciones : [undefined]).forEach((d) => this.direccionesArray.push(this.crearDireccionGroup(d)));
          this.familiares.set(res.paciente.familiares ?? []);
          this.cerrarFormFamiliar();
          this.antecedentes.set(res.paciente.antecedentes ?? []);
          this.cerrarFormAntecedente();
          this.deshabilitarCamposIdentidad();
        } else {
          this.pacienteExistente.set(null);
          this.familiares.set([]);
          this.antecedentes.set([]);
          this.habilitarCamposIdentidad();
        }
      },
      error: () => {
        if (token !== this.tokenBusquedaIdentificacion) return;
        this.pacienteExistente.set(null);
        this.familiares.set([]);
        this.antecedentes.set([]);
        this.habilitarCamposIdentidad();
      },
    });
  }

  private deshabilitarCamposIdentidad(): void {
    this.camposIdentidad.forEach((c) => this.form.get(c)?.disable());
  }

  private habilitarCamposIdentidad(): void {
    this.camposIdentidad.forEach((c) => this.form.get(c)?.enable());
  }

  guardar(): void {
    if (this.form.invalid) return;
    const data: any = this.form.getRawValue();
    data.familiares = this.familiares();
    data.antecedentes = this.antecedentes();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el paciente'),
    });
  }

  eliminar(p: Paciente): void {
    if (!confirm(`Eliminar al paciente "${p.nombre}"?`)) return;
    this.srv.eliminar(p.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el paciente'),
    });
  }

  verHistorial(p: Paciente): void {
    this.pacienteHistorial.set(p);
    this.antecedenteHistorialSeleccionado.set(null);
    this.historial.set([]);
    this.historialSeleccionado.set(null);
    this.limpiarFiltrosHistorial();
    this.tabSuperior.set('consultas');
    this.tabInferior.set('signos');
    this.signosVitalesSeleccionado.set(null);
    this.signosVitalesHistorialLista.set([]);
    this.recetasSeleccionadas.set([]);
    this.ordenesLaboratorioSeleccionadas.set([]);
    this.cargandoHistorial.set(true);
    this.srv.historial(p.id).subscribe({
      next: (data) => { this.historial.set(data); this.cargandoHistorial.set(false); },
      error: () => this.cargandoHistorial.set(false),
    });
    this.srv.signosVitalesHistorial(p.id).subscribe({
      next: (data) => this.signosVitalesHistorialLista.set(data),
      error: () => this.signosVitalesHistorialLista.set([]),
    });
  }

  cerrarHistorial(): void { this.pacienteHistorial.set(null); }

  claseImc(imc: number | null | undefined): { etiqueta: string; clase: string } | null {
    return imc != null ? clasificarImc(imc) : null;
  }

  clasePresion(sistolica: number | null | undefined, diastolica: number | null | undefined): { etiqueta: string; clase: string } | null {
    return sistolica != null && diastolica != null ? clasificarPresion(sistolica, diastolica) : null;
  }

  // Compara el peso de la consulta seleccionada contra el ultimo registro
  // ANTERIOR (cronologicamente) que si tenga peso -- puede no ser la
  // consulta inmediatamente anterior si esa no tenia signos vitales.
  tendenciaPeso(): 'subio' | 'bajo' | null {
    const actual = this.signosVitalesSeleccionado();
    if (actual?.peso == null) return null;

    const lista = this.signosVitalesHistorialLista(); // asc por fecha
    const idx = lista.findIndex((sv) => sv.id === actual.id);
    if (idx <= 0) return null;

    for (let i = idx - 1; i >= 0; i--) {
      const anterior = lista[i].peso;
      if (anterior != null) {
        if (actual.peso > anterior) return 'subio';
        if (actual.peso < anterior) return 'bajo';
        return null;
      }
    }
    return null;
  }

  claseGlucosa(glucosa: number | null | undefined): { etiqueta: string; clase: string } | null {
    return glucosa != null ? clasificarGlucosa(glucosa) : null;
  }

  seleccionarHistorial(h: HistoriaClinica): void {
    this.historialSeleccionado.set(h);
    this.tabInferior.set('signos');

    this.signosVitalesSeleccionado.set(null);
    this.cargandoSignosSeleccionado.set(true);
    this.citasSrv.obtenerSignosVitales(h.cita_id).subscribe({
      next: (data) => { this.signosVitalesSeleccionado.set(data); this.cargandoSignosSeleccionado.set(false); },
      error: () => this.cargandoSignosSeleccionado.set(false), // 404: no se registraron signos vitales en esa consulta
    });

    this.recetasSeleccionadas.set([]);
    this.cargandoRecetaSeleccionada.set(true);
    this.citasSrv.listarRecetas(h.cita_id).subscribe({
      next: (data) => { this.recetasSeleccionadas.set(data); this.cargandoRecetaSeleccionada.set(false); },
      error: () => this.cargandoRecetaSeleccionada.set(false),
    });

    this.ordenesLaboratorioSeleccionadas.set([]);
    this.cargandoLaboratorioSeleccionado.set(true);
    this.citasSrv.listarLaboratorio(h.cita_id).subscribe({
      next: (data) => { this.ordenesLaboratorioSeleccionadas.set(data); this.cargandoLaboratorioSeleccionado.set(false); },
      error: () => this.cargandoLaboratorioSeleccionado.set(false),
    });
  }

  // Selecciona la fila y salta directo al tab "Receta", sin pasar por
  // "Signos vitales" primero. Detiene la propagacion para no disparar
  // tambien el (click) de la fila (que haria lo mismo mas el tab por defecto).
  verRecetaDeHistorial(h: HistoriaClinica, event: MouseEvent): void {
    event.stopPropagation();
    this.seleccionarHistorial(h);
    this.tabInferior.set('receta');
  }

  // Igual que verRecetaDeHistorial, pero para el tab "Laboratorio".
  verLaboratorioDeHistorial(h: HistoriaClinica, event: MouseEvent): void {
    event.stopPropagation();
    this.seleccionarHistorial(h);
    this.tabInferior.set('laboratorio');
  }
}
