import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoriasAntecedentesService } from '../../core/services/categoriasAntecedentes.service';
import { AntecedentesPatologicosService } from '../../core/services/antecedentesPatologicos.service';
import { CategoriaAntecedente, AntecedentePatologico } from '../../core/models/models';

@Component({
  selector: 'app-catalogo-antecedentes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './catalogo-antecedentes.component.html',
  styleUrl: './catalogo-antecedentes.component.css',
})
export class CatalogoAntecedentesComponent implements OnInit {
  categorias = signal<CategoriaAntecedente[]>([]);
  antecedentes = signal<AntecedentePatologico[]>([]);

// ---------- Categorias ----------
  panelCategoriaAbierto = signal(false);
  editandoCategoria = signal<CategoriaAntecedente | null>(null);
  categoriaForm = this.fb.group({
    nombre: ['', Validators.required],
    orden: [0],
    activo: [true],
  });

  filtroCategoriaNombre = signal('');
  filtroCategoriaOrden = signal('');
  filtroCategoriaEstado = signal(''); // '', 'activa', 'inactiva'
  ordenCategoriaCampo = signal<'nombre' | 'orden' | 'activo'>('orden');
  ordenCategoriaDireccion = signal<'asc' | 'desc'>('asc');

  hayFiltrosCategorias = computed(() => !!(this.filtroCategoriaNombre() || this.filtroCategoriaOrden() || this.filtroCategoriaEstado()));

  limpiarFiltrosCategorias(): void {
    this.filtroCategoriaNombre.set('');
    this.filtroCategoriaOrden.set('');
    this.filtroCategoriaEstado.set('');
  }

  // Clic en una fila de Categorias filtra la tabla de Antecedentes por
  // esa categoria -- clic de nuevo sobre la misma quita el filtro.
  seleccionarCategoriaParaFiltrar(c: CategoriaAntecedente): void {
    this.filtroCategoriaId.set(this.filtroCategoriaId() === c.id ? '' : c.id);
  }

  ordenarCategoriasPor(campo: 'nombre' | 'orden' | 'activo'): void {
    if (this.ordenCategoriaCampo() === campo) {
      this.ordenCategoriaDireccion.set(this.ordenCategoriaDireccion() === 'asc' ? 'desc' : 'asc');
    } else {
      this.ordenCategoriaCampo.set(campo);
      this.ordenCategoriaDireccion.set('asc');
    }
  }

