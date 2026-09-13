import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { PoliticaPassword } from '../models/models';
import { porcentajeSimilitud } from './levenshtein.util';

const GEN_MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I/O -- se confunden con 1/0
const GEN_MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const GEN_NUMEROS = '23456789';
const GEN_ESPECIALES = '!@#$%^&*-_+=';

function elegirAlAzar(pool: string): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function barajar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Genera un password aleatorio que cumple con la politica activa: incluye
// al menos un caracter de cada clase exigida y respeta la longitud minima
// (con un piso de 10 para que no quede demasiado corto si la politica es
// laxa). Usado por el boton "Generar" en los formularios donde se define
// una contrasena.
export function generarPasswordSegunPolitica(politica: PoliticaPassword): string {
  const obligatorios: string[] = [];
  if (politica.requiere_mayuscula) obligatorios.push(elegirAlAzar(GEN_MAYUSCULAS));
  if (politica.requiere_minuscula) obligatorios.push(elegirAlAzar(GEN_MINUSCULAS));
  if (politica.requiere_numero) obligatorios.push(elegirAlAzar(GEN_NUMEROS));
  if (politica.requiere_caracter_especial) obligatorios.push(elegirAlAzar(GEN_ESPECIALES));

  const longitud = Math.max(politica.longitud_minima, obligatorios.length, 10);
  const poolCompleto = GEN_MAYUSCULAS + GEN_MINUSCULAS + GEN_NUMEROS + GEN_ESPECIALES;
  const resto: string[] = [];
  for (let i = obligatorios.length; i < longitud; i++) resto.push(elegirAlAzar(poolCompleto));

  return barajar([...obligatorios, ...resto]).join('');
}

// Validador de FormGroup: exige que password_nueva y password_confirmar
// coincidan. Usado en el drawer de "Cambiar contrasena" y en la pantalla
// publica de "Restablecer contrasena".
export function passwordsCoincidenValidator(group: AbstractControl): ValidationErrors | null {
  const nueva = group.get('password_nueva')?.value;
  const confirmar = group.get('password_confirmar')?.value;
  if (!nueva || !confirmar) return null;
  return nueva === confirmar ? null : { noCoincide: true };
}

// Requisitos activos de la politica, en texto plano, para mostrar debajo
// del campo de password (ej. "minimo 8 caracteres, una mayuscula...").
export function requisitosPoliticaTexto(politica: PoliticaPassword): string {
  const partes = [`minimo ${politica.longitud_minima} caracteres`];
  if (politica.requiere_mayuscula) partes.push('una mayuscula');
  if (politica.requiere_minuscula) partes.push('una minuscula');
  if (politica.requiere_numero) partes.push('un numero');
  if (politica.requiere_caracter_especial) partes.push('un caracter especial');
  return partes.join(', ');
}

// Validador de control: mismas reglas que
// backend/src/utils/politicaPassword.js#validarPassword. Vacio no es
// invalido aqui (eso es responsabilidad de un Validators.required
// aparte) para poder aplicarse tambien al campo opcional de Usuarios.
export function construirValidadorPolitica(politica: PoliticaPassword): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const v: string = control.value || '';
    if (!v) return null;
    const errores: string[] = [];
    if (v.length < politica.longitud_minima) errores.push(`al menos ${politica.longitud_minima} caracteres`);
    if (politica.requiere_mayuscula && !/[A-Z]/.test(v)) errores.push('una mayuscula');
    if (politica.requiere_minuscula && !/[a-z]/.test(v)) errores.push('una minuscula');
    if (politica.requiere_numero && !/[0-9]/.test(v)) errores.push('un numero');
    if (politica.requiere_caracter_especial && !/[^A-Za-z0-9]/.test(v)) errores.push('un caracter especial');
    return errores.length ? { politica: `Debe incluir ${errores.join(', ')}.` } : null;
  };
}

// Un item del checklist visual (ver PasswordChecklistComponent): una
// regla de la politica, si la cumple el valor actual, y evidencia (los
// caracteres puntuales que la satisfacen, o un detalle en texto libre).
export interface RequisitoPolitica {
  label: string;
  cumple: boolean;
  detalle?: string;
  ejemplos?: string[];
}

function caracteresUnicos(v: string, test: (c: string) => boolean): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const c of v) {
    if (test(c) && !vistos.has(c)) {
      vistos.add(c);
      resultado.push(c);
    }
  }
  return resultado;
}

// Desglosa la politica en items evaluados contra el valor actual del
// campo -- usado por PasswordChecklistComponent para el checklist en
// vivo (✅/❌ por regla, con los caracteres que la cumplen).
export function evaluarPoliticaPassword(password: string, politica: PoliticaPassword): RequisitoPolitica[] {
  const v = password || '';
  const items: RequisitoPolitica[] = [
    { label: `Minimo ${politica.longitud_minima} caracteres`, cumple: v.length >= politica.longitud_minima, detalle: `tiene ${v.length}` },
  ];
  if (politica.requiere_mayuscula) {
    const ejemplos = caracteresUnicos(v, (c) => /[A-Z]/.test(c));
    items.push({ label: 'Al menos 1 mayuscula', cumple: ejemplos.length > 0, ejemplos: ejemplos.length ? ejemplos : undefined });
  }
  if (politica.requiere_minuscula) {
    const ejemplos = caracteresUnicos(v, (c) => /[a-z]/.test(c));
    items.push({ label: 'Al menos 1 minuscula', cumple: ejemplos.length > 0, ejemplos: ejemplos.length ? ejemplos : undefined });
  }
  if (politica.requiere_numero) {
    const ejemplos = caracteresUnicos(v, (c) => /[0-9]/.test(c));
    items.push({ label: 'Al menos 1 numero', cumple: ejemplos.length > 0, ejemplos: ejemplos.length ? ejemplos : undefined });
  }
  if (politica.requiere_caracter_especial) {
    const ejemplos = caracteresUnicos(v, (c) => /[^A-Za-z0-9]/.test(c));
    items.push({ label: 'Al menos 1 caracter especial', cumple: ejemplos.length > 0, ejemplos: ejemplos.length ? ejemplos : undefined });
  }
  return items;
}

// Validador de FormGroup (necesita "pista" Y "password_nueva" a la vez):
// mismas reglas que backend/src/utils/politicaPassword.js#validarPista.
export function construirValidadorPista(politica: PoliticaPassword): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const pista: string = group.get('pista')?.value || '';
    if (!pista) return null;
    const password: string = group.get('password_nueva')?.value || '';
    if (pista.length < politica.pista_longitud_minima) {
      return { pista: `La pista debe tener al menos ${politica.pista_longitud_minima} caracteres.` };
    }
    if (pista.trim().toLowerCase() === password.trim().toLowerCase()) {
      return { pista: 'La pista no puede ser igual a la contrasena.' };
    }
    const similitud = porcentajeSimilitud(password, pista);
    if (similitud > politica.pista_similitud_maxima_porcentaje) {
      return { pista: `La pista es demasiado obvia (${similitud.toFixed(0)}% de similitud). Debe parecerse menos de un ${politica.pista_similitud_maxima_porcentaje}%.` };
    }
    return null;
  };
}
