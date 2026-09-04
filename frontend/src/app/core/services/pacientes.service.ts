import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HistoriaClinica, OrdenLaboratorio, Paciente, Receta, SignosVitales } from '../models/models';

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

  // Ordenado cronologicamente (mas antiguo primero), para calcular
  // tendencias (ej. peso subio/bajo respecto a la consulta anterior).
  signosVitalesHistorial(id: string): Observable<SignosVitales[]> {
    return this.http.get<SignosVitales[]>(`${this.base}/${id}/signos-vitales-historial`);
  }

  buscarPorIdentificacion(identificacion: string): Observable<{ existe: boolean; paciente?: Paciente }> {
    return this.http.get<{ existe: boolean; paciente?: Paciente }>(`${this.base}/buscar`, { params: { identificacion } });
  }

  // Todas las ordenes de laboratorio del paciente en esta clinica, de
  // cualquier cita, ordenadas de la mas reciente a la mas antigua.
  laboratorioHistorial(id: string): Observable<OrdenLaboratorio[]> {
    return this.http.get<OrdenLaboratorio[]>(`${this.base}/${id}/laboratorio-historial`);
  }

  // Todas las recetas del paciente en esta clinica, de cualquier cita.
  recetasHistorial(id: string): Observable<Receta[]> {
    return this.http.get<Receta[]>(`${this.base}/${id}/recetas-historial`);
  }
}
