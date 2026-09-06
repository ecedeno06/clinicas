import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Sucursal } from '../models/models';

@Injectable({ providedIn: 'root' })
export class SucursalesService {
  private base = `${environment.apiUrl}/sucursales`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Sucursal[]> { return this.http.get<Sucursal[]>(this.base); }
  crear(data: any): Observable<Sucursal> { return this.http.post<Sucursal>(this.base, data); }
  actualizar(id: string, data: any): Observable<Sucursal> { return this.http.put<Sucursal>(`${this.base}/${id}`, data); }
}
