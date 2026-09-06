import { Component, OnInit, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CampanasService } from '../../core/services/campanas.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { CitasService } from '../../core/services/citas.service';
import { AuthService } from '../../core/services/auth.service';
import { Campana, CampanaDoctor, Cita, Doctor, EstadoCampana, EventoCitaLog, Sucursal } from '../../core/models/models';
import { formatoAmPm } from '../../core/utils/hora12.util';
import { hoyISO } from '../../core/utils/fecha.util';
import { MapaSelectorComponent, UbicacionSeleccionada, extraerLatLng } from '../../core/components/mapa-selector/mapa-selector.component';

// Mismo grafo de transiciones que el backend (campanas.controller.js) --
// duplicado a proposito en el cliente solo para decidir que botones
// mostrar; el backend sigue siendo quien valida de verdad.
const TRANSICIONES: Record<EstadoCampana, EstadoCampana[]> = {
  borrador: ['pendiente_aprobacion'],
  pendiente_aprobacion: ['aprobada', 'rechazada'],
  rechazada: ['borrador'],
  aprobada: ['en_curso', 'cancelada'],
  en_curso: ['finalizada', 'cancelada'],
  finalizada: [],
  cancelada: [],
};

const ETIQUETAS_ESTADO: Record<EstadoCampana, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  en_curso: 'En curso',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

const ETIQUETAS_TRANSICION: Record<string, string> = {
  pendiente_aprobacion: 'Enviar a revisión',
  aprobada: 'Aprobar',
  rechazada: 'Rechazar',
  borrador: 'Volver a borrador',
  en_curso: 'Marcar en curso',
  finalizada: 'Finalizar',
  cancelada: 'Cancelar',
};

@Component({
  selector: 'app-campanas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MapaSelectorComponent],
  templateUrl: './campanas.component.html',
  styleUrl: './campanas.component.css',
})
export class CampanasComponent implements OnInit {
  campanas = signal<Campana[]>([]);
  sucursales = signal<Sucursal[]>([]);
  doctores = signal<Doctor[]>([]);
  panelAbierto = signal(false);
  editando = signal<Campana | null>(null);
  doctoresDeCampana = signal<CampanaDoctor[]>([]);
  doctorParaInvitar = signal<string>('');
  citasAtendidas = signal<Cita[]>([]);
  formatoAmPm = formatoAmPm;

  filtroNombre = signal('');
  filtroEstado = signal('');
  hayFiltros = computed(() => !!(this.filtroNombre() || this.filtroEstado()));
  limpiarFiltros(): void { this.filtroNombre.set(''); this.filtroEstado.set(''); }

