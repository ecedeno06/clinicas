// Codigos de pais (E.164) para el selector de telefono. El valor guardado
// en base de datos es "codigo + numero local" pegado, sin "+" ni espacios
// (ese es el formato que necesita wa.me para abrir el chat correcto); los
// enlaces de llamada (tel:) le anteponen el "+" al mostrarlo.
// Panama va primero porque es el pais por defecto de esta clinica.
export interface PaisTelefono {
  nombre: string;
  dial: string;
}

export const PAISES_TELEFONO: PaisTelefono[] = [
  { nombre: 'Panama', dial: '507' },
  { nombre: 'Costa Rica', dial: '506' },
  { nombre: 'Nicaragua', dial: '505' },
  { nombre: 'Honduras', dial: '504' },
  { nombre: 'El Salvador', dial: '503' },
  { nombre: 'Guatemala', dial: '502' },
  { nombre: 'Belice', dial: '501' },
  { nombre: 'Mexico', dial: '52' },
  { nombre: 'Colombia', dial: '57' },
  { nombre: 'Venezuela', dial: '58' },
  { nombre: 'Ecuador', dial: '593' },
  { nombre: 'Peru', dial: '51' },
  { nombre: 'Bolivia', dial: '591' },
  { nombre: 'Chile', dial: '56' },
  { nombre: 'Argentina', dial: '54' },
  { nombre: 'Uruguay', dial: '598' },
  { nombre: 'Paraguay', dial: '595' },
  { nombre: 'Brasil', dial: '55' },
  { nombre: 'Cuba', dial: '53' },
  // EEUU, Canada, Rep. Dominicana y Puerto Rico comparten el +1 (se
  // distinguen por codigo de area, no por codigo de pais) -- una sola
  // entrada para no repetir el mismo "+1" varias veces en el selector.
  { nombre: 'Estados Unidos / Canada / Rep. Dominicana / Puerto Rico', dial: '1' },
  { nombre: 'Espana', dial: '34' },
  { nombre: 'Portugal', dial: '351' },
  { nombre: 'Francia', dial: '33' },
  { nombre: 'Italia', dial: '39' },
  { nombre: 'Alemania', dial: '49' },
  { nombre: 'Reino Unido', dial: '44' },
  { nombre: 'China', dial: '86' },
  { nombre: 'India', dial: '91' },
  { nombre: 'Japon', dial: '81' },
  { nombre: 'Corea del Sur', dial: '82' },
];

// Codigos de marcado unicos (para armar el select), ordenados de mas largo
// a mas corto -- necesario para que al leer un numero guardado, un codigo
// de 3 digitos no sea "engañado" por uno de 1-2 digitos que tambien calza
// como prefijo (ej. "1" de USA/Canada vs "58" de Venezuela).
export const DIALS_ORDENADOS: string[] = [...new Set(PAISES_TELEFONO.map((p) => p.dial))].sort((a, b) => b.length - a.length);

export const DIAL_DEFAULT = '507';
