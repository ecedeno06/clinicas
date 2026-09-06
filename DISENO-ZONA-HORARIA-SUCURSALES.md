# Análisis y Hoja de Ruta: Zona Horaria por Sucursal (no solo por Clínica)

> **Documento de Diseño — Estado: Fases 1-3 implementadas (2026-09-06).**
> Migraciones `012`-`015` aplicadas en `.17` y en Neon (verificado esquema
> idéntico). Incluye: tabla `sucursales` con backfill automático, CRUD de
> administración (pantalla "Sucursales", accesible a super admin y al admin
> de la clínica), selector de sucursal en Horario del doctor (con el chequeo
> de choque cruzando todas las sucursales del doctor), selector de sucursal
> en Nueva/Editar cita, disponibilidad agrupada por sucursal, chequeo de
> choque por paciente, y filtro "Sucursal" + columna en el dashboard.
> **Pendiente**: subir el código a GitHub (confirmación explícita por
> separado, como siempre).
> **Origen:** surge del bug de desfase de un día en fechas corregido el 2026-09-05
> (ver commit `9f399c5` y `MEJORAS-PROPUESTAS.md` sección 5), donde se anotó
> agregar `zona_horaria` a `empresas`. Al revisarlo más a fondo, el cambio real
> es más grande de lo que parecía: **la unidad correcta de zona horaria (y de
> horario de atención) no es la empresa, es la sucursal.**
> **Decisión ya tomada (2026-09-05):** el sistema está en construcción, vale la
> pena construir esto ahora en vez de esperar a que exista una necesidad real
> (responde la pregunta abierta #4). Un doctor **sí puede atender en más de una
> sucursal** de la misma empresa con horarios distintos en cada una (responde
> la pregunta abierta #2) — por lo tanto `sucursal_id` vive en
> `doctor_horarios` (no directo en `doctores`), y `citas` necesita su propio
> `sucursal_id` explícito, sin poder heredarlo automáticamente del doctor.

---

## 1. Por qué "empresa" no alcanza

El modelo actual asume, implícitamente, que una clínica (`empresas`) es **una sola
ubicación física**: tiene una `direccion` (campo único de texto), y todo lo demás
(doctores, horarios, citas) cuelga directo de `empresa_id`. Eso funciona mientras
sea cierto — pero dos cosas rompen ese supuesto con el tiempo:

1. **Una misma clínica puede tener varias sucursales.** Aunque hoy todas las
   clínicas de este sistema están en Panamá (una sola zona horaria, sin horario
   de verano), el sistema ya es multi-clínica (`empresa_id`) y nada impide que
   mañana una clínica abra una segunda sede — en la misma ciudad, en otra
   provincia, o incluso en otro país si el negocio crece. Cada sucursal puede
   tener su **propia zona horaria**.
2. **Cada sucursal puede tener su propio horario de atención.** Independiente de
   la zona horaria: una sede en un centro comercial puede abrir hasta las 9pm,
   otra solo en las mañanas. Hoy `doctor_horarios` modela el horario semanal
   **del doctor**, pero no existe ningún concepto de "la clínica abre de X a Y"
   — el horario de un doctor sin sucursal es, en la práctica, el único límite
   que existe.

Si se agrega `zona_horaria` únicamente a `empresas` (como se anotó originalmente),
se resuelve el caso de hoy (una clínica = una zona horaria) pero se deja mal
planteada la base de datos para el día en que aparezca la primera clínica con
más de una sede — habría que deshacer y rehacer la migración en vez de
extenderla.

## 2. Estado actual del sistema (para referencia)

```sql
-- empresas: una sola direccion, sin zona horaria, sin concepto de sede
create table empresas (
    id uuid primary key, nombre text, identificacion text,
    email text, telefono text, direccion text, logo text, activo boolean, ...
);

-- doctores: pertenece a una empresa directamente, sin sucursal
create table doctores (
    id uuid primary key, empresa_id uuid references empresas(id),
    usuario_id uuid, especialidad_id uuid, nombre text, ...
);

-- doctor_horarios: patron semanal del doctor, sin ubicacion
create table doctor_horarios (
    id uuid primary key, doctor_id uuid references doctores(id),
    dia_semana smallint, hora_inicio time, hora_fin time, activo boolean, ...
);

-- citas: liga paciente + doctor + empresa, sin sucursal
create table citas (
    id uuid primary key, empresa_id uuid, paciente_id uuid, doctor_id uuid,
    fecha date, hora_inicio time, hora_fin time, estado text, ...
);
```

Todas las fechas (`date`) y horas (`time`) se guardan y se muestran como
**"hora de pared" sin zona** (wall-clock, ya corregido para no convertirlas por
error a la zona horaria del navegador — ver el bug del 2026-09-05). Eso ya es
correcto y **no cambia** con esta mejora: seguirán siendo valores locales
literales. Lo que cambia es **a qué lugar** (sucursal) pertenece esa hora local,
para poder calcular correctamente cosas como "¿qué hora es ahora mismo en esa
sucursal?" o "¿ya pasó esta cita?" cuando haya más de una zona horaria en juego.

## 3. Modelo de datos propuesto

Se introduce una tabla nueva `sucursales`, y las tablas que hoy asumen "una sola
ubicación por empresa" pasan a referenciar la sucursal en vez de (o además de)
la empresa.

```sql
create table sucursales (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id) on delete cascade,
    nombre          text not null,              -- ej. "Sede Centro", "Sede Costa del Este"
    direccion       text,
    zona_horaria    text not null default 'America/Panama',  -- identificador IANA, ej. 'America/Bogota'
    -- Horario general de atencion de la sucursal (limite superior, distinto del
    -- horario individual de cada doctor -- ver seccion 5).
    hora_apertura   time,
    hora_cierre     time,
    activo          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- doctor_horarios pasa a ser por doctor + sucursal, no solo por doctor:
-- el mismo doctor puede atender en mas de una sede con horarios distintos.
alter table doctor_horarios
  add column sucursal_id uuid references sucursales(id) on delete cascade;

-- citas registra en que sucursal ocurre, para saber la zona horaria aplicable
-- y en cual local se atiende al paciente.
alter table citas
  add column sucursal_id uuid references sucursales(id);
```

`empresas` **no** necesita su propio campo `zona_horaria` bajo este modelo: la
zona horaria vive en la sucursal. Si se quiere un valor "por defecto" para
mostrar antes de que existan sucursales, puede resolverse en la aplicación
(asumir `America/Panama` si no hay ninguna sucursal todavía), sin necesidad de
duplicar el dato en dos tablas.

### 3.1 Migración de los datos existentes (sin romper nada)

Como hoy **no existe** el concepto de sucursal, la migración debe crear una
**"sucursal principal"** automática por cada empresa existente, y reapuntar
`doctor_horarios` y `citas` hacia ella — de forma que el sistema siga
funcionando exactamente igual que hoy para todas las clínicas actuales
(una sola sede, zona horaria `America/Panama`), sin pedirle nada a nadie hasta
que decidan agregar una segunda sucursal.

```sql
insert into sucursales (empresa_id, nombre, direccion, zona_horaria)
select id, nombre, direccion, 'America/Panama' from empresas;

update doctor_horarios dh set sucursal_id = (
  select s.id from sucursales s join doctores d on d.empresa_id = s.empresa_id
  where d.id = dh.doctor_id limit 1
);

update citas c set sucursal_id = (
  select s.id from sucursales s where s.empresa_id = c.empresa_id limit 1
);

alter table doctor_horarios alter column sucursal_id set not null;
alter table citas alter column sucursal_id set not null;
```

## 4. Impacto en funcionalidades ya construidas

| Área | Cambio necesario |
|---|---|
| **Empresas (admin)** | Nueva pantalla/sección para gestionar sucursales de una empresa (crear, editar, desactivar). Si una empresa tiene una sola sucursal, la UI puede ocultar la complejidad y comportarse igual que hoy (auto-seleccionar la única sucursal). **Permisos (2026-09-06)**: no solo el super admin — el administrador de la clínica (rol `admin` en `usuarios_empresas_rol` para esa `empresa_id`) también debe poder gestionar las sucursales de su propia empresa. El backend debe permitir el CRUD de sucursales a cualquier usuario con rol `admin` en esa empresa, no solo a `es_super_admin`. |
| **Doctores → Horario semanal** | Al agregar un bloque de horario, elegir a qué sucursal aplica (si el doctor trabaja en más de una). El endpoint de disponibilidad (`GET /api/doctores/:id/disponibilidad`) debe filtrar por sucursal, no solo por doctor. |
| **Citas → Nueva/Editar cita** | Elegir sucursal (auto-seleccionada si el doctor solo atiende en una). Los chips de disponibilidad ya calculados dependen de `doctor_horarios` filtrado por sucursal. |
| **Reagendar (estado `reagendar`)** | La lógica que marca citas como `reagendar` al eliminar un bloque de horario (`doctorHorarios.controller.js#eliminar`) debe filtrar también por `sucursal_id` del bloque eliminado, no solo por `doctor_id`. |
| **Dashboard / "Citas hoy"** | Si una empresa llega a tener sucursales en zonas horarias distintas, "hoy" deja de ser una sola fecha global — cada sucursal tiene su propio "hoy". Mientras todas las sucursales de una empresa estén en la misma zona (el caso común), no cambia nada. |
| **Impresión de recetas/laboratorio/citas** | Los membretes impresos deberían indicar la sucursal (nombre y dirección), no solo el nombre de la empresa, si aplica. |
| **Reportes futuros** | Cualquier reporte "por fecha" tendría que decidir en base a qué zona horaria agrupa los datos cuando hay sucursales multi-zona (normalmente: la zona de cada sucursal, no una zona global de la empresa). |

## 4.1 Validaciones de choque que hay que agregar/ajustar (multi-sucursal)

Con un doctor pudiendo atender en más de una sucursal, aparecen dos formas de
"choque de horario" que hoy no existen (o que existen implícitamente y hay que
revisar que sigan funcionando bien) — ambas son requisito de la Fase 1/3, no
un refinamiento posterior:

**a) Un paciente no puede tener dos citas que se crucen en el tiempo, sin
importar en qué sucursal o con qué doctor.** Hoy el único choque que se valida
es el del **doctor** (`hayChoqueDeHorario` en `citas.controller.js`, escapa a
que un doctor tenga dos citas superpuestas) — no existe ningún chequeo por
**paciente**, así que técnicamente hoy ya sería posible agendar al mismo
paciente con dos doctores distintos a la misma hora dentro de una sola
sucursal, y nadie lo nota. Con sucursales, el caso se vuelve más obvio (un
paciente no puede estar físicamente en dos sucursales a la vez) pero el
arreglo real es más general: agregar un chequeo de choque por `paciente_id`
(mismo patrón que `hayChoqueDeHorario`, pero filtrando por paciente en vez de
por doctor, y sin importar la sucursal ni el doctor de cada cita), que se
ejecute junto al chequeo de doctor ya existente al crear/editar una cita.
Importante: el chequeo es por **superposición de horario**, no por "mismo
día" — el mismo paciente sí puede tener citas distintas el mismo día en
sucursales distintas, siempre que no se crucen en el tiempo (ej. 9:00am en
Sucursal Centro y 3:00pm en Sucursal Norte está bien; 9:00am en ambas al
mismo tiempo, no).

**b) El horario semanal de un doctor no puede pisarse entre sucursales
distintas.** Hoy `hayChoqueDeBloque` (en `doctorHorarios.controller.js`) ya
impide que un doctor tenga dos bloques de horario superpuestos el mismo día
de la semana — pero lo hace sin ningún concepto de sucursal, porque no existe
todavía. **Al agregar `sucursal_id` a `doctor_horarios`, hay que tener
cuidado de NO empezar a filtrar ese chequeo por sucursal** (sería el error
natural al adaptar la query) — el chequeo debe seguir siendo por
`doctor_id` + `dia_semana` **a través de todas sus sucursales**, para seguir
impidiendo que, por ejemplo, se configure al mismo doctor atendiendo en
Sucursal Centro Y Sucursal Norte los lunes de 8am a 12pm (físicamente
imposible). Es decir: el chequeo de choque de horario de doctor debe ampliar
su alcance (de "un doctor" a "un doctor en cualquiera de sus sucursales"),
no restringirlo.

