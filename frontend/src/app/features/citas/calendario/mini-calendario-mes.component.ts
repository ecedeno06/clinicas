import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { hoyISO } from '../../../core/utils/fecha.util';
import { DiaGrillaMes, generarGrillaMes } from './calendario.util';

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const NOMBRES_DIA_CORTO = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

@Component({
  selector: 'app-mini-calendario-mes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mini-calendario-mes.component.html',
  styleUrl: './mini-calendario-mes.component.css',
})
export class MiniCalendarioMesComponent implements OnChanges {
  @Input() fechaSeleccionada = hoyISO();
  @Output() fechaElegida = new EventEmitter<string>();

  readonly nombresDia = NOMBRES_DIA_CORTO;

  private anioVisible: number;
  private mesVisible: number; // 0-11

  constructor() {
    const [anio, mes] = this.fechaSeleccionada.split('-').map(Number);
    this.anioVisible = anio;
    this.mesVisible = mes - 1;
  }

  grilla = signal<DiaGrillaMes[]>([]);
  tituloMes = signal('');

  // Cada vez que el padre cambia la fecha (boton "Hoy", flechas de dia, o
  // el propio clic en este mini-calendario) el mes visible se realinea con
  // ella -- pero navegar de mes con mesAnterior()/mesSiguiente() sin elegir
  // un dia no dispara esto (fechaSeleccionada no cambia), asi que se puede
  // explorar otros meses sin mover todavia el calendario principal.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fechaSeleccionada']) {
      const [anio, mes] = this.fechaSeleccionada.split('-').map(Number);
      this.anioVisible = anio;
      this.mesVisible = mes - 1;
    }
    this.recalcular();
  }

  private recalcular(): void {
    this.grilla.set(generarGrillaMes(this.anioVisible, this.mesVisible));
    this.tituloMes.set(`${NOMBRES_MES[this.mesVisible]} ${this.anioVisible}`);
  }

  mesAnterior(): void {
    this.mesVisible -= 1;
    if (this.mesVisible < 0) { this.mesVisible = 11; this.anioVisible -= 1; }
    this.recalcular();
  }

  mesSiguiente(): void {
    this.mesVisible += 1;
    if (this.mesVisible > 11) { this.mesVisible = 0; this.anioVisible += 1; }
    this.recalcular();
  }

  esHoy(fecha: string): boolean {
    return fecha === hoyISO();
  }

  elegir(fecha: string): void {
    this.fechaElegida.emit(fecha);
  }

  diaDeMes(fecha: string): number {
    return Number(fecha.substring(8, 10));
  }
}
