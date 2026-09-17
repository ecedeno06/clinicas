import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalPacienteService } from '../../core/services/portalPaciente.service';
import { EstadoCita, HistoriaClinica, OrdenLaboratorio, PacienteAntecedente, Receta, SignosVitales } from '../../core/models/models';
import { formatoFechaCorta } from '../../core/utils/pdf.util';
import { formatoAmPm } from '../../core/utils/hora12.util';
import { clasificarImc } from '../../core/utils/imc.util';
import { clasificarPresion } from '../../core/utils/presion.util';
import { clasificarGlucosa } from '../../core/utils/glucosa.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';

// "Mis Citas" del portal del paciente: mismo diseno que el "Historial
// clinico" que ya usa el staff en pacientes.component.ts/.html (tabs
// Consultas/Antecedentes arriba, tabla + filtros, panel de detalle abajo
// con Signos vitales/Receta/Laboratorio), incluyendo los iconos rapidos de
// receta/laboratorio en la fila -- pero como pagina completa (no drawer) y
// agregando consultas de TODAS las clinicas que autorizan al paciente
// (columna Clinica, ausente en la version de staff porque ahi ya se sabe
// la clinica). Sin el boton de compartir ubicacion por WhatsApp -- fuera
// de alcance (ese comparte la ubicacion DEL PACIENTE con el doctor, no
// tiene sentido en su propio portal).
@Component({
  selector: 'app-citas-paciente',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectorFotoComponent],
  templateUrl: './citas-paciente.component.html',
})
export class CitasPacienteComponent implements OnInit {
  formatoAmPm = formatoAmPm;

  fotoPaciente = signal<string | null>(null);
  nombrePaciente = signal('');

  tabSuperior = signal<'consultas' | 'antecedentes'>('consultas');
  // 'evaluacion' (motivo/diagnostico/observaciones) no pide ninguna
  // llamada aparte -- ya viene en la fila de historialSeleccionado().
  tabInferior = signal<'signos' | 'receta' | 'laboratorio' | 'evaluacion'>('signos');

  historial = signal<HistoriaClinica[]>([]);
  cargandoHistorial = signal(true);
  error = signal<string | null>(null);

  antecedentes = signal<PacienteAntecedente[]>([]);
  alergias = signal<string | null>(null);
  antecedenteSeleccionado = signal<PacienteAntecedente | null>(null);

  filtroClinica = signal('');
  filtroFecha = signal('');
  filtroDoctor = signal('');
  filtroSucursal = signal('');
  filtroEstado = signal('');

  hayFiltros = computed(() => !!(
    this.filtroClinica() || this.filtroFecha() || this.filtroDoctor() || this.filtroSucursal() || this.filtroEstado()
  ));

  limpiarFiltros(): void {
    this.filtroClinica.set('');
    this.filtroFecha.set('');
    this.filtroDoctor.set('');
    this.filtroSucursal.set('');
    this.filtroEstado.set('');
  }

  historialFiltrado = computed(() => {
    const clinica = this.filtroClinica().trim().toLowerCase();
    const fecha = this.filtroFecha().trim().toLowerCase();
    const doctor = this.filtroDoctor().trim().toLowerCase();
    const sucursal = this.filtroSucursal().trim().toLowerCase();
    const estado = this.filtroEstado().trim().toLowerCase();

    return this.historial().filter((h) => {
      if (clinica && !(h.empresa_nombre ?? '').toLowerCase().includes(clinica)) return false;
      if (fecha && !formatoFechaCorta(h.fecha_cita || '').includes(fecha)) return false;
      if (doctor && !(h.doctor_nombre ?? '').toLowerCase().includes(doctor)) return false;
      if (sucursal && !(h.sucursal_nombre ?? '').toLowerCase().includes(sucursal)) return false;
      if (estado && !this.estadoEtiqueta(h.estado).toLowerCase().includes(estado)) return false;
      return true;
    });
  });

  estadoEtiqueta(estado: EstadoCita | undefined): string {
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

  signosVitalesSeleccionado = signal<SignosVitales | null>(null);
  cargandoSignosSeleccionado = signal(false);

  recetasSeleccionadas = signal<Receta[]>([]);
  cargandoRecetaSeleccionada = signal(false);

  ordenesLaboratorioSeleccionadas = signal<OrdenLaboratorio[]>([]);
  cargandoLaboratorioSeleccionado = signal(false);

  constructor(private srv: PortalPacienteService) {}

  ngOnInit(): void {
    this.cargandoHistorial.set(true);
    this.srv.historial().subscribe({
      next: (data) => { this.historial.set(data); this.cargandoHistorial.set(false); },
      error: (err) => { this.error.set(err?.error?.mensaje || 'No se pudo cargar tu historial'); this.cargandoHistorial.set(false); },
    });

    this.srv.perfil().subscribe({
      next: (p) => {
        this.antecedentes.set(p.antecedentes ?? []);
        this.alergias.set(p.alergias ?? null);
        this.fotoPaciente.set(p.foto ?? null);
        this.nombrePaciente.set(p.nombre ?? '');
      },
      error: () => {},
    });
  }

  seleccionarHistorial(h: HistoriaClinica): void {
    this.historialSeleccionado.set(h);
    this.tabInferior.set('signos');

    this.signosVitalesSeleccionado.set(null);
    this.cargandoSignosSeleccionado.set(true);
    this.srv.signosVitalesDeCita(h.cita_id).subscribe({
      next: (data) => { this.signosVitalesSeleccionado.set(data); this.cargandoSignosSeleccionado.set(false); },
      error: () => this.cargandoSignosSeleccionado.set(false), // 404: no se registraron signos vitales en esa consulta
    });

    this.recetasSeleccionadas.set([]);
    this.cargandoRecetaSeleccionada.set(true);
    this.srv.recetasDeCita(h.cita_id).subscribe({
      next: (data) => { this.recetasSeleccionadas.set(data); this.cargandoRecetaSeleccionada.set(false); },
      error: () => this.cargandoRecetaSeleccionada.set(false),
    });

    this.ordenesLaboratorioSeleccionadas.set([]);
    this.cargandoLaboratorioSeleccionado.set(true);
    this.srv.laboratorioDeCita(h.cita_id).subscribe({
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

  claseImc(imc: number | null | undefined): { etiqueta: string; clase: string } | null {
    return imc != null ? clasificarImc(imc) : null;
  }

  clasePresion(sistolica: number | null | undefined, diastolica: number | null | undefined): { etiqueta: string; clase: string } | null {
    return sistolica != null && diastolica != null ? clasificarPresion(sistolica, diastolica) : null;
  }

  claseGlucosa(glucosa: number | null | undefined): { etiqueta: string; clase: string } | null {
    return glucosa != null ? clasificarGlucosa(glucosa) : null;
  }
}
