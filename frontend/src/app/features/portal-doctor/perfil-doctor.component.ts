import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DoctoresService } from '../../core/services/doctores.service';
import { AuthService } from '../../core/services/auth.service';
import { DoctorHorario, PerfilDoctor } from '../../core/models/models';
import { formatoAmPm } from '../../core/utils/hora12.util';

// Portal del doctor: sus propios datos, en que clinicas tiene rol
// 'doctor', y activar/desactivar sus propios bloques de horario en
// cualquiera de ellas -- el backend ya soporta gestionar el horario
// cross-clinica (ver puedeGestionarHorario en doctorHorarios.controller.js),
// esto solo lo expone en un portal de solo lectura para sus datos (mismo
// criterio que el portal del paciente: no edita su ficha aca).
@Component({
  selector: 'app-perfil-doctor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './perfil-doctor.component.html',
  styleUrl: './perfil-doctor.component.css',
})
export class PerfilDoctorComponent implements OnInit {
  perfil = signal<PerfilDoctor | null>(null);
  horarios = signal<DoctorHorario[]>([]);
  cargando = signal(true);
  error = signal<string | null>(null);
  actualizandoId = signal<string | null>(null);

  readonly diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  formatoAmPm = formatoAmPm;

  constructor(private srv: DoctoresService, public auth: AuthService) {}

  ngOnInit(): void {
    this.srv.miPerfil().subscribe({
      next: (p) => {
        this.perfil.set(p);
        this.srv.listarHorarios(p.doctor.id).subscribe({
          next: (h) => { this.horarios.set(h); this.cargando.set(false); },
          error: () => this.cargando.set(false),
        });
      },
      error: (err) => {
        this.error.set(err?.error?.mensaje || 'No se pudo cargar tu perfil de doctor');
        this.cargando.set(false);
      },
    });
  }

  horariosPorDia(dia: number): DoctorHorario[] {
    return this.horarios()
      .filter((h) => h.dia_semana === dia)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }

  // Solo para el color del bloque (verde = clinica activa de esta sesion,
  // ambar = otra donde tambien atiende) -- mismo criterio visual que ya
  // usa doctores.component.ts para un admin viendo el tablero.
  esDeClinicaActiva(h: DoctorHorario): boolean {
    return h.sucursal_empresa_id === this.auth.empresaActiva()?.empresa_id;
  }

  toggleActivo(h: DoctorHorario): void {
    this.actualizandoId.set(h.id);
    this.srv.actualizarHorario(h.id, { activo: !h.activo }).subscribe({
      next: (actualizado) => {
        this.actualizandoId.set(null);
        this.horarios.update((lista) => lista.map((x) => (x.id === h.id ? { ...x, ...actualizado } : x)));
      },
      error: (err) => {
        this.actualizandoId.set(null);
        alert(err?.error?.mensaje || 'No se pudo actualizar el bloque');
      },
    });
  }
}
