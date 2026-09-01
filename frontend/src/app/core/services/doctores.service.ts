import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Doctor } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DoctoresService {
  private base = `${environment.apiUrl}/doctores`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Doctor[]> { return this.http.get<Doctor[]>(this.base); }
  obtener(id: string): Observable<Doctor> { return this.http.get<Doctor>(`${this.base}/${id}`); }
  crear(data: any): Observable<Doctor> { return this.http.post<Doctor>(this.base, data); }
  actualizar(id: string, data: any): Observable<Doctor> { return this.http.put<Doctor>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
}
