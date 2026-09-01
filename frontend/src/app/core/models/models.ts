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

export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'cancelada' | 'no_asistio';

export interface Cita {
  id: string;
  empresa_id?: string;
  paciente_id: string;
  paciente_nombre?: string;
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
  doctor_nombre?: string;
  especialidad_nombre?: string;
  created_at?: string;
}
