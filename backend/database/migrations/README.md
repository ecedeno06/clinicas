# Migraciones pendientes / aplicadas por entorno

Registro de cambios de base de datos hechos despues del esquema inicial
(`../schema.sql`), para saber que falta correr en cada entorno. `schema.sql`
ya esta actualizado con todos los cambios (sirve para instalaciones nuevas
desde cero); estos archivos son para aplicar el delta sobre bases que ya
existian antes del cambio.

Como aplicar un archivo pendiente contra un entorno (ejemplo con Docker,
sin necesidad de instalar psql localmente):

```bash
docker run --rm -i -e PGPASSWORD='<password>' postgres:16 \
  psql -h <host> -U <usuario> -d <base> < database/migrations/00X_nombre.sql
```

## Estado por entorno

| Migracion | Descripcion | `.19` (dev) | Neon (produccion) |
|---|---|---|---|
| `001_signos_vitales.sql` | Tabla `signos_vitales` (temperatura, peso, talla/IMC, presion arterial, glucosa) ligada a `cita_id` | ✅ Aplicada 2026-09-01 | ✅ Aplicada 2026-09-02 |
| `002_glucosa_glicosilada.sql` | Columna `glucosa_glicosilada` (HbA1c, %) en `signos_vitales` | ✅ Aplicada 2026-09-01 | ✅ Aplicada 2026-09-02 |
| `003_recetas.sql` | Tablas `recetas` (cabecera) y `receta_medicamentos` (lineas), ligadas a `cita_id` | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `004_recetas_multiples.sql` | Quita el `unique` de `recetas.cita_id`: una cita puede tener varias recetas | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `005_pacientes_globales.sql` | `pacientes` pasa a ser global (multi-clinica), nueva tabla `pacientes_empresas` | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `006_horarios_doctores.sql` | Nueva tabla `doctor_horarios` (patron semanal de dias/horas por doctor, para calcular disponibilidad al agendar) | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `007_laboratorio.sql` | Nuevas tablas `ordenes_laboratorio` (cabecera) y `orden_laboratorio_examenes` (lineas) | ✅ Aplicada 2026-09-03 | ✅ Aplicada 2026-09-03 (certificado en desarrollo, promovido) |
| `008_paciente_foto.sql` | Columna `foto` (base64) en `pacientes` | ✅ Aplicada 2026-09-04 | ✅ Aplicada 2026-09-04 |
| `009_citas_reagendar.sql` | Agrega `'reagendar'` a los valores permitidos de `citas.estado` | ✅ Aplicada 2026-09-05 | ✅ Aplicada 2026-09-05 |
| `010_citas_log.sql` | Columna `log` (jsonb array de `{fecha, usuario, nota}`) en `citas`: bitacora de auditoria | ✅ Aplicada 2026-09-05 | ✅ Aplicada 2026-09-05 |
| `011_recetas_creado_por.sql` | Columna `creado_por` en `recetas`: solo el autor puede editar/eliminar | ✅ Aplicada 2026-09-05 | ✅ Aplicada 2026-09-05 |
| `012_sucursales.sql` | Tabla `sucursales` + `sucursal_id` en `doctor_horarios`/`citas`, con backfill automatico ("Sede Principal" por empresa) | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `013_sucursales_telefono.sql` | Columna `telefono` en `sucursales` | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `014_sucursales_google_maps.sql` | Columna `google_maps_url` en `sucursales` | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `015_pacientes_acepta_whatsapp.sql` | Columna `acepta_whatsapp` en `pacientes` | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `016_campanas.sql` | Tablas `campanas` y `campana_doctores` (Fase 1 de campañas médicas) + `citas.campana_id` | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `017_campanas_google_maps.sql` | Columna `google_maps_url` en `campanas` | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `018_doctores_acepta_whatsapp.sql` | Columna `acepta_whatsapp` en `doctores` | ✅ Aplicada 2026-09-06 | ✅ Aplicada 2026-09-06 |
| `019_doctor_especialidades.sql` | Tabla nueva `doctor_especialidades` (un doctor puede tener varias especialidades, cada una con su numero de colegiado); elimina `doctores.especialidad_id`/`numero_colegiado`; agrega `citas.especialidad_id` (sin FK, dato informativo) | ✅ Aplicada 2026-09-07 | ✅ Aplicada 2026-09-07 |
| `020_pacientes_google_maps.sql` | Columna `google_maps_url` en `pacientes` (visitas a domicilio) | ✅ Aplicada 2026-09-07 | ✅ Aplicada 2026-09-07 |
| `021_citas_domicilio.sql` | Columna `es_domicilio` en `citas` (marca visita a domicilio del paciente) | ✅ Aplicada 2026-09-07 | ✅ Aplicada 2026-09-07 |
| `022_citas_urgencia.sql` | Columna `es_urgencia` en `citas` (permite asignar cualquier doctor sin validar su horario configurado ni choques de campaña) | ✅ Aplicada 2026-09-07 | ✅ Aplicada 2026-09-07 |
| `023_pacientes_comparte_ubicacion.sql` | Columna `comparte_ubicacion` en `pacientes` (consentimiento para mostrar los botones de ubicacion) | ✅ Aplicada 2026-09-08 | ✅ Aplicada 2026-09-08 |
| `024_usuarios_telefono.sql` | Columnas `telefono` y `acepta_whatsapp` en `usuarios` | ✅ Aplicada 2026-09-08 | ✅ Aplicada 2026-09-08 |
| `025_direcciones_paciente.sql` | Tabla `direcciones_paciente` (un paciente puede tener varias direcciones, una principal; incluye pais/provincia/distrito/corregimiento y comparte_ubicacion por direccion); elimina `pacientes.direccion`/`google_maps_url`/`comparte_ubicacion` | ✅ Aplicada 2026-09-08 | ✅ Aplicada 2026-09-08 |
| `026_sesiones.sql` | Tabla nueva `sesiones` (registro en BD de sesiones de usuario -- clinica/sucursal, token, expiracion, razon de salida). Bitacora de auditoria: el login/logout/middleware (JWT sin consulta a BD) no la usa para autenticar | ✅ Aplicada 2026-09-08 | ✅ Aplicada 2026-09-08 |
| `027_auth_2fa_pista.sql` | Columnas `pista` (hint de contrasena), `two_factor_enabled`/`two_factor_secret` (2FA por app autenticadora, TOTP) en `usuarios` | ✅ Aplicada 2026-09-08 | ✅ Aplicada 2026-09-08 |
| `028_usuarios_debe_cambiar_password.sql` | Columna `debe_cambiar_password` en `usuarios` (fuerza cambio de contrasena en el siguiente login al crear un usuario o resetearle la contrasena desde Usuarios) | ✅ Aplicada 2026-09-09 | ✅ Aplicada 2026-09-09 |
| `029_password_reset_tokens.sql` | Tabla nueva `password_reset_tokens` (recuperar contrasena por correo, self-service: token de un solo uso, 1 hora de vigencia) | ✅ Aplicada 2026-09-09 | ✅ Aplicada 2026-09-09 |
| `030_pacientes_email_no_unico.sql` | Quita la restriccion de unicidad de `pacientes.email` (varios pacientes pueden compartir un email, ej. un familiar/cuidador) | ✅ Aplicada 2026-09-09 | ✅ Aplicada 2026-09-09 |
| `031_dos_factor_recovery_tokens.sql` | Tabla nueva `dos_factor_recovery_tokens`: recuperar acceso por correo cuando se pierde el dispositivo del 2FA (desactiva el 2FA de la cuenta) | ✅ Aplicada 2026-09-10 | ✅ Aplicada 2026-09-10 |
| `032_telefonos_con_codigo_pais.sql` | `telefono` pasa a incluir codigo de pais pegado (formato que necesita wa.me); backfill agrega "507" a los numeros locales existentes | ✅ Aplicada 2026-09-10 | ✅ Aplicada 2026-09-10 |
| `033_two_factor_challenge.sql` | Columna `two_factor_challenge_hash` en `usuarios`: frase-reto (bcrypt) que se pide antes de enviar el correo de recuperacion de 2FA | ✅ Aplicada 2026-09-10 | ✅ Aplicada 2026-09-10 |
| `034_pacientes_estado_civil_laboral.sql` | Columnas `estado_civil`/`estado_laboral`/`tipo_trabajo`/`lugar_trabajo` en `pacientes` | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `035_familiares_paciente.sql` | Tabla nueva `familiares_paciente` (reemplaza el campo unico "contacto de emergencia" por una lista) | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `036_catalogo_antecedentes.sql` | Tablas nuevas `categorias_antecedentes`/`antecedentes_patologicos`: catalogo global de antecedentes patologicos, solo editable por super admin | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `037_paciente_antecedente.sql` | Tabla nueva `paciente_antecedente`: antecedentes que presenta cada paciente, tomados del catalogo global (migracion 036) | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `038_paciente_antecedente_autor.sql` | Columna `creado_por` en `paciente_antecedente`: solo el autor puede editar/eliminar (mismo criterio que `recetas.creado_por`) | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `039_paciente_antecedente_doctor.sql` | Columna `doctor_id` en `paciente_antecedente`: doctor que diagnostico el antecedente (distinto de `creado_por`) | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `040_catalogo_examenes_laboratorio.sql` | Tablas nuevas `categorias_examenes_laboratorio`/`examenes_laboratorio_catalogo`: catalogo global de examenes, mismo patron que antecedentes (036) | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `041_orden_laboratorio_examen_catalogo.sql` | Columna `examen_id` en `orden_laboratorio_examenes`: enlaza cada linea al catalogo global (040) cuando aplica | ✅ Aplicada 2026-09-11 | ✅ Aplicada 2026-09-11 |
| `042_examenes_laboratorio_por_clinica.sql` | Columna `empresa_id` en `categorias_examenes_laboratorio`/`examenes_laboratorio_catalogo`: cada clinica puede agregar sus propios examenes ademas del catalogo global | ✅ Aplicada 2026-09-12 | ✅ Aplicada 2026-09-12 |
| `043_doctores_globales.sql` | `doctores` pasa a ser global (multi-clinica, mismo patron que pacientes): nueva tabla `doctores_empresas`, columna `identificacion` como llave de red | ✅ Aplicada 2026-09-12 | ✅ Aplicada 2026-09-12 |
| `044_especialidades_hibridas.sql` | `especialidades` pasa a catalogo hibrido (global + por-clinica), mismo patron que examenes de laboratorio (042) | ✅ Aplicada 2026-09-12 | ✅ Aplicada 2026-09-12 |
| `045_seed_especialidades_globales.sql` | Seed del catalogo global de especialidades medicas mas comunes (idempotente via `on conflict`) | ✅ Aplicada 2026-09-12 | ✅ Aplicada 2026-09-12 |
| `046_especialidades_empresas.sql` | Tabla nueva `especialidades_empresas`: que especialidades globales tiene activadas cada clinica | ✅ Aplicada 2026-09-12 | ✅ Aplicada 2026-09-12 |
| `047_pacientes_usuario_paciente.sql` | Columna `usuario_id` en `pacientes` + rol `'paciente'`: permite invitar a un paciente a su propio portal de solo lectura | ✅ Aplicada 2026-09-13 | ✅ Aplicada 2026-09-13 |
| `048_sesiones_rol_paciente.sql` | Corrige el check de `sesiones.rol` (independiente del de `usuarios_empresas_rol`) para admitir el rol `'paciente'` agregado en 047 | ✅ Aplicada 2026-09-13 | ✅ Aplicada 2026-09-13 |
| `049_multi_rol_por_clinica.sql` | Permite un rol de staff Y un rol `'paciente'` a la vez en la misma clinica (dos indices unicos parciales en vez de un `unique` simple) | ✅ Aplicada 2026-09-13 | ✅ Aplicada 2026-09-13 |
| `050_politica_password.sql` | Tabla singleton `politica_password`: reglas de contrasena configurables por el super admin (sembrada para no cambiar el comportamiento actual) | ✅ Aplicada 2026-09-13 | ✅ Aplicada 2026-09-13 |
| `051_doctor_foto_multi_rol_staff.sql` | Columna `foto` en `doctores` + permite mas de un rol de staff a la vez (ej. admin Y doctor) en la misma clinica | ✅ Aplicada 2026-09-15 | ✅ Aplicada 2026-09-15 |
| `052_familiar_acepta_whatsapp.sql` | Columna `acepta_whatsapp` en `familiares_paciente`, mismo patron que `pacientes.acepta_whatsapp` | ✅ Aplicada 2026-09-16 | ✅ Aplicada 2026-09-16 |
| `053_sucursal_acepta_whatsapp.sql` | Columna `acepta_whatsapp` en `sucursales` | ✅ Aplicada 2026-09-16 | ✅ Aplicada 2026-09-16 |
| `054_cambio_email_tokens.sql` | Tabla nueva `cambio_email_tokens`: autoservicio de cambio de correo de acceso, confirmado por token + contrasena actual | ✅ Aplicada 2026-09-19 | ✅ Aplicada 2026-09-19 |
| `055_consentimiento_datos.sql` | Columna `comparte_historial_clinico` en `pacientes_empresas` + tabla `consentimiento_datos_tokens`: consentimiento del paciente (por clinica) para compartir su historial entre clinicas del ecosistema | ✅ Aplicada 2026-09-19 | ✅ Aplicada 2026-09-19 |
| `056_acepta_correo_super_admin.sql` | Columna `acepta_correo_super_admin` en `usuarios`: cada super-admin decide si recibe los correos de notificacion de consentimiento (default true) | ✅ Aplicada 2026-09-20 | ✅ Aplicada 2026-09-20 |

**Verificado 2026-09-02**: comparacion completa de esquema (tablas, columnas,
indices, constraints, funciones, triggers) entre `.19` y Neon — identicos
(antes de aplicar la migracion 005).

**Verificado 2026-09-06**: comparacion de columnas de `sucursales`,
`pacientes`, `doctor_horarios` y `citas` entre `.17` y Neon tras aplicar
`012`-`015` — identicas.

**Verificado 2026-09-07**: comparacion de columnas de `doctores`,
`doctor_especialidades`, `citas` y `pacientes` entre `.17` y Neon tras
aplicar `019`-`021` — identicas. Backfill de `doctor_especialidades`
confirmado (3 doctores -> 3 filas, 1:1, sin perdida de datos).

Actualizar esta tabla cada vez que se agregue una migracion nueva o se
aplique una existente a un entorno adicional.
