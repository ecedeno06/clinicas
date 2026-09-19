export type Rol = 'admin' | 'doctor' | 'recepcionista' | 'paciente';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  // Rol y activo son atributos de la relacion con la clinica activa
  // (usuarios_empresas_rol), no de la persona en si.
  rol: Rol | null;
  activo: boolean;
  telefono?: string | null;
  acepta_whatsapp?: boolean;
  avatar?: string | null;
  es_super_admin?: boolean;
  two_factor_enabled?: boolean;
  // Fuerza el formulario de cambio de contrasena al iniciar sesion (lo
  // activa un admin al crear el usuario o resetearle la contrasena).
  debe_cambiar_password?: boolean;
  empresa_id?: string | null;
  empresa_nombre?: string | null;
  empresa_logo?: string | null;
  created_at?: string;
  // Nombre de la base de datos a la que esta conectado el backend (ej.
  // "clinica_medica" en desarrollo, "neondb" en Neon) -- se muestra en el
  // header para evitar confundir en que entorno se esta trabajando.
  base_datos?: string;
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
  acepta_whatsapp?: boolean;
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

// Clinica a la que pertenece el usuario autenticado, con su rol en ella.
// empresa_id/empresa_nombre son null solo para la opcion agregada de
// paciente (rol 'paciente' sin clinica activa, ver auth.service.ts).
export interface EmpresaSeleccionable {
  empresa_id: string | null;
  empresa_nombre: string | null;
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
export type EstadoCivil = 'soltero' | 'casado' | 'unido' | 'viudo';
export type EstadoLaboral = 'trabaja' | 'jubilado' | 'pensionado' | 'no_aplica';
export type TipoTrabajo = 'privada' | 'gobierno' | 'independiente';

// Familiar del paciente (reemplaza el antiguo campo unico "contacto de
// emergencia"). La lista se maneja en memoria en el formulario y se
// manda completa al guardar el paciente -- ver reemplazarFamiliares en
// pacientes.controller.js.
export interface FamiliarPaciente {
  id?: string;
  nombre: string;
  telefono?: string | null;
  parentesco?: string | null;
  acepta_whatsapp?: boolean;
}

// Antecedente patologico que presenta el paciente, tomado del catalogo
// global (AntecedentePatologico). categoria_nombre/antecedente_nombre
// vienen por join solo para mostrar -- no se editan aqui directamente,
// se editan en el catalogo (pantalla de super admin).
export interface PacienteAntecedente {
  id?: string;
  antecedente_id: string;
  antecedente_nombre?: string;
  categoria_nombre?: string;
  fecha_inicio?: string | null;
  tratamiento?: string | null;
  observacion?: string | null;
  // Quien lo creo -- solo esa persona puede editarlo/eliminarlo (null =
  // autor desconocido, sin restriccion). Mismo criterio que Receta.creado_por.
  creado_por?: string | null;
  creado_por_nombre?: string | null;
  // El doctor que diagnostico el antecedente -- distinto de creado_por
  // (quien lo registro en el sistema puede ser una recepcionista, u otro
  // usuario). Mismo criterio que Receta.doctor_id.
  doctor_id?: string | null;
  doctor_nombre?: string | null;
}

// Un paciente puede tener varias direcciones (casa, trabajo, etc.), una
// marcada como principal -- esa es la que usan Google Maps/Waze/WhatsApp
// al doctor en Citas/historial. Ver DISENO-GEOCODIFICACION-INVERSA.md.
export interface DireccionPaciente {
  id?: string;
  direccion?: string | null;
  google_maps_url?: string | null;
  pais?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  // Google no provee este nivel para Panama -- se escribe a mano casi
  // siempre (ver diseno, seccion 3).
  corregimiento?: string | null;
  comparte_ubicacion?: boolean;
  es_principal?: boolean;
}

export interface Paciente {
  id: string;
  empresa_id?: string;
  nombre: string;
  identificacion?: string;
  fecha_nacimiento?: string | null;
  sexo?: Sexo | null;
  estado_civil?: EstadoCivil | null;
  estado_laboral?: EstadoLaboral | null;
  // Solo aplican si estado_laboral es 'trabaja' (el backend los limpia si
  // deja de serlo).
  tipo_trabajo?: TipoTrabajo | null;
  lugar_trabajo?: string | null;
  telefono?: string;
  acepta_whatsapp?: boolean;
  email?: string;
  direcciones?: DireccionPaciente[];
  familiares?: FamiliarPaciente[];
  antecedentes?: PacienteAntecedente[];
  alergias?: string;
  foto?: string | null;
  // Cuenta con la que este paciente puede loguearse (rol 'paciente'), si
  // fue invitado desde ALGUNA clinica -- ver PacientesService.invitar().
  // OJO: es global (una sola cuenta para toda la red), no implica que
  // tenga acceso de paciente en ESTA clinica en particular -- para eso
  // usar tiene_acceso_esta_clinica.
  usuario_id?: string | null;
  // true solo si YA tiene rol 'paciente' asignado en la clinica activa
  // (puede tener usuario_id seteado por acceso en otra clinica sin tener
  // esto en true) -- lo que decide si el boton "Invitar acceso" del
  // listado de Pacientes esta habilitado o muestra "Acceso activo".
  tiene_acceso_esta_clinica?: boolean;
  activo: boolean;
  created_at?: string;
}

// Catalogo hibrido (mismo patron que CategoriaExamenLaboratorio):
// empresa_id nulo = global, compartido por toda la red (solo un doctor
// puede tener asignadas especialidades globales, ver Doctor); empresa_id
// no nulo = propia de esa clinica (solo utilizable por ella en
// Citas/Campanas).
export interface Especialidad {
  id: string;
  empresa_id?: string | null;
  empresa_nombre?: string | null;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at?: string;
}

// Catalogo global de antecedentes patologicos (categorias + detalle),
// compartido por todas las clinicas -- solo lectura salvo para un super
// admin. Ver backend/database/migrations/036_catalogo_antecedentes.sql.
export interface CategoriaAntecedente {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface AntecedentePatologico {
  id: string;
  categoria_id: string;
  categoria_nombre?: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

// Un doctor puede tener varias especialidades, cada una con su propio
// numero de colegiado (la junta medica certifica por especialidad).
export interface DoctorEspecialidad {
  especialidad_id: string;
  nombre?: string;
  numero_colegiado?: string | null;
}

// Doctor es GLOBAL (mismo patron que Paciente): un mismo medico puede
// atender en varias clinicas de la red sin duplicar su registro.
// identificacion (cedula) es la llave para buscarlo en toda la red al
// agregarlo a una clinica nueva -- ver Paciente.identificacion.
export interface Doctor {
  id: string;
  usuario_id?: string | null;
  identificacion?: string | null;
  especialidades: DoctorEspecialidad[];
  // Nombres de especialidades ya unidos ("Cardiologia, Pediatria"), para
  // mostrar en listados/mensajes sin necesitar el arreglo estructurado.
  especialidad_nombre?: string;
  nombre: string;
  telefono?: string;
  acepta_whatsapp?: boolean;
  email?: string;
  foto?: string | null;
  // true solo si YA tiene rol 'doctor' asignado en la clinica activa
  // (puede tener usuario_id seteado por acceso en otra clinica sin tener
  // esto en true) -- lo que decide si el boton "Invitar acceso" del
  // listado de Doctores esta habilitado o muestra "Acceso activo".
  tiene_acceso_esta_clinica?: boolean;
  activo: boolean;
  created_at?: string;
}

// Respuesta de GET /doctores/mi-perfil (portal del doctor): sus datos +
// en que clinicas tiene rol 'doctor', sin importar cual este activa en la
// sesion ahora mismo (ver DoctoresService.miPerfil()).
export interface PerfilDoctor {
  doctor: Doctor;
  empresas: { empresa_id: string; empresa_nombre: string; activo: boolean }[];
}

export interface DoctorHorario {
  id: string;
  doctor_id: string;
  sucursal_id: string;
  sucursal_nombre?: string;
  // De que clinica es esta sucursal -- un doctor puede atender en varias.
  // El frontend lo usa para pintar el bloque (verde = clinica activa de
  // la sesion, ambar = otra clinica) y para decidir si el boton de
  // deshabilitar/eliminar esta habilitado para un admin normal.
  sucursal_empresa_id?: string;
  // Solo para mostrar en la pastilla -- un admin viendo un bloque ambar
  // necesita saber de que clinica es, no solo que "no es la mia".
  empresa_nombre?: string;
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
  // true si el doctor tiene horario cargado en OTRA clinica (no esta) --
  // distingue "nunca configuro horario en ningun lado" (sigue libre aca)
  // de "tiene horario, pero no aca" (se bloquea aca).
  tiene_horario_en_otra_clinica: boolean;
  dia_semana: number;
  ocupados: FranjaHoraria[];
  sucursales: DisponibilidadSucursal[];
}

export type EstadoCita = 'pendiente' | 'confirmada' | 'atendida' | 'cancelada' | 'no_asistio' | 'reagendar';
// 'vencida' NO es un valor real de la columna estado (la cita sigue
// 'pendiente' en la base de datos): es un estado derivado, solo para
// mostrar, que calendario.util.ts#estadoEfectivo() calcula a partir de
// Cita.vencida. Nunca se envia al backend.
export type EstadoCitaMostrado = EstadoCita | 'vencida';

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
  sucursal_telefono?: string | null;
  sucursal_acepta_whatsapp?: boolean | null;
  sucursal_hora_apertura?: string | null;
  sucursal_hora_cierre?: string | null;
  campana_id?: string | null;
  campana_nombre?: string | null;
  paciente_id: string;
  paciente_nombre?: string;
  paciente_edad?: number | null;
  paciente_telefono?: string | null;
  paciente_acepta_whatsapp?: boolean;
  paciente_foto?: string | null;
  paciente_identificacion?: string | null;
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
  // Calculado por el backend: true si estado='pendiente' y hora_fin ya
  // paso segun la zona horaria de la sucursal. Ver calendario.util.ts#estadoEfectivo().
  vencida?: boolean;
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
  // Solo viene del portal del paciente (agrega citas de varias clinicas
  // a la vez) -- el historial de staff siempre esta dentro de una sola
  // clinica, no lo necesita.
  empresa_nombre?: string;
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
  vencida?: boolean;
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

// Catalogo hibrido de examenes de laboratorio (categorias + detalle):
// empresa_id nulo = global, compartido por todas las clinicas (solo
// editable por un super admin); empresa_id no nulo = agregado por esa
// clinica, visible y editable solo por ella (ademas del global). Ver
// backend/database/migrations/040_catalogo_examenes_laboratorio.sql y
// 042_examenes_laboratorio_por_clinica.sql.
export interface CategoriaExamenLaboratorio {
  id: string;
  nombre: string;
  empresa_id?: string | null;
  empresa_nombre?: string | null;
  orden: number;
  activo: boolean;
}

export interface ExamenLaboratorioCatalogo {
  id: string;
  categoria_id: string;
  categoria_nombre?: string;
  nombre: string;
  empresa_id?: string | null;
  empresa_nombre?: string | null;
  valor_referencia?: string | null;
  unidad?: string | null;
  orden: number;
  activo: boolean;
}

export type EstadoLaboratorio = 'pendiente' | 'completada' | 'cancelada';

export interface ExamenLaboratorio {
  id?: string;
  examen_id?: string | null;
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

// Tabla singleton (una sola fila): editable solo por super admin desde
// /politica-password. GET es publico -- el login y "restablecer
// contrasena" (paginas sin autenticar) tambien la necesitan.
export interface PoliticaPassword {
  id?: number;
  longitud_minima: number;
  requiere_mayuscula: boolean;
  requiere_minuscula: boolean;
  requiere_numero: boolean;
  requiere_caracter_especial: boolean;
  pista_longitud_minima: number;
  pista_similitud_maxima_porcentaje: number;
  updated_at?: string;
}
