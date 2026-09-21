import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import 'leaflet.heat';
import { ReportesService } from '../../../core/services/reportes.service';
import { ReporteMapaCalorFila } from '../../../core/models/models';
import { hoyISO } from '../../../core/utils/fecha.util';

// Mismo centro por defecto que mapa-selector.component.ts (Ciudad de
// Panama) para cuando ninguna sucursal tiene coordenadas todavia.
const CENTRO_POR_DEFECTO: [number, number] = [8.9824, -79.5199];

// Mapa de calor de diagnosticos por sucursal: agrega el volumen de
// diagnosticos registrados (mismo criterio que ReporteDiagnosticosComponent)
// por sucursal, y lo pinta como un resplandor de calor sobre sus
// coordenadas (leaflet.heat) -- ver reportes.controller.js#mapaCalorDiagnosticos.
// No mide "por tipo" de diagnostico (es texto libre, sin catalogo), solo
// volumen total, con un filtro de texto opcional.
@Component({
  selector: 'app-reporte-mapa-calor-diagnosticos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-mapa-calor-diagnosticos.component.html',
  styleUrl: './reporte-mapa-calor-diagnosticos.component.css',
})
export class ReporteMapaCalorDiagnosticosComponent {
  desde = signal(hoyISO());
  hasta = signal(hoyISO());
  filtroTexto = signal('');

  filas = signal<ReporteMapaCalorFila[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  sucursalesSinUbicacion = () => this.filas().filter((f) => f.latitud == null || f.longitud == null);
  totalDiagnosticos = () => this.filas().reduce((suma, f) => suma + f.cantidad, 0);

  @ViewChild('mapaContainer') mapaContainerRef?: ElementRef<HTMLDivElement>;
  private mapa: L.Map | null = null;
  private capaCalor: L.Layer | null = null;

  constructor(private reportesSrv: ReportesService) {}

  buscar(): void {
    this.cargando.set(true);
    const filtros: Record<string, string> = { desde: this.desde(), hasta: this.hasta() };
    if (this.filtroTexto().trim()) filtros['q'] = this.filtroTexto().trim();

    this.reportesSrv.mapaCalorDiagnosticos(filtros).subscribe({
      next: (data) => {
        this.filas.set(data);
        this.cargando.set(false);
        this.buscado.set(true);
        // El contenedor del mapa recien se renderiza con @if -- hay que
        // esperar al siguiente ciclo para que exista en el DOM.
        setTimeout(() => this.actualizarMapa(), 0);
      },
      error: () => { this.filas.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  private actualizarMapa(): void {
    if (!this.mapa) {
      if (!this.mapaContainerRef) return;
      const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      });
      this.mapa = L.map(this.mapaContainerRef.nativeElement, { layers: [calles] }).setView(CENTRO_POR_DEFECTO, 12);
    }
    // El contenedor puede no tener todavia su alto/ancho final resuelto
    // (recien se monto con @if) -- sin esto, Leaflet a veces calcula mal
    // el tamano del mapa y las capas que se agreguen despues no se ven.
    this.mapa.invalidateSize();

    if (this.capaCalor) {
      this.mapa.removeLayer(this.capaCalor);
      this.capaCalor = null;
    }

    // "numeric" en Postgres llega como string por el driver -- se fuerza a
    // numero real aca ademas de en el backend (::float8), por si alguna
    // fila vieja llega sin ese cast.
    const conCoordenadas = this.filas()
      .filter((f) => f.latitud != null && f.longitud != null)
      .map((f) => ({ ...f, latitud: Number(f.latitud), longitud: Number(f.longitud) }))
      .filter((f) => !Number.isNaN(f.latitud) && !Number.isNaN(f.longitud));
    if (conCoordenadas.length === 0) return;

    // fitBounds primero: si algo falla al pintar el resplandor, el mapa
    // igual queda centrado/con zoom correcto en vez de en el centro por
    // defecto de todo Panama.
    const bounds = L.latLngBounds(conCoordenadas.map((f) => [f.latitud, f.longitud]));
    this.mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });

    const maxCantidad = Math.max(...conCoordenadas.map((f) => f.cantidad));
    const puntos: [number, number, number][] = conCoordenadas.map((f) => [f.latitud, f.longitud, f.cantidad / maxCantidad]);
    this.capaCalor = L.heatLayer(puntos, { radius: 45, blur: 35, maxZoom: 17 }).addTo(this.mapa);
  }
}
