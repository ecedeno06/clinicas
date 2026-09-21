import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConsentimientoDatosService } from '../../core/services/consentimientoDatos.service';
import { ConsentimientoDatosInfo } from '../../core/models/models';

type Respuesta = 'aceptado' | 'rechazado';

// Pantalla publica (fuera del authGuard, sin sesion): se llega aqui
// desde los botones Aceptar/Rechazar del correo de
// solicitarConsentimientoDatos(), con ?token=...&respuesta=aceptado|rechazado
// en la URL. A diferencia de confirmar-cambio-email (una sola accion),
// esta pantalla pide un click final explicito antes de ejecutar nada
// (el link del correo por si solo no hace ningun cambio) y, si la
// respuesta es "aceptado", ademas exige el codigo OTP del correo como
// segundo factor -- "rechazado" es de menor riesgo y no lo pide.
@Component({
  selector: 'app-consentimiento-datos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './consentimiento-datos.component.html',
})
export class ConsentimientoDatosComponent implements OnInit {
  cargando = signal(true);
  error = signal<string | null>(null);
  contexto = signal<ConsentimientoDatosInfo | null>(null);
  respuesta = signal<Respuesta | null>(null);

  otpValor = signal('');
  enviando = signal(false);
  errorConfirmar = signal<string | null>(null);
  resultado = signal<Respuesta | null>(null);

  // Aceptar siempre exige OTP; rechazar normalmente no, PERO un token de
  // 'revocacion' (el paciente ya autenticado pidiendo dejar de compartir
  // algo activo, ver mis-clinicas) siempre lo exige tambien.
  requiereOtp = computed(() => this.respuesta() === 'aceptado' || this.contexto()?.accion === 'revocacion');

  private token = '';

  constructor(private srv: ConsentimientoDatosService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.token = params.get('token') || '';
    const respuestaParam = params.get('respuesta');

    if (!this.token || (respuestaParam !== 'aceptado' && respuestaParam !== 'rechazado')) {
      this.cargando.set(false);
      this.error.set('El enlace no es valido. Pide que te envien uno nuevo.');
      return;
    }
    this.respuesta.set(respuestaParam);

    this.srv.obtener(this.token).subscribe({
      next: (info) => { this.contexto.set(info); this.cargando.set(false); },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.mensaje || 'No se pudo cargar la solicitud.');
      },
    });
  }

  confirmar(): void {
    const respuesta = this.respuesta();
    if (!respuesta) return;
    if (this.requiereOtp() && this.otpValor().trim().length !== 6) return;

    this.enviando.set(true);
    this.errorConfirmar.set(null);
    this.srv.responder(this.token, respuesta, this.requiereOtp() ? this.otpValor().trim() : undefined).subscribe({
      next: () => { this.enviando.set(false); this.resultado.set(respuesta); },
      error: (err) => {
        this.enviando.set(false);
        this.errorConfirmar.set(err?.error?.mensaje || 'No se pudo registrar tu respuesta.');
      },
    });
  }

  irALogin(): void {
    this.router.navigate(['/login']);
  }
}
