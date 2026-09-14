import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cita, Disponibilidad, Doctor } from '../../../core/models/models';
import { formatoAmPm } from '../../../core/utils/hora12.util';
import {
  RangoMin,
  asignarColumnas,
  calcularEjeHoras,
  calcularRangosBloqueados,
  colorEstadoCita,
  estaDentroDeRangos,
  etiquetaHora,
  horasDelEje,
  iniciales,
  minutosAHora,
  minutosDesdeMedianoche,
  posicionBloque,
} from './calendario.util';

export interface CeldaVaciaClick {
  doctorId: string;
  hora_inicio: string;
  hora_fin: string;
}

// Alto de cada hora en la regla vertical -- a mas alto, mas legible cada
// bloque, pero mas scroll para ver el dia completo.
const PX_POR_HORA = 96;
const PX_POR_MINUTO = PX_POR_HORA / 60;
// Duracion por defecto cuando se hace clic en una celda vacia, redondeada a
// este mismo paso.
const PASO_SLOT_MIN = 30;
// Las etiquetas de hora quedan centradas sobre su linea (translateY(-50%)
// en el CSS) -- sin este margen, la de 12:00 a.m. de arriba y la de
// 12:00 a.m. (dia siguiente) de abajo quedarian cortadas a la mitad justo
// en el borde del panel, dando la falsa impresion de que el dia empieza a
// la 1:00 a.m.
const PADDING_VERTICAL = 10;

interface BloqueCita {
  cita: Cita;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  color: string;
}

interface BloqueSombreado {
  top: number;
  height: number;
}

@Component({
  selector: 'app-calendario-dia',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendario-dia.component.html',
  styleUrl: './calendario-dia.component.css',
})
export class CalendarioDiaComponent implements AfterViewInit {
  @Input() set citas(v: Cita[]) { this._citas.set(v ?? []); }
  get citas(): Cita[] { return this._citas(); }
  @Input() set doctores(v: Doctor[]) { this._doctores.set(v ?? []); }
  get doctores(): Doctor[] { return this._doctores(); }
  // Disponibilidad de cada doctor visible para el dia mostrado (una
  // llamada por doctor, ya hecha por CitasComponent) -- se usa para
  // sombrear las horas en que no atiende y para bloquear el clic en una
  // celda vacia fuera de su horario.
  @Input() set disponibilidadPorDoctor(v: Map<string, Disponibilidad>) { this._disponibilidad.set(v ?? new Map()); }
  get disponibilidadPorDoctor(): Map<string, Disponibilidad> { return this._disponibilidad(); }
  // Sucursal elegida en el sidebar de filtros ('' = todas) -- determina
  // cual horario de sucursal del doctor aplica cuando trabaja en varias.
  @Input() set sucursalFiltro(v: string) { this._sucursalFiltro.set(v ?? ''); }
  get sucursalFiltro(): string { return this._sucursalFiltro(); }

  @Output() citaClick = new EventEmitter<{ cita: Cita; origen: HTMLElement }>();
  @Output() celdaClick = new EventEmitter<CeldaVaciaClick>();

  @ViewChild('scrollContainer') private scrollContainerRef?: ElementRef<HTMLDivElement>;

  // Alto real disponible hasta el pie de pagina, medido con JS -- un
  // max-height fijo en CSS (ej. calc(100vh - 260px)) no puede acertarle al
  // espacio real porque .content es flex:1 y se estira segun el resto del
  // layout (sidebar, toolbar, etc.), dejando un hueco en blanco antes del
  // footer. null antes de medir: el CSS de respaldo se usa mientras tanto.
  alturaDisponible = signal<number | null>(null);

  private _citas = signal<Cita[]>([]);
  private _doctores = signal<Doctor[]>([]);
  private _disponibilidad = signal<Map<string, Disponibilidad>>(new Map());
  private _sucursalFiltro = signal('');

  readonly pxPorHora = PX_POR_HORA;
  formatoAmPm = formatoAmPm;
  iniciales = iniciales;

  eje = computed(() => calcularEjeHoras(this._citas()));
  marcasHora = computed(() => horasDelEje(this.eje()));
  etiquetaHora = etiquetaHora;

  alturaTotal = computed(() => (this.eje().finMin - this.eje().inicioMin) * PX_POR_MINUTO + PADDING_VERTICAL * 2);

