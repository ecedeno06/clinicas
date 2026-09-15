import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PacientesService } from '../../services/pacientes.service';
import { Paciente } from '../../models/models';
import { TelefonoInputComponent } from '../telefono-input/telefono-input.component';

// Creacion rapida de paciente desde dentro de otro flujo (hoy: "Nueva
// cita" cuando el buscador de paciente no encuentra a nadie entre los ya
// vinculados a esta clinica) -- solo los campos minimos para poder
// agendar (nombre, identificacion, telefono con codigo de pais, correo).
// Para cargar direcciones/familiares/antecedentes/foto sigue estando la
// pantalla completa de Pacientes; esto es deliberadamente chico para no
// frenar el agendado.
//
// Si la identificacion escrita ya existe en la red (en OTRA clinica), se
// avisa y se reutiliza esa persona en vez de crear un duplicado -- mismo
// patron ya usado en Doctores/Pacientes (onIdentificacionBlur): requiere
// que quien esta agendando conozca la identificacion EXACTA (ej. porque el
// paciente esta ahi mismo dandola), a diferencia de una busqueda abierta
// por nombre que expondria datos de pacientes de otras clinicas sin
// ninguna relacion real con ellos.
@Component({
  selector: 'app-paciente-rapido-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TelefonoInputComponent],
  templateUrl: './paciente-rapido-form.component.html',
  styleUrl: './paciente-rapido-form.component.css',
})
export class PacienteRapidoFormComponent implements OnChanges {
  @Input() nombreInicial = '';
  @Output() creado = new EventEmitter<Paciente>();
  @Output() cancelado = new EventEmitter<void>();

  guardando = signal(false);
  error = signal<string | null>(null);
  pacienteExistente = signal<Paciente | null>(null);

  private readonly camposIdentidad = ['nombre', 'telefono', 'email'];
  private tokenBusqueda = 0;

  form = this.fb.group({
    nombre: ['', Validators.required],
    identificacion: [''],
    telefono: [''],
    email: ['', Validators.email],
  });

  constructor(private fb: FormBuilder, private srv: PacientesService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['nombreInicial']) this.form.patchValue({ nombre: this.nombreInicial });
  }

  onIdentificacionBlur(): void {
    const identificacion = (this.form.get('identificacion')?.value || '').trim();
    if (!identificacion) {
      this.pacienteExistente.set(null);
      this.habilitarCamposIdentidad();
      return;
    }
    const token = ++this.tokenBusqueda;
    this.srv.buscarPorIdentificacion(identificacion).subscribe({
      next: (res) => {
        if (token !== this.tokenBusqueda) return;
        if (res.existe && res.paciente) {
          this.pacienteExistente.set(res.paciente);
          this.form.patchValue({
            nombre: res.paciente.nombre,
            telefono: res.paciente.telefono ?? '',
            email: res.paciente.email ?? '',
          });
          this.deshabilitarCamposIdentidad();
        } else {
          this.pacienteExistente.set(null);
          this.habilitarCamposIdentidad();
        }
      },
      error: () => {
        if (token !== this.tokenBusqueda) return;
        this.pacienteExistente.set(null);
        this.habilitarCamposIdentidad();
      },
    });
  }

  private deshabilitarCamposIdentidad(): void {
    this.camposIdentidad.forEach((c) => this.form.get(c)?.disable());
  }

  private habilitarCamposIdentidad(): void {
    this.camposIdentidad.forEach((c) => this.form.get(c)?.enable());
  }

  guardar(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);
    this.error.set(null);
    const { nombre, identificacion, telefono, email } = this.form.getRawValue();
    this.srv.crear({ nombre, identificacion: identificacion || undefined, telefono: telefono || undefined, email: email || undefined }).subscribe({
      next: (paciente) => {
        this.guardando.set(false);
        this.creado.emit(paciente);
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo crear el paciente');
      },
    });
  }
}
