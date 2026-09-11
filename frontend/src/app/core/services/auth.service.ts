import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, shareReplay, finalize, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Usuario, EmpresaSeleccionable } from '../models/models';

interface LoginResponse {
  token: string;
  refreshToken: string;
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
  refreshIntervalMinutes: number;
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

  // Evita disparar varios POST /auth/refresh en paralelo si varias
  // peticiones fallan con 401 al mismo tiempo (el refresh token rota en
  // cada uso, asi que una segunda llamada simultanea fallaria). Todas
  // comparten el mismo refresh en curso via shareReplay.
  private refrescando$: Observable<LoginResponse> | null = null;

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

  // POST /auth/refresh -- pide un access token nuevo con el refresh token
  // guardado (que a su vez rota: el backend devuelve uno nuevo). La usa
  // tanto el interceptor (reactivo, ante un 401) como SessionService
  // (proactivo, cada SESSION_REFRESH_INTERVAL_MINUTES mientras hay
  // actividad) -- por eso el resultado se comparte entre llamadas
  // simultaneas en vez de disparar un refresh por cada una.
  refrescarToken(): Observable<LoginResponse> {
    if (this.refrescando$) return this.refrescando$;

    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No hay una sesion que renovar'));
    }

    this.refrescando$ = this.http.post<LoginResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken }).pipe(
      // A diferencia de un login real, un refresh NO reinicia
      // SESSION_START_KEY -- el cronometro de "tiempo conectado" del
      // header debe seguir contando desde el login original.
      tap((res) => this.guardarTokens(res)),
      shareReplay(1),
      finalize(() => { this.refrescando$ = null; })
    );
    return this.refrescando$;
  }

  private guardarTokens(res: LoginResponse): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    this._usuario.set(res.usuario);
    this._seleccionPendiente.set(null);
  }

  private guardarSesionFinal(res: LoginResponse): void {
    this.guardarTokens(res);
    localStorage.setItem(SESSION_START_KEY, String(Date.now()));
  }

  // razon: motivo del cierre, guardado en la bitacora de "sesiones" para
  // auditoria ('logout_usuario' por defecto, 'inactividad' desde
  // SessionService). El aviso al backend es "mejor esfuerzo": si falla
  // (refresh token ya vencido, sin red) igual se cierra la sesion local.
  logout(razon: string = 'logout_usuario'): void {
    const refreshToken = this.refreshToken;
    if (refreshToken) {
      this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken, razon }).subscribe({ error: () => {} });
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
    return this.http.get<Usuario>(`${environment.apiUrl}/auth/me`).pipe(
      tap((usuario) => this.guardarUsuarioActualizado(usuario))
    );
  }

  // pista es opcional: si se omite, el backend no toca la pista ya
  // guardada; si se envia vacia o con texto, la reemplaza (validando
  // similitud con la nueva contrasena en el segundo caso). El backend
  // reemite un access token (debe_cambiar_password=false) para desbloquear
  // de inmediato si el cambio era obligatorio -- sin esperar al proximo
  // refresh proactivo.
  cambiarPassword(passwordActual: string, passwordNueva: string, pista?: string): Observable<{ mensaje: string; token?: string }> {
    const body: Record<string, string> = { password_actual: passwordActual, password_nueva: passwordNueva };
    if (pista !== undefined) body['pista'] = pista;
    return this.http.put<{ mensaje: string; token?: string }>(`${environment.apiUrl}/auth/password`, body).pipe(
      tap((res) => {
        if (res.token) this.actualizarTrasCambioPassword(res.token);
      })
    );
  }

  private actualizarTrasCambioPassword(token: string): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    const actual = raw ? JSON.parse(raw) : {};
    const usuarioActualizado = actual.usuario ? { ...actual.usuario, debe_cambiar_password: false } : actual.usuario;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...actual, token, usuario: usuarioActualizado }));
    if (usuarioActualizado) this._usuario.set(usuarioActualizado);
  }

  // Llamado por el interceptor cuando el backend rechaza una peticion con
  // requiereCambioPassword: true (el access token en uso quedo "viejo" --
  // se emitio antes de que un admin reseteara esta contrasena). Fuerza el
  // formulario obligatorio sin esperar al proximo refresh.
  marcarCambioPasswordObligatorio(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const actual = JSON.parse(raw);
    if (!actual.usuario) return;
    const usuarioActualizado = { ...actual.usuario, debe_cambiar_password: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...actual, usuario: usuarioActualizado }));
    this._usuario.set(usuarioActualizado);
  }

  // GET /auth/pista -- publico, sin autenticacion (se usa desde la
  // pantalla de login antes de iniciar sesion).
  obtenerPista(email: string): Observable<{ pista: string }> {
    return this.http.get<{ pista: string }>(`${environment.apiUrl}/auth/pista`, { params: { email } });
  }

  // POST /auth/forgot-password -- publico. El backend siempre responde el
  // mismo mensaje generico exista o no el correo (evita revelar que
  // usuarios existen).
  olvidarPassword(email: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/forgot-password`, { email });
  }

  // POST /auth/reset-password -- publico, usa el token del enlace enviado
  // por correo (valido 1 hora, un solo uso).
  restablecerPassword(token: string, passwordNueva: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/reset-password`, { token, password_nueva: passwordNueva });
  }

  sessionConfig(): Observable<SessionConfig> {
    return this.http.get<SessionConfig>(`${environment.apiUrl}/auth/session-config`);
  }

  // POST /auth/2fa/recovery -- publico. Se llama desde la pantalla que pide
  // el codigo de la app autenticadora ("perdi acceso a mi 2FA"), usando el
  // usuarioId que ya devolvio el login (contrasena ya validada). fraseReto
  // es el segundo secreto definido al activar el 2FA -- un solo intento,
  // si falla el backend responde error sin enviar correo. Si la cuenta no
  // tiene frase configurada (activada antes de este cambio), se ignora y
  // se comporta como antes.
  solicitarRecuperacion2FA(usuarioId: string, fraseReto: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/2fa/recovery`, { usuarioId, frase_reto: fraseReto });
  }

  // POST /auth/2fa/recovery/confirm -- publico, usa el token del enlace
  // enviado por correo (valido 1 hora, un solo uso). Desactiva el 2FA de
  // la cuenta -- no toca la contrasena.
  confirmarRecuperacion2FA(token: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/2fa/recovery/confirm`, { token });
  }

  // POST /auth/2fa/recovery/notificar-admin -- publico. Boton de escape
  // tras fallar la frase-reto: avisa a los super admins por correo para
  // que puedan desactivar el 2FA manualmente si el caso es legitimo.
  notificarAdmin2FA(usuarioId: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/2fa/recovery/notificar-admin`, { usuarioId });
  }

  setup2FA(): Observable<{ secret: string; qrCode: string }> {
    return this.http.post<{ secret: string; qrCode: string }>(`${environment.apiUrl}/auth/2fa/setup`, {});
  }

  // frase_reto: segundo secreto, independiente de la contrasena, exigido
  // para poder pedir la recuperacion de 2FA por correo (ver
  // solicitarRecuperacion2FA). Siempre se pide en blanco -- nunca se
  // reutiliza una frase anterior.
  enable2FA(secret: string, code: string, fraseReto: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${environment.apiUrl}/auth/2fa/enable`, { secret, code, frase_reto: fraseReto });
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

  // Refresh token opaco (rotado en cada /auth/refresh o login). Null para
  // tokens parciales (seleccion de empresa / 2FA pendiente), que no tienen.
  get refreshToken(): string | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw).refreshToken ?? null;
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
