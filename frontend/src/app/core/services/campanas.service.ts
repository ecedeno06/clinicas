import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Campana, CampanaDoctor, EstadoCampana, EstadoInvitacionDoctor } from '../models/models';

@Injectable({ providedIn: 'root' })
export class CampanasService {
  private base = `${environment.apiUrl}/campanas`;
  constructor(private http: HttpClient) {}

  listar(filtros: Record<string, string> = {}): Observable<Campana[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<Campana[]>(`${this.base}${params ? '?' + params : ''}`);
  }
  obtener(id: string): Observable<Campana> { return this.http.get<Campana>(`${this.base}/${id}`); }
  crear(data: any): Observable<Campana> { return this.http.post<Campana>(this.base, data); }
  actualizar(id: string, data: any): Observable<Campana> { return this.http.put<Campana>(`${this.base}/${id}`, data); }
  cambiarEstado(id: string, estado: EstadoCampana, motivo_rechazo?: string): Observable<Campana> {
    return this.http.put<Campana>(`${this.base}/${id}/estado`, { estado, motivo_rechazo });
  }

  listarDoctores(campanaId: string): Observable<CampanaDoctor[]> {
    return this.http.get<CampanaDoctor[]>(`${this.base}/${campanaId}/doctores`);
  }
  invitarDoctor(campanaId: string, doctorId: string, notas?: string): Observable<CampanaDoctor> {
    return this.http.post<CampanaDoctor>(`${this.base}/${campanaId}/doctores`, { doctor_id: doctorId, notas });
  }
  actualizarDoctor(campanaId: string, doctorId: string, data: { estado?: EstadoInvitacionDoctor; notas?: string }): Observable<CampanaDoctor> {
    return this.http.put<CampanaDoctor>(`${this.base}/${campanaId}/doctores/${doctorId}`, data);
  }
  quitarDoctor(campanaId: string, doctorId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${campanaId}/doctores/${doctorId}`);
  }
}
