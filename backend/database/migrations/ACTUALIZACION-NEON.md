# Actualizacion aplicada a Neon (produccion)

Estado: `001` a `008` ya se aplicaron en Neon (verificado con
comparacion completa de esquema contra `.19`; `007` certificada en
desarrollo y promovida el 2026-09-03; `008` aplicada el 2026-09-04).
`009` esta aplicada solo en `.19` por ahora (pendiente de promover). Ver
tambien [README.md](./README.md) para el registro vivo de que esta
aplicado en cada entorno.

## Resumen

| # | Migracion | Que agrega | Estado en Neon |
|---|---|---|---|
| 1 | `001_signos_vitales.sql` | Tabla nueva `signos_vitales` | ✅ Aplicada |
| 2 | `002_glucosa_glicosilada.sql` | 1 columna nueva en `signos_vitales` | ✅ Aplicada |
| 3 | `003_recetas.sql` | 2 tablas nuevas: `recetas` y `receta_medicamentos` | ✅ Aplicada |
| 4 | `004_recetas_multiples.sql` | Permite varias recetas por cita | ✅ Aplicada |
| 5 | `005_pacientes_globales.sql` | `pacientes` pasa a ser global (multi-clinica) | ✅ Aplicada |
| 6 | `006_horarios_doctores.sql` | Tabla nueva `doctor_horarios` (horario semanal por doctor) | ✅ Aplicada |
| 7 | `007_laboratorio.sql` | Tablas nuevas `ordenes_laboratorio` y `orden_laboratorio_examenes` | ✅ Aplicada 2026-09-03 |
| 8 | `008_paciente_foto.sql` | Columna nueva `foto` (base64) en `pacientes` | ✅ Aplicada 2026-09-04 |
| 9 | `009_citas_reagendar.sql` | Agrega `'reagendar'` al check de `citas.estado` | ⬜ Pendiente |

---

## 4. `004_recetas_multiples.sql` — Varias recetas por cita

El diseño original limitaba a **una receta por cita** (`unique` en
`recetas.cita_id`). En la practica el doctor puede emitir mas de una receta
en la misma consulta, asi que se quita esa restriccion:

```sql
alter table recetas drop constraint if exists recetas_cita_id_key;
create index if not exists idx_recetas_cita on recetas(cita_id);
```

Esto tambien cambio el backend: antes `PUT`/`GET` de receta vivian bajo
`/citas/:citaId/receta` (una sola); ahora `GET`/`POST` de la lista siguen
bajo `/citas/:citaId/recetas` (plural), pero `PUT`/`DELETE` de una receta
puntual pasaron a `/recetas/:recetaId` (recurso propio), porque ya no hay
una unica receta por cita a la cual referirse implicitamente.

Validado con Postgres desechable: se simulo el estado actual de Neon (con
el `unique` todavia activo), se confirmo que una segunda receta para la
misma cita fallaba con `duplicate key value violates unique constraint
"recetas_cita_id_key"`, se aplico la migracion, y se confirmo que despues
la segunda receta se inserta sin problema.

---

## 5. `005_pacientes_globales.sql` — Paciente global (multi-clinica)

Cambio de modelo: `pacientes` deja de pertenecer a una sola clinica. Ahora
es una identidad global (misma logica que `usuarios`), y una nueva tabla
`pacientes_empresas` (N:M, paralela a `usuarios_empresas_rol`) vincula esa
identidad con cada clinica donde el paciente es atendido.

**Que hace la migracion, en orden:**
1. Crea `pacientes_empresas` (paciente_id, empresa_id, activo).
2. Migra cada `pacientes.empresa_id`/`activo` existente a un vinculo en
   la tabla nueva.
3. **Deduplica** pacientes con la misma `identificacion` registrados por
   separado en distintas clinicas antes de este cambio: fusiona las filas
   en una sola (conservando la mas antigua), reapunta `citas`,
   `historias_clinicas`, `signos_vitales` y `recetas` de las filas
   duplicadas hacia la sobreviviente, y traslada los vinculos de clinica.
   *(Verificado: no habia ningun caso real en `.19` ni en Neon al momento
   de escribir esta migracion, pero el bloque corre igual como
   salvaguarda -- probado por separado con datos sinteticos que si
   duplicaban).*
4. Quita `empresa_id` y `activo` de `pacientes` (ahora en
   `pacientes_empresas`).
5. Vuelve `identificacion` y `email` **unicos globalmente** en `pacientes`
   (antes `identificacion` era unico solo por clinica).

**Cambio de comportamiento importante**: al registrar un paciente nuevo,
el backend ahora busca primero por `identificacion` en toda la red
(`GET /api/pacientes/buscar?identificacion=`). Si ya existe, no se crea un
registro duplicado — se reutiliza el existente (nombre, alergias, contacto
de emergencia, etc.) y solo se crea el vinculo con la clinica actual. El
frontend muestra un aviso y bloquea esos campos para edicion accidental
cuando detecta la coincidencia.

**Lo que NO cambia**: el aislamiento de datos clinicos entre clinicas.
`citas`, `historias_clinicas`, `signos_vitales` y `recetas` ya filtraban
por su propio `empresa_id` — eso sigue igual. El personal de una clinica
sigue sin ver el historial que el mismo paciente tiene en otra.

