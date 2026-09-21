import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReporteDiagnosticoFila, ReporteMedicamentoFila, ReporteLaboratorioFila, ReporteMapaCalorFila } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private base = `${environment.apiUrl}/reportes`;
  constructor(private http: HttpClient) {}

  diagnosticos(filtros: Record<string, string> = {}): Observable<ReporteDiagnosticoFila[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<ReporteDiagnosticoFila[]>(`${this.base}/diagnosticos${params ? '?' + params : ''}`);
  }

  medicamentos(filtros: Record<string, string> = {}): Observable<ReporteMedicamentoFila[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<ReporteMedicamentoFila[]>(`${this.base}/medicamentos${params ? '?' + params : ''}`);
  }

  laboratorios(filtros: Record<string, string> = {}): Observable<ReporteLaboratorioFila[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<ReporteLaboratorioFila[]>(`${this.base}/laboratorios${params ? '?' + params : ''}`);
  }

  mapaCalorDiagnosticos(filtros: Record<string, string> = {}): Observable<ReporteMapaCalorFila[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<ReporteMapaCalorFila[]>(`${this.base}/diagnosticos/mapa-calor${params ? '?' + params : ''}`);
  }
}
