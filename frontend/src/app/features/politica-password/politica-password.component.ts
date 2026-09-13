import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PoliticaPasswordService } from '../../core/services/politicaPassword.service';

@Component({
  selector: 'app-politica-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './politica-password.component.html',
  styleUrl: './politica-password.component.css',
})
export class PoliticaPasswordComponent implements OnInit {
  cargando = signal(false);
  guardando = signal(false);

  form = this.fb.group({
    longitud_minima: [6, [Validators.required, Validators.min(1)]],
    requiere_mayuscula: [false],
    requiere_minuscula: [false],
    requiere_numero: [false],
    requiere_caracter_especial: [false],
    pista_longitud_minima: [4, [Validators.required, Validators.min(1)]],
    pista_similitud_maxima_porcentaje: [70, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  constructor(private fb: FormBuilder, private srv: PoliticaPasswordService) {}

  ngOnInit(): void {
    this.cargando.set(true);
    this.srv.obtener().subscribe({
      next: (p) => {
        this.form.reset({
          longitud_minima: p.longitud_minima,
          requiere_mayuscula: p.requiere_mayuscula,
          requiere_minuscula: p.requiere_minuscula,
          requiere_numero: p.requiere_numero,
          requiere_caracter_especial: p.requiere_caracter_especial,
          pista_longitud_minima: p.pista_longitud_minima,
          pista_similitud_maxima_porcentaje: p.pista_similitud_maxima_porcentaje,
        });
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  guardar(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);
    this.srv.actualizar(this.form.getRawValue() as any).subscribe({
      next: () => {
        this.guardando.set(false);
        alert('Politica de password actualizada correctamente.');
      },
      error: (err) => {
        this.guardando.set(false);
        alert(err?.error?.mensaje || 'No se pudo guardar la politica de password');
      },
    });
  }
}
