import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { ReportesService } from '../../../core/services/reportes.service';
import { ReporteMapaCalorFila } from '../../../core/models/models';
import { hoyISO, primerDiaDelMesISO } from '../../../core/utils/fecha.util';

// Mismo centro por defecto que mapa-selector.component.ts (Ciudad de
// Panama) para cuando ninguna sucursal tiene coordenadas todavia.
const CENTRO_POR_DEFECTO: [number, number] = [8.9824, -79.5199];

// Zoom fijo para cuando solo hay UNA sucursal con coordenadas: fitBounds
// sobre un bounds de un solo punto (area cero) es un caso ambiguo en
// Leaflet -- el zoom resultante depende del tamano del contenedor y
// puede terminar muy lejos o muy cerca, y leaflet.heat atenua la
// intensidad segun que tan lejos este el zoom actual de su propio
// "maxZoom" (options.maxZoom abajo), asi que un zoom inesperado puede
// dejar el resplandor practicamente invisible. Usar el mismo numero fijo
// para el zoom Y para options.maxZoom del heatLayer evita esa atenuacion
// por completo (queda en intensidad 1 siempre que el mapa este a este
// zoom exacto).
const ZOOM_UN_PUNTO = 15;

// leaflet.heat NO exporta nada -- es un script clasico que espera
// encontrar una variable global "L" y le agrega heatLayer/HeatLayer
// encima. Con "ng serve" (dev), "leaflet" se resuelve por su entrada
// CommonJS/UMD, que como efecto secundario deja "window.L" definido, asi
// que el parche cae sobre el mismo objeto que usa este componente. En el
// build de produccion (optimizado para tree-shaking), "leaflet" se
// resuelve por su entrada ESM, que NO deja ese global -- leaflet.heat
// termina parchando un "L" distinto (o ninguno), y L.heatLayer queda
// undefined aca ("L.heatLayer is not a function" solo en produccion).
// Por eso se fuerza "window.L" a este MISMO modulo antes de
// cargar el plugin (con import() dinamico, para que ocurra en ese orden
// exacto -- un import estatico normal se ejecutaria antes que cualquier
// otra linea de este archivo, sin importar donde se escriba).
let leafletHeatListo: Promise<void> | null = null;
function asegurarLeafletHeat(): Promise<void> {
  if (!leafletHeatListo) {
    (window as unknown as { L: typeof L }).L = L;
    leafletHeatListo = import('leaflet.heat').then(() => undefined);
  }
  return leafletHeatListo;
}

export type CriterioMapaCalor = 'diagnostico' | 'medicamento' | 'motivo';

// Mapa de calor por sucursal: agrega el volumen de diagnosticos,
// medicamentos, o motivos de consulta (segun "criterio") por sucursal, y
// lo pinta como un resplandor de calor sobre sus coordenadas
// (leaflet.heat) -- ver reportes.controller.js#mapaCalorDiagnosticos.
// Ninguno de los 3 tiene catalogo/CIE (son texto libre), asi que mide
// volumen total, con un filtro de texto opcional sobre el campo elegido.
@Component({
  selector: 'app-reporte-mapa-calor-diagnosticos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-mapa-calor-diagnosticos.component.html',
  styleUrl: './reporte-mapa-calor-diagnosticos.component.css',
})
export class ReporteMapaCalorDiagnosticosComponent {
  desde = signal(primerDiaDelMesISO());
  hasta = signal(hoyISO());
  criterio = signal<CriterioMapaCalor>('diagnostico');
  valorBusqueda = signal('');

  criterios: { valor: CriterioMapaCalor; etiqueta: string; etiquetaPlural: string }[] = [
    { valor: 'diagnostico', etiqueta: 'Diagnostico', etiquetaPlural: 'diagnosticos' },
    { valor: 'medicamento', etiqueta: 'Medicamento', etiquetaPlural: 'medicamentos' },
    { valor: 'motivo', etiqueta: 'Motivo de consulta', etiquetaPlural: 'motivos de consulta' },
  ];

  filas = signal<ReporteMapaCalorFila[]>([]);
  cargando = signal(false);
  buscado = signal(false);

  sucursalesSinUbicacion = () => this.filas().filter((f) => f.latitud == null || f.longitud == null);
  totalDiagnosticos = () => this.filas().reduce((suma, f) => suma + f.cantidad, 0);
  etiquetaCriterioActual = () => this.criterios.find((c) => c.valor === this.criterio())?.etiquetaPlural ?? 'diagnosticos';

  @ViewChild('mapaContainer') mapaContainerRef?: ElementRef<HTMLDivElement>;
  private mapa: L.Map | null = null;
  private capaCalor: L.Layer | null = null;
  private capaEtiquetas: L.LayerGroup | null = null;

