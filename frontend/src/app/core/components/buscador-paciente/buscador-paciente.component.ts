import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Paciente } from '../../models/models';

// Buscador de paciente por nombre o cedula para el formulario de "Nueva
// cita" -- mismo patron que app-buscador-antecedente: filtra en cliente
// una lista ya cargada en memoria, sin llamar al backend en cada tecleo.
//
// A proposito NO busca en la red global de pacientes (solo entre los ya
// vinculados a esta clinica, pacientesConocidos): una busqueda global por
// nombre exponia la cedula/telefono de pacientes de otras clinicas y
// permitia vincularlos a la propia con un clic, sin ninguna relacion real
// con esa persona. Para traer a alguien que ya existe en la red pero
// todavia no en esta clinica, "+ Nuevo paciente" abre
// app-paciente-rapido-form, que reutiliza el patron ya existente y de bajo
// riesgo de Doctores/Pacientes: escribir su identificacion EXACTA
// (buscarPorIdentificacion) es lo que la reconoce y evita duplicarla.
@Component({
  selector: 'app-buscador-paciente',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './buscador-paciente.component.html',
  styleUrl: './buscador-paciente.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BuscadorPacienteComponent),
      multi: true,
    },
  ],
})
export class BuscadorPacienteComponent implements ControlValueAccessor {
  @Input() pacientesConocidos: Paciente[] = [];
  @Output() crearNuevo = new EventEmitter<string>();

  texto = '';
  abierto = false;
  disabled = false;

  private valorId: string | null = null;
  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  get resultados(): Paciente[] {
    const q = this.texto.trim().toLowerCase();
    if (!q) return this.pacientesConocidos;
    return this.pacientesConocidos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || (p.identificacion ?? '').toLowerCase().includes(q)
    );
  }

  writeValue(id: string | null): void {
    this.valorId = id;
    const encontrado = this.pacientesConocidos.find((p) => p.id === id);
    this.texto = encontrado ? encontrado.nombre : '';
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(valor: string): void {
    this.texto = valor;
    this.abierto = true;
    if (this.valorId) {
      this.valorId = null;
      this.onChange(null);
    }
  }

  onFocus(): void {
    this.abierto = true;
  }

  onBlur(): void {
    this.onTouched();
    // Se cierra con un pequeno retraso para que el (mousedown) de
    // seleccionar()/onCrearNuevo() alcance a dispararse antes de que la
    // lista desaparezca.
    setTimeout(() => (this.abierto = false), 150);
  }

  seleccionar(p: Paciente): void {
    this.valorId = p.id;
    this.texto = p.nombre;
    this.abierto = false;
    this.onChange(p.id);
  }

  onCrearNuevo(): void {
    this.abierto = false;
    this.crearNuevo.emit(this.texto.trim());
  }

  // El padre la llama por @ViewChild justo despues de crear un paciente
  // nuevo (ver citas.component.ts) -- writeValue() no alcanza a mostrar el
  // nombre en ese momento porque @Input pacientesConocidos recien se
  // actualiza en el PROXIMO ciclo de deteccion de cambios, no en el mismo
  // tick en que se llama form.patchValue().
  fijarSeleccion(id: string, nombre: string): void {
    this.valorId = id;
    this.texto = nombre;
    this.onChange(id);
  }
}
