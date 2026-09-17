import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PortalPacienteService } from '../../core/services/portalPaciente.service';
import { GeocodificacionService } from '../../core/services/geocodificacion.service';
import { DireccionPaciente, FamiliarPaciente, Paciente } from '../../core/models/models';
import { formatoFechaCorta } from '../../core/utils/pdf.util';
import { SelectorFotoComponent } from '../../core/components/selector-foto/selector-foto.component';
import { TelefonoInputComponent } from '../../core/components/telefono-input/telefono-input.component';
import { MapaSelectorComponent, UbicacionSeleccionada, extraerLatLng } from '../../core/components/mapa-selector/mapa-selector.component';

// El paciente puede editar toda su informacion personal (contacto,
// direcciones, familiares) EXCEPTO la identificacion (cedula), que solo
// corrige el staff -- confirmado con el usuario. Antecedentes se muestran
// pero no se editan aqui (el paciente no diagnostica su propio historial).
@Component({
  selector: 'app-perfil-paciente',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SelectorFotoComponent, TelefonoInputComponent, MapaSelectorComponent],
  templateUrl: './perfil-paciente.component.html',
})
export class PerfilPacienteComponent implements OnInit {
  paciente = signal<Paciente | null>(null);
  cargando = signal(true);
  guardando = signal(false);
  error = signal<string | null>(null);
  mensajeGuardado = signal<string | null>(null);

  form = this.fb.group({
    nombre: ['', Validators.required],
    foto: [null as string | null],
    fecha_nacimiento: [''],
    sexo: [''],
    estado_civil: [''],
    estado_laboral: [''],
    tipo_trabajo: [''],
    lugar_trabajo: [''],
    telefono: [''],
    acepta_whatsapp: [false],
    email: [''],
    direcciones: this.fb.array([this.crearDireccionGroup()]),
    alergias: [''],
  });

  familiares = signal<FamiliarPaciente[]>([]);
  mostrarFormFamiliar = signal(false);
  familiarEditandoIndex = signal<number | null>(null);
  familiarForm = this.fb.group({
    nombre: ['', Validators.required],
    telefono: [''],
    parentesco: [''],
    acepta_whatsapp: [false],
  });

