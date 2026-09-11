import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PacienteAntecedente } from '../models/models';

@Injectable({ providedIn: 'root' })
export class PacienteAntecedentesService {
  constructor(private http: HttpClient) {}

  listar(pacienteId: string): Observable<PacienteAntecedente[]> {
    return this.http.get<PacienteAntecedente[]>(`${environment.apiUrl}/pacientes/${pacienteId}/antecedentes`);
  }
  crear(pacienteId: string, data: any): Observable<PacienteAntecedente> {
    return this.http.post<PacienteAntecedente>(`${environment.apiUrl}/pacientes/${pacienteId}/antecedentes`, data);
  }
  actualizar(id: string, data: any): Observable<PacienteAntecedente> {
    return this.http.put<PacienteAntecedente>(`${environment.apiUrl}/paciente-antecedentes/${id}`, data);
  }
  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/paciente-antecedentes/${id}`);
  }
}
