import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DoctoresService } from '../../core/services/doctores.service';
import { EspecialidadesService } from '../../core/services/especialidades.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { AuthService } from '../../core/services/auth.service';
import { Doctor, DoctorEspecialidad, DoctorHorario, Especialidad, Sucursal } from '../../core/models/models';
import { combinar12, combinarHoraFin12, formatoAmPm, HORAS_12, MINUTOS_60, partes12 } from '../../core/utils/hora12.util';
import { TelefonoInputComponent } from '../../core/components/telefono-input/telefono-input.component';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';

@Component({
  selector: 'app-doctores',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TelefonoInputComponent, SelectorFotoComponent],
  templateUrl: './doctores.component.html',
  styleUrl: './doctores.component.css',
})
export class DoctoresComponent implements OnInit {
  doctores = signal<Doctor[]>([]);
  especialidades = signal<Especialidad[]>([]);
  // La especialidad que ejerce un doctor es un hecho global de la
  // persona (no de la clinica que lo consulta) -- solo se le pueden
  // asignar especialidades del catalogo GLOBAL, nunca privadas de una
  // clinica (el backend tambien lo valida). Permite responder "que
  // doctores tienen la especialidad X en toda la red" sin fragmentar
  // por clinica.
  especialidadesGlobales = computed(() => this.especialidades().filter((e) => !e.empresa_id));
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
    identificacion: [''],
    telefono: [''],
    acepta_whatsapp: [false],
    email: [''],
    foto: [null as string | null],
    activo: [true],
    especialidades: this.fb.array([this.crearEspecialidadGroup()]),
  });

  // Doctor es global (mismo patron que Pacientes): al escribir la
  // identificacion se busca en TODA la red antes de crear uno nuevo.
  doctorExistente = signal<Doctor | null>(null);
  private readonly camposIdentidad = ['nombre', 'telefono', 'email'];
  // Se incrementa cada vez que se abre el panel para que una respuesta
  // tardia de buscarPorIdentificacion() no contamine un formulario que
  // ya se reseteo -- ver onIdentificacionBlur().
  private tokenBusquedaIdentificacion = 0;

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

  // Dar acceso al sistema (rol staff) es mas sensible que invitar-paciente
  // (portal de solo lectura) -- por eso solo admin, a diferencia de
  // puedeInvitarPaciente() que tambien permite doctor.
  puedeInvitarDoctor(): boolean {
    return this.esAdmin();
  }

  invitarAcceso(d: Doctor, confirmarVincularExistente = false): void {
    if (!confirmarVincularExistente && !confirm(`Se enviara un correo a ${d.email} con sus credenciales de acceso al sistema. Continuar?`)) return;
    this.srv.invitar(d.id, confirmarVincularExistente).subscribe({
      next: () => { alert('Invitacion enviada.'); this.cargar(); },
      error: (err) => {
        // Si el correo ya pertenece a una cuenta existente, el backend
        // rechaza con 409 y pide confirmar explicitamente (ver
        // resolverUsuarioPortal()) en vez de vincularla en silencio.
        if (err?.status === 409 && err?.error?.requiereConfirmacion) {
          const nombreExistente = err.error.cuenta_existente_nombre;
          if (confirm(`Ya existe una cuenta con ese correo, a nombre de "${nombreExistente}". ¿Es la misma persona? Confirma solo si estas seguro -- si no, cancela y corrige el correo primero.`)) {
            this.invitarAcceso(d, true);
          }
          return;
        }
        alert(err?.error?.mensaje || 'No se pudo enviar la invitacion');
      },
    });
  }

  // Revoca el acceso de doctor en ESTA clinica -- no borra su cuenta ni su
  // acceso en otras clinicas donde tambien trabaje.
  desinvitarAcceso(d: Doctor): void {
    if (!confirm(`Quitar el acceso al sistema de "${d.nombre}" en esta clinica? Podras volver a invitarlo cuando quieras.`)) return;
    this.srv.desinvitar(d.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo quitar el acceso'),
    });
  }

  reseteandoPasswordDoctor = signal<string | null>(null);

  resetearPasswordDoctor(d: Doctor): void {
    if (!confirm(`Se generara una nueva contrasena de acceso para "${d.nombre}" y se enviara a ${d.email}. Continuar?`)) return;
    this.reseteandoPasswordDoctor.set(d.id);
    this.srv.resetearPassword(d.id).subscribe({
      next: (res) => { this.reseteandoPasswordDoctor.set(null); alert(res.mensaje); },
      error: (err) => { this.reseteandoPasswordDoctor.set(null); alert(err?.error?.mensaje || 'No se pudo resetear la contrasena'); },
    });
  }

  // Corrige el correo de LOGIN de la cuenta ya vinculada (usuarios.email) --
  // distinto del correo de contacto del doctor (d.email). Pensado para
  // cuando el doctor perdio acceso a esa bandeja, o quedo mal escrito al
  // invitarlo (ver resolverUsuarioPortal()).
  cambiarCorreoAccesoDoctor(d: Doctor): void {
    const nuevoEmail = prompt(`Nuevo correo de acceso (login) para "${d.nombre}" -- distinto de su correo de contacto (${d.email}):`);
    if (!nuevoEmail) return;
    this.srv.cambiarCorreoAcceso(d.id, nuevoEmail).subscribe({
      next: () => { alert('Correo de acceso actualizado.'); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo cambiar el correo de acceso'),
    });
  }

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
    this.tokenBusquedaIdentificacion++;
    this.editando.set(null);
    this.doctorExistente.set(null);
    this.form.reset({ activo: true });
    this.habilitarCamposIdentidad();
    this.especialidadesArray.clear();
    this.especialidadesArray.push(this.crearEspecialidadGroup());
    this.panelAbierto.set(true);
  }

  abrirEditar(d: Doctor): void {
    this.tokenBusquedaIdentificacion++;
    this.editando.set(d);
    this.doctorExistente.set(null);
    this.form.reset({ nombre: d.nombre, identificacion: d.identificacion, telefono: d.telefono, acepta_whatsapp: d.acepta_whatsapp, email: d.email, foto: d.foto ?? null, activo: d.activo });
    this.habilitarCamposIdentidad();
    this.especialidadesArray.clear();
    (d.especialidades.length ? d.especialidades : [undefined]).forEach((e) => this.especialidadesArray.push(this.crearEspecialidadGroup(e)));
    this.panelAbierto.set(true);
  }

  // Mismo criterio que en Pacientes: el drawer solo guarda la foto cuando
  // se envia el formulario completo, no de inmediato -- por eso solo se
  // actualiza el control, sin llamar al backend aca.
  onFotoSeleccionada(base64: string): void {
    this.form.patchValue({ foto: base64 });
    this.form.get('foto')?.markAsDirty();
  }

  onFotoEliminada(): void {
    this.form.patchValue({ foto: null });
    this.form.get('foto')?.markAsDirty();
  }

  // Solo aplica al registrar un doctor nuevo: busca en TODA la red (no
  // solo esta clinica) si la identificacion ya pertenece a alguien. Si
  // es asi, reutiliza sus datos globales (nombre, contacto) en vez de
  // dejar que se vuelvan a capturar distinto por error.
  onIdentificacionBlur(): void {
    if (this.editando()) return;
    const identificacion = (this.form.get('identificacion')?.value || '').trim();
    if (!identificacion) {
      this.doctorExistente.set(null);
      this.habilitarCamposIdentidad();
      return;
    }
    const token = ++this.tokenBusquedaIdentificacion;
    this.srv.buscarPorIdentificacion(identificacion).subscribe({
      next: (res) => {
        if (token !== this.tokenBusquedaIdentificacion) return;
        if (res.existe && res.doctor) {
          this.doctorExistente.set(res.doctor);
          this.form.patchValue({
            nombre: res.doctor.nombre,
            telefono: res.doctor.telefono ?? '',
            acepta_whatsapp: res.doctor.acepta_whatsapp ?? false,
            email: res.doctor.email ?? '',
            foto: res.doctor.foto ?? null,
          });
          this.especialidadesArray.clear();
          (res.doctor.especialidades?.length ? res.doctor.especialidades : [undefined]).forEach((e) => this.especialidadesArray.push(this.crearEspecialidadGroup(e)));
          this.deshabilitarCamposIdentidad();
        } else {
          this.doctorExistente.set(null);
          this.habilitarCamposIdentidad();
        }
      },
      error: () => {
        if (token !== this.tokenBusquedaIdentificacion) return;
        this.doctorExistente.set(null);
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
    this.srv.eliminar(d.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el doctor'),
    });
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

  // "Hasta" usa combinarHoraFin12(): "12:00 a.m." solo tiene sentido como
  // fin del dia (24:00, ver hora12.util.ts), nunca como su inicio (00:00).
  actualizarHoraHorario12(campo: 'hora_inicio' | 'hora_fin', parte: 'h' | 'm' | 'periodo', valor: number | string): void {
    const actual = this.partesHoraHorario(campo);
    const h12 = parte === 'h' ? Number(valor) : actual.h ?? 12;
    const m = parte === 'm' ? String(valor) : actual.m ?? '00';
    const periodo = (parte === 'periodo' ? valor : actual.periodo ?? 'a.m.') as 'a.m.' | 'p.m.';
    const hora24 = campo === 'hora_fin' ? combinarHoraFin12(h12, m, periodo) : combinar12(h12, m, periodo);
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

  // El doctor dueno de este tablero (su propia cuenta) puede gestionar
  // cualquiera de sus bloques sin importar la clinica.
  esMiPropioDoctor(): boolean {
    const doctor = this.horarioDoctor();
    const usuarioId = this.auth.usuario()?.id;
    return !!doctor?.usuario_id && doctor.usuario_id === usuarioId;
  }

  // true si este bloque puntual es de la clinica activa de la sesion --
  // decide el color (verde/ambar) y, para un admin normal, si puede
  // deshabilitarlo/eliminarlo (ver puedeGestionarHorario).
  esDeClinicaActiva(h: DoctorHorario): boolean {
    return h.sucursal_empresa_id === this.auth.empresaActiva()?.empresa_id;
  }

  // Mismo criterio que el backend (puedeGestionarHorario en
  // doctorHorarios.controller.js): el doctor dueno gestiona cualquiera de
  // sus bloques; un admin normal solo los de su clinica activa.
  puedeGestionarHorario(h: DoctorHorario): boolean {
    return this.esMiPropioDoctor() || (this.esAdmin() && this.esDeClinicaActiva(h));
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
