import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DoctoresService } from '../../core/services/doctores.service';
import { SucursalesService } from '../../core/services/sucursales.service';
import { AuthService } from '../../core/services/auth.service';
import { DoctorHorario, PerfilDoctor, Sucursal } from '../../core/models/models';
import { combinar12, combinarHoraFin12, formatoAmPm, HORAS_12, MINUTOS_60, partes12 } from '../../core/utils/hora12.util';

// Portal del doctor: sus propios datos, en que clinicas tiene rol
// 'doctor', y gestionar sus propios bloques de horario en cualquiera de
// ellas -- el backend ya soporta gestionar el horario cross-clinica (ver
// puedeGestionarHorario en doctorHorarios.controller.js). Agregar un
// bloque nuevo si esta restringido a las sucursales de la clinica activa
// de la sesion (misma restriccion que tiene un admin al agregar desde
// doctores.component.ts) -- para agregar en otra clinica, el doctor
// cambia su clinica activa con el mismo selector que ya usa el resto del
// personal multi-clinica.
@Component({
  selector: 'app-perfil-doctor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './perfil-doctor.component.html',
  styleUrl: './perfil-doctor.component.css',
})
export class PerfilDoctorComponent implements OnInit {
  perfil = signal<PerfilDoctor | null>(null);
  horarios = signal<DoctorHorario[]>([]);
  sucursales = signal<Sucursal[]>([]);
  cargando = signal(true);
  error = signal<string | null>(null);
  actualizandoId = signal<string | null>(null);

  readonly diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  formatoAmPm = formatoAmPm;
  readonly horas12 = HORAS_12;
  readonly minutos60 = MINUTOS_60;

  horarioForm = this.fb.group({
    sucursal_id: ['', Validators.required],
    dia_semana: [1, Validators.required],
    hora_inicio: ['', Validators.required],
    hora_fin: ['', Validators.required],
  });

  constructor(private fb: FormBuilder, private srv: DoctoresService, private sucursalesSrv: SucursalesService, public auth: AuthService) {}

  ngOnInit(): void {
    this.sucursalesSrv.listar().subscribe((data) => this.sucursales.set(data.filter((s) => s.activo)));
    this.srv.miPerfil().subscribe({
      next: (p) => {
        this.perfil.set(p);
        this.horarioForm.patchValue({ sucursal_id: '' });
        this.cargarHorarios(p.doctor.id);
      },
      error: (err) => {
        this.error.set(err?.error?.mensaje || 'No se pudo cargar tu perfil de doctor');
        this.cargando.set(false);
      },
    });
  }

  cargarHorarios(doctorId: string): void {
    this.srv.listarHorarios(doctorId).subscribe({
      next: (h) => { this.horarios.set(h); this.cargando.set(false); },
      error: () => this.cargando.set(false),
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

  partesHoraHorario(campo: 'hora_inicio' | 'hora_fin'): { h: number | null; m: string | null; periodo: 'a.m.' | 'p.m.' | null } {
    const valor = this.horarioForm.get(campo)?.value;
    if (!valor) return { h: null, m: null, periodo: null };
    return partes12(valor);
  }

  actualizarHoraHorario12(campo: 'hora_inicio' | 'hora_fin', parte: 'h' | 'm' | 'periodo', valor: number | string): void {
    const actual = this.partesHoraHorario(campo);
    const h12 = parte === 'h' ? Number(valor) : actual.h ?? 12;
    const m = parte === 'm' ? String(valor) : actual.m ?? '00';
    const periodo = (parte === 'periodo' ? valor : actual.periodo ?? 'a.m.') as 'a.m.' | 'p.m.';
    const hora24 = campo === 'hora_fin' ? combinarHoraFin12(h12, m, periodo) : combinar12(h12, m, periodo);
    if (campo === 'hora_inicio') this.horarioForm.patchValue({ hora_inicio: hora24 });
    else this.horarioForm.patchValue({ hora_fin: hora24 });
  }

  agregarHorario(): void {
    if (this.horarioForm.invalid) return;
    const doctor = this.perfil()?.doctor;
    if (!doctor) return;
    const data = this.horarioForm.getRawValue();
    this.srv.crearHorario(doctor.id, {
      dia_semana: Number(data.dia_semana),
      hora_inicio: data.hora_inicio!,
      hora_fin: data.hora_fin!,
      sucursal_id: data.sucursal_id || undefined,
    }).subscribe({
      next: () => {
        this.horarioForm.patchValue({ hora_inicio: '', hora_fin: '' });
        this.cargarHorarios(doctor.id);
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo agregar el horario'),
    });
  }

  eliminarHorario(h: DoctorHorario): void {
    const doctor = this.perfil()?.doctor;
    if (!doctor) return;
    if (!confirm('Eliminar este bloque de horario?')) return;
    this.srv.eliminarHorario(h.id).subscribe({
      next: (res) => {
        this.cargarHorarios(doctor.id);
        if (res.citas_afectadas > 0) {
          alert(
            `Se elimino el bloque de horario. ${res.citas_afectadas} cita(s) quedaron sin disponibilidad y se marcaron como "Por reagendar".`
          );
        }
      },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el horario'),
    });
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
