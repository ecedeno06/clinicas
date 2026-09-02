import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Cita, HistoriaClinica, Receta, SignosVitales } from '../models/models';

@Injectable({ providedIn: 'root' })
export class CitasService {
  private base = `${environment.apiUrl}/citas`;
  private baseRecetas = `${environment.apiUrl}/recetas`;
  constructor(private http: HttpClient) {}

  listar(filtros: Record<string, string> = {}): Observable<Cita[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<Cita[]>(`${this.base}${params ? '?' + params : ''}`);
  }
  obtener(id: string): Observable<Cita> { return this.http.get<Cita>(`${this.base}/${id}`); }
  crear(data: any): Observable<Cita> { return this.http.post<Cita>(this.base, data); }
  actualizar(id: string, data: any): Observable<Cita> { return this.http.put<Cita>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }

  obtenerHistoria(citaId: string): Observable<HistoriaClinica> {
    return this.http.get<HistoriaClinica>(`${this.base}/${citaId}/historia`);
  }
  crearHistoria(citaId: string, data: any): Observable<HistoriaClinica> {
    return this.http.post<HistoriaClinica>(`${this.base}/${citaId}/historia`, data);
  }
  actualizarHistoria(citaId: string, data: any): Observable<HistoriaClinica> {
    return this.http.put<HistoriaClinica>(`${this.base}/${citaId}/historia`, data);
  }

  obtenerSignosVitales(citaId: string): Observable<SignosVitales> {
    return this.http.get<SignosVitales>(`${this.base}/${citaId}/signos-vitales`);
  }
  crearSignosVitales(citaId: string, data: any): Observable<SignosVitales> {
    return this.http.post<SignosVitales>(`${this.base}/${citaId}/signos-vitales`, data);
  }
  actualizarSignosVitales(citaId: string, data: any): Observable<SignosVitales> {
    return this.http.put<SignosVitales>(`${this.base}/${citaId}/signos-vitales`, data);
  }

  // Una cita puede tener varias recetas.
  listarRecetas(citaId: string): Observable<Receta[]> {
    return this.http.get<Receta[]>(`${this.base}/${citaId}/recetas`);
  }
  crearReceta(citaId: string, data: any): Observable<Receta> {
    return this.http.post<Receta>(`${this.base}/${citaId}/recetas`, data);
  }
  actualizarReceta(recetaId: string, data: any): Observable<Receta> {
    return this.http.put<Receta>(`${this.baseRecetas}/${recetaId}`, data);
  }
  eliminarReceta(recetaId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseRecetas}/${recetaId}`);
  }
}
