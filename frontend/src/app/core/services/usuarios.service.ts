import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Usuario } from '../models/models';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private base = `${environment.apiUrl}/usuarios`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Usuario[]> { return this.http.get<Usuario[]>(this.base); }
  crear(data: any): Observable<Usuario> { return this.http.post<Usuario>(this.base, data); }
  actualizar(id: string, data: any): Observable<Usuario> { return this.http.put<Usuario>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }

  buscarPorEmail(email: string): Observable<{ existe: boolean; nombre?: string }> {
    return this.http.get<{ existe: boolean; nombre?: string }>(`${this.base}/buscar`, { params: { email } });
  }
}