Ambas validaciones son del mismo tipo (detectar superposición de intervalos
de tiempo) y ya existe el patrón de referencia en el código
(`hayChoqueDeHorario`/`hayChoqueDeBloque`) — la Fase 1/3 debe extender ese
patrón a paciente, y confirmar que el de doctor no se reduzca por accidente
al agregar la dimensión de sucursal.

## 4.2 La sucursal NO es una frontera de datos clínicos

Punto importante para no equivocar el alcance al implementar: **la sucursal es
un concepto operativo (agenda, horario, zona horaria), no un límite de
aislamiento de información como sí lo es `empresa_id`.** El historial clínico
del paciente (`historias_clinicas`, `signos_vitales`, `recetas`,
`ordenes_laboratorio`, y el tab "Historial"/bitácora de la cita) debe seguir
viéndose **igual desde cualquier sucursal de la misma empresa** — si un
paciente fue atendido en Sucursal Centro el lunes y llega a Sucursal Norte el
jueves, el doctor que lo atienda ahí debe poder ver todo su historial
completo dentro de esa empresa, sin ningún filtro adicional por sucursal.

Esto ya es consistente con el diseño existente de paciente global
(`DISENO-PACIENTE-GLOBAL.md`): hoy el aislamiento real de datos clínicos es
por `empresa_id` (un paciente atendido en dos clínicas distintas no comparte
historial entre ellas), y las sucursales de **una misma** empresa deben
comportarse como una sola unidad para efectos de historial — la sucursal solo
importa para decidir *dónde y cuándo* ocurre una cita, nunca para decidir
*quién puede ver qué* dentro de la misma empresa.

