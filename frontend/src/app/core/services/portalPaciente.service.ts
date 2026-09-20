import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClinicaConsentimiento, HistoriaClinica, OrdenLaboratorio, Paciente, Receta, SignosVitales } from '../models/models';

// Portal del rol 'paciente': solo ve (y puede editar su propia ficha) su
// propia informacion, resuelta server-side a partir del usuario
// autenticado (ver backend/src/controllers/portalPaciente.controller.js).
// La sesion no tiene clinica activa -- historial() agrega las consultas
// de TODAS las clinicas que autorizaron al paciente; los 3 detalles por
// cita solo devuelven algo si esa cita puntual es de una de esas clinicas.
@Injectable({ providedIn: 'root' })
export class PortalPacienteService {
  private base = `${environment.apiUrl}/portal-paciente`;
  constructor(private http: HttpClient) {}

  perfil(): Observable<Paciente> { return this.http.get<Paciente>(`${this.base}/perfil`); }
  actualizar(data: any): Observable<Paciente> { return this.http.put<Paciente>(`${this.base}/perfil`, data); }
  historial(): Observable<HistoriaClinica[]> { return this.http.get<HistoriaClinica[]>(`${this.base}/citas`); }
  signosVitalesDeCita(citaId: string): Observable<SignosVitales> {
    return this.http.get<SignosVitales>(`${this.base}/citas/${citaId}/signos-vitales`);
  }
  recetasDeCita(citaId: string): Observable<Receta[]> {
    return this.http.get<Receta[]>(`${this.base}/citas/${citaId}/recetas`);
  }
  laboratorioDeCita(citaId: string): Observable<OrdenLaboratorio[]> {
    return this.http.get<OrdenLaboratorio[]>(`${this.base}/citas/${citaId}/laboratorio`);
  }

  misClinicas(): Observable<ClinicaConsentimiento[]> {
    return this.http.get<ClinicaConsentimiento[]>(`${this.base}/clinicas`);
  }
  revocarConsentimiento(empresaId: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/clinicas/${empresaId}/revocar-consentimiento`, {});
  }
  solicitarConsentimiento(empresaId: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.base}/clinicas/${empresaId}/solicitar-consentimiento`, {});
  }
}