  constructor(private reportesSrv: ReportesService) {}

  buscar(): void {
    this.cargando.set(true);
    const filtros: Record<string, string> = { desde: this.desde(), hasta: this.hasta(), criterio: this.criterio() };
    if (this.valorBusqueda().trim()) filtros['q'] = this.valorBusqueda().trim();

    this.reportesSrv.mapaCalorDiagnosticos(filtros).subscribe({
      next: (data) => {
        this.filas.set(data);
        this.cargando.set(false);
        this.buscado.set(true);
        // El contenedor del mapa recien se renderiza con @if -- hay que
        // esperar al siguiente ciclo para que exista en el DOM.
        setTimeout(() => { this.actualizarMapa().catch((err) => console.error('No se pudo pintar el mapa de calor', err)); }, 0);
      },
      error: () => { this.filas.set([]); this.cargando.set(false); this.buscado.set(true); },
    });
  }

  private async actualizarMapa(): Promise<void> {
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
    if (this.capaEtiquetas) {
      this.mapa.removeLayer(this.capaEtiquetas);
      this.capaEtiquetas = null;
    }

    // "numeric" en Postgres llega como string por el driver -- se fuerza a
    // numero real aca ademas de en el backend (::float8), por si alguna
    // fila vieja llega sin ese cast.
    const conCoordenadas = this.filas()
      .filter((f) => f.latitud != null && f.longitud != null)
      .map((f) => ({ ...f, latitud: Number(f.latitud), longitud: Number(f.longitud) }))
      .filter((f) => !Number.isNaN(f.latitud) && !Number.isNaN(f.longitud));
    if (conCoordenadas.length === 0) return;

    // Centrar/hacer zoom primero: si algo falla al pintar el resplandor,
    // el mapa igual queda bien ubicado en vez de en el centro por
    // defecto de todo Panama. Con una sola sucursal se usa setView a un
    // zoom fijo en vez de fitBounds (ver comentario de ZOOM_UN_PUNTO).
    if (conCoordenadas.length === 1) {
      this.mapa.setView([conCoordenadas[0].latitud, conCoordenadas[0].longitud], ZOOM_UN_PUNTO);
    } else {
      const bounds = L.latLngBounds(conCoordenadas.map((f) => [f.latitud, f.longitud]));
      this.mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: ZOOM_UN_PUNTO });
    }

    await asegurarLeafletHeat();
    if (!this.mapa) return; // por si el componente se destruyo mientras se cargaba el plugin

    const maxCantidad = Math.max(...conCoordenadas.map((f) => f.cantidad));
    const puntos: [number, number, number][] = conCoordenadas.map((f) => [f.latitud, f.longitud, f.cantidad / maxCantidad]);
    this.capaCalor = L.heatLayer(puntos, { radius: 45, blur: 35, maxZoom: ZOOM_UN_PUNTO, minOpacity: 0.4 }).addTo(this.mapa);

    // Etiqueta fija por sucursal (nombre + criterio elegido + cantidad):
    // el resplandor de calor no dice por si solo que se esta midiendo ni
    // cuanto es exactamente. Contenido armado como nodos de DOM (no HTML
    // en un string) para no interpretar el nombre de la sucursal como
    // marcado si algun dia trae caracteres como "<".
    const etiquetaCriterio = this.criterios.find((c) => c.valor === this.criterio())?.etiqueta ?? 'Diagnostico';
    const valorBuscado = this.valorBusqueda().trim();
    this.capaEtiquetas = L.layerGroup(
      conCoordenadas.map((f) => {
        const contenido = document.createElement('div');
        const nombre = document.createElement('strong');
        nombre.textContent = f.sucursal_nombre;
        contenido.appendChild(nombre);
        contenido.appendChild(document.createElement('br'));
        // Si hay un valor buscado (ej. "diabetes"), se muestra entre
        // comillas para dejar claro que la cantidad mide ESE valor
        // puntual del criterio, no el total general.
        const etiquetaTexto = valorBuscado ? `${etiquetaCriterio} "${valorBuscado}"` : etiquetaCriterio;
        contenido.appendChild(document.createTextNode(`${etiquetaTexto}: ${f.cantidad}`));
        return L.circleMarker([f.latitud, f.longitud], { radius: 4, color: '#1d4ed8', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.9 }).bindTooltip(contenido, {
          permanent: true,
          direction: 'top',
          offset: [0, -6],
          className: 'etiqueta-mapa-calor',
        });
      })
    ).addTo(this.mapa);
  }
}
