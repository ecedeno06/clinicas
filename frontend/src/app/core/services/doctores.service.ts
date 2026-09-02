import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Doctor, Disponibilidad, DoctorHorario } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DoctoresService {
  private base = `${environment.apiUrl}/doctores`;
  private baseHorarios = `${environment.apiUrl}/horarios`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Doctor[]> { return this.http.get<Doctor[]>(this.base); }
  obtener(id: string): Observable<Doctor> { return this.http.get<Doctor>(`${this.base}/${id}`); }
  crear(data: any): Observable<Doctor> { return this.http.post<Doctor>(this.base, data); }
  actualizar(id: string, data: any): Observable<Doctor> { return this.http.put<Doctor>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }

  listarHorarios(doctorId: string): Observable<DoctorHorario[]> { return this.http.get<DoctorHorario[]>(`${this.base}/${doctorId}/horarios`); }
  crearHorario(doctorId: string, data: { dia_semana: number; hora_inicio: string; hora_fin: string }): Observable<DoctorHorario> {
    return this.http.post<DoctorHorario>(`${this.base}/${doctorId}/horarios`, data);
  }
  eliminarHorario(id: string): Observable<void> { return this.http.delete<void>(`${this.baseHorarios}/${id}`); }

  disponibilidad(doctorId: string, fecha: string): Observable<Disponibilidad> {
    return this.http.get<Disponibilidad>(`${this.base}/${doctorId}/disponibilidad`, { params: { fecha } });
  }
}
