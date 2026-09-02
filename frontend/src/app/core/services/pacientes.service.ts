import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HistoriaClinica, Paciente } from '../models/models';

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private base = `${environment.apiUrl}/pacientes`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Paciente[]> { return this.http.get<Paciente[]>(this.base); }
  obtener(id: string): Observable<Paciente> { return this.http.get<Paciente>(`${this.base}/${id}`); }
  crear(data: any): Observable<Paciente> { return this.http.post<Paciente>(this.base, data); }
  actualizar(id: string, data: any): Observable<Paciente> { return this.http.put<Paciente>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }
  historial(id: string): Observable<HistoriaClinica[]> { return this.http.get<HistoriaClinica[]>(`${this.base}/${id}/historial`); }

  buscarPorIdentificacion(identificacion: string): Observable<{ existe: boolean; paciente?: Paciente }> {
    return this.http.get<{ existe: boolean; paciente?: Paciente }>(`${this.base}/buscar`, { params: { identificacion } });
  }
}