  campanasFiltradas = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    const estado = this.filtroEstado();
    return this.campanas().filter((c) => {
      if (nombre && !c.nombre.toLowerCase().includes(nombre)) return false;
      if (estado && c.estado !== estado) return false;
      return true;
    });
  });

  etiquetaEstado = (e: EstadoCampana) => ETIQUETAS_ESTADO[e] ?? e;
  etiquetaTransicion = (e: EstadoCampana) => ETIQUETAS_TRANSICION[e] ?? e;

  // Doctores que todavia no estan invitados a la campana que se esta editando.
  doctoresDisponibles = computed(() => {
    const invitados = new Set(this.doctoresDeCampana().map((d) => d.doctor_id));
    return this.doctores().filter((d) => !invitados.has(d.id));
  });

  form = this.fb.group({
    sucursal_id: [''],
    nombre: ['', Validators.required],
    lugar: ['', Validators.required],
    contacto_lugar: [''],
    google_maps_url: [''],
    fecha_inicio: ['', Validators.required],
    fecha_fin: ['', Validators.required],
    hora_inicio: [''],
    hora_fin: [''],
    descripcion: [''],
  });

  constructor(
    private fb: FormBuilder,
    private srv: CampanasService,
    private sucursalesSrv: SucursalesService,
    private doctoresSrv: DoctoresService,
    private citasSrv: CitasService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
    this.doctoresSrv.listar().subscribe((data) => this.doctores.set(data.filter((d) => d.activo)));
  }

  cargar(): void { this.srv.listar().subscribe((data) => this.campanas.set(data)); }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  // Solo se puede editar el formulario libremente en borrador/rechazada,
  // igual que el backend.
  puedeEditarCampos(): boolean {
    const c = this.editando();
    return !c || c.estado === 'borrador' || c.estado === 'rechazada';
  }

  // Una campana cerrada (terminal, o cuya fecha ya paso aunque nadie la
  // haya marcado como finalizada a mano) ya no admite gestionar a sus
  // doctores invitados -- ni cambiarles el estado ni compartirles la
  // ubicacion tiene sentido a esas alturas.
  campanaCerrada(c: Campana): boolean {
    return ['finalizada', 'cancelada', 'rechazada'].includes(c.estado) || c.fecha_fin.substring(0, 10) < hoyISO();
  }

  transicionesDisponibles(): EstadoCampana[] {
    const c = this.editando();
    if (!c) return [];
    return TRANSICIONES[c.estado] ?? [];
  }

  abrirNuevo(): void {
    this.editando.set(null);
    this.doctoresDeCampana.set([]);
    this.citasAtendidas.set([]);
    this.form.reset();
    this.form.enable();
    this.panelAbierto.set(true);
  }

  abrirEditar(c: Campana): void {
    this.editando.set(c);
    this.form.reset({
      sucursal_id: c.sucursal_id ?? '',
      nombre: c.nombre,
      lugar: c.lugar,
      contacto_lugar: c.contacto_lugar ?? '',
      google_maps_url: c.google_maps_url ?? '',
      fecha_inicio: c.fecha_inicio.substring(0, 10),
      fecha_fin: c.fecha_fin.substring(0, 10),
      hora_inicio: c.hora_inicio?.substring(0, 5) ?? '',
      hora_fin: c.hora_fin?.substring(0, 5) ?? '',
      descripcion: c.descripcion ?? '',
    });
    this.actualizarBloqueoFormulario();
    this.cargarDoctoresDeCampana(c.id);
    this.cargarCitasAtendidas(c.id);
    this.panelAbierto.set(true);
  }

  cargarDoctoresDeCampana(campanaId: string): void {
    this.srv.listarDoctores(campanaId).subscribe((data) => this.doctoresDeCampana.set(data));
  }

  // Reporte de pacientes atendidos: reutiliza el listado de citas ya
  // existente, filtrado por esta campana y estado 'atendida' -- no hace
  // falta ningun endpoint nuevo.
  cargarCitasAtendidas(campanaId: string): void {
    this.citasSrv.listar({ campana_id: campanaId, estado: 'atendida' }).subscribe((data) => this.citasAtendidas.set(data));
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  @ViewChild(MapaSelectorComponent) mapaSelector?: MapaSelectorComponent;

  abrirMapa(): void {
    this.mapaSelector?.abrir(this.form.get('google_maps_url')?.value);
  }

  onUbicacionElegida(u: UbicacionSeleccionada): void {
    this.form.patchValue({ google_maps_url: u.url });
  }

  // wa.me abre WhatsApp Web/app con el mensaje precargado -- no requiere
  // API ni cuenta de WhatsApp Business, solo funciona como un enlace normal.
  whatsappUrl(c: Campana): string {
    const lineas = [`Ubicacion de ${c.nombre} (Google Maps): ${c.google_maps_url}`];
    const coords = extraerLatLng(c.google_maps_url);
    if (coords) {
      lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
    }
    return `https://wa.me/?text=${encodeURIComponent(lineas.join('\n'))}`;
  }

  private formatoFecha(iso: string): string {
    const [anio, mes, dia] = iso.substring(0, 10).split('-');
    return `${dia}/${mes}/${anio}`;
  }

  // Solo tiene sentido ofrecer "compartir ubicacion" con el doctor si hay
  // a donde mandarlo (telefono, marcado explicitamente como que recibe
  // WhatsApp) y que mandar (enlace de la campana) -- mismo criterio que
  // en Citas.
  puedeCompartirUbicacionDoctor(cd: CampanaDoctor): boolean {
    const c = this.editando();
    return !!cd.doctor_telefono && !!cd.doctor_acepta_whatsapp && !!c?.google_maps_url;
  }

  whatsappUrlDoctor(cd: CampanaDoctor): string {
    const c = this.editando()!;
    const telefono = (cd.doctor_telefono || '').replace(/\D/g, '');
    const fechas = c.fecha_inicio === c.fecha_fin
      ? this.formatoFecha(c.fecha_inicio)
      : `${this.formatoFecha(c.fecha_inicio)} - ${this.formatoFecha(c.fecha_fin)}`;

    const lineas = [
      `Hola ${cd.doctor_nombre}, te confirmamos los datos de la campaña "${c.nombre}":`,
      '',
      `Fecha: ${fechas}`,
    ];
    if (c.hora_inicio && c.hora_fin) {
      lineas.push(`Hora: ${formatoAmPm(c.hora_inicio)} - ${formatoAmPm(c.hora_fin)}`);
    }
    lineas.push(`Lugar: ${c.lugar}`);
    if (c.sucursal_nombre) lineas.push(`Sucursal organizadora: ${c.sucursal_nombre}`);
    lineas.push('', `Ubicacion (Google Maps): ${c.google_maps_url}`);

    const coords = extraerLatLng(c.google_maps_url);
    if (coords) {
      lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
    }

    return `https://wa.me/${telefono}?text=${encodeURIComponent(lineas.join('\n'))}`;
  }

  guardar(): void {
    if (this.form.invalid) return;
    const data = this.form.getRawValue();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: (campana) => {
        if (!actual) {
          // Recien creada: se queda en el mismo panel, ya en modo edicion,
          // para poder reclutar doctores sin tener que reabrir.
          this.editando.set(campana);
          this.cargarDoctoresDeCampana(campana.id);
        } else {
          this.editando.set(campana);
        }
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la campana'),
    });
  }

  // Guarda solo la ubicacion, sin importar el estado de la campana (el
  // backend acepta un payload que solo traiga google_maps_url incluso
  // fuera de borrador/rechazada -- ver campanas.controller.js#actualizar).
  guardarUbicacion(): void {
    const c = this.editando();
    if (!c) return;
    const google_maps_url = this.form.get('google_maps_url')?.value;
    this.srv.actualizar(c.id, { google_maps_url }).subscribe({
      next: (campana) => { this.editando.set(campana); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la ubicacion'),
    });
  }

  cambiarEstado(estado: EstadoCampana): void {
    const c = this.editando();
    if (!c) return;
    let motivo: string | undefined;
    if (estado === 'rechazada') {
      motivo = prompt('Motivo del rechazo:') || '';
      if (!motivo) return;
    }
    if (estado === 'cancelada' && !confirm('Cancelar esta campana?')) return;

    this.srv.cambiarEstado(c.id, estado, motivo).subscribe({
      next: (campana) => {
        this.editando.set(campana);
        this.actualizarBloqueoFormulario();
        this.cargar();
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo cambiar el estado'),
    });
  }

  // Bloquea el formulario segun el estado actual, dejando siempre
  // habilitada la ubicacion (google_maps_url no tiene candado de estado,
  // ver campanas.controller.js#actualizar).
  private actualizarBloqueoFormulario(): void {
    if (this.puedeEditarCampos()) {
      this.form.enable();
    } else {
      this.form.disable();
      this.form.get('google_maps_url')?.enable();
    }
  }

  invitarDoctor(): void {
    const c = this.editando();
    const doctorId = this.doctorParaInvitar();
    if (!c || !doctorId) return;
    this.srv.invitarDoctor(c.id, doctorId).subscribe({
      next: () => { this.doctorParaInvitar.set(''); this.cargarDoctoresDeCampana(c.id); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo invitar al doctor'),
    });
  }

  actualizarEstadoDoctor(cd: CampanaDoctor, estado: 'confirmado' | 'rechazado'): void {
    const c = this.editando();
    if (!c) return;
    this.srv.actualizarDoctor(c.id, cd.doctor_id, { estado }).subscribe({
      next: () => { this.cargarDoctoresDeCampana(c.id); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo actualizar al doctor'),
    });
  }

  logDesc(c: Campana): EventoCitaLog[] {
    return [...(c.log ?? [])].reverse();
  }

  quitarDoctor(cd: CampanaDoctor): void {
    const c = this.editando();
    if (!c) return;
    if (!confirm(`Quitar a "${cd.doctor_nombre}" de esta campana?`)) return;
    this.srv.quitarDoctor(c.id, cd.doctor_id).subscribe({
      next: () => { this.cargarDoctoresDeCampana(c.id); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo quitar al doctor'),
    });
  }
}
