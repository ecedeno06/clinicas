import { Component, OnInit, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SucursalesService } from '../../core/services/sucursales.service';
import { AuthService } from '../../core/services/auth.service';
import { Sucursal } from '../../core/models/models';
import { MapaSelectorComponent, UbicacionSeleccionada, extraerLatLng } from '../../core/components/mapa-selector/mapa-selector.component';

// Catalogo acotado de zonas horarias frecuentes en la region -- se guarda
// como identificador IANA (America/Panama, etc.), no como offset fijo.
export const ZONAS_HORARIAS = [
  { valor: 'America/Panama', etiqueta: 'Panama (UTC-5)' },
  { valor: 'America/Bogota', etiqueta: 'Bogota (UTC-5)' },
  { valor: 'America/Cancun', etiqueta: 'Cancun (UTC-5)' },
  { valor: 'America/Mexico_City', etiqueta: 'Ciudad de Mexico (UTC-6)' },
  { valor: 'America/Guatemala', etiqueta: 'Guatemala (UTC-6)' },
  { valor: 'America/Costa_Rica', etiqueta: 'Costa Rica (UTC-6)' },
  { valor: 'America/Tegucigalpa', etiqueta: 'Honduras (UTC-6)' },
  { valor: 'America/El_Salvador', etiqueta: 'El Salvador (UTC-6)' },
  { valor: 'America/Managua', etiqueta: 'Nicaragua (UTC-6)' },
  { valor: 'America/Santo_Domingo', etiqueta: 'Rep. Dominicana (UTC-4)' },
  { valor: 'America/New_York', etiqueta: 'Nueva York (UTC-5/-4)' },
  { valor: 'America/Chicago', etiqueta: 'Chicago (UTC-6/-5)' },
  { valor: 'America/Denver', etiqueta: 'Denver (UTC-7/-6)' },
  { valor: 'America/Los_Angeles', etiqueta: 'Los Angeles (UTC-8/-7)' },
  { valor: 'UTC', etiqueta: 'UTC' },
];

@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MapaSelectorComponent],
  templateUrl: './sucursales.component.html',
  styleUrl: './sucursales.component.css',
})
export class SucursalesComponent implements OnInit {
  sucursales = signal<Sucursal[]>([]);
  panelAbierto = signal(false);
  editando = signal<Sucursal | null>(null);
  zonasHorarias = ZONAS_HORARIAS;

  filtroNombre = signal('');
  hayFiltros = computed(() => !!this.filtroNombre());
  limpiarFiltros(): void { this.filtroNombre.set(''); }

  sucursalesFiltradas = computed(() => {
    const nombre = this.filtroNombre().trim().toLowerCase();
    return this.sucursales().filter((s) => !nombre || s.nombre.toLowerCase().includes(nombre));
  });

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

  constructor(private fb: FormBuilder, private srv: SucursalesService, public auth: AuthService) {}

  ngOnInit(): void { this.cargar(); }
  cargar(): void { this.srv.listar().subscribe((data) => this.sucursales.set(data)); }

  esAdmin(): boolean { return this.auth.esSuperAdmin() || this.auth.usuario()?.rol === 'admin'; }

  abrirNuevo(): void {
    this.editando.set(null);
    this.form.reset({ zona_horaria: 'America/Panama', activo: true });
    this.panelAbierto.set(true);
  }

  abrirEditar(s: Sucursal): void {
    this.editando.set(s);
    this.form.reset({
      ...s,
      hora_apertura: (s.hora_apertura || '').substring(0, 5),
      hora_cierre: (s.hora_cierre || '').substring(0, 5),
    });
    this.panelAbierto.set(true);
  }

  cerrarPanel(): void { this.panelAbierto.set(false); }

  @ViewChild(MapaSelectorComponent) mapaSelector?: MapaSelectorComponent;

  abrirMapa(): void {
    this.mapaSelector?.abrir(this.form.get('google_maps_url')?.value);
  }

  onUbicacionElegida(u: UbicacionSeleccionada): void {
    this.form.patchValue({ google_maps_url: u.url });
  }

  // wa.me abre WhatsApp Web/app con el mensaje precargado -- no requiere
  // API ni cuenta de WhatsApp Business, solo funciona como un enlace normal.
  whatsappUrl(s: Sucursal): string {
    const lineas = [`Ubicacion de ${s.nombre} (Google Maps): ${s.google_maps_url}`];
    const coords = extraerLatLng(s.google_maps_url);
    if (coords) {
      lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
    }
    return `https://wa.me/?text=${encodeURIComponent(lineas.join('\n'))}`;
  }

  guardar(): void {
    if (this.form.invalid) return;
    const data = this.form.getRawValue();
    const actual = this.editando();
    const req = actual ? this.srv.actualizar(actual.id, data) : this.srv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanel(); this.cargar(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la sucursal'),
    });
  }

  desactivar(s: Sucursal): void {
    if (!confirm(`Desactivar la sucursal "${s.nombre}"? Los doctores y citas que le pertenecen no se ven afectados.`)) return;
    this.srv.actualizar(s.id, { activo: false }).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo desactivar la sucursal'),
    });
  }

  reactivar(s: Sucursal): void {
    this.srv.actualizar(s.id, { activo: true }).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo reactivar la sucursal'),
    });
  }
}
