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

export interface Sucursal {
  id: string;
  empresa_id?: string;
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  google_maps_url?: string | null;
  zona_horaria: string;
  hora_apertura?: string | null;
  hora_cierre?: string | null;
  activo: boolean;
  created_at?: string;
}

export type EstadoCampana = 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada' | 'en_curso' | 'finalizada' | 'cancelada';
export type EstadoInvitacionDoctor = 'invitado' | 'confirmado' | 'rechazado';

export interface CampanaDoctor {
  id: string;
  doctor_id: string;
  doctor_nombre?: string;
  especialidad_nombre?: string;
  doctor_telefono?: string | null;
  doctor_acepta_whatsapp?: boolean;
  estado: EstadoInvitacionDoctor;
  notas?: string | null;
}

export interface Campana {
  id: string;
  empresa_id?: string;
  sucursal_id?: string | null;
  sucursal_nombre?: string | null;
  nombre: string;
  lugar: string;
  contacto_lugar?: string | null;
  google_maps_url?: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  descripcion?: string | null;
  estado: EstadoCampana;
  aprobado_por?: string | null;
  fecha_aprobacion?: string | null;
  motivo_rechazo?: string | null;
  creado_por?: string | null;
  doctores_invitados?: number;
  doctores_confirmados?: number;
  doctores?: CampanaDoctor[];
  log?: EventoCitaLog[];
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
  acepta_whatsapp?: boolean;
  email?: string;
  direccion?: string;
  google_maps_url?: string | null;
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

// Un doctor puede tener varias especialidades, cada una con su propio
// numero de colegiado (la junta medica certifica por especialidad).
export interface DoctorEspecialidad {
  especialidad_id: string;
  nombre?: string;
  numero_colegiado?: string | null;
}

export interface Doctor {
  id: string;
  empresa_id?: string;
  usuario_id?: string | null;
  especialidades: DoctorEspecialidad[];
  // Nombres de especialidades ya unidos ("Cardiologia, Pediatria"), para
  // mostrar en listados/mensajes sin necesitar el arreglo estructurado.
  especialidad_nombre?: string;
  nombre: string;
  telefono?: string;
  acepta_whatsapp?: boolean;
  email?: string;
  activo: boolean;
  created_at?: string;
}

export interface DoctorHorario {
  id: string;
  doctor_id: string;
  sucursal_id: string;
  sucursal_nombre?: string;
  dia_semana: number; // 0=domingo … 6=sabado
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
}

export interface FranjaHoraria {
  hora_inicio: string;
  hora_fin: string;
}

export interface DisponibilidadSucursal {
  sucursal_id: string;
  sucursal_nombre: string;
  atiende: boolean;
  bloques: FranjaHoraria[];
  libres: FranjaHoraria[];
}

export interface Disponibilidad {
  atiende: boolean;
  tiene_horario_configurado: boolean;
  dia_semana: number;
  ocupados: FranjaHoraria[];
  sucursales: DisponibilidadSucursal[];
}

export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'cancelada' | 'no_asistio' | 'reagendar';

export interface EventoCitaLog {
  fecha: string;
  usuario: string;
  nota: string;
  anterior?: string | null;
  nuevo?: string | null;
}

export interface Cita {
  id: string;
  empresa_id?: string;
  sucursal_id?: string;
  sucursal_nombre?: string;
  sucursal_direccion?: string | null;
  sucursal_google_maps_url?: string | null;
  sucursal_hora_apertura?: string | null;
  sucursal_hora_cierre?: string | null;
  campana_id?: string | null;
  campana_nombre?: string | null;
  paciente_id: string;
  paciente_nombre?: string;
  paciente_edad?: number | null;
  paciente_telefono?: string | null;
  paciente_acepta_whatsapp?: boolean;
  doctor_id: string;
  doctor_nombre?: string;
  // Especialidad elegida como filtro al agendar (dato informativo, no una
  // relacion protegida -- ver migracion 019_doctor_especialidades.sql).
  especialidad_id?: string | null;
  especialidad_nombre?: string;
  es_domicilio?: boolean;
  es_urgencia?: boolean;
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
  log?: EventoCitaLog[];
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
  hora_fin_cita?: string;
  motivo_cita?: string | null;
  estado?: EstadoCita;
  doctor_nombre?: string;
  doctor_telefono?: string | null;
  doctor_acepta_whatsapp?: boolean;
  especialidad_nombre?: string;
  sucursal_nombre?: string;
  es_domicilio?: boolean;
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
  creado_por?: string | null;
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
