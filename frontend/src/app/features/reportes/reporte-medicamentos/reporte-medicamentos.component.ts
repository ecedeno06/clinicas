import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportesService } from '../../../core/services/reportes.service';
import { SucursalesService } from '../../../core/services/sucursales.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReporteMedicamentoFila, Sucursal } from '../../../core/models/models';
import { formatoAmPm } from '../../../core/utils/hora12.util';
import { hoyISO } from '../../../core/utils/fecha.util';
import { generarPdf, encabezadoClinica, formatoFechaCorta } from '../../../core/utils/pdf.util';
import { exportarCsv } from '../../../core/utils/csv.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

// Mismo comportamiento que ReporteDiagnosticosComponent, pero una fila
// por MEDICAMENTO (no por cita): una cita puede tener varias recetas, y
// cada receta varios medicamentos -- ver reportes.controller.js#medicamentos.
@Component({
  selector: 'app-reporte-medicamentos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-medicamentos.component.html',
  styleUrl: './reporte-medicamentos.component.css',
})
export class ReporteMedicamentosComponent implements OnInit {
  sucursales = signal<Sucursal[]>([]);
  filas = signal<ReporteMedicamentoFila[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  sucursalId = signal('');
  desde = signal(hoyISO());
  hasta = signal(hoyISO());

  filtroPaciente = signal('');
  filtroMedicamento = signal('');
  filtroDosis = signal('');
  filtroDoctor = signal('');
  filtroSucursal = signal('');

  hayFiltrosColumna = computed(() => !!(
    this.filtroPaciente() || this.filtroMedicamento() || this.filtroDosis() ||
    this.filtroDoctor() || this.filtroSucursal()
  ));

  limpiarFiltrosColumna(): void {
    this.filtroPaciente.set('');
    this.filtroMedicamento.set('');
    this.filtroDosis.set('');
    this.filtroDoctor.set('');
    this.filtroSucursal.set('');
  }

  filasFiltradas = computed(() => {
    const paciente = this.filtroPaciente().trim().toLowerCase();
    const medicamento = this.filtroMedicamento().trim().toLowerCase();
    const dosis = this.filtroDosis().trim().toLowerCase();
    const doctor = this.filtroDoctor().trim().toLowerCase();
    const sucursal = this.filtroSucursal().trim().toLowerCase();

    return this.filas().filter((f) => {
      if (paciente && !f.paciente_nombre.toLowerCase().includes(paciente)) return false;
      if (medicamento && !f.medicamento.toLowerCase().includes(medicamento)) return false;
      if (dosis && !(f.dosis ?? '').toLowerCase().includes(dosis)) return false;
      if (doctor && !f.doctor_nombre.toLowerCase().includes(doctor)) return false;
      if (sucursal && !f.sucursal_nombre.toLowerCase().includes(sucursal)) return false;
      return true;
    });
  });

  formatoAmPm = formatoAmPm;

  seleccionados = signal<Set<string>>(new Set());
  haySeleccion = computed(() => this.seleccionados().size > 0);
  todosVisiblesSeleccionados = computed(() => {
    const visibles = this.filasFiltradas();
    return visibles.length > 0 && visibles.every((f) => this.seleccionados().has(f.medicamento_id));
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
    this.reportesSrv.medicamentos(filtros).subscribe({
      next: (data) => { this.filas.set(data); this.cargando.set(false); this.buscado.set(true); },
      error: () => { this.filas.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  toggleSeleccion(medicamentoId: string): void {
    const nuevo = new Set(this.seleccionados());
    if (nuevo.has(medicamentoId)) nuevo.delete(medicamentoId); else nuevo.add(medicamentoId);
    this.seleccionados.set(nuevo);
  }

  toggleSeleccionarTodosVisibles(): void {
    const visibles = this.filasFiltradas();
    const nuevo = new Set(this.seleccionados());
    if (this.todosVisiblesSeleccionados()) {
      visibles.forEach((f) => nuevo.delete(f.medicamento_id));
    } else {
      visibles.forEach((f) => nuevo.add(f.medicamento_id));
    }
    this.seleccionados.set(nuevo);
  }

  imprimir(): void {
    const empresa = this.auth.empresaActiva();
    const seleccionadas = this.filas().filter((f) => this.seleccionados().has(f.medicamento_id));
    const filas = seleccionadas.map((f) => [
      `${formatoFechaCorta(f.fecha)}\n${formatoAmPm(f.hora_inicio)} - ${formatoAmPm(f.hora_fin)}`,
      f.paciente_nombre,
      f.medicamento,
      f.dosis || '-',
      f.frecuencia || '-',
      f.doctor_nombre,
      f.sucursal_nombre,
    ]);

    const doc: TDocumentDefinitions = {
      pageOrientation: 'landscape',
      pageMargins: [30, 30, 30, 30],
      content: [
        ...(encabezadoClinica(empresa?.empresa_logo, empresa?.empresa_nombre, 'Reporte de medicamentos') as any[]),
        {
          text: `${formatoFechaCorta(this.desde())} - ${formatoFechaCorta(this.hasta())}`,
          color: '#64748b',
          margin: [0, 0, 0, 10],
        },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', '*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Fecha - Hora', 'Paciente', 'Medicamento', 'Dosis', 'Frecuencia', 'Doctor', 'Sucursal'].map((t) => ({ text: t, bold: true })),
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

  exportarCsv(): void {
    const seleccionadas = this.filas().filter((f) => this.seleccionados().has(f.medicamento_id));
    const filas = seleccionadas.map((f) => [
      `${formatoFechaCorta(f.fecha)} ${formatoAmPm(f.hora_inicio)} - ${formatoAmPm(f.hora_fin)}`,
      f.paciente_nombre,
      f.medicamento,
      f.dosis || '',
      f.frecuencia || '',
      f.duracion || '',
      f.doctor_nombre,
      f.sucursal_nombre,
    ]);
    exportarCsv(
      `reporte-medicamentos_${this.desde()}_${this.hasta()}`,
      ['Fecha - Hora', 'Paciente', 'Medicamento', 'Dosis', 'Frecuencia', 'Duracion', 'Doctor', 'Sucursal'],
      filas
    );
  }
}
