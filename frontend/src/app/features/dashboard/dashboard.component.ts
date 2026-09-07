import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { CitasService } from '../../core/services/citas.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { AuthService } from '../../core/services/auth.service';
import { Cita, Doctor, LaboratorioPendiente, Paciente, Sucursal } from '../../core/models/models';
import { formatoAmPm } from '../../core/utils/hora12.util';
import { hoyISO } from '../../core/utils/fecha.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  pacientes = signal<Paciente[]>([]);
  doctores = signal<Doctor[]>([]);
  citas = signal<Cita[]>([]);
  sucursales = signal<Sucursal[]>([]);
  laboratoriosPendientes = signal<LaboratorioPendiente[]>([]);
  mostrarPendientesLaboratorio = signal(false);

  // Fecha que se esta consultando en "Agenda del dia" (por defecto, hoy).
  fechaAgenda = signal<string>(hoyISO());

  // Filtro de sucursal para todo el tablero -- '' = "Todas" (vista agregada
  // por defecto, ver DISENO-ZONA-HORARIA-SUCURSALES.md seccion 4.3).
  sucursalFiltro = signal<string>('');

  citasFiltradas = computed(() => {
    const sucursalId = this.sucursalFiltro();
    if (!sucursalId) return this.citas();
    return this.citas().filter((c) => c.sucursal_id === sucursalId);
  });

  pacientesActivos = computed(() => this.pacientes().filter((p) => p.activo).length);
  doctoresActivos = computed(() => this.doctores().filter((d) => d.activo).length);
  citasHoy = computed(() => this.citasFiltradas().filter((c) => c.fecha.substring(0, 10) === hoyISO()).length);
  citasPendientes = computed(() => this.citasFiltradas().filter((c) => c.estado === 'pendiente' || c.estado === 'confirmada').length);
  citasPorReagendar = computed(() => this.citasFiltradas().filter((c) => c.estado === 'reagendar').length);

  esHoy = computed(() => this.fechaAgenda() === hoyISO());

  agendaDelDia = computed(() =>
    this.citasFiltradas()
      .filter((c) => c.fecha.substring(0, 10) === this.fechaAgenda())
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
  );

  // El selector de sucursal solo aporta algo si la clinica tiene mas de una.
  mostrarFiltroSucursal = computed(() => this.sucursales().length > 1);

  // Nombre de la sucursal activa en el filtro del tablero, para propagarlo
  // como filtro de texto al navegar a Citas (que filtra por nombre, no id).
  sucursalNombreFiltro = computed(() => this.sucursales().find((s) => s.id === this.sucursalFiltro())?.nombre ?? '');

  irAHoy(): void { this.fechaAgenda.set(hoyISO()); }

  formatoAmPm = formatoAmPm;

  constructor(
    private pacientesSrv: PacientesService,
    private doctoresSrv: DoctoresService,
    private citasSrv: CitasService,
    private sucursalesSrv: SucursalesService,
    public auth: AuthService
  ) {}

  puedeVerLaboratorio(): boolean {
    const rol = this.auth.usuario()?.rol;
    return this.auth.esSuperAdmin() || rol === 'admin' || rol === 'doctor';
  }

  ngOnInit(): void {
    forkJoin({
      pacientes: this.pacientesSrv.listar(),
      doctores: this.doctoresSrv.listar(),
      citas: this.citasSrv.listar(),
    }).subscribe(({ pacientes, doctores, citas }) => {
      this.pacientes.set(pacientes);
      this.doctores.set(doctores);
      this.citas.set(citas);
    });

    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));

    if (this.puedeVerLaboratorio()) {
      this.citasSrv.listarLaboratorioPendientes().subscribe((data) => this.laboratoriosPendientes.set(data));
    }
  }

  // Formato dd/mm/aaaa, igual al que espera el filtro de fecha de Citas.
  fechaParaFiltro(iso: string): string {
    const [anio, mes, dia] = iso.substring(0, 10).split('-');
    return `${dia}/${mes}/${anio}`;
  }
}