Ver [DISENO-PACIENTE-GLOBAL.md](../../../DISENO-PACIENTE-GLOBAL.md) para
el diseño completo, incluyendo lo que falta (portal del paciente, login
propio, invitacion por correo) que NO forma parte de esta migracion.

---

## 6. `006_horarios_doctores.sql` — Horario semanal por doctor (tablero de turnos)

Tabla nueva `doctor_horarios`: el patron recurrente de dias/horas en que
atiende cada doctor (puede tener varios bloques el mismo dia, ej. turno
partido manana/tarde). No modifica `citas` ni ninguna tabla existente, y
no es una restriccion dura — un doctor sin filas aqui sigue recibiendo
citas exactamente igual que antes.

Se usa para:
1. Un tablero de horario por doctor (pantalla nueva en Doctores, icono
   "Horario" en cada fila).
2. Un endpoint de disponibilidad (`GET /api/doctores/:id/disponibilidad?fecha=`)
   que combina ese horario con las citas ya agendadas ese dia, y devuelve
   franjas libres en bloques de 30 minutos — el formulario de "Nueva cita"
   las muestra como chips clicables que rellenan hora de inicio/fin (sin
   dejar de poder escribirlas a mano).

Validado con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y probado end-to-end contra `.19` con datos reales: horario
con turno partido, un dia sin atencion, y una cita ya agendada restando
correctamente su franja de las disponibles.

---

## 7. `007_laboratorio.sql` — Modulo de laboratorio (certificado y promovido a Neon el 2026-09-03)

Tablas nuevas `ordenes_laboratorio` (cabecera, N por cita) y
`orden_laboratorio_examenes` (lineas de examenes solicitados), con el
mismo patron ya usado en `recetas`/`receta_medicamentos`: se ata a
`cita_id`, no a `historia_clinica_id`, y las lineas se reemplazan como
conjunto en cada actualizacion (no se editan una a una).

Se probo primero solo en `.19` (desarrollo) por instruccion explicita,
incluyendo el card "Laboratorios pendientes" del tablero agregado
despues. Una vez certificado, se aplico a Neon y se verifico el esquema
contra `.19` (identico). Ver [LABORATORIO.md](../../../LABORATORIO.md)
en la raiz del proyecto para el diseno completo, el detalle de
endpoints y todo lo que se probo.

**Alcance de esta version (MVP)**: `resultado` y `valor_referencia` son
texto libre (soportan valores numericos y cualitativos, ej.
"Positivo"/"Negativo"). **No incluye archivos adjuntos** (PDF de
resultados, imagenes) — eso requiere definir almacenamiento de archivos
primero, ver `MEJORAS-PROPUESTAS.md` seccion 6.

---

## 8. `008_paciente_foto.sql` — Foto del paciente (base64)

Columna aditiva `foto text` en `pacientes` (mismo patron ya usado en
`usuarios.avatar` y `empresas.logo`). Se sube desde el formulario de
Pacientes (camara, archivo del equipo o pegar) y solo se persiste al
guardar el registro. Aplicada a Neon el 2026-09-04, verificada con
`\d pacientes` (columna `foto | text` presente).

---

## 9. `009_citas_reagendar.sql` — Estado `reagendar` en citas

Agrega `'reagendar'` a los valores permitidos del check de `citas.estado`
(dropea y vuelve a crear `citas_estado_check`, ya que es un check inline,
no un tipo enum). Se usa cuando un admin elimina un bloque de horario de
un doctor (`DELETE /api/horarios/:id`): antes de borrar el bloque, el
backend marca como `reagendar` las citas que quedarian sin disponibilidad
(activas -- pendiente/confirmada --, no vencidas, y cuyo horario cae
dentro del bloque eliminado), y devuelve cuantas fueron afectadas para
que el frontend avise al usuario. El tablero muestra una pastilla "Citas
por reagendar" que enlaza a Citas filtrado por ese estado.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y luego end-to-end contra `.19`: una cita activa dentro del
bloque eliminado paso a `reagendar`; una cita `atendida` y otra ya
vencida dentro del mismo rango horario NO se tocaron. Aplicada solo en
`.19` por ahora -- pendiente de promover a Neon.

---

## Como aplicarlo a Neon

Necesitas la cadena de conexion de Neon (Project Settings → Database →
**Direct connection**, no el pooler). Con Docker (sin instalar `psql`):

```bash
docker run --rm -i -e PGPASSWORD='<password-neon>' postgres:16 \
  psql -h <host-neon> -U <usuario-neon> -d <base-neon> < backend/database/migrations/007_laboratorio.sql
```

## Verificacion despues de aplicar

```sql
\d ordenes_laboratorio            -- debe existir, con sus fk a citas/pacientes/doctores y el check de estado
\d orden_laboratorio_examenes     -- debe existir, con su fk a ordenes_laboratorio

select count(*) from ordenes_laboratorio;  -- 0 es normal (nadie ha cargado ordenes todavia)
```

## Riesgo / reversibilidad

Migracion 100% aditiva: crea 2 tablas nuevas, no toca ninguna existente.
No hay riesgo de romper datos ni backend viejo. Revertirla es
`drop table orden_laboratorio_examenes; drop table ordenes_laboratorio;`
si hiciera falta (en ese orden, por la foreign key).
