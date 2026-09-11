import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CategoriaAntecedente } from '../models/models';

@Injectable({ providedIn: 'root' })
export class CategoriasAntecedentesService {
  private base = `${environment.apiUrl}/antecedentes-categorias`;
  constructor(private http: HttpClient) {}

  listar(): Observable<CategoriaAntecedente[]> { return this.http.get<CategoriaAntecedente[]>(this.base); }
  crear(data: any): Observable<CategoriaAntecedente> { return this.http.post<CategoriaAntecedente>(this.base, data); }
  actualizar(id: string, data: any): Observable<CategoriaAntecedente> { return this.http.put<CategoriaAntecedente>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
}