**Que hay que cuidar al implementar:** ninguna de las consultas de historial
existentes (`pacientes.controller.js#historial`, `#recetasHistorial`,
`#laboratorioHistorial`, `#signosVitalesHistorial`) debe agregar un filtro por
`sucursal_id` — siguen filtrando solo por `paciente_id` + `empresa_id`, como
hoy. El campo `sucursal_id` que se agrega a `citas` es informativo (para
mostrar "esta cita fue en Sucursal X" si hace falta), no una condición de
acceso.

## 4.3 Dashboard con sucursales

**Comportamiento por defecto (sin cambios visibles para una empresa con una
sola sucursal):** el tablero sigue funcionando exactamente igual que hoy — las
tarjetas ("Citas hoy", "Citas pendientes", "Laboratorios pendientes") suman
**todas las sucursales de la empresa**. Con una sola sucursal, esa suma y el
total de hoy son lo mismo, así que no hay ningún cambio perceptible.

**Cuando la empresa tiene más de una sucursal:**
- Se agrega un selector **"Sucursal"** en la parte superior del tablero (mismo
  patrón ya usado por el selector de fecha de "Agenda del día"), con una
  opción **"Todas"** seleccionada por defecto — que mantiene el comportamiento
  agregado descrito arriba.
- Si el usuario elige una sucursal específica, todas las tarjetas y la tabla
  "Agenda del día" se filtran a esa sola sede.
