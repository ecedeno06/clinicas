import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Empresa, UsuarioGlobal, UsuarioDeEmpresa } from '../models/models';

@Injectable({ providedIn: 'root' })
export class EmpresasService {
  private base = `${environment.apiUrl}/empresas`;
  constructor(private http: HttpClient) {}

  listar(): Observable<Empresa[]> { return this.http.get<Empresa[]>(this.base); }
  obtener(id: string): Observable<Empresa> { return this.http.get<Empresa>(`${this.base}/${id}`); }
  crear(data: any): Observable<Empresa> { return this.http.post<Empresa>(this.base, data); }
  actualizar(id: string, data: any): Observable<Empresa> { return this.http.put<Empresa>(`${this.base}/${id}`, data); }
  eliminar(id: string): Observable<void> { return this.http.delete<void>(`${this.base}/${id}`); }

  usuariosGlobales(): Observable<UsuarioGlobal[]> {
    return this.http.get<UsuarioGlobal[]>(`${this.base}/usuarios-globales`);
  }

  usuariosDeEmpresa(empresaId: string): Observable<UsuarioDeEmpresa[]> {
    return this.http.get<UsuarioDeEmpresa[]>(`${this.base}/${empresaId}/usuarios`);
  }

  asociarUsuario(empresaId: string, data: { usuario_id: string; rol?: string }): Observable<UsuarioDeEmpresa> {
    return this.http.post<UsuarioDeEmpresa>(`${this.base}/${empresaId}/usuarios`, data);
  }

  desasociarUsuario(empresaId: string, usuarioId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${empresaId}/usuarios/${usuarioId}`);
  }
}
