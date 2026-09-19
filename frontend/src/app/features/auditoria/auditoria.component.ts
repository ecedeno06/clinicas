import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditoriaService } from '../../core/services/auditoria.service';
import { EmpresasService } from '../../core/services/empresas.service';
import { MotivoSalidaSesion, SesionAuditoria, UsuarioGlobal } from '../../core/models/models';
import { hoyISO, haceDiasISO } from '../../core/utils/fecha.util';
import { generarPdf, formatoFechaCorta } from '../../core/utils/pdf.util';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

// login_en/logout_en son timestamptz reales (no un "date" plano como
// fecha.util.ts): formatoFechaCorta() asume el string ya representa el
// dia local y NO debe usarse aca -- para un timestamptz hay que pasar
// por Date para que se convierta a la zona horaria del navegador
// (mismo criterio que el pipe `date` de Angular sin forzar :'UTC').
function fechaHoraLocal(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()} ${hora}:${min}`;
}

function soloFechaLocal(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

const ETIQUETAS_MOTIVO: Record<MotivoSalidaSesion, string> = {
  logout_usuario: 'Cierre de sesion',
  inactividad: 'Inactividad',
  reset_password: 'Reseteo de contrasena',
  cambio_email: 'Cambio de correo',
  recuperacion_2fa: 'Recuperacion 2FA',
  en_curso: 'En curso',
  expirada_sin_cerrar: 'Expirada (sin cerrar)',
};

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auditoria.component.html',
  styleUrl: './auditoria.component.css',
})
export class AuditoriaComponent implements OnInit {
  usuarios = signal<UsuarioGlobal[]>([]);
  sesiones = signal<SesionAuditoria[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  usuarioId = signal('');
  // Rango de 7 dias por defecto -- a diferencia de un reporte operativo
  // del dia (ej. reporte de citas), una auditoria de accesos casi siempre
  // se revisa hacia atras en el tiempo.
  desde = signal(haceDiasISO(7));
  hasta = signal(hoyISO());

  constructor(
    private srv: AuditoriaService,
    private empresasSrv: EmpresasService
  ) {}

  ngOnInit(): void {
    this.empresasSrv.usuariosGlobales().subscribe((data) => this.usuarios.set(data));
  }

  usuarioNombreFiltro(): string {
    if (!this.usuarioId()) return 'Todos los usuarios';
    return this.usuarios().find((u) => u.id === this.usuarioId())?.nombre ?? '';
  }

  motivoEtiqueta(motivo: MotivoSalidaSesion): string {
    return ETIQUETAS_MOTIVO[motivo] ?? motivo;
  }

  // "2h 15m" / "15m" / "< 1m" -- nunca segundos sueltos, no aporta nada
  // en una auditoria de sesiones que suelen durar minutos u horas.
  formatoDuracion(segundos: number | null): string {
    if (segundos === null || segundos === undefined) return '-';
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    if (horas > 0) return `${horas}h ${minutos}m`;
    if (minutos > 0) return `${minutos}m`;
    return '< 1m';
  }

  buscar(): void {
    this.cargando.set(true);
    const filtros: Record<string, string> = { desde: this.desde(), hasta: this.hasta() };
    if (this.usuarioId()) filtros['usuario_id'] = this.usuarioId();
    this.srv.listarSesiones(filtros).subscribe({
      next: (data) => { this.sesiones.set(data); this.cargando.set(false); this.buscado.set(true); },
      error: () => { this.sesiones.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  verPdf(): void {
    const filas = this.sesiones().map((s) => [
      soloFechaLocal(s.login_en),
      s.usuario_nombre,
      s.empresa_nombre || '-',
      fechaHoraLocal(s.login_en),
      fechaHoraLocal(s.logout_en),
      this.formatoDuracion(s.duracion_segundos),
      this.motivoEtiqueta(s.motivo_salida),
    ]);

    const subtitulo = [
      this.usuarioNombreFiltro(),
      `${formatoFechaCorta(this.desde())} - ${formatoFechaCorta(this.hasta())}`,
    ].filter(Boolean).join('  ·  ');

    // Este reporte es global (todas las clinicas), no pertenece a una
    // empresa puntual -- a diferencia de reporte-citas/reporte-campanas
    // no usa encabezadoClinica() con el logo de una clinica activa, sino
    // la marca de la plataforma (mismo "GC" + nombre del sidebar).
    const marcaGC: any = {
      table: {
        widths: [36],
        heights: [36],
        body: [[{ text: 'GC', color: '#ffffff', bold: true, fontSize: 14, alignment: 'center', margin: [0, 10, 0, 0], fillColor: '#0d9488' }]],
      },
      layout: 'noBorders',
    };

    const doc: TDocumentDefinitions = {
      pageOrientation: 'landscape',
      pageMargins: [30, 30, 30, 30],
      content: [
        {
          columns: [
            marcaGC,
            {
              stack: [
                { text: 'Gestor Clinico', bold: true, fontSize: 12 },
                { text: 'Auditoria de sesiones', fontSize: 16, bold: true, margin: [0, 2, 0, 0] },
              ],
              margin: [10, 0, 0, 0],
            },
          ],
          margin: [0, 0, 0, 12],
        },
        { text: subtitulo, color: '#64748b', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', '*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Fecha', 'Usuario', 'Clinica', 'Login', 'Logout', 'Tiempo en sesion', 'Motivo de salida'].map((t) => ({ text: t, bold: true })),
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
