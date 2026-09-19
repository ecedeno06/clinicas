import { EstadoCita, EstadoCitaMostrado } from '../../../core/models/models';

// ---------- Eje de horas ----------

export interface EjeHoras {
  inicioMin: number;
  finMin: number;
}

const EJE_DEFAULT_INICIO_MIN = 0;
const EJE_DEFAULT_FIN_MIN = 24 * 60;

export function minutosDesdeMedianoche(hora: string): number {
  const [h, m] = hora.substring(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// El eje cubre el dia completo (00:00 a 24:00) por defecto -- asi ninguna
// cita queda cortada sin importar la hora (urgencias de madrugada
// incluidas). Si se conoce el horario real de la sucursal, se usa como
// punto de partida en vez del default, pero las citas siempre lo pueden
// ensanchar mas si caen fuera de ese horario.
export function calcularEjeHoras(
  citas: { hora_inicio: string; hora_fin: string }[],
  horaAperturaSucursal?: string | null,
  horaCierreSucursal?: string | null
): EjeHoras {
  let inicioMin = horaAperturaSucursal ? minutosDesdeMedianoche(horaAperturaSucursal) : EJE_DEFAULT_INICIO_MIN;
  let finMin = horaCierreSucursal ? minutosDesdeMedianoche(horaCierreSucursal) : EJE_DEFAULT_FIN_MIN;
  for (const c of citas) {
    inicioMin = Math.min(inicioMin, minutosDesdeMedianoche(c.hora_inicio));
    finMin = Math.max(finMin, minutosDesdeMedianoche(c.hora_fin));
  }
  return { inicioMin, finMin };
}

// Marcas de hora en punto dentro del eje, para dibujar la regla vertical.
export function horasDelEje(eje: EjeHoras): number[] {
  const horas: number[] = [];
  const primeraHoraEnPunto = Math.ceil(eje.inicioMin / 60) * 60;
  for (let m = primeraHoraEnPunto; m <= eje.finMin; m += 60) horas.push(m);
  return horas;
}

export function etiquetaHora(minutos: number): string {
  // El eje llega hasta 24:00 (fin del dia) -- esa marca representa la
  // medianoche siguiente, igual que la hora 0.
  const h = Math.floor(minutos / 60) % 24;
  const periodo = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${periodo}`;
}

// top/height en px de un bloque de cita dentro de la columna de su doctor,
// segun su posicion en el eje de horas y una escala de px por minuto.
export function posicionBloque(horaInicio: string, horaFin: string, eje: EjeHoras, pxPorMinuto: number): { top: number; height: number } {
  const inicio = minutosDesdeMedianoche(horaInicio);
  const fin = Math.max(minutosDesdeMedianoche(horaFin), inicio + 1);
  return {
    top: (inicio - eje.inicioMin) * pxPorMinuto,
    height: (fin - inicio) * pxPorMinuto,
  };
}

// ---------- Solapes: cuantas columnas concurrentes hay en cada rango ----------

export interface ItemConRango {
  id: string;
  hora_inicio: string;
  hora_fin: string;
}

export interface ColumnaAsignada {
  col: number;
  totalCols: number;
}

// Mismo problema que cualquier calendario tipo Google Calendar/Booksy:
// agrupa las citas en "islas" que se solapan transitivamente entre si, y
// dentro de cada isla asigna cada cita a la primera columna donde ya no
// hay conflicto (greedy, por orden de inicio).
export function asignarColumnas<T extends ItemConRango>(items: T[]): Map<string, ColumnaAsignada> {
  const resultado = new Map<string, ColumnaAsignada>();
  const ordenados = [...items].sort((a, b) => minutosDesdeMedianoche(a.hora_inicio) - minutosDesdeMedianoche(b.hora_inicio));

  let isla: T[] = [];
  let finMaximoIsla = -1;

  const cerrarIsla = () => {
    if (isla.length === 0) return;
    const finDeColumna: number[] = [];
    const columnaDeItem = new Map<string, number>();
    for (const it of isla) {
      const inicio = minutosDesdeMedianoche(it.hora_inicio);
      const fin = minutosDesdeMedianoche(it.hora_fin);
      let colIdx = finDeColumna.findIndex((fin) => fin <= inicio);
      if (colIdx === -1) {
        colIdx = finDeColumna.length;
        finDeColumna.push(fin);
      } else {
        finDeColumna[colIdx] = fin;
      }
      columnaDeItem.set(it.id, colIdx);
    }
    const totalCols = finDeColumna.length;
    for (const it of isla) resultado.set(it.id, { col: columnaDeItem.get(it.id)!, totalCols });
  };

  for (const it of ordenados) {
    const inicio = minutosDesdeMedianoche(it.hora_inicio);
    if (isla.length === 0 || inicio < finMaximoIsla) {
      isla.push(it);
      finMaximoIsla = Math.max(finMaximoIsla, minutosDesdeMedianoche(it.hora_fin));
    } else {
      cerrarIsla();
      isla = [it];
      finMaximoIsla = minutosDesdeMedianoche(it.hora_fin);
    }
  }
  cerrarIsla();
  return resultado;
}

// ---------- Rangos de disponibilidad (para sombrear/bloquear horas fuera del horario del doctor) ----------

export interface RangoMin {
  inicio: number;
  fin: number;
}

// Redondea un clic/soltar de arrastre al paso de la grilla (ej. 30 min),
// pero sin salirse del rango libre real donde cayo -- un bloque de
// horario puede no calzar justo en esa grilla (ej. termina a las 23:59,
// dejando un unico slot libre de 23:00 a 23:30). Redondear "a ciegas"
// puede empujar el inicio fuera del rango aunque el clic haya caido
// dentro de una zona visualmente disponible (sombreada como libre).
// Devuelve null si el punto crudo cayo fuera de cualquier rango
// disponible (solo relevante cuando rangos no es null).
export function redondearInicioDisponible(minutosCrudos: number, duracionMin: number, rangos: RangoMin[] | null, pasoMin: number): number | null {
  const redondeado = Math.round(minutosCrudos / pasoMin) * pasoMin;
  if (rangos === null) return redondeado;
  const rango = rangos.find((r) => minutosCrudos >= r.inicio && minutosCrudos < r.fin);
  if (!rango) return null;
  const maxInicio = Math.max(rango.inicio, rango.fin - duracionMin);
  return Math.min(Math.max(redondeado, rango.inicio), maxInicio);
}

// El complemento de los rangos libres dentro del eje visible -- para
// dibujar el sombreado de "no atiende" detras de los bloques de cita.
export function calcularRangosBloqueados(libres: RangoMin[], ejeInicioMin: number, ejeFinMin: number): RangoMin[] {
  const ordenados = [...libres].sort((a, b) => a.inicio - b.inicio);
  const bloqueados: RangoMin[] = [];
  let cursor = ejeInicioMin;
  for (const r of ordenados) {
    const inicio = Math.max(r.inicio, ejeInicioMin);
    const fin = Math.min(r.fin, ejeFinMin);
    if (inicio > cursor) bloqueados.push({ inicio: cursor, fin: inicio });
    cursor = Math.max(cursor, fin);
  }
  if (cursor < ejeFinMin) bloqueados.push({ inicio: cursor, fin: ejeFinMin });
  return bloqueados;
}

// ---------- Color por estado (mismo mapeo que los badges de la tabla) ----------

export type ColorEstadoCita = 'slate' | 'amber' | 'green' | 'red' | 'violet' | 'orange';

export function colorEstadoCita(estado: EstadoCitaMostrado): ColorEstadoCita {
  switch (estado) {
    case 'pendiente': return 'slate';
    case 'confirmada': return 'amber';
    case 'atendida': return 'green';
    case 'cancelada':
    case 'no_asistio': return 'red';
    case 'reagendar': return 'violet';
    case 'vencida': return 'orange';
  }
}

// Estado 'pendiente' cuya hora_fin ya paso (Cita.vencida, calculado en el
// backend con la zona horaria de la sucursal) se muestra como 'vencida'
// en vez de 'pendiente' -- sin que el valor real guardado en estado
// cambie. Usar esto en vez de leer cita.estado directamente en cualquier
// lugar que muestre/filtre el estado al usuario (badges, colores,
// leyendas, filtros de texto).
export function estadoEfectivo(cita: { estado: EstadoCita; vencida?: boolean }): EstadoCitaMostrado {
  return cita.estado === 'pendiente' && cita.vencida ? 'vencida' : cita.estado;
}

// ---------- Iniciales para avatar (mismo criterio que selector-foto/inicialesPaciente) ----------

export function iniciales(nombre: string | undefined | null): string {
  return (nombre || '')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

// ---------- Grilla de mes (6 semanas x 7 dias) para el mini-calendario ----------

export interface DiaGrillaMes {
  fecha: string; // YYYY-MM-DD
  enMes: boolean;
}

export function generarGrillaMes(anio: number, mes: number): DiaGrillaMes[] {
  const primerDiaMes = new Date(anio, mes, 1);
  const offsetInicio = primerDiaMes.getDay(); // domingo = 0
  const celdas: DiaGrillaMes[] = [];
  for (let i = 0; i < 42; i++) {
    const dia = new Date(anio, mes, 1 - offsetInicio + i);
    celdas.push({ fecha: formatoISO(dia), enMes: dia.getMonth() === mes });
  }
  return celdas;
}

function formatoISO(d: Date): string {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
