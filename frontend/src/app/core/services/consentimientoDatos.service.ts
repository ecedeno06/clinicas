import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConsentimientoDatosInfo } from '../models/models';

// Endpoints 100% publicos (se llega por un link de correo sin sesion) --
// ver consentimientoDatos.controller.js.
@Injectable({ providedIn: 'root' })
export class ConsentimientoDatosService {
  private base = `${environment.apiUrl}/consentimiento-datos`;
  constructor(private http: HttpClient) {}

  obtener(token: string): Observable<ConsentimientoDatosInfo> {
    return this.http.get<ConsentimientoDatosInfo>(`${this.base}/${token}`);
  }

  responder(token: string, respuesta: 'aceptado' | 'rechazado', otp?: string): Observable<{ respuesta: string; paciente_nombre: string }> {
    return this.http.post<{ respuesta: string; paciente_nombre: string }>(`${this.base}/responder`, { token, respuesta, otp });
  }
}
