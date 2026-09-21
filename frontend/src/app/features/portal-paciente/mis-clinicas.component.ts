import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PortalPacienteService } from '../../core/services/portalPaciente.service';
import { ClinicaConsentimiento } from '../../core/models/models';

// "Mis Clinicas": todas las clinicas donde el paciente tiene expediente
// (pacientes_empresas), independiente de si tiene acceso a su portal
// ahi -- y con cuales esta compartiendo su historial en el ecosistema
// (ver migracion 055). Tanto activar como dejar de compartir exigen el
// mismo correo+token+OTP (aca solo se dispara el envio) -- dejar de
// compartir algo ya activo es mas sensible que nunca haberlo compartido,
// asi que tampoco es inmediato aunque el paciente ya este autenticado.
@Component({
  selector: 'app-mis-clinicas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mis-clinicas.component.html',
  styleUrl: './mis-clinicas.component.css',
})
export class MisClinicasComponent implements OnInit {
  clinicas = signal<ClinicaConsentimiento[]>([]);
  cargando = signal(true);
  error = signal<string | null>(null);
  revocando = signal<string | null>(null);
  solicitando = signal<string | null>(null);

  constructor(private srv: PortalPacienteService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.srv.misClinicas().subscribe({
      next: (data) => { this.clinicas.set(data); this.cargando.set(false); },
      error: (err) => { this.error.set(err?.error?.mensaje || 'No se pudo cargar tus clinicas'); this.cargando.set(false); },
    });
  }

  revocar(c: ClinicaConsentimiento): void {
    if (!confirm(`Te vamos a enviar un correo para confirmar que quieres dejar de compartir tu informacion de ${c.empresa_nombre} con las demas clinicas de la red. Continuar?`)) return;

    this.revocando.set(c.empresa_id);
    this.srv.solicitarRevocacion(c.empresa_id).subscribe({
      next: (res) => { this.revocando.set(null); alert(res.mensaje); },
      error: (err) => { this.revocando.set(null); alert(err?.error?.mensaje || 'No se pudo enviar el correo de confirmacion'); },
    });
  }

  solicitar(c: ClinicaConsentimiento): void {
    if (!confirm(`Te vamos a enviar un correo para confirmar que quieres compartir tu informacion de ${c.empresa_nombre} con las demas clinicas de la red. Continuar?`)) return;

    this.solicitando.set(c.empresa_id);
    this.srv.solicitarConsentimiento(c.empresa_id).subscribe({
      next: (res) => { this.solicitando.set(null); alert(res.mensaje); },
      error: (err) => { this.solicitando.set(null); alert(err?.error?.mensaje || 'No se pudo enviar el correo de consentimiento'); },
    });
  }
}
