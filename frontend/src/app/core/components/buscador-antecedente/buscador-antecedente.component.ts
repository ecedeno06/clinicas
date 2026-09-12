import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AntecedentePatologico } from '../../models/models';

export interface GrupoAntecedentes {
  categoria: string;
  items: AntecedentePatologico[];
}

// Selector de antecedente patologico con filtro de texto libre (busca por
// cualquier parte del nombre del antecedente o de su categoria, no solo
// desde el inicio como un <select> nativo) -- el catalogo puede tener
// decenas de opciones agrupadas en muchas categorias, dificiles de ubicar
// desplazandose a mano.
@Component({
  selector: 'app-buscador-antecedente',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './buscador-antecedente.component.html',
  styleUrl: './buscador-antecedente.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BuscadorAntecedenteComponent),
      multi: true,
    },
  ],
})
export class BuscadorAntecedenteComponent implements ControlValueAccessor {
  @Input() grupos: GrupoAntecedentes[] = [];

  texto = '';
  abierto = false;
  disabled = false;

  private valorId: string | null = null;
  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  get resultados(): GrupoAntecedentes[] {
    const q = this.texto.trim().toLowerCase();
    if (!q) return this.grupos;
    return this.grupos
      .map((g) => ({
        categoria: g.categoria,
        items: g.items.filter((i) => i.nombre.toLowerCase().includes(q) || g.categoria.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }

  writeValue(id: string | null): void {
    this.valorId = id;
    const encontrado = this.grupos.flatMap((g) => g.items).find((i) => i.id === id);
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
    // Si edita el texto despues de haber elegido algo, esa seleccion ya
    // no es valida hasta que elija de nuevo de la lista.
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
    // seleccionar() alcance a dispararse antes de que la lista desaparezca.
    setTimeout(() => (this.abierto = false), 150);
  }

  seleccionar(item: AntecedentePatologico): void {
    this.valorId = item.id;
    this.texto = item.nombre;
    this.abierto = false;
    this.onChange(item.id);
  }
}