  categoriasFiltradas = computed(() => {
    const nombre = this.filtroCategoriaNombre().trim().toLowerCase();
    const orden = this.filtroCategoriaOrden().trim();
    const estado = this.filtroCategoriaEstado();
    const campo = this.ordenCategoriaCampo();
    const dir = this.ordenCategoriaDireccion() === 'asc' ? 1 : -1;

    return this.categorias()
      .filter((c) => {
        if (nombre && !c.nombre.toLowerCase().includes(nombre)) return false;
        if (orden && !String(c.orden).includes(orden)) return false;
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

  // ---------- Antecedentes ----------
  filtroCategoriaId = signal('');
  filtroAntecedenteNombre = signal('');
  filtroAntecedenteOrden = signal('');
  filtroAntecedenteEstado = signal(''); // '', 'activo', 'inactivo'
  ordenAntecedenteCampo = signal<'categoria_nombre' | 'nombre' | 'orden' | 'activo'>('orden');
  ordenAntecedenteDireccion = signal<'asc' | 'desc'>('asc');

  hayFiltrosAntecedentes = computed(() => !!(
    this.filtroCategoriaId() || this.filtroAntecedenteNombre() || this.filtroAntecedenteOrden() || this.filtroAntecedenteEstado()
  ));

  limpiarFiltrosAntecedentes(): void {
    this.filtroCategoriaId.set('');
    this.filtroAntecedenteNombre.set('');
    this.filtroAntecedenteOrden.set('');
    this.filtroAntecedenteEstado.set('');
  }

  ordenarAntecedentesPor(campo: 'categoria_nombre' | 'nombre' | 'orden' | 'activo'): void {
    if (this.ordenAntecedenteCampo() === campo) {
      this.ordenAntecedenteDireccion.set(this.ordenAntecedenteDireccion() === 'asc' ? 'desc' : 'asc');
    } else {
      this.ordenAntecedenteCampo.set(campo);
      this.ordenAntecedenteDireccion.set('asc');
    }
  }

  antecedentesFiltrados = computed(() => {
    const catId = this.filtroCategoriaId();
    const nombre = this.filtroAntecedenteNombre().trim().toLowerCase();
    const orden = this.filtroAntecedenteOrden().trim();
    const estado = this.filtroAntecedenteEstado();
    const campo = this.ordenAntecedenteCampo();
    const dir = this.ordenAntecedenteDireccion() === 'asc' ? 1 : -1;

    return this.antecedentes()
      .filter((a) => {
        if (catId && a.categoria_id !== catId) return false;
        if (nombre && !a.nombre.toLowerCase().includes(nombre)) return false;
        if (orden && !String(a.orden).includes(orden)) return false;
        if (estado === 'activo' && !a.activo) return false;
        if (estado === 'inactivo' && a.activo) return false;
        return true;
      })
      .sort((a, b) => {
        const av = a[campo] ?? '';
        const bv = b[campo] ?? '';
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      });
  });

  panelAntecedenteAbierto = signal(false);
  editandoAntecedente = signal<AntecedentePatologico | null>(null);
  antecedenteForm = this.fb.group({
    categoria_id: ['', Validators.required],
    nombre: ['', Validators.required],
    orden: [0],
    activo: [true],
  });

  constructor(
    private fb: FormBuilder,
    private categoriasSrv: CategoriasAntecedentesService,
    private antecedentesSrv: AntecedentesPatologicosService
  ) {}

  ngOnInit(): void {
    this.cargarCategorias();
    this.cargarAntecedentes();
  }

  cargarCategorias(): void {
    this.categoriasSrv.listar().subscribe((data) => this.categorias.set(data));
  }

  cargarAntecedentes(): void {
    this.antecedentesSrv.listar().subscribe((data) => this.antecedentes.set(data));
  }

  // ---------- Categorias: CRUD ----------

  abrirNuevaCategoria(): void {
    this.editandoCategoria.set(null);
    this.categoriaForm.reset({ nombre: '', orden: 0, activo: true });
    this.panelCategoriaAbierto.set(true);
  }

  abrirEditarCategoria(c: CategoriaAntecedente): void {
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

  eliminarCategoria(c: CategoriaAntecedente): void {
    if (!confirm(`Eliminar la categoria "${c.nombre}"?`)) return;
    this.categoriasSrv.eliminar(c.id).subscribe({
      next: () => this.cargarCategorias(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar la categoria'),
    });
  }

  // ---------- Antecedentes: CRUD ----------

  abrirNuevoAntecedente(): void {
    this.editandoAntecedente.set(null);
    this.antecedenteForm.reset({ categoria_id: this.filtroCategoriaId() || '', nombre: '', orden: 0, activo: true });
    this.panelAntecedenteAbierto.set(true);
  }

  abrirEditarAntecedente(a: AntecedentePatologico): void {
    this.editandoAntecedente.set(a);
    this.antecedenteForm.reset({ ...a });
    this.panelAntecedenteAbierto.set(true);
  }

  cerrarPanelAntecedente(): void {
    this.panelAntecedenteAbierto.set(false);
  }

  guardarAntecedente(): void {
    if (this.antecedenteForm.invalid) return;
    const data = this.antecedenteForm.getRawValue();
    const actual = this.editandoAntecedente();
    const req = actual ? this.antecedentesSrv.actualizar(actual.id, data) : this.antecedentesSrv.crear(data);
    req.subscribe({
      next: () => { this.cerrarPanelAntecedente(); this.cargarAntecedentes(); },
      error: (err) => alert(err?.error?.mensaje || 'No se pudo guardar el antecedente'),
    });
  }

  eliminarAntecedente(a: AntecedentePatologico): void {
    if (!confirm(`Eliminar el antecedente "${a.nombre}"?`)) return;
    this.antecedentesSrv.eliminar(a.id).subscribe({
      next: () => this.cargarAntecedentes(),
      error: (err) => alert(err?.error?.mensaje || 'No se pudo eliminar el antecedente'),
    });
  }
}
