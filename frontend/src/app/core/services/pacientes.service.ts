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

  // Crea/reutiliza una cuenta de acceso de solo lectura para el paciente
  // (rol 'paciente') y le envia el correo con las credenciales.
  invitar(id: string, confirmarVincularExistente = false): Observable<Paciente> {
    return this.http.post<Paciente>(`${this.base}/${id}/invitar`, confirmarVincularExistente ? { confirmarVincularExistente: true } : {});
  }

  // Revoca el acceso de paciente en ESTA clinica (no borra la cuenta ni
  // su acceso en otras clinicas donde tambien sea paciente).
  desinvitar(id: string): Observable<Paciente> {
    return this.http.delete<Paciente>(`${this.base}/${id}/invitar`);
  }

  resetearPassword(id: string, password?: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/${id}/resetear-password`, password ? { password } : {});
  }

  // Corrige el correo de LOGIN de la cuenta ya vinculada (usuarios.email) --
  // distinto de "actualizar", que edita el correo de contacto del paciente.
  cambiarCorreoAcceso(id: string, email: string): Observable<Paciente> {
    return this.http.put<Paciente>(`${this.base}/${id}/correo-acceso`, { email });
  }

  // Le envia al paciente el correo de consentimiento para compartir su
  // historial clinico entre clinicas -- ver
  // pacientes.controller.js#solicitarConsentimientoDatos.
  solicitarConsentimientoDatos(id: string): Observable<Paciente> {
    return this.http.post<Paciente>(`${this.base}/${id}/consentimiento-datos`, {});
  }
}
