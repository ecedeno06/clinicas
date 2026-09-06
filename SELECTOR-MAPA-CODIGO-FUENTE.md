# Selector de ubicación en el mapa — Código fuente

Componente `app-mapa-selector`: popup con un mapa interactivo (Leaflet +
OpenStreetMap, sin API key) para elegir el punto exacto de una sucursal,
con buscador de direcciones (Nominatim) y alternancia entre vista de calles
y vista satelital (Esri World Imagery). Al guardar, genera un enlace de
Google Maps (`https://www.google.com/maps?q=lat,lng`) y lo entrega al
componente que lo use.

Integrado hoy en `SucursalesComponent` (campo "Enlace de Google Maps"),
pero está escrito como un componente standalone reusable — cualquier otra
pantalla puede importarlo igual.

## Dependencias

```bash
npm install leaflet
npm install --save-dev @types/leaflet
```

`angular.json` — se agregó el CSS de Leaflet y se copian sus imágenes de
marcador (aunque el ícono visible ya no las usa, ver más abajo):

```json
"assets": [
  "src/favicon.ico",
  "src/assets",
  { "glob": "**/*", "input": "node_modules/leaflet/dist/images", "output": "leaflet-images" }
],
"styles": ["node_modules/leaflet/dist/leaflet.css", "src/styles.css"],
```

---

## `core/components/mapa-selector/mapa-selector.component.ts`

```typescript
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
```

---

## `core/components/mapa-selector/mapa-selector.component.html`

```html
@if (visible()) {
  <div class="mapa-selector-overlay">
    <div class="mapa-selector-modal">
      <div class="drawer-header">
        <h2>Elegir ubicacion en el mapa</h2>
        <button class="close" (click)="cerrar()">&times;</button>
      </div>

      <div class="mapa-selector-buscador">
        <input
          class="input"
          type="text"
          placeholder="Buscar direccion o lugar..."
          [ngModel]="busqueda()"
          (ngModelChange)="onBusquedaInput($event)"
          (keydown.enter)="buscarAhora(); $event.preventDefault()"
        />
        @if (buscando()) {
          <div class="mapa-selector-resultados"><div class="text-muted text-sm" style="padding:8px 10px;">Buscando...</div></div>
        } @else if (resultadosBusqueda().length > 0) {
          <div class="mapa-selector-resultados">
            @for (r of resultadosBusqueda(); track r.display_name) {
              <button type="button" class="mapa-selector-resultado" (click)="elegirResultado(r)">{{ r.display_name }}</button>
            }
          </div>
        }
      </div>

      <p class="text-muted text-sm mt-8">O haz clic directamente en el mapa para colocar el punto.</p>

      <div #mapaContainer class="mapa-selector-mapa"></div>

      @if (puntoElegido(); as p) {
        <p class="text-muted text-sm mt-8">Punto elegido: {{ p[0].toFixed(6) }}, {{ p[1].toFixed(6) }}</p>
      } @else {
        <p class="text-muted text-sm mt-8">Todavia no has elegido un punto.</p>
      }

      <div class="form-actions">
        <button type="button" class="btn btn-primary" [disabled]="!puntoElegido()" (click)="guardar()">Guardar ubicacion</button>
        <button type="button" class="btn btn-outline" (click)="cerrar()">Cancelar</button>
      </div>
    </div>
  </div>
}
```

---

## `core/components/mapa-selector/mapa-selector.component.css`

```css
.mapa-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}

.mapa-selector-modal {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  padding: 22px;
  width: 640px;
  max-width: 92vw;
}

.mapa-selector-buscador {
  position: relative;
  margin-top: 8px;
}

.mapa-selector-resultados {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--white);
  border: 1px solid var(--slate-200);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  max-height: 220px;
  overflow-y: auto;
  z-index: 70;
}

.mapa-selector-resultado {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--slate-700);
  border-bottom: 1px solid var(--slate-100);
}
.mapa-selector-resultado:last-child { border-bottom: none; }
.mapa-selector-resultado:hover { background: var(--slate-50); }

.mapa-selector-mapa {
  width: 100%;
  height: 360px;
  border-radius: 8px;
  margin-top: 8px;
}

/* Sombra suave debajo del pin. Leaflet inserta el marcador fuera del arbol
   de Angular (fuera de la encapsulacion de vista normal) -- ::ng-deep es
   necesario para que este selector le llegue. */
::ng-deep .mapa-selector-pin {
  filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.35));
}
```

---

## Integración en `features/sucursales/sucursales.component.ts`

Piezas relevantes (el resto del componente es el CRUD normal de Sucursales):

```typescript
import { MapaSelectorComponent, UbicacionSeleccionada } from '../../core/components/mapa-selector/mapa-selector.component';

@Component({
  // ...
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MapaSelectorComponent],
  // ...
})
export class SucursalesComponent implements OnInit {
  // ...

  form = this.fb.group({
    nombre: ['', Validators.required],
    direccion: [''],
    telefono: [''],
    google_maps_url: [''],
    zona_horaria: ['America/Panama', Validators.required],
    hora_apertura: [''],
    hora_cierre: [''],
    activo: [true],
  });

  @ViewChild(MapaSelectorComponent) mapaSelector?: MapaSelectorComponent;

  abrirMapa(): void {
    this.mapaSelector?.abrir(this.form.get('google_maps_url')?.value);
  }

  onUbicacionElegida(u: UbicacionSeleccionada): void {
    this.form.patchValue({ google_maps_url: u.url });
  }

  // ...
}
```

## Integración en `features/sucursales/sucursales.component.html`

```html
<div class="form-group mt-16">
  <label>Enlace de Google Maps</label>
  <div class="flex gap-8">
    <input class="input" type="url" formControlName="google_maps_url" placeholder="https://maps.google.com/..." style="flex:1" />
    <button type="button" class="btn-icon" title="Elegir en el mapa" aria-label="Elegir en el mapa" (click)="abrirMapa()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    </button>
  </div>
  <div class="text-muted text-sm mt-8">Pega el enlace de Google Maps o usa el boton para elegir el punto en un mapa.</div>
</div>

<!-- ... resto del formulario ... -->

<app-mapa-selector (ubicacionSeleccionada)="onUbicacionElegida($event)"></app-mapa-selector>
```

## Notas

- **Sin API key**: usa OpenStreetMap (calles), Esri World Imagery (satélite)
  y Nominatim (búsqueda) — los tres son gratuitos y no requieren cuenta ni
  clave, a diferencia del stack completo de Google Maps.
- **Persistencia**: no se agregó ninguna columna nueva a la base de datos.
  El punto elegido se convierte en un enlace de Google Maps
  (`https://www.google.com/maps?q=lat,lng`) y se guarda en la columna ya
  existente `sucursales.google_maps_url` (migración `014_sucursales_google_maps.sql`).
- **Reutilizable**: `MapaSelectorComponent` no depende de nada de Sucursales
  — cualquier otra pantalla puede importarlo, llamar a `abrir(urlExistente?)`
  y escuchar `(ubicacionSeleccionada)` para obtener `{ lat, lng, url }`.
