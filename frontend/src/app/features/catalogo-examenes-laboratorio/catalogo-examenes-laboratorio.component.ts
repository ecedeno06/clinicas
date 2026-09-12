import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoriasExamenesLaboratorioService } from '../../core/services/categoriasExamenesLaboratorio.service';
import { ExamenesLaboratorioCatalogoService } from '../../core/services/examenesLaboratorioCatalogo.service';
import { CategoriaExamenLaboratorio, ExamenLaboratorioCatalogo } from '../../core/models/models';

@Component({
  selector: 'app-catalogo-examenes-laboratorio',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './catalogo-examenes-laboratorio.component.html',
  styleUrl: './catalogo-examenes-laboratorio.component.css',
})
export class CatalogoExamenesLaboratorioComponent implements OnInit {
  categorias = signal<CategoriaExamenLaboratorio[]>([]);
  examenes = signal<ExamenLaboratorioCatalogo[]>([]);

  // ---------- Categorias ----------
  panelCategoriaAbierto = signal(false);
  editandoCategoria = signal<CategoriaExamenLaboratorio | null>(null);
  // El campo "orden" ya no se muestra ni se edita en esta pantalla -- las
  // listas se muestran siempre alfabeticamente (el backend ya ordena por
  // nombre); se conserva en el formulario con su valor por defecto (0)
  // solo para no romper la forma del payload que espera la API.
  categoriaForm = this.fb.group({
    nombre: ['', Validators.required],
    orden: [0],
    activo: [true],
  });

  filtroCategoriaNombre = signal('');
  filtroCategoriaEstado = signal(''); // '', 'activa', 'inactiva'
  ordenCategoriaCampo = signal<'nombre' | 'activo'>('nombre');
  ordenCategoriaDireccion = signal<'asc' | 'desc'>('asc');

  hayFiltrosCategorias = computed(() => !!(this.filtroCategoriaNombre() || this.filtroCategoriaEstado()));

  limpiarFiltrosCategorias(): void {
    this.filtroCategoriaNombre.set('');
    this.filtroCategoriaEstado.set('');
  }

  // Clic en una fila de Categorias filtra la tabla de Examenes por esa
  // categoria -- clic de nuevo sobre la misma quita el filtro.
  seleccionarCategoriaParaFiltrar(c: CategoriaExamenLaboratorio): void {
    this.filtroCategoriaId.set(this.filtroCategoriaId() === c.id ? '' : c.id);
  }

  ordenarCategoriasPor(campo: 'nombre' | 'activo'): void {
    if (this.ordenCategoriaCampo() === campo) {
      this.ordenCategoriaDireccion.set(this.ordenCategoriaDireccion() === 'asc' ? 'desc' : 'asc');
    } else {
      this.ordenCategoriaCampo.set(campo);
      this.ordenCategoriaDireccion.set('asc');
    }
  }

  categoriasFiltradas = computed(() => {
    const nombre = this.filtroCategoriaNombre().trim().toLowerCase();
    const estado = this.filtroCategoriaEstado();
    const campo = this.ordenCategoriaCampo();
    const dir = this.ordenCategoriaDireccion() === 'asc' ? 1 : -1;

    return this.categorias()
      .filter((c) => {
        if (nombre && !c.nombre.toLowerCase().includes(nombre)) return false;
        if (estado === 'activa' && !c.activo) return false;
        if (estado === 'inactiva' && c.activo) return false;
        return true;
      })
      .sort((a, b) => {
        const av = a[campo];
        const bv = b[campo];
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      });
  });

  // ---------- Examenes ----------
  filtroCategoriaId = signal('');
  filtroExamenNombre = signal('');
  filtroExamenEstado = signal(''); // '', 'activo', 'inactivo'
  ordenExamenCampo = signal<'categoria_nombre' | 'nombre' | 'activo'>('nombre');
  ordenExamenDireccion = signal<'asc' | 'desc'>('asc');

  hayFiltrosExamenes = computed(() => !!(
    this.filtroCategoriaId() || this.filtroExamenNombre() || this.filtroExamenEstado()
  ));

  limpiarFiltrosExamenes(): void {
    this.filtroCategoriaId.set('');
    this.filtroExamenNombre.set('');
    this.filtroExamenEstado.set('');
  }

  ordenarExamenesPor(campo: 'categoria_nombre' | 'nombre' | 'activo'): void {
    if (this.ordenExamenCampo() === campo) {
      this.ordenExamenDireccion.set(this.ordenExamenDireccion() === 'asc' ? 'desc' : 'asc');
    } else {
      this.ordenExamenCampo.set(campo);
      this.ordenExamenDireccion.set('asc');
    }
  }

