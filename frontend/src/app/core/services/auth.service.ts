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

// El login se detiene aqui cuando el usuario tiene 2FA activo -- el
// frontend debe pedir el codigo y llamar a verificar2FA().
interface LoginRequiere2FA {
  requiere2FA: true;
  usuarioId: string;
}

export interface SessionConfig {
  inactivityLimitMinutes: number;
  warningBeforeMinutes: number;
  passwordHintMaxSimilarity: number;
}

const STORAGE_KEY = 'clinica_auth';
// Marca de tiempo (Date.now()) de cuando se emitio el JWT final -- usada
// solo para el cronometro de "tiempo conectado" del header, no tiene
// relacion con la expiracion real del token.
const SESSION_START_KEY = 'clinica_session_start';

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

  login(email: string, password: string): Observable<LoginResponse | LoginRequiereSeleccion | LoginRequiere2FA> {
    return this.http
      .post<LoginResponse | LoginRequiereSeleccion | LoginRequiere2FA>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          if ('requiere2FA' in res) return;
          if ('requiereSeleccionEmpresa' in res) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.tokenParcial, usuario: null }));
            this._seleccionPendiente.set(res.empresas);
          } else {
            this.guardarSesionFinal(res);
          }
        })
      );
  }

  // POST /auth/2fa/verify-login -- continua el login tras el codigo TOTP.
  verificar2FA(usuarioId: string, code: string): Observable<LoginResponse | LoginRequiereSeleccion> {
    return this.http
      .post<LoginResponse | LoginRequiereSeleccion>(`${environment.apiUrl}/auth/2fa/verify-login`, { usuarioId, code })
      .pipe(
        tap((res) => {
          if ('requiereSeleccionEmpresa' in res) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.tokenParcial, usuario: null }));
            this._seleccionPendiente.set(res.empresas);
          } else {
            this.guardarSesionFinal(res);
          }
        })
      );
  }

  // Completa el login cuando hay mas de una clinica, o cambia la clinica
  // activa con la sesion ya iniciada.
  seleccionarEmpresa(empresaId: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/seleccionar-empresa`, { empresa_id: empresaId })
      .pipe(tap((res) => this.guardarSesionFinal(res)));
  }

  private guardarSesionFinal(res: LoginResponse): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    localStorage.setItem(SESSION_START_KEY, String(Date.now()));
    this._usuario.set(res.usuario);
    this._seleccionPendiente.set(null);
  }

  // razon: motivo del cierre, guardado en la bitacora de "sesiones" para
  // auditoria ('logout_usuario' por defecto, 'inactividad' desde
  // SessionService). El aviso al backend es "mejor esfuerzo": si falla
  // (token ya vencido, sin red) igual se cierra la sesion localmente.
  logout(razon: string = 'logout_usuario'): void {
    if (this.token) {
      this.http.post(`${environment.apiUrl}/auth/logout`, { razon }).subscribe({ error: () => {} });
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_START_KEY);
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

  obtenerMe(): Observable<Usuario> {
    return this.http.get<Usuario>(`${environment.apiUrl}/auth/me`);
  }

  // pista es opcional: si se omite, el backend no toca la pista ya
  // guardada; si se envia vacia o con texto, la reemplaza (validando
  // similitud con la nueva contrasena en el segundo caso).
  cambiarPassword(passwordActual: string, passwordNueva: string, pista?: string): Observable<{ mensaje: string }> {
    const body: Record<string, string> = { password_actual: passwordActual, password_nueva: passwordNueva };
    if (pista !== undefined) body['pista'] = pista;
    return this.http.put<{ mensaje: string }>(`${environment.apiUrl}/auth/password`, body);
  }

  // GET /auth/pista -- publico, sin autenticacion (se usa desde la
  // pantalla de login antes de iniciar sesion).
  obtenerPista(email: string): Observable<{ pista: string }> {
    return this.http.get<{ pista: string }>(`${environment.apiUrl}/auth/pista`, { params: { email } });
  }

  sessionConfig(): Observable<SessionConfig> {
    return this.http.get<SessionConfig>(`${environment.apiUrl}/auth/session-config`);
  }

  setup2FA(): Observable<{ secret: string; qrCode: string }> {
    return this.http.post<{ secret: string; qrCode: string }>(`${environment.apiUrl}/auth/2fa/setup`, {});
  }

  enable2FA(secret: string, code: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/2fa/enable`, { secret, code });
  }

  disable2FA(code: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/2fa/disable`, { code });
  }

  private guardarUsuarioActualizado(usuario: Usuario): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    const actual = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...actual, usuario: { ...actual.usuario, ...usuario } }));
    this._usuario.set({ ...this._usuario(), ...usuario } as Usuario);
  }

  // Refresca nombre/logo de la clinica activa en la sesion actual cuando se
  // edita la empresa desde el panel de administracion (esos datos quedan
  // cacheados en el usuario desde el login y no se actualizan solos).
  actualizarEmpresaActiva(empresaId: string, nombre: string, logo: string | null): void {
    if (this._usuario()?.empresa_id !== empresaId) return;
    this.guardarUsuarioActualizado({ empresa_nombre: nombre, empresa_logo: logo } as Usuario);
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

  // Timestamp (ms epoch) de cuando se emitio el JWT final, para el
  // cronometro de "tiempo conectado" del header. Null si no hay sesion.
  get sessionStart(): number | null {
    const raw = localStorage.getItem(SESSION_START_KEY);
    return raw ? Number(raw) : null;
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
