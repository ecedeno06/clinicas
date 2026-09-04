export type Rol = 'admin' | 'doctor' | 'recepcionista';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  // Rol y activo son atributos de la relacion con la clinica activa
  // (usuarios_empresas_rol), no de la persona en si.
  rol: Rol | null;
  activo: boolean;
  avatar?: string | null;
  es_super_admin?: boolean;
  empresa_id?: string | null;
  empresa_nombre?: string | null;
  empresa_logo?: string | null;
  created_at?: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  identificacion?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  logo?: string | null;
  activo: boolean;
  created_at?: string;
}

// Clinica a la que pertenece el usuario autenticado, con su rol en ella
export interface EmpresaSeleccionable {
  empresa_id: string;
  empresa_nombre: string;
  rol: Rol;
}

// Catalogo global de usuarios (para elegir a quien asociar a una clinica)
export interface UsuarioGlobal {
  id: string;
  nombre: string;
  email: string;
}

export interface UsuarioDeEmpresa extends UsuarioGlobal {
  rol: Rol;
}

export type Sexo = 'M' | 'F' | 'Otro';

export interface ContactoEmergencia {
  nombre?: string;
  telefono?: string;
  parentesco?: string;
}

export interface Paciente {
  id: string;
  empresa_id?: string;
  nombre: string;
  identificacion?: string;
  fecha_nacimiento?: string | null;
  sexo?: Sexo | null;
  telefono?: string;
  email?: string;
  direccion?: string;
  contacto_emergencia?: ContactoEmergencia | null;
  alergias?: string;
  foto?: string | null;
  activo: boolean;
  created_at?: string;
}

export interface Especialidad {
  id: string;
  empresa_id?: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at?: string;
}

export interface Doctor {
  id: string;
  empresa_id?: string;
  usuario_id?: string | null;
  especialidad_id: string;
  especialidad_nombre?: string;
  nombre: string;
  numero_colegiado?: string;
  telefono?: string;
  email?: string;
  activo: boolean;
  created_at?: string;
}

export interface DoctorHorario {
  id: string;
  doctor_id: string;
  dia_semana: number; // 0=domingo … 6=sabado
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
}

export interface FranjaHoraria {
  hora_inicio: string;
  hora_fin: string;
}

export interface Disponibilidad {
  atiende: boolean;
  tiene_horario_configurado: boolean;
  dia_semana: number;
  bloques: FranjaHoraria[];
  ocupados: FranjaHoraria[];
  libres: FranjaHoraria[];
}

export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'cancelada' | 'no_asistio';

export interface Cita {
  id: string;
  empresa_id?: string;
  paciente_id: string;
  paciente_nombre?: string;
  paciente_edad?: number | null;
  doctor_id: string;
  doctor_nombre?: string;
  especialidad_nombre?: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoCita;
  motivo?: string;
  observaciones?: string;
  tiene_historia?: boolean;
  tiene_signos_vitales?: boolean;
  tiene_receta?: boolean;
  tiene_laboratorio?: boolean;
  estado_laboratorio?: EstadoLaboratorio | null;
  created_at?: string;
}

export interface HistoriaClinica {
  id: string;
  empresa_id?: string;
  cita_id: string;
  paciente_id: string;
  doctor_id: string;
  motivo_consulta?: string;
  diagnostico?: string;
  tratamiento?: string;
  notas?: string;
  // Presentes solo cuando viene del historial de un paciente (join con la cita)
  fecha_cita?: string;
  hora_cita?: string;
  doctor_nombre?: string;
  especialidad_nombre?: string;
  tiene_receta?: boolean;
  tiene_laboratorio?: boolean;
  estado_laboratorio?: EstadoLaboratorio | null;
  created_at?: string;
}

export interface RecetaMedicamento {
  id?: string;
  medicamento: string;
  dosis?: string | null;
  frecuencia?: string | null;
  duracion?: string | null;
  indicaciones?: string | null;
}

export interface Receta {
  id: string;
  empresa_id?: string;
  cita_id: string;
  paciente_id: string;
  doctor_id: string;
  indicaciones_generales?: string | null;
  medicamentos: RecetaMedicamento[];
  created_at?: string;
  updated_at?: string;
  // Presentes solo cuando viene del historial de un paciente (join con la cita)
  fecha_cita?: string;
  hora_cita?: string;
  doctor_nombre?: string;
}

export type EstadoLaboratorio = 'pendiente' | 'completada' | 'cancelada';

export interface ExamenLaboratorio {
  id?: string;
  nombre_examen: string;
  valor_referencia?: string | null;
  resultado?: string | null;
  unidad?: string | null;
}

export interface LaboratorioPendiente {
  orden_id: string;
  cita_id: string;
  fecha: string;
  hora_inicio: string;
  paciente_id: string;
  paciente_nombre: string;
  doctor_nombre: string;
  especialidad_nombre: string;
  created_at?: string;
}

export interface OrdenLaboratorio {
  id: string;
  empresa_id?: string;
  cita_id: string;
  paciente_id: string;
  doctor_id: string;
  estado: EstadoLaboratorio;
  observaciones?: string | null;
  examenes: ExamenLaboratorio[];
  created_at?: string;
  updated_at?: string;
  // Presentes solo cuando viene del historial de un paciente (join con la cita)
  fecha_cita?: string;
  hora_cita?: string;
  doctor_nombre?: string;
}

export interface SignosVitales {
  id: string;
  empresa_id?: string;
  cita_id: string;
  paciente_id: string;
  temperatura?: number | null;
  peso?: number | null;
  talla?: number | null;
  imc?: number | null;
  presion_sistolica?: number | null;
  presion_diastolica?: number | null;
  glucosa?: number | null;
  glucosa_glicosilada?: number | null;
  created_at?: string;
  // Presentes solo cuando viene del historial de un paciente (join con la cita)
  fecha_cita?: string;
  hora_cita?: string;
}
