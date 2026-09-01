import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Especialidad } from '../models/models';

@Injectable({ providedIn: 'root' })
export class EspecialidadesService {
  private base = `${environment.apiUrl}/especialidades`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Especialidad[]> { return this.http.get<Especialidad[]>(this.base); }
  obtener(id: string): Observable<Especialidad> { return this.http.get<Especialidad>(`${this.base}/${id}`); }
  crear(data: any): Observable<Especialidad> { return this.http.post<Especialidad>(this.base, data); }
  actualizar(id: string, data: any): Observable<Especialidad> { return this.http.put<Especialidad>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
}
