import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PacientesService } from '../../core/services/pacientes.service';
import { CitasService } from '../../core/services/citas.service';
import { AuthService } from '../../core/services/auth.service';
import { HistoriaClinica, OrdenLaboratorio, Paciente, Receta, SignosVitales } from '../../core/models/models';
import { clasificarImc } from '../../core/utils/imc.util';
import { clasificarPresion } from '../../core/utils/presion.util';
import { clasificarGlucosa } from '../../core/utils/glucosa.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SelectorFotoComponent],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.css',
})
export class PacientesComponent implements OnInit {
  pacientes = signal<Paciente[]>([]);
  panelAbierto = signal(false);
  editando = signal<Paciente | null>(null);
  pacienteExistente = signal<Paciente | null>(null);

  private readonly camposIdentidad = ['nombre', 'fecha_nacimiento', 'sexo', 'telefono', 'email', 'direccion', 'alergias', 'contacto_emergencia'];

  pacienteHistorial = signal<Paciente | null>(null);
  historial = signal<HistoriaClinica[]>([]);
  cargandoHistorial = signal(false);

  historialSeleccionado = signal<HistoriaClinica | null>(null);
  // Dos grupos de tabs independientes: arriba (lista/antecedentes del
  // paciente) y abajo (detalle de la consulta seleccionada).
  tabSuperior = signal<'consultas' | 'antecedentes'>('consultas');
  tabInferior = signal<'signos' | 'receta' | 'laboratorio'>('signos');

  signosVitalesSeleccionado = signal<SignosVitales | null>(null);
  cargandoSignosSeleccionado = signal(false);
  // Historial completo de signos vitales del paciente (asc por fecha), para
  // calcular tendencias (ej. peso subio/bajo respecto a la consulta anterior).
  signosVitalesHistorialLista = signal<SignosVitales[]>([]);

  recetasSeleccionadas = signal<Receta[]>([]);
  cargandoRecetaSeleccionada = signal(false);

  ordenesLaboratorioSeleccionadas = signal<OrdenLaboratorio[]>([]);
  cargandoLaboratorioSeleccionado = signal(false);

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

  constructor(private fb: FormBuilder, private srv: PacientesService, private citasSrv: CitasService, public auth: AuthService) {}

  ngOnInit(): void { this.cargar(); }
  cargar(): void { this.srv.listar().subscribe((data) => this.pacientes.set(data)); }

  abrirNuevo(): void {
    this.editando.set(null);
    this.pacienteExistente.set(null);
    this.form.reset({ activo: true, contacto_emergencia: { nombre: '', telefono: '', parentesco: '' } });
    this.habilitarCamposIdentidad();
    this.panelAbierto.set(true);
  }

  abrirEditar(p: Paciente): void {
    this.editando.set(p);
    this.pacienteExistente.set(null);
    this.form.reset({
      ...p,
      fecha_nacimiento: p.fecha_nacimiento?.substring(0, 10) ?? '',
      contacto_emergencia: {
        nombre: p.contacto_emergencia?.nombre ?? '',
        telefono: p.contacto_emergencia?.telefono ?? '',
        parentesco: p.contacto_emergencia?.parentesco ?? '',
      },
    });
    this.habilitarCamposIdentidad();
    this.panelAbierto.set(true);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

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
    this.srv.buscarPorIdentificacion(identificacion).subscribe({
      next: (res) => {
        if (res.existe && res.paciente) {
          this.pacienteExistente.set(res.paciente);
          this.form.patchValue({
            nombre: res.paciente.nombre,
            foto: res.paciente.foto ?? null,
            fecha_nacimiento: res.paciente.fecha_nacimiento?.substring(0, 10) ?? '',
            sexo: res.paciente.sexo ?? '',
            telefono: res.paciente.telefono ?? '',
            email: res.paciente.email ?? '',
            direccion: res.paciente.direccion ?? '',
            alergias: res.paciente.alergias ?? '',
            contacto_emergencia: {
              nombre: res.paciente.contacto_emergencia?.nombre ?? '',
              telefono: res.paciente.contacto_emergencia?.telefono ?? '',
              parentesco: res.paciente.contacto_emergencia?.parentesco ?? '',
            },
          });
          this.deshabilitarCamposIdentidad();
        } else {
          this.pacienteExistente.set(null);
          this.habilitarCamposIdentidad();
        }
      },
      error: () => { this.pacienteExistente.set(null); this.habilitarCamposIdentidad(); },
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
    this.historialSeleccionado.set(null);
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