  examenesFiltrados = computed(() => {
    const catId = this.filtroCategoriaId();
    const nombre = this.filtroExamenNombre().trim().toLowerCase();
    const estado = this.filtroExamenEstado();
    const campo = this.ordenExamenCampo();
    const dir = this.ordenExamenDireccion() === 'asc' ? 1 : -1;

    return this.examenes()
      .filter((e) => {
        if (catId && e.categoria_id !== catId) return false;
        if (nombre && !e.nombre.toLowerCase().includes(nombre)) return false;
        if (estado === 'activo' && !e.activo) return false;
        if (estado === 'inactivo' && e.activo) return false;
        return true;
      })
      .sort((a, b) => {
        const av = a[campo] ?? '';
        const bv = b[campo] ?? '';
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      });
  });

  panelExamenAbierto = signal(false);
  editandoExamen = signal<ExamenLaboratorioCatalogo | null>(null);
  examenForm = this.fb.group({
    categoria_id: ['', Validators.required],
    nombre: ['', Validators.required],
    valor_referencia: [''],
    unidad: [''],
    orden: [0],
    activo: [true],
  });

  constructor(
    private fb: FormBuilder,
    private categoriasSrv: CategoriasExamenesLaboratorioService,
    private examenesSrv: ExamenesLaboratorioCatalogoService
  ) {}

  ngOnInit(): void {
    this.cargarCategorias();
    this.cargarExamenes();
  }

  cargarCategorias(): void {
    this.categoriasSrv.listar().subscribe((data) => this.categorias.set(data));
  }

  cargarExamenes(): void {
    this.examenesSrv.listar().subscribe((data) => this.examenes.set(data));
  }

  // ---------- Categorias: CRUD ----------

  abrirNuevaCategoria(): void {
    this.editandoCategoria.set(null);
    this.categoriaForm.reset({ nombre: '', orden: 0, activo: true });
    this.panelCategoriaAbierto.set(true);
  }

  abrirEditarCategoria(c: CategoriaExamenLaboratorio): void {
    this.editandoCategoria.set(c);
    this.categoriaForm.reset({ ...c });
    this.panelCategoriaAbierto.set(true);
  }

  cerrarPanelCategoria(): void {
    this.panelCategoriaAbierto.set(false);
  }

  guardarCategoria(): void {
    if (this.categoriaForm.invalid) return;
    const data = this.categoriaForm.getRawValue();
    const actual = this.editandoCategoria();
    const req = actual ? this.categoriasSrv.actualizar(actual.id, data) : this.categoriasSrv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanelCategoria(); this.cargarCategorias(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar la categoria'),
    });
  }

  eliminarCategoria(c: CategoriaExamenLaboratorio): void {
    if (!confirm(`Eliminar la categoria "${c.nombre}"?`)) return;
    this.categoriasSrv.eliminar(c.id).subscribe({
      next: () => this.cargarCategorias(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la categoria'),
    });
  }

  // ---------- Examenes: CRUD ----------

  abrirNuevoExamen(): void {
    this.editandoExamen.set(null);
    this.examenForm.reset({ categoria_id: this.filtroCategoriaId() || '', nombre: '', valor_referencia: '', unidad: '', orden: 0, activo: true });
    this.panelExamenAbierto.set(true);
  }

  abrirEditarExamen(e: ExamenLaboratorioCatalogo): void {
    this.editandoExamen.set(e);
    this.examenForm.reset({ ...e, valor_referencia: e.valor_referencia ?? '', unidad: e.unidad ?? '' });
    this.panelExamenAbierto.set(true);
  }

  cerrarPanelExamen(): void {
    this.panelExamenAbierto.set(false);
  }

  guardarExamen(): void {
    if (this.examenForm.invalid) return;
    const data = this.examenForm.getRawValue();
    const actual = this.editandoExamen();
    const req = actual ? this.examenesSrv.actualizar(actual.id, data) : this.examenesSrv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanelExamen(); this.cargarExamenes(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el examen'),
    });
  }

  eliminarExamen(e: ExamenLaboratorioCatalogo): void {
    if (!confirm(`Eliminar el examen "${e.nombre}"?`)) return;
    this.examenesSrv.eliminar(e.id).subscribe({
      next: () => this.cargarExamenes(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el examen'),
    });
  }
}
