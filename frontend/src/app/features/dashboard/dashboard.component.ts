import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { CitasService } from '../../core/services/citas.service';
import { AuthService } from '../../core/services/auth.service';
import { Cita, Doctor, LaboratorioPendiente, Paciente } from '../../core/models/models';

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
  laboratoriosPendientes = signal<LaboratorioPendiente[]>([]);
  mostrarPendientesLaboratorio = signal(false);

  // Fecha que se esta consultando en "Agenda del dia" (por defecto, hoy).
  fechaAgenda = signal<string>(hoyISO());

  pacientesActivos = computed(() => this.pacientes().filter((p) => p.activo).length);
  doctoresActivos = computed(() => this.doctores().filter((d) => d.activo).length);
  citasHoy = computed(() => this.citas().filter((c) => c.fecha.substring(0, 10) === hoyISO()).length);
  citasPendientes = computed(() => this.citas().filter((c) => c.estado === 'pendiente' || c.estado === 'confirmada').length);

  esHoy = computed(() => this.fechaAgenda() === hoyISO());

  agendaDelDia = computed(() =>
    this.citas()
      .filter((c) => c.fecha.substring(0, 10) === this.fechaAgenda())
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
  );

  irAHoy(): void { this.fechaAgenda.set(hoyISO()); }

  constructor(
    private pacientesSrv: PacientesService,
    private doctoresSrv: DoctoresService,
    private citasSrv: CitasService,
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

function hoyISO(): string {
  return new Date().toISOString().substring(0, 10);
}
