import { Component, ElementRef, EventEmitter, Output, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';

// Centro por defecto cuando no hay ninguna ubicacion previa: Ciudad de
// Panama (la mayoria de las clinicas de este sistema operan ahi hoy).
const CENTRO_POR_DEFECTO: [number, number] = [8.9824, -79.5199];

// Icono propio (pin relleno con el color de acento de la app) en vez del
// marcador azul por defecto de Leaflet -- se dibuja como SVG inline, no
// depende de ninguna imagen.
const ICONO_PIN = L.divIcon({
  className: 'mapa-selector-pin',
  html: `<svg width="34" height="34" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#0d9488" stroke="#0f172a" stroke-width="0.6"/>
    <circle cx="12" cy="10" r="3.3" fill="#ffffff"/>
  </svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32], // la punta del pin senala el punto exacto
});

interface ResultadoBusqueda {
  display_name: string;
  lat: number;
  lon: number;
}

export interface UbicacionSeleccionada {
  lat: number;
  lng: number;
  url: string;
}

// Intenta extraer lat/lng de un enlace de Google Maps ya guardado, para
// que al reabrir el selector el pin aparezca donde se dejo la vez anterior.
// Soporta el formato que este mismo componente genera (?q=lat,lng) y el
// formato comun de los enlaces "Compartir" de Google Maps (.../@lat,lng,zoom).
export function extraerLatLng(url: string | null | undefined): [number, number] | null {
  if (!url) return null;
  const patrones = [/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/, /@(-?\d+\.?\d*),(-?\d+\.?\d*)/];
  for (const patron of patrones) {
    const m = url.match(patron);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return [lat, lng];
    }
  }
  return null;
}

@Component({
  selector: 'app-mapa-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mapa-selector.component.html',
  styleUrl: './mapa-selector.component.css',
})
export class MapaSelectorComponent {
  @Output() ubicacionSeleccionada = new EventEmitter<UbicacionSeleccionada>();
  @ViewChild('mapaContainer') mapaContainer?: ElementRef<HTMLDivElement>;

  visible = signal(false);
  puntoElegido = signal<[number, number] | null>(null);

  busqueda = signal('');
  buscando = signal(false);
  resultadosBusqueda = signal<ResultadoBusqueda[]>([]);

  private mapa: L.Map | null = null;
  private marcador: L.Marker | null = null;
  private debounceBusqueda?: ReturnType<typeof setTimeout>;

  abrir(urlActual?: string | null): void {
    const inicial = extraerLatLng(urlActual) ?? null;
    this.puntoElegido.set(inicial);
    this.busqueda.set('');
    this.resultadosBusqueda.set([]);
    this.visible.set(true);
    // El contenedor del mapa recien se renderiza con @if -- hay que esperar
    // al siguiente ciclo para que exista en el DOM antes de inicializar Leaflet.
    setTimeout(() => this.inicializarMapa(inicial ?? CENTRO_POR_DEFECTO), 0);
  }

  private inicializarMapa(centro: [number, number]): void {
    if (!this.mapaContainer) return;

    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    // Esri World Imagery: capa satelital gratuita, sin API key (a diferencia
    // de la vista satelital de Google Maps, que si requiere una).
    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    });

    this.mapa = L.map(this.mapaContainer.nativeElement, { layers: [calles] }).setView(centro, 15);
    L.control.layers({ 'Calles': calles, 'Satelite': satelite }).addTo(this.mapa);

    if (this.puntoElegido()) {
      this.colocarMarcador(centro);
    }

    this.mapa.on('click', (e: L.LeafletMouseEvent) => {
      this.puntoElegido.set([e.latlng.lat, e.latlng.lng]);
      this.colocarMarcador([e.latlng.lat, e.latlng.lng]);
    });
  }

  private colocarMarcador(punto: [number, number]): void {
    if (!this.mapa) return;
    if (this.marcador) {
      this.marcador.setLatLng(punto);
    } else {
      this.marcador = L.marker(punto, { icon: ICONO_PIN }).addTo(this.mapa);
    }
  }

  // Buscador de direcciones via Nominatim (geocodificador gratuito de
  // OpenStreetMap, sin API key). Se usa fetch() nativo en vez de HttpClient
  // a proposito: el interceptor de la app le agrega el token Bearer y
  // desloguea en cualquier 401 de CUALQUIER peticion -- no queremos que eso
  // le llegue a un servicio externo.
  onBusquedaInput(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.debounceBusqueda);
    const q = valor.trim();
    if (q.length < 3) { this.resultadosBusqueda.set([]); return; }
    this.debounceBusqueda = setTimeout(() => this.buscarDireccion(q), 500);
  }

  buscarAhora(): void {
    clearTimeout(this.debounceBusqueda);
    const q = this.busqueda().trim();
    if (q.length >= 3) this.buscarDireccion(q);
  }

  private async buscarDireccion(query: string): Promise<void> {
    this.buscando.set(true);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
      const data: any[] = await resp.json();
      this.resultadosBusqueda.set(data.map((d) => ({ display_name: d.display_name, lat: Number(d.lat), lon: Number(d.lon) })));
    } catch {
      this.resultadosBusqueda.set([]);
    } finally {
      this.buscando.set(false);
    }
  }

  elegirResultado(r: ResultadoBusqueda): void {
    this.busqueda.set(r.display_name);
    this.resultadosBusqueda.set([]);
    this.puntoElegido.set([r.lat, r.lon]);
    this.mapa?.setView([r.lat, r.lon], 17);
    this.colocarMarcador([r.lat, r.lon]);
  }

  guardar(): void {
    const punto = this.puntoElegido();
    if (!punto) return;
    const [lat, lng] = punto;
    this.ubicacionSeleccionada.emit({
      lat, lng,
      url: `https://www.google.com/maps?q=${lat},${lng}`,
    });
    this.cerrar();
  }

  cerrar(): void {
    clearTimeout(this.debounceBusqueda);
    this.visible.set(false);
    this.mapa?.remove();
    this.mapa = null;
    this.marcador = null;
  }
}