  // Rangos (en minutos) en que cada doctor SI atiende, segun su horario
  // configurado y la sucursal filtrada -- null significa "sin restriccion"
  // (mismo criterio que sinDisponibilidad() en citas.component.ts: un
  // doctor que todavia no tiene ningun horario configurado sigue pudiendo
  // recibir citas libremente, en cualquier hora).
  private rangosLibresPorDoctor = computed(() => {
    const mapa = new Map<string, RangoMin[] | null>();
    const disponibilidad = this._disponibilidad();
    const sucursalFiltro = this._sucursalFiltro();
    for (const doctor of this._doctores()) {
      const disp = disponibilidad.get(doctor.id);
      if (!disp || !disp.tiene_horario_configurado) { mapa.set(doctor.id, null); continue; }
      const sucursales = sucursalFiltro ? disp.sucursales.filter((s) => s.sucursal_id === sucursalFiltro) : disp.sucursales;
      const libres = sucursales
        .filter((s) => s.atiende)
        .flatMap((s) => s.libres)
        .map((f) => ({ inicio: minutosDesdeMedianoche(f.hora_inicio), fin: minutosDesdeMedianoche(f.hora_fin) }));
      mapa.set(doctor.id, libres);
    }
    return mapa;
  });

  columnas = computed(() => {
    const eje = this.eje();
    const rangosLibres = this.rangosLibresPorDoctor();
    return this._doctores().map((doctor) => {
      const citasDoctor = this._citas().filter((c) => c.doctor_id === doctor.id);
      const columnasSolape = asignarColumnas(citasDoctor);
      const bloques: BloqueCita[] = citasDoctor.map((c) => {
        const { top, height  } = posicionBloque(c.hora_inicio, c.hora_fin, eje, PX_POR_MINUTO);
        const asignada = columnasSolape.get(c.id)!;
        const widthPct = 100 / asignada.totalCols;
        return { cita: c, top: top + PADDING_VERTICAL , height, leftPct: widthPct * asignada.col, widthPct, color: colorEstadoCita(c.estado) };
      });

      const libres = rangosLibres.get(doctor.id) ?? null;
      const sombreado: BloqueSombreado[] = libres === null ? [] : calcularRangosBloqueados(libres, eje.inicioMin, eje.finMin).map((r) => ({
        top: (r.inicio - eje.inicioMin) * PX_POR_MINUTO + PADDING_VERTICAL,
        height: (r.fin - r.inicio) * PX_POR_MINUTO,
      }));

      return { doctor, bloques, sombreado };
    });
  });

  topDeMarca(minutos: number): number {
    return (minutos - this.eje().inicioMin) * PX_POR_MINUTO + PADDING_VERTICAL;
  }

  onCitaClick(cita: Cita, event: MouseEvent): void {
    event.stopPropagation();
    this.citaClick.emit({ cita, origen: event.currentTarget as HTMLElement });
  }

  onCeldaVaciaClick(doctorId: string, event: MouseEvent): void {
    const col = event.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const offsetY = event.clientY - rect.top - PADDING_VERTICAL;
    const minutosClickeados = this.eje().inicioMin + offsetY / PX_POR_MINUTO;
    const inicioRedondeado = Math.round(minutosClickeados / PASO_SLOT_MIN) * PASO_SLOT_MIN;
    const fin = inicioRedondeado + PASO_SLOT_MIN;

    // No se ofrece crear una cita "rapida" haciendo clic fuera del horario
    // configurado del doctor -- sigue estando disponible el boton general
    // "+ Nuevo", donde se puede marcar Urgencia para saltarse esta regla,
    // igual que en el formulario completo (ver sinDisponibilidad()).
    const libres = this.rangosLibresPorDoctor().get(doctorId) ?? null;
    if (!estaDentroDeRangos(inicioRedondeado, libres)) {
      alert('Este doctor no atiende en este horario segun su horario configurado.');
      return;
    }

    this.celdaClick.emit({ doctorId, hora_inicio: minutosAHora(inicioRedondeado), hora_fin: minutosAHora(fin) });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.medirAlturaDisponible();
  }

  // El eje cubre las 24 horas -- sin esto, el dia siempre abriria mostrando
  // la medianoche en vez de la hora actual. setTimeout(0) espera a que el
  // navegador ya haya calculado el layout real (posicion del contenedor,
  // alto del grid), que en el primer ciclo de deteccion de cambios todavia
  // puede no estar disponible.
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.medirAlturaDisponible();
      this.scrollAHoraActual();
    });
  }

  // Mide cuanto espacio vertical real queda desde el contenedor hasta el
  // pie de pagina, en vez de adivinarlo con un calc(100vh - Npx) fijo en
  // CSS -- ese numero fijo no puede acertarle porque .content es flex:1 y
  // su alto real depende del resto del layout de esta pagina puntual.
  private medirAlturaDisponible(): void {
    const contenedor = this.scrollContainerRef?.nativeElement;
    if (!contenedor) return;
    const MARGEN_INFERIOR = 24;
    const top = contenedor.getBoundingClientRect().top;
    this.alturaDisponible.set(Math.max(300, window.innerHeight - top - MARGEN_INFERIOR));
  }

  private scrollAHoraActual(): void {
    const contenedor = this.scrollContainerRef?.nativeElement;
    if (!contenedor) return;
    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    contenedor.scrollTop = Math.max(0, (minutosAhora - this.eje().inicioMin) * PX_POR_MINUTO + PADDING_VERTICAL);
  }
}
