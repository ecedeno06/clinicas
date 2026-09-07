import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampanasService } from '../../../core/services/campanas.service';
import { CitasService } from '../../../core/services/citas.service';
import { AuthService } from '../../../core/services/auth.service';
import { Campana, Cita } from '../../../core/models/models';
import { formatoAmPm } from '../../../core/utils/hora12.util';
import { generarPdf, encabezadoClinica, formatoFechaCorta } from '../../../core/utils/pdf.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Component({
  selector: 'app-reporte-campanas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-campanas.component.html',
  styleUrl: './reporte-campanas.component.css',
})
export class ReporteCampanasComponent implements OnInit {
  campanas = signal<Campana[]>([]);
  campanaId = signal('');
  citas = signal<Cita[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  formatoAmPm = formatoAmPm;

  constructor(private campanasSrv: CampanasService, private citasSrv: CitasService, public auth: AuthService) {}

  ngOnInit(): void {
    // Todas las campanas (no solo aprobada/en_curso) -- un reporte tambien
    // debe poder consultar campanas ya finalizadas.
    this.campanasSrv.listar().subscribe((data) => this.campanas.set(data));
  }

  campanaSeleccionada(): Campana | null {
    const id = this.campanaId();
    return id ? this.campanas().find((c) => c.id === id) ?? null : null;
  }

  onCampanaChange(id: string): void {
    this.campanaId.set(id);
    this.buscado.set(false);
    if (!id) { this.citas.set([]); return; }
    this.cargando.set(true);
    this.citasSrv.listar({ campana_id: id, estado: 'atendida' }).subscribe({
      next: (data) => { this.citas.set(data); this.cargando.set(false); this.buscado.set(true); },
      error: () => { this.citas.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  verPdf(): void {
    const camp = this.campanaSeleccionada();
    if (!camp) return;
    const empresa = this.auth.empresaActiva();

    const filas = this.citas().map((c) => [
      formatoFechaCorta(c.fecha),
      `${formatoAmPm(c.hora_inicio)} - ${formatoAmPm(c.hora_fin)}`,
      c.paciente_nombre,
      c.doctor_nombre,
    ]);

    const rango = camp.fecha_fin !== camp.fecha_inicio
      ? `${formatoFechaCorta(camp.fecha_inicio)} - ${formatoFechaCorta(camp.fecha_fin)}`
      : formatoFechaCorta(camp.fecha_inicio);

    const doc: TDocumentDefinitions = {
      pageMargins: [30, 30, 30, 30],
      content: [
        ...(encabezadoClinica(empresa?.empresa_logo, empresa?.empresa_nombre, 'Reporte de campaña') as any[]),
        { text: `${camp.nombre}  ·  ${camp.lugar}`, margin: [0, 0, 0, 2] },
        { text: rango, color: '#64748b', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', '*'],
            body: [
              ['Fecha', 'Hora', 'Paciente', 'Doctor'].map((t) => ({ text: t, bold: true })),
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
