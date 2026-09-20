import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReporteDiagnosticoFila } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private base = `${environment.apiUrl}/reportes`;
  constructor(private http: HttpClient) {}

  diagnosticos(filtros: Record<string, string> = {}): Observable<ReporteDiagnosticoFila[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<ReporteDiagnosticoFila[]>(`${this.base}/diagnosticos${params ? '?' + params : ''}`);
  }
}
