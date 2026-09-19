import { Component, OnInit, computed, signal } from '@angular/core';
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
  cerrada_por_admin: 'Cerrada por administrador',
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

  // "Matar sesion" solo tiene sentido para una sesion realmente EN CURSO
  // (token todavia valido) -- una ya cerrada o expirada no se puede ni
  // hace falta forzar, por eso solo esas filas muestran checkbox.
  seleccionadas = signal<Set<string>>(new Set());
  cerrandoSesiones = signal(false);

  // Filtro por columna sobre lo ya cargado (mismo patron que
  // pacientes.component.ts/citas.component.ts) -- distinto del buscador
  // de arriba (usuarioId/desde/hasta), que va contra el backend.
  filtroFecha = signal('');
  filtroUsuario = signal('');
  filtroClinica = signal('');
  filtroLogin = signal('');
  filtroLogout = signal('');
  filtroTiempo = signal('');
  filtroMotivo = signal('');

  hayFiltrosColumna = computed(() => !!(
    this.filtroFecha() || this.filtroUsuario() || this.filtroClinica() ||
    this.filtroLogin() || this.filtroLogout() || this.filtroTiempo() || this.filtroMotivo()
  ));

  limpiarFiltrosColumna(): void {
    this.filtroFecha.set('');
    this.filtroUsuario.set('');
    this.filtroClinica.set('');
    this.filtroLogin.set('');
    this.filtroLogout.set('');
    this.filtroTiempo.set('');
    this.filtroMotivo.set('');
  }

  sesionesFiltradas = computed(() => {
    const fecha = this.filtroFecha().trim().toLowerCase();
    const usuario = this.filtroUsuario().trim().toLowerCase();
    const clinica = this.filtroClinica().trim().toLowerCase();
    const login = this.filtroLogin().trim().toLowerCase();
    const logout = this.filtroLogout().trim().toLowerCase();
    const tiempo = this.filtroTiempo().trim().toLowerCase();
    const motivo = this.filtroMotivo().trim().toLowerCase();

    return this.sesiones().filter((s) => {
      if (fecha && !soloFechaLocal(s.login_en).includes(fecha)) return false;
      if (usuario && !`${s.usuario_nombre} ${s.usuario_email}`.toLowerCase().includes(usuario)) return false;
      if (clinica && !`${s.empresa_nombre || ''} ${s.sucursal_nombre || ''}`.toLowerCase().includes(clinica)) return false;
      if (login && !fechaHoraLocal(s.login_en).toLowerCase().includes(login)) return false;
      if (logout && !fechaHoraLocal(s.logout_en).toLowerCase().includes(logout)) return false;
      if (tiempo && !this.formatoDuracion(s.duracion_segundos).toLowerCase().includes(tiempo)) return false;
      if (motivo && !this.motivoEtiqueta(s.motivo_salida).toLowerCase().includes(motivo)) return false;
      return true;
    });
  });

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
    this.seleccionadas.set(new Set());
    this.limpiarFiltrosColumna();
    const filtros: Record<string, string> = { desde: this.desde(), hasta: this.hasta() };
    if (this.usuarioId()) filtros['usuario_id'] = this.usuarioId();
    this.srv.listarSesiones(filtros).subscribe({
      next: (data) => { this.sesiones.set(data); this.cargando.set(false); this.buscado.set(true); },
      error: () => { this.sesiones.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  esSeleccionable(s: SesionAuditoria): boolean {
    return s.motivo_salida === 'en_curso';
  }

  // Sobre lo FILTRADO -- "seleccionar todas" no debe marcar filas que el
  // filtro de columna dejo ocultas.
  sesionesSeleccionables(): SesionAuditoria[] {
    return this.sesionesFiltradas().filter((s) => this.esSeleccionable(s));
  }

  todasSeleccionadas(): boolean {
    const seleccionables = this.sesionesSeleccionables();
    return seleccionables.length > 0 && seleccionables.every((s) => this.seleccionadas().has(s.id));
  }

  toggleSeleccion(id: string): void {
    const actuales = new Set(this.seleccionadas());
    if (actuales.has(id)) actuales.delete(id); else actuales.add(id);
    this.seleccionadas.set(actuales);
  }

  toggleTodas(): void {
    if (this.todasSeleccionadas()) {
      this.seleccionadas.set(new Set());
    } else {
      this.seleccionadas.set(new Set(this.sesionesSeleccionables().map((s) => s.id)));
    }
  }

  cerrarSeleccionadas(): void {
    const ids = [...this.seleccionadas()];
    if (!ids.length) return;
    if (!confirm(`Se cerrara${ids.length > 1 ? 'n' : ''} ${ids.length} sesion${ids.length > 1 ? 'es' : ''} de inmediato. La persona debera iniciar sesion de nuevo. Continuar?`)) return;
    this.ejecutarCierre(ids);
  }

  // Boton de accion individual por fila -- atajo para no tener que marcar
  // el checkbox de una sola sesion antes de terminarla.
  cerrarSesionUnica(s: SesionAuditoria): void {
    if (!confirm(`Se cerrara de inmediato la sesion de "${s.usuario_nombre}". Debera iniciar sesion de nuevo. Continuar?`)) return;
    this.ejecutarCierre([s.id]);
  }

  private ejecutarCierre(ids: string[]): void {
    this.cerrandoSesiones.set(true);
    this.srv.cerrarSesiones(ids).subscribe({
      next: () => { this.cerrandoSesiones.set(false); this.buscar(); },
      error: (err) => {
        this.cerrandoSesiones.set(false);
        alert(err?.error?.mensaje || 'No se pudieron cerrar las sesiones');
      },
    });
  }

  verPdf(): void {
    const filas = this.sesionesFiltradas().map((s) => [
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
