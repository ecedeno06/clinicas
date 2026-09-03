# Modulo de laboratorio

> **Estado (2026-09-03): certificado en `.19` (desarrollo) y promovido a
> Neon (produccion).** Ver
> [ACTUALIZACION-NEON.md](backend/database/migrations/ACTUALIZACION-NEON.md)
> seccion 7 para el detalle de la promocion.

Siguiente item de la hoja de ruta en [MEJORAS-PROPUESTAS.md](MEJORAS-PROPUESTAS.md)
despues de signos vitales y recetas: ordenes de laboratorio con sus
examenes y resultados, ligadas a una cita.

## 1. Modelo de datos

Migracion [`007_laboratorio.sql`](backend/database/migrations/007_laboratorio.sql),
mismo patron ya usado en `recetas`/`receta_medicamentos`: cabecera N por
cita (un doctor puede pedir mas de una orden en la misma consulta) +
lineas que se reemplazan como conjunto en cada actualizacion (no se
editan una a una).

```sql
create table ordenes_laboratorio (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id),
    cita_id         uuid not null references citas(id) on delete cascade,
    paciente_id     uuid not null references pacientes(id) on delete restrict,
    doctor_id       uuid not null references doctores(id) on delete restrict,
    estado          text not null check (estado in ('pendiente', 'completada', 'cancelada')) default 'pendiente',
    observaciones   text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table orden_laboratorio_examenes (
    id                  uuid primary key default gen_random_uuid(),
    orden_id            uuid not null references ordenes_laboratorio(id) on delete cascade,
    nombre_examen       text not null,
    valor_referencia    text,
    resultado           text,
    unidad              text,
    orden               integer not null default 0,
    created_at          timestamptz not null default now()
);
```

**Se ata a `cita_id`, no a `historia_clinica_id`**: igual que recetas, el
doctor puede pedir un examen sin necesitar haber completado la historia
clinica de esa cita.

**Alcance de esta version (MVP) — sin archivos adjuntos**: `resultado` y
`valor_referencia` son texto libre, no numeros ni tablas de rangos
estructuradas. Soporta tanto resultados numericos ("92") como
cualitativos ("Positivo", "Normal"). Adjuntar el PDF o imagen del
resultado del laboratorio externo queda para una fase futura que
requiere definir almacenamiento de archivos (ver
`MEJORAS-PROPUESTAS.md`, seccion 6, nota sobre storage) — hoy no hay
ningun archivo binario en el sistema fuera de logos/avatares en base64,
y agregar esa capacidad es un cambio de infraestructura aparte.

## 2. Backend

**Controlador** [`laboratorio.controller.js`](backend/src/controllers/laboratorio.controller.js):
- `listarPorCita` — todas las ordenes de una cita, cada una con su
  arreglo de `examenes`.
- `crear` — nueva orden con 1+ examenes (`empresa_id`/`paciente_id`/
  `doctor_id` se toman de la cita, no del body, igual que recetas).
- `actualizar` — reemplaza la lista completa de examenes de una orden
  puntual (sirve tanto para corregir lo solicitado como para cargar
  resultados despues), y permite cambiar `estado`/`observaciones`.
- `eliminar`.

**Rutas**:
- `GET/POST /api/citas/:citaId/laboratorio` (mientras la cita agrupa la
  lista, igual que `/citas/:citaId/recetas`).
- `PUT/DELETE /api/laboratorio/:ordenId` (recurso propio, porque una
  cita puede tener varias ordenes — mismo patron que
  `/recetas/:recetaId`).

**Permisos**: solo `admin` y `doctor` (confidencial, igual que recetas e
historia clinica). `citas.controller.js` `listar()` ahora incluye
`tiene_laboratorio` (via `exists(...)`, mismo patron que `tiene_receta`)
para mostrar el indicador (✓) en el menu de la fila.

## 3. Frontend

En **Citas**, el menu ⋮ de cada fila tiene una nueva opcion
"Laboratorio (✓ si ya tiene)" que abre un panel con:
- Lista de ordenes de esa cita (fecha, badge de estado, tabla de
  examenes con valor de referencia/resultado/unidad, boton Editar y
  Eliminar por orden).
- Formulario para registrar una orden nueva o editar una existente:
  N bloques de examen (nombre, valor de referencia, resultado, unidad,
  con "+ Agregar examen"/"Quitar"), selector de estado
  (pendiente/completada/cancelada), y observaciones generales.

Mismo diseno de lista+formulario ya usado para Recetas, para mantener
consistencia visual y de interaccion en todo el modulo de Citas.

