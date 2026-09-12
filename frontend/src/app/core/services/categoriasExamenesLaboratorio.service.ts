import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CategoriaExamenLaboratorio } from '../models/models';

@Injectable({ providedIn: 'root' })
export class CategoriasExamenesLaboratorioService {
  private base = `${environment.apiUrl}/examenes-laboratorio-categorias`;
  constructor(private http: HttpClient) {}

  listar(): Observable<CategoriaExamenLaboratorio[]> { return this.http.get<CategoriaExamenLaboratorio[]>(this.base); }
  crear(data: any): Observable<CategoriaExamenLaboratorio> { return this.http.post<CategoriaExamenLaboratorio>(this.base, data); }
  actualizar(id: string, data: any): Observable<CategoriaExamenLaboratorio> { return this.http.put<CategoriaExamenLaboratorio>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
}
