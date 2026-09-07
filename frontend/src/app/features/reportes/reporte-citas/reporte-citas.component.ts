import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CitasService } from '../../../core/services/citas.service';
import { SucursalesService } from '../../../core/services/sucursales.service';
import { AuthService } from '../../../core/services/auth.service';
import { Cita, EstadoCita, Sucursal } from '../../../core/models/models';
import { formatoAmPm } from '../../../core/utils/hora12.util';
import { hoyISO } from '../../../core/utils/fecha.util';
import { generarPdf, encabezadoClinica, formatoFechaCorta } from '../../../core/utils/pdf.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Component({
  selector: 'app-reporte-citas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-citas.component.html',
  styleUrl: './reporte-citas.component.css',
})
export class ReporteCitasComponent implements OnInit {
  sucursales = signal<Sucursal[]>([]);
  citas = signal<Cita[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  sucursalId = signal('');
  estado = signal('');
  desde = signal(hoyISO());
  hasta = signal(hoyISO());

  estados: EstadoCita[] = ['pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio', 'reagendar'];

  formatoAmPm = formatoAmPm;

  constructor(
    private citasSrv: CitasService,
    private sucursalesSrv: SucursalesService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
  }

  sucursalNombreFiltro(): string {
    if (!this.sucursalId()) return 'Todas las sucursales';
    return this.sucursales().find((s) => s.id === this.sucursalId())?.nombre ?? '';
  }

  estadoEtiqueta(estado: string): string {
    const etiquetas: Record<string, string> = {
      pendiente: 'Pendiente',
      confirmada: 'Confirmada',
      atendida: 'Atendida',
      cancelada: 'Cancelada',
      no_asistio: 'No asistió',
      reagendar: 'Reagendar',
    };
    return etiquetas[estado] ?? estado;
  }

  buscar(): void {
    this.cargando.set(true);
    const filtros: Record<string, string> = { desde: this.desde(), hasta: this.hasta() };
    if (this.sucursalId()) filtros['sucursal_id'] = this.sucursalId();
    if (this.estado()) filtros['estado'] = this.estado();
    this.citasSrv.listar(filtros).subscribe({
      next: (data) => {
        this.citas.set([...data].sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio)));
        this.cargando.set(false);
        this.buscado.set(true);
      },
      error: () => { this.citas.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  verPdf(): void {
    const empresa = this.auth.empresaActiva();
    const filas = this.citas().map((c) => [
      formatoFechaCorta(c.fecha),
      `${formatoAmPm(c.hora_inicio)} - ${formatoAmPm(c.hora_fin)}`,
      c.paciente_nombre,
      c.doctor_nombre,
      c.sucursal_nombre || '',
      c.campana_nombre || '',
      this.estadoEtiqueta(c.estado),
    ]);

    const subtitulo = [
      this.sucursalNombreFiltro(),
      `${formatoFechaCorta(this.desde())} - ${formatoFechaCorta(this.hasta())}`,
      this.estado() ? this.estadoEtiqueta(this.estado()) : null,
    ].filter(Boolean).join('  ·  ');

    const doc: TDocumentDefinitions = {
      pageOrientation: 'landscape',
      pageMargins: [30, 30, 30, 30],
      content: [
        ...(encabezadoClinica(empresa?.empresa_logo, empresa?.empresa_nombre, 'Reporte de citas') as any[]),
        { text: subtitulo, color: '#64748b', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', '*', 'auto', 'auto', 'auto'],
            body: [
              ['Fecha', 'Hora', 'Paciente', 'Doctor', 'Sucursal', 'Campaña', 'Estado'].map((t) => ({ text: t, bold: true })),
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
}