**Archivos nuevos/modificados**: `laboratorio.controller.js`,
`laboratorio.routes.js`, interfaces `OrdenLaboratorio`/
`ExamenLaboratorio`/`EstadoLaboratorio` en `models.ts`, metodos
`listarLaboratorio`/`crearLaboratorio`/`actualizarLaboratorio`/
`eliminarLaboratorio` en `citas.service.ts`, y el panel completo en
`citas.component.ts`/`.html`.

## 4. Lo que se probo

Contra un Postgres desechable (creacion limpia + re-ejecucion
idempotente de la migracion) y luego end-to-end contra `.19` con datos
reales:
- Crear una orden con 2 examenes desde una cita.
- Editar esa orden: cargar resultado y unidad en cada examen, marcar
  `estado = completada`.
- Rechazo de un `estado` invalido (`400 Estado invalido.`).
- Eliminar una orden.
- El indicador `tiene_laboratorio` aparece correctamente en el listado
  de citas y en el menu ⋮ de la fila.
- Verificacion visual (Playwright) de la lista vacia, el formulario, la
  lista con una orden pendiente, y la misma orden ya completada con sus
  resultados.
- El icono y el tab "Laboratorio" en el historial del paciente (seccion
  5) tambien se verificaron con Playwright: el icono aparece solo si la
  consulta tiene ordenes, y saltar a el selecciona la fila correcta y
  muestra la orden con sus examenes.

## 5. Historial en la ficha del paciente

Igual que Receta: en Pacientes → Historial clinico, el tab inferior
("Signos vitales" / "Receta") ahora tiene un tercer tab "Laboratorio"
(con badge de cantidad), ligado a la consulta seleccionada arriba. La
tabla de "Consultas" muestra un icono nuevo (junto al de receta) cuando
esa consulta tiene ordenes de laboratorio, que selecciona la fila y
salta directo al tab "Laboratorio".

**Backend**: `pacientes.controller.js` `historial()` ahora incluye
`tiene_laboratorio` (mismo patron `exists(...)` que `tiene_receta`).

## 5.1 Bug encontrado y corregido: citas sin consulta escrita desaparecian del historial

El tab "Consultas" de Pacientes se armaba consultando `historias_clinicas`
(con `join` a `citas`), no las citas del paciente directamente. Una cita
con una orden de laboratorio (o una receta) pero **sin** que el doctor
hubiera escrito todavia la nota de consulta (motivo/diagnostico) no
tenia fila en `historias_clinicas`, asi que desaparecia por completo de
la lista — sin poder verse ni su icono de laboratorio/receta ni nada.

**Corregido** en `pacientes.controller.js` `historial()`: ahora la
consulta parte de `citas` (`left join historias_clinicas`), así que
toda cita del paciente en esa clinica aparece, tenga o no historia
clinica ya registrada — el diagnostico se muestra como "-" hasta que el
doctor la complete. Esto tambien corrige el mismo problema latente que
ya existia con Recetas (no reportado hasta ahora, pero con la misma
causa).

## 5.2 Card "Laboratorios pendientes" en el tablero

En el Resumen general (Dashboard), un card mas junto a los 4 existentes
("Pacientes activos", etc.), visible solo para `admin`/`doctor`. Al
hacer clic abre un panel con todas las ordenes en estado `pendiente` de
la clinica (fecha, paciente, doctor/especialidad) y un boton "Ir a la
cita" por fila que navega a Citas con la fecha y el paciente
prefiltrados (`?fecha=dd/mm/aaaa&paciente=...`).

**Backend**: `GET /api/laboratorio/pendientes` (nuevo, en
`laboratorio.controller.js`/`laboratorio.routes.js`), mismo permiso
admin/doctor que el resto del modulo.

**Frontend**: `citas.service.ts` → `listarLaboratorioPendientes()`;
`dashboard.component.ts` la consume solo si `puedeVerLaboratorio()`;
`citas.component.ts` ahora lee `?fecha=`/`?paciente=` de la URL al
entrar (`ActivatedRoute`) para prefiltrar la tabla — mismo mecanismo
que podria reusarse a futuro para otros accesos directos desde el
tablero.

## 6. Pendiente / fuera de alcance de esta version

- **Archivos adjuntos** (PDF/imagenes de resultados) — requiere
  almacenamiento de archivos, no implementado.
- **Promocion a Neon**: pendiente a proposito hasta certificar el
  modulo en desarrollo (ver seccion superior).