- La tabla "Agenda del día" gana una columna **Sucursal** (visible solo si la
  empresa tiene más de una), para distinguir de un vistazo dónde es cada cita
  cuando se está viendo "Todas".

Esto se resuelve en la Fase 3 (junto con el resto de la UI de Citas), reusando
el mismo servicio/listado de citas ya filtrado por `sucursal_id` cuando
aplique — no requiere un endpoint nuevo.

## 5. Horario de atención de la sucursal vs. horario del doctor

Son dos conceptos relacionados pero distintos, y vale la pena no confundirlos:

- **Horario de atención de la sucursal** (`sucursales.hora_apertura`/`hora_cierre`):
  el límite superior — cuándo el local físico está abierto, independiente de qué
  doctores estén trabajando. Útil para bloquear que se agende cualquier cita
  fuera de esas horas, sin importar el doctor.
- **Horario del doctor** (`doctor_horarios`, ya existente): cuándo ESE doctor en
  particular atiende, dentro del horario de la sucursal. Ya sigue el patrón
  establecido de "si no hay horario configurado, no se bloquea nada" (ver
  `006_horarios_doctores.sql`) — el mismo principio debería aplicar al horario
  de sucursal: si una sucursal no define `hora_apertura`/`hora_cierre`, no
  agrega ninguna restricción adicional a la que ya impone el horario del doctor.

