import { DireccionPaciente, Paciente } from '../models/models';

// La principal si esta marcada explicitamente; si no hay ninguna marcada
// pero existe al menos una direccion, se asume esa (evita obligar a
// marcar "principal" cuando el paciente solo tiene una).
export function direccionPrincipal(p: Paciente | null | undefined): DireccionPaciente | null {
  return p?.direcciones?.find((d) => d.es_principal) ?? p?.direcciones?.[0] ?? null;
}
