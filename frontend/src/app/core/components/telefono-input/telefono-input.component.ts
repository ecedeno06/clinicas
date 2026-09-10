import { Component, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DIAL_DEFAULT, DIALS_ORDENADOS, PAISES_TELEFONO } from '../../utils/paises-telefono';

// Selector de pais + numero local, para que wa.me y tel: funcionen con
// pacientes/doctores/usuarios de cualquier pais (antes se guardaba solo el
// numero local, asumiendo siempre Panama). El valor expuesto/guardado es
// "codigo de pais + numero local" pegado, sin "+" ni espacios (formato que
// necesita wa.me) -- ver DIALS_ORDENADOS/paises-telefono.ts.
@Component({
  selector: 'app-telefono-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './telefono-input.component.html',
  styleUrl: './telefono-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TelefonoInputComponent),
      multi: true,
    },
  ],
})
export class TelefonoInputComponent implements ControlValueAccessor {
  paises = PAISES_TELEFONO;
  dial = DIAL_DEFAULT;
  numeroLocal = '';
  disabled = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const digitos = (value || '').replace(/\D/g, '');
    if (!digitos) {
      this.dial = DIAL_DEFAULT;
      this.numeroLocal = '';
      return;
    }
    const dialEncontrado = DIALS_ORDENADOS.find((d) => digitos.startsWith(d) && digitos.length > d.length);
    if (dialEncontrado) {
      this.dial = dialEncontrado;
      this.numeroLocal = digitos.slice(dialEncontrado.length);
    } else {
      // Numero de antes de este selector, guardado sin codigo de pais.
      this.dial = DIAL_DEFAULT;
      this.numeroLocal = digitos;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onDialChange(): void {
    this.emitir();
  }

  onNumeroInput(valor: string): void {
    this.numeroLocal = valor.replace(/\D/g, '');
    this.emitir();
  }

  private emitir(): void {
    this.onTouched();
    this.onChange(this.numeroLocal ? `${this.dial}${this.numeroLocal}` : '');
  }
}