No se propone que el horario de sucursal reemplace al del doctor, sino que sea
una validación adicional opcional (advertencia o bloqueo suave, a decidir en la
implementación) cuando el horario de un doctor se configura fuera del horario
general de su sucursal.

## 6. Zona horaria: cómo se usaría en la práctica

- Se guarda como identificador de la base de datos IANA de zonas horarias (ej.
  `America/Panama`, `America/Bogota`, `America/Mexico_City`) — es el estándar
  que entienden tanto Postgres como Node como los navegadores, evita inventar
  un formato propio.
- Las fechas (`date`) y horas (`time`) de `citas`/`doctor_horarios` **siguen
  siendo wall-clock sin zona**, como hoy — la zona horaria de la sucursal es el
  dato que le da *significado* a esa hora ("las 9:00am de esta cita son las
  9:00am en `America/Bogota`"), no algo que se les reste o sume.
- Se necesita en dos lugares concretos:
  1. **Backend:** para calcular correctamente "¿qué día/hora es *ahora* en esa
     sucursal?" (ej. al decidir si una cita ya venció, o al filtrar "citas de
     hoy" agrupando por sucursal) — usando una librería de zonas horarias en
     Node (ej. `date-fns-tz`, o el soporte nativo de `Intl.DateTimeFormat` con
     `timeZone`), no cálculos manuales de offset.
  2. **Frontend:** para mostrarle a alguien que NO está físicamente en la
     sucursal (ej. un administrador remoto viendo el tablero) la hora
     traducida a su propia zona si hace falta, o simplemente para rotular
     claramente "9:00am (hora de Sucursal Centro)" cuando haya ambigüedad.
     Mientras solo haya una sucursal por empresa y todos los usuarios estén en
     la misma zona (el caso de hoy), esto es invisible — no hace falta tocar
     la UI hasta que exista una empresa con sucursales en zonas distintas.

## 7. Hoja de ruta de implementación por fases

| Fase | Alcance | Depende de | Prioridad |
|---|---|---|---|
| **Fase 0 — Hecho** | Corrección puntual del bug de desfase de un día en fechas (pipes de Angular sin `'UTC'`, cálculo de "hoy" con `toISOString()`). Ver commit `9f399c5`. | — | ✅ Completado 2026-09-05 |
| **Fase 1** | Migración `sucursales` + `sucursal_id` en `doctor_horarios`/`citas`, con la migración automática de "sucursal principal" por empresa (sección 3.1). Sin cambios visibles en la UI todavia — todo sigue funcionando igual porque cada empresa sigue teniendo exactamente una sucursal. | — | Media (base necesaria para todo lo demás) |
| **Fase 2** | Pantalla de administración de sucursales dentro de Empresas (CRUD). **Accesible tanto para `es_super_admin` como para el rol `admin` de esa empresa** (no solo super admin, ver fila "Empresas (admin)" arriba). Selector de sucursal en Doctores → Horario semanal (oculto/auto-seleccionado si solo hay una). **Ampliar `hayChoqueDeBloque` para que siga comparando por `doctor_id` + `dia_semana` a través de todas sus sucursales (ver sección 4.1.b) — no reducirlo por sucursal.** | Fase 1 | Media |
| **Fase 3** | Selector de sucursal en Nueva/Editar cita (mismo criterio: oculto si el doctor solo tiene una opción). Endpoint de disponibilidad filtra por sucursal. Ajustar la lógica de `reagendar` para considerar `sucursal_id`. **Agregar chequeo de choque por `paciente_id` al crear/editar una cita (ver sección 4.1.a), independiente de sucursal/doctor.** Selector "Sucursal" en el dashboard + columna Sucursal en "Agenda del día" (ver sección 4.3). | Fase 2 | Media |
| **Fase 4** | Horario de atención general de la sucursal (`hora_apertura`/`hora_cierre`) y su validación cruzada (suave) contra el horario de cada doctor. | Fase 2 | Baja |
| **Fase 5** | Soporte real a multi-zona horaria en dashboard/reportes ("hoy" por sucursal en vez de global) y rotulado de hora con zona horaria en pantallas donde el usuario podría no estar en la misma zona que la sucursal. | Fase 1–3 | Baja (solo aplica si de verdad aparece una empresa con sucursales en zonas distintas) |

**Nota de secuencia:** las Fases 1–3 son las que de verdad *habilitan* el
soporte de sucursales como concepto (aunque cada empresa siga teniendo una
sola por ahora); las Fases 4–5 son refinamientos que solo generan valor una
vez que exista al menos una clínica con más de una sede o con sedes en
distinta zona horaria — no hay urgencia de adelantarlas.

## 8. Preguntas abiertas para decisión del usuario

1. ~~¿Hay ya una clínica real con planes concretos de abrir una segunda sede?~~
   **Resuelto (2026-09-05):** no hace falta que exista todavía — el sistema
   está en construcción, se decidió construirlo ahora como base preventiva.
2. ~~¿Un doctor puede trabajar en más de una sucursal de la misma empresa?~~
   **Resuelto (2026-09-05): sí.** `sucursal_id` vive en `doctor_horarios` (no
   en `doctores`), y `citas` necesita su propio `sucursal_id` explícito.
3. **¿El horario de atención general de la sucursal es un bloqueo duro o solo
   informativo/de advertencia?** (ver sección 5). Sigue abierta — se puede
   resolver al llegar a la Fase 4, no bloquea el arranque de la Fase 1.
4. ~~¿Vale la pena versus el esfuerzo?~~ **Resuelto (2026-09-05):** sí, se
   construye ahora aprovechando que el sistema todavía está en etapa temprana.

**Estado de la implementación:** aprobada, pero el usuario pidió explícitamente
esperar unos días antes de arrancar la Fase 1 ("no hagas el cambio aún, en un
par de días me recuerdas") — no iniciar sin retomarlo primero.

## 9. Fuera de alcance de este documento

- Cambios de horario de verano (DST) — Panamá no lo usa, pero si en el futuro
  se opera en un país que sí, las librerías de zona horaria basadas en IANA
  (recomendadas en la sección 6) ya lo manejan automáticamente; no requiere
  diseño adicional de este sistema.
- Facturación/impuestos por sucursal (usualmente ligado a sucursales en
  sistemas contables) — no es parte del alcance clínico de este análisis.
- Portal del paciente eligiendo sucursal al agendar — depende de que exista un
  portal de paciente (ver `DISENO-PACIENTE-GLOBAL.md`), que hoy no está
  implementado.