  constructor(private fb: FormBuilder, private srv: PortalPacienteService, private geocodificacionSrv: GeocodificacionService) {}

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.srv.perfil().subscribe({
      next: (p) => { this.paciente.set(p); this.poblarFormulario(p); this.cargando.set(false); },
      error: (err) => { this.error.set(err?.error?.mensaje || 'No se pudo cargar tu ficha'); this.cargando.set(false); },
    });
  }

  private poblarFormulario(p: Paciente): void {
    this.form.reset({
      nombre: p.nombre,
      foto: p.foto ?? null,
      fecha_nacimiento: p.fecha_nacimiento?.substring(0, 10) ?? '',
      sexo: p.sexo ?? '',
      estado_civil: p.estado_civil ?? '',
      estado_laboral: p.estado_laboral ?? '',
      tipo_trabajo: p.tipo_trabajo ?? '',
      lugar_trabajo: p.lugar_trabajo ?? '',
      telefono: p.telefono ?? '',
      acepta_whatsapp: p.acepta_whatsapp ?? false,
      email: p.email ?? '',
      alergias: p.alergias ?? '',
    });
    this.direccionesArray.clear();
    (p.direcciones?.length ? p.direcciones : [undefined]).forEach((d) => this.direccionesArray.push(this.crearDireccionGroup(d)));
    this.familiares.set(p.familiares ?? []);
    this.cerrarFormFamiliar();
  }

  crearDireccionGroup(d?: DireccionPaciente) {
    return this.fb.group({
      direccion: [d?.direccion ?? ''],
      google_maps_url: [d?.google_maps_url ?? ''],
      pais: [d?.pais ?? ''],
      provincia: [d?.provincia ?? ''],
      distrito: [d?.distrito ?? ''],
      corregimiento: [d?.corregimiento ?? ''],
      comparte_ubicacion: [d?.comparte_ubicacion ?? false],
      es_principal: [d?.es_principal ?? false],
    });
  }

  get direccionesArray(): FormArray {
    return this.form.get('direcciones') as FormArray;
  }

  agregarDireccion(): void {
    this.direccionesArray.push(this.crearDireccionGroup());
  }

  quitarDireccion(i: number): void {
    this.direccionesArray.removeAt(i);
  }

  marcarPrincipal(i: number): void {
    this.direccionesArray.controls.forEach((c, idx) => c.get('es_principal')?.setValue(idx === i));
  }

  @ViewChild(MapaSelectorComponent) mapaSelector?: MapaSelectorComponent;
  private indiceDireccionMapa: number | null = null;

  abrirMapa(i: number): void {
    this.indiceDireccionMapa = i;
    this.mapaSelector?.abrir(this.direccionesArray.at(i).get('google_maps_url')?.value);
  }

  onUbicacionElegida(u: UbicacionSeleccionada): void {
    if (this.indiceDireccionMapa === null) return;
    const grupo = this.direccionesArray.at(this.indiceDireccionMapa);
    grupo.patchValue({ google_maps_url: u.url });
    grupo.markAsDirty();
  }

  // Mismo criterio que pacientes.component.ts: llama a nuestro backend
  // (nunca directo a Google), corregimiento se escribe a mano.
  detectandoDireccion = signal<number | null>(null);

  detectarDivisionPolitica(i: number): void {
    const grupo = this.direccionesArray.at(i);
    const coords = extraerLatLng(grupo.get('google_maps_url')?.value);
    if (!coords) {
      alert('Primero elige una ubicacion en el mapa.');
      return;
    }
    this.detectandoDireccion.set(i);
    this.geocodificacionSrv.reverse(coords[0], coords[1]).subscribe({
      next: (d) => {
        grupo.patchValue({ pais: d.pais ?? grupo.get('pais')?.value, provincia: d.provincia ?? grupo.get('provincia')?.value, distrito: d.distrito ?? grupo.get('distrito')?.value });
        this.detectandoDireccion.set(null);
      },
      error: (err) => {
        alert(err?.error?.mensaje || 'No se pudo detectar la division politica para ese punto.');
        this.detectandoDireccion.set(null);
      },
    });
  }

  abrirNuevoFamiliar(): void {
    this.familiarEditandoIndex.set(null);
    this.familiarForm.reset({ nombre: '', telefono: '', parentesco: '', acepta_whatsapp: false });
    this.mostrarFormFamiliar.set(true);
  }

  editarFamiliar(i: number): void {
    this.familiarEditandoIndex.set(i);
    this.familiarForm.reset(this.familiares()[i]);
    this.mostrarFormFamiliar.set(true);
  }

  guardarFamiliar(): void {
    if (this.familiarForm.invalid) return;
    const valor = this.familiarForm.getRawValue() as FamiliarPaciente;
    const indice = this.familiarEditandoIndex();
    if (indice === null) {
      this.familiares.update((arr) => [...arr, valor]);
    } else {
      this.familiares.update((arr) => arr.map((f, idx) => (idx === indice ? valor : f)));
    }
    this.cerrarFormFamiliar();
  }

  cerrarFormFamiliar(): void {
    this.mostrarFormFamiliar.set(false);
    this.familiarEditandoIndex.set(null);
    this.familiarForm.reset({ nombre: '', telefono: '', parentesco: '', acepta_whatsapp: false });
  }

  eliminarFamiliar(i: number): void {
    this.familiares.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  onFotoSeleccionada(foto: string): void {
    this.form.patchValue({ foto });
  }

  onFotoEliminada(): void {
    this.form.patchValue({ foto: null });
  }

  fechaCorta(iso?: string | null): string {
    return iso ? formatoFechaCorta(iso) : '-';
  }

  guardar(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);
    this.mensajeGuardado.set(null);
    this.error.set(null);
    const data = { ...this.form.getRawValue(), familiares: this.familiares() };
    this.srv.actualizar(data).subscribe({
      next: (p) => {
        this.paciente.set(p);
        this.poblarFormulario(p);
        this.guardando.set(false);
        this.mensajeGuardado.set('Cambios guardados.');
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudieron guardar los cambios');
      },
    });
  }
}
