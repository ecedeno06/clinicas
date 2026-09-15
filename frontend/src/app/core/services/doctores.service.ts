import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Doctor, Disponibilidad, DoctorHorario, PerfilDoctor } from '../models/models';

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

  buscarPorIdentificacion(identificacion: string): Observable<{ existe: boolean; doctor?: Doctor }> {
    return this.http.get<{ existe: boolean; doctor?: Doctor }>(`${this.base}/buscar`, { params: { identificacion } });
  }

  listarHorarios(doctorId: string): Observable<DoctorHorario[]> { return this.http.get<DoctorHorario[]>(`${this.base}/${doctorId}/horarios`); }
  crearHorario(doctorId: string, data: { dia_semana: number; hora_inicio: string; hora_fin: string; sucursal_id?: string }): Observable<DoctorHorario> {
    return this.http.post<DoctorHorario>(`${this.base}/${doctorId}/horarios`, data);
  }
  eliminarHorario(id: string): Observable<{ eliminado: boolean; citas_afectadas: number }> {
    return this.http.delete<{ eliminado: boolean; citas_afectadas: number }>(`${this.baseHorarios}/${id}`);
  }
  actualizarHorario(id: string, data: { activo?: boolean }): Observable<DoctorHorario> {
    return this.http.put<DoctorHorario>(`${this.baseHorarios}/${id}`, data);
  }

  disponibilidad(doctorId: string, fecha: string): Observable<Disponibilidad> {
    return this.http.get<Disponibilidad>(`${this.base}/${doctorId}/disponibilidad`, { params: { fecha } });
  }

  // Da/quita acceso al sistema (rol 'doctor' en la clinica activa) y
  // resetea la contrasena -- solo admin (ver doctores.routes.js).
  invitar(id: string): Observable<Doctor> {
    return this.http.post<Doctor>(`${this.base}/${id}/invitar`, {});
  }
  desinvitar(id: string): Observable<Doctor> {
    return this.http.delete<Doctor>(`${this.base}/${id}/invitar`);
  }
  resetearPassword(id: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/${id}/resetear-password`, {});
  }

  // Portal del doctor: sus datos + en que clinicas tiene rol 'doctor'.
  miPerfil(): Observable<PerfilDoctor> {
    return this.http.get<PerfilDoctor>(`${this.base}/mi-perfil`);
  }
}
