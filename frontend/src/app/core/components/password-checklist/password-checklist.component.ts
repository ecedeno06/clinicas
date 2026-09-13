import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PoliticaPassword } from '../../models/models';
import { evaluarPoliticaPassword, RequisitoPolitica } from '../../utils/password.util';

// Checklist en vivo de la politica de password (✅/❌ por regla, con los
// caracteres puntuales que la cumplen) -- usado en los 3 lugares donde
// un usuario define su propia contrasena (cambiar, restablecer, crear/
// editar usuario). El validador que bloquea el submit sigue siendo
// construirValidadorPolitica(); esto es solo el feedback visual.
@Component({
  selector: 'app-password-checklist',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './password-checklist.component.html',
  styleUrl: './password-checklist.component.css',
})
export class PasswordChecklistComponent {
  @Input() password: string | null | undefined = '';
  @Input() politica: PoliticaPassword | null = null;

  items(): RequisitoPolitica[] {
    if (!this.politica) return [];
    return evaluarPoliticaPassword(this.password || '', this.politica);
  }
}
