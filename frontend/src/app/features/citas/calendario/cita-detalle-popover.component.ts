import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita, EstadoCita } from '../../../core/models/models';
import { formatoAmPm } from '../../../core/utils/hora12.util';
import { colorEstadoCita } from './calendario.util';

const ANCHO_POPOVER = 320;
const ALTO_APROX_POPOVER = 460;

// Tarjeta flotante con el detalle de una cita: se abre anclada al bloque
// clickeado en el calendario de dia (ver calendario-dia.component). Es
// deliberadamente "tonta" -- no llama servicios ni conoce reglas de
// permisos: todo lo que muestra/permite le llega por @Input y cada accion
// se delega hacia arriba por @Output para que CitasComponent reutilice
// exactamente los mismos metodos que ya usa la tabla (whatsappUrl,
// abrirHistoria, eliminar, etc.).
@Component({
  selector: 'app-cita-detalle-popover',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cita-detalle-popover.component.html',
  styleUrl: './cita-detalle-popover.component.css',
})
export class CitaDetallePopoverComponent {
  @Input() cita: Cita | null = null;
  @Input() origen: HTMLElement | null = null;

  @Input() puedeEditar = false;
  @Input() puedeEliminar = false;
  @Input() puedeVerHistoria = false;
  @Input() puedeRegistrarSignos = false;
  @Input() whatsappHref: string | null = null;

  @Output() cerrar = new EventEmitter<void>();
  @Output() cambiarEstado = new EventEmitter<EstadoCita>();
  @Output() editar = new EventEmitter<Cita>();
  @Output() eliminar = new EventEmitter<Cita>();
  @Output() abrirHistoria = new EventEmitter<Cita>();
  @Output() abrirSignos = new EventEmitter<Cita>();
  @Output() abrirRecetas = new EventEmitter<Cita>();
  @Output() abrirLaboratorio = new EventEmitter<Cita>();

  readonly estados: EstadoCita[] = ['pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio', 'reagendar'];
  formatoAmPm = formatoAmPm;
  colorEstadoCita = colorEstadoCita;

  // Recalculado en cada render (no vale la pena un signal/computed para
  // esto): ancla a la derecha del bloque, cae a la izquierda si no entra,
  // y se recorta siempre dentro del viewport.
  posicion(): { top: string; left: string } {
    if (!this.origen) return { top: '80px', left: '80px' };
    const rect = this.origen.getBoundingClientRect();
    let left = rect.right + 8;
    if (left + ANCHO_POPOVER > window.innerWidth) left = rect.left - ANCHO_POPOVER - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - ANCHO_POPOVER - 8));
    let top = rect.top;
    top = Math.max(8, Math.min(top, window.innerHeight - ALTO_APROX_POPOVER - 8));
    return { top: `${top}px`, left: `${left}px` };
  }
}
