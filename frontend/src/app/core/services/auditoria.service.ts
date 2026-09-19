import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SesionAuditoria } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private base = `${environment.apiUrl}/auditoria`;
  constructor(private http: HttpClient) {}

  listarSesiones(filtros: Record<string, string> = {}): Observable<SesionAuditoria[]> {
    const params = new URLSearchParams(filtros).toString();
    return this.http.get<SesionAuditoria[]>(`${this.base}/sesiones${params ? '?' + params : ''}`);
  }

  cerrarSesiones(ids: string[]): Observable<{ cerradas: number }> {
    return this.http.post<{ cerradas: number }>(`${this.base}/sesiones/cerrar`, { ids });
  }
}
