import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportesService } from '../../../core/services/reportes.service';
import { SucursalesService } from '../../../core/services/sucursales.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReporteDiagnosticoFila, Sucursal } from '../../../core/models/models';
import { formatoAmPm } from '../../../core/utils/hora12.util';
import { hoyISO } from '../../../core/utils/fecha.util';
import { generarPdf, encabezadoClinica, formatoFechaCorta } from '../../../core/utils/pdf.util';
import { exportarCsv } from '../../../core/utils/csv.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Component({
  selector: 'app-reporte-diagnosticos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-diagnosticos.component.html',
  styleUrl: './reporte-diagnosticos.component.css',
})
export class ReporteDiagnosticosComponent implements OnInit {
  sucursales = signal<Sucursal[]>([]);
  filas = signal<ReporteDiagnosticoFila[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  sucursalId = signal('');
  desde = signal(hoyISO());
  hasta = signal(hoyISO());

  // Filtro por columna, sobre lo ya traido del rango de fechas -- mismo
  // patron que usuarios.component.ts.
  filtroPaciente = signal('');
  filtroDiagnostico = signal('');
  filtroMedicamento = signal('');
  filtroDoctor = signal('');
  filtroSucursal = signal('');

  hayFiltrosColumna = computed(() => !!(
    this.filtroPaciente() || this.filtroDiagnostico() || this.filtroMedicamento() ||
    this.filtroDoctor() || this.filtroSucursal()
  ));

  limpiarFiltrosColumna(): void {
    this.filtroPaciente.set('');
    this.filtroDiagnostico.set('');
    this.filtroMedicamento.set('');
    this.filtroDoctor.set('');
    this.filtroSucursal.set('');
  }

  filasFiltradas = computed(() => {
    const paciente = this.filtroPaciente().trim().toLowerCase();
    const diagnostico = this.filtroDiagnostico().trim().toLowerCase();
    const medicamento = this.filtroMedicamento().trim().toLowerCase();
    const doctor = this.filtroDoctor().trim().toLowerCase();
    const sucursal = this.filtroSucursal().trim().toLowerCase();

    return this.filas().filter((f) => {
      if (paciente && !f.paciente_nombre.toLowerCase().includes(paciente)) return false;
      if (diagnostico && !f.diagnostico.toLowerCase().includes(diagnostico)) return false;
      if (medicamento && !(f.medicamentos ?? '').toLowerCase().includes(medicamento)) return false;
      if (doctor && !f.doctor_nombre.toLowerCase().includes(doctor)) return false;
      if (sucursal && !f.sucursal_nombre.toLowerCase().includes(sucursal)) return false;
      return true;
    });
  });

  formatoAmPm = formatoAmPm;

  // Seleccion para imprimir: independiente del filtro por columna (una
  // fila seleccionada sigue seleccionada aunque un filtro la oculte
  // momentaneamente de la vista).
  seleccionados = signal<Set<string>>(new Set());
  haySeleccion = computed(() => this.seleccionados().size > 0);
  todosVisiblesSeleccionados = computed(() => {
    const visibles = this.filasFiltradas();
    return visibles.length > 0 && visibles.every((f) => this.seleccionados().has(f.cita_id));
  });

  constructor(
    private reportesSrv: ReportesService,
    private sucursalesSrv: SucursalesService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
  }

  buscar(): void {
    this.cargando.set(true);
    this.limpiarFiltrosColumna();
    this.seleccionados.set(new Set());
    const filtros: Record<string, string> = { desde: this.desde(), hasta: this.hasta() };
    if (this.sucursalId()) filtros['sucursal_id'] = this.sucursalId();
    this.reportesSrv.diagnosticos(filtros).subscribe({
      next: (data) => { this.filas.set(data); this.cargando.set(false); this.buscado.set(true); },
      error: () => { this.filas.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  toggleSeleccion(citaId: string): void {
    const nuevo = new Set(this.seleccionados());
    if (nuevo.has(citaId)) nuevo.delete(citaId); else nuevo.add(citaId);
    this.seleccionados.set(nuevo);
  }

  toggleSeleccionarTodosVisibles(): void {
    const visibles = this.filasFiltradas();
    if (this.todosVisiblesSeleccionados()) {
      const nuevo = new Set(this.seleccionados());
      visibles.forEach((f) => nuevo.delete(f.cita_id));
      this.seleccionados.set(nuevo);
    } else {
      const nuevo = new Set(this.seleccionados());
      visibles.forEach((f) => nuevo.add(f.cita_id));
      this.seleccionados.set(nuevo);
    }
  }

  imprimir(): void {
    const empresa = this.auth.empresaActiva();
    const seleccionadas = this.filas().filter((f) => this.seleccionados().has(f.cita_id));
    const filas = seleccionadas.map((f) => [
      `${formatoFechaCorta(f.fecha)}\n${formatoAmPm(f.hora_inicio)} - ${formatoAmPm(f.hora_fin)}`,
      f.paciente_nombre,
      f.diagnostico,
      f.medicamentos || '-',
      f.doctor_nombre,
      f.sucursal_nombre,
    ]);

    const doc: TDocumentDefinitions = {
      pageOrientation: 'landscape',
      pageMargins: [30, 30, 30, 30],
      content: [
        ...(encabezadoClinica(empresa?.empresa_logo, empresa?.empresa_nombre, 'Reporte de diagnosticos') as any[]),
        {
          text: `${formatoFechaCorta(this.desde())} - ${formatoFechaCorta(this.hasta())}`,
          color: '#64748b',
          margin: [0, 0, 0, 10],
        },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', '*', '*', 'auto', 'auto'],
            body: [
              ['Fecha - Hora', 'Paciente', 'Diagnostico', 'Medicamento', 'Doctor', 'Sucursal'].map((t) => ({ text: t, bold: true })),
              ...filas,
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],
      defaultStyle: { fontSize: 9 },
    };

    generarPdf(doc);
  }

  // Mismo criterio que imprimir(): solo las filas marcadas con checkbox.
  exportarCsv(): void {
    const seleccionadas = this.filas().filter((f) => this.seleccionados().has(f.cita_id));
    const filas = seleccionadas.map((f) => [
      `${formatoFechaCorta(f.fecha)} ${formatoAmPm(f.hora_inicio)} - ${formatoAmPm(f.hora_fin)}`,
      f.paciente_nombre,
      f.diagnostico,
      f.medicamentos || '',
      f.doctor_nombre,
      f.sucursal_nombre,
    ]);
    exportarCsv(
      `reporte-diagnosticos_${this.desde()}_${this.hasta()}`,
      ['Fecha - Hora', 'Paciente', 'Diagnostico', 'Medicamento', 'Doctor', 'Sucursal'],
      filas
    );
  }
}
