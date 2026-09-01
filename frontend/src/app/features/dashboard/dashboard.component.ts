import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PacientesService } from '../../core/services/pacientes.service';
import { DoctoresService } from '../../core/services/doctores.service';
import { CitasService } from '../../core/services/citas.service';
import { Cita, Doctor, Paciente } from '../../core/models/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  pacientes = signal<Paciente[]>([]);
  doctores = signal<Doctor[]>([]);
  citas = signal<Cita[]>([]);

  pacientesActivos = computed(() => this.pacientes().filter((p) => p.activo).length);
  doctoresActivos = computed(() => this.doctores().filter((d) => d.activo).length);
  citasHoy = computed(() => this.citas().filter((c) => c.fecha.substring(0, 10) === hoyISO()).length);
  citasPendientes = computed(() => this.citas().filter((c) => c.estado === 'pendiente' || c.estado === 'confirmada').length);

  agendaHoy = computed(() =>
    this.citas()
      .filter((c) => c.fecha.substring(0, 10) === hoyISO())
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
  );

  constructor(
    private pacientesSrv: PacientesService,
    private doctoresSrv: DoctoresService,
    private citasSrv: CitasService
  ) {}

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
  }
}

function hoyISO(): string {
  return new Date().toISOString().substring(0, 10);
}
