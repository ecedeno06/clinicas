import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExamenLaboratorioCatalogo } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ExamenesLaboratorioCatalogoService {
  private base = `${environment.apiUrl}/examenes-laboratorio-catalogo`;
  constructor(private http: HttpClient) {}

  listar(categoriaId?: string): Observable<ExamenLaboratorioCatalogo[]> {
    const url = categoriaId ? `${this.base}?categoria_id=${categoriaId}` : this.base;
    return this.http.get<ExamenLaboratorioCatalogo[]>(url);
  }
  crear(data: any): Observable<ExamenLaboratorioCatalogo> { return this.http.post<ExamenLaboratorioCatalogo>(this.base, data); }
  actualizar(id: string, data: any): Observable<ExamenLaboratorioCatalogo> { return this.http.put<ExamenLaboratorioCatalogo>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
}
