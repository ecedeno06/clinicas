import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PoliticaPassword } from '../models/models';

// GET es publico (sin token) -- el login y "restablecer contrasena" son
// paginas sin autenticar y tambien necesitan la politica. PUT es solo
// super admin (lo exige el backend).
@Injectable({ providedIn: 'root' })
export class PoliticaPasswordService {
  private base = `${environment.apiUrl}/politica-password`;
  constructor(private http: HttpClient) {}

  obtener(): Observable<PoliticaPassword> { return this.http.get<PoliticaPassword>(this.base); }
  actualizar(data: Partial<PoliticaPassword>): Observable<PoliticaPassword> { return this.http.put<PoliticaPassword>(this.base, data); }
}
