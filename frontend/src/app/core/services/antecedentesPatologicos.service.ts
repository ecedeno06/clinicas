import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AntecedentePatologico } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AntecedentesPatologicosService {
  private base = `${environment.apiUrl}/antecedentes-patologicos`;
  constructor(private http: HttpClient) {}

  listar(categoriaId?: string): Observable<AntecedentePatologico[]> {
    const url = categoriaId ? `${this.base}?categoria_id=${categoriaId}` : this.base;
    return this.http.get<AntecedentePatologico[]>(url);
  }
  crear(data: any): Observable<AntecedentePatologico> { return this.http.post<AntecedentePatologico>(this.base, data); }
  actualizar(id: string, data: any): Observable<AntecedentePatologico> { return this.http.put<AntecedentePatologico>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
}
