import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Usuario, EmpresaSeleccionable } from '../models/models';

interface LoginResponse {
  token: string;
  usuario: Usuario;
}

interface LoginRequiereSeleccion {
  requiereSeleccionEmpresa: true;
  tokenParcial: string;
  empresas: EmpresaSeleccionable[];
}

const STORAGE_KEY = 'clinica_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _usuario = signal<Usuario | null>(this.leerUsuarioGuardado());
  usuario = computed(() => this._usuario());
  estaAutenticado = computed(() => !!this._usuario());
  esSuperAdmin = computed(() => !!this._usuario()?.es_super_admin);
  empresaActiva = computed(() => {
    const u = this._usuario();
    return u?.empresa_id
      ? { empresa_id: u.empresa_id, empresa_nombre: u.empresa_nombre, empresa_logo: u.empresa_logo }
      : null;
  });

  // Clinicas para elegir cuando el login detecta que el usuario pertenece
  // a mas de una (login queda "a medias" hasta llamar a seleccionarEmpresa).
  private _seleccionPendiente = signal<EmpresaSeleccionable[] | null>(null);
  seleccionPendiente = computed(() => this._seleccionPendiente());

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string): Observable<LoginResponse | LoginRequiereSeleccion> {
    return this.http
      .post<LoginResponse | LoginRequiereSeleccion>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          if ('requiereSeleccionEmpresa' in res) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.tokenParcial, usuario: null }));
            this._seleccionPendiente.set(res.empresas);
          } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
            this._usuario.set(res.usuario);
            this._seleccionPendiente.set(null);
          }
        })
      );
  }

  // Completa el login cuando hay mas de una clinica, o cambia la clinica
  // activa con la sesion ya iniciada.
  seleccionarEmpresa(empresaId: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/seleccionar-empresa`, { empresa_id: empresaId })
      .pipe(
        tap((res) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
          this._usuario.set(res.usuario);
          this._seleccionPendiente.set(null);
        })
      );
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._usuario.set(null);
    this._seleccionPendiente.set(null);
    this.router.navigate(['/login']);
  }

  puedeEditar(): boolean {
    const rol = this.usuario()?.rol;
    return this.esSuperAdmin() || rol === 'admin' || rol === 'recepcionista';
  }

  puedeEliminar(): boolean {
    return this.esSuperAdmin() || this.usuario()?.rol === 'admin';
  }

  actualizarAvatar(avatar: string | null): Observable<Usuario> {
    return this.http.put<Usuario>(`${environment.apiUrl}/auth/me`, { avatar }).pipe(
      tap((usuario) => this.guardarUsuarioActualizado(usuario))
    );
  }

  cambiarPassword(passwordActual: string, passwordNueva: string): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(`${environment.apiUrl}/auth/password`, {
      password_actual: passwordActual,
      password_nueva: passwordNueva,
    });
  }

  private guardarUsuarioActualizado(usuario: Usuario): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    const actual = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...actual, usuario: { ...actual.usuario, ...usuario } }));
    this._usuario.set({ ...this._usuario(), ...usuario } as Usuario);
  }

  get token(): string | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw).token ?? null;
    } catch {
      return null;
    }
  }

  private leerUsuarioGuardado(): Usuario | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw).usuario ?? null;
    } catch {
      return null;
    }
  }
}
