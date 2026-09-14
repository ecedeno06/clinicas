# Calendario de Citas (vista dia, por doctor)

## Contexto

Hoy "Citas" (`frontend/src/app/features/citas/`) es una tabla plana: una
fila por cita, filtros de texto por columna, sin ningun agrupamiento por
fecha/hora ni vista visual del dia. El usuario quiere algo como la
captura de referencia: un calendario tipo agenda -- una columna por
doctor, bloques de horario coloreados por estado, clic en un bloque abre
una tarjeta flotante con los datos de la cita y accesos rapidos
(WhatsApp, ficha, cambiar estado), sidebar con filtros (sucursal,
doctor, estado) y un mini-calendario de mes para navegar de fecha.

Este documento es **solo el plan** (pedido explicito del usuario, dos
veces: "solo plan"/"para sacar ideas") -- no se implementa nada todavia.
Donde hubo una decision de alcance abierta, se dejo el default
recomendado marcado como tal, para que sea facil de ajustar antes de
pedir que se ejecute.

**Decisiones de alcance para esta v1 (ajustables):**
- El calendario se agrega como una **vista nueva conviviendo con la
  tabla actual** (toggle "Lista / Calendario" en la misma pantalla de
  Citas) -- no se borra ni se reescribe la tabla, que sigue siendo util
  para buscar por texto y ver el historial completo.
- **Solo vista Dia** en esta primera version (una columna por doctor).
  La vista Semana queda como fase 2 explicita, reutilizando el mismo
  motor de renderizado por tiempo.
- **Sin boton de pago** -- el sistema no tiene ningun concepto de
  facturacion hoy (ni en BD ni backend); agregarlo es su propia
  iniciativa grande, fuera de alcance de "agregar un calendario".
- **Avatares de doctor**: `Doctor` no tiene campo de foto hoy (solo
  `Paciente.foto` existe). v1 usa iniciales (mismo patron que ya se usa
  para pacientes en el drawer de Historia), sin agregar upload de foto
  de doctor -- eso queda como mejora aparte, no bloqueante.

## Lo que ya existe y se reutiliza tal cual

Todo esto fue confirmado leyendo el codigo actual -- no requiere cambios
para que el calendario funcione:

- **Backend, una sola consulta**: `GET /api/citas?desde=&hasta=&doctor_id=&sucursal_id=&estado=&campana_id=`
  (`backend/src/controllers/citas.controller.js#listar`) ya soporta
  rango de fechas + filtros combinados en una sola llamada, con todos los
  joins necesarios (`paciente_nombre`, `paciente_telefono`,
  `paciente_acepta_whatsapp`, `doctor_nombre`, `sucursal_nombre`,
  `tiene_receta`, `tiene_laboratorio`, `estado_laboratorio`, etc.). Hoy
  el frontend nunca lo llama con filtros (carga todo y filtra en
  cliente) -- el calendario sera el primer consumidor real de este
  filtro server-side.
- `CitasService.listar(filtros)` (`frontend/src/app/core/services/citas.service.ts`)
  ya reenvia cualquier filtro como querystring -- no necesita cambios.
  `.actualizar(id, { estado })` sirve para los pills de cambio rapido de
  estado en la tarjeta de detalle.
- Modelos `Cita`/`EstadoCita`/`Disponibilidad`/`DisponibilidadSucursal`/`FranjaHoraria`
  (`frontend/src/app/core/models/models.ts`) ya traen todo lo que
  necesita un bloque/tarjeta (paciente, telefono, doctor, sucursal,
  banderas de historia/receta/laboratorio).
- `DoctoresService.disponibilidad(doctorId, fecha)` -- para sombrear
  horas en que el doctor no atiende dentro de su columna.
- Paleta de estado ya definida y theme-aware: clases `badge-slate`
  (pendiente), `badge-amber` (confirmada), `badge-green` (atendida),
  `badge-red` (cancelada/no_asistio), `badge-violet` (reagendar), sobre
  los tokens `--tint-*-bg`/`--text-on-tint-*` de `styles.css`. Se
  reutiliza el mismo mapeo para el color de fondo de cada bloque.
- Logica de conflictos en backend (`hayChoqueDeHorario`,
  `hayChoqueDePaciente`, `hayChoqueCampanaParaCita`) -- sin cambios, el
  calendario solo dispara los mismos `crear`/`actualizar` ya existentes.
- El formulario completo de crear/editar cita (con su selector de
  franjas libres tipo chip, el picker de hora en 12h de
  `hora12.util.ts`, y las reglas de urgencia/campana/domicilio) --
  se reutiliza sin tocarlo, solo cambia COMO se abre (desde un clic en
  una celda vacia en vez de un boton "+ Nueva cita").
- Los drawers de Historia clinica, Signos vitales, Recetas y Laboratorio
  y sus metodos de apertura (`abrirHistoria`, `abrirSignos`,
  `abrirRecetas`, `abrirLaboratorio` en `citas.component.ts`) -- la
  tarjeta de detalle del calendario solo necesita botones que llamen a
  estos mismos metodos, ya existentes.
- `whatsappUrl(c: Cita)` y su gating `puedeCompartirUbicacion(c)`
  (ya en `citas.component.ts`) -- se reutiliza tal cual para el boton
  "Hablar por WhatsApp" de la tarjeta.
- `AuthService.puedeEditar()/puedeEliminar()/esSuperAdmin()` -- para
  ocultar/deshabilitar acciones segun rol, igual que ya hace la tabla.
- Como shell visual de referencia (no como motor de tiempo):
  `.horario-week-grid`/`.horario-day-col`/`.horario-slot-block` de
  `doctores.component.css`, con su tratamiento "neon glow" ya usado para
  verde/ambar -- buena base de identidad visual para los bloques de
  cita, aunque el posicionamiento por hora real es nuevo (ver abajo).

## Lo que hay que construir (net-new)

### 1. Motor de renderizado del dia (lo mas importante y lo unico realmente nuevo en logica)

Un nuevo componente standalone, ej. `CalendarioDiaComponent`
(`frontend/src/app/features/citas/calendario-dia/`), que recibe la lista
de citas del dia (ya filtrada por `desde=hasta=<fecha>` y opcionalmente
`doctor_id`/`sucursal_id`) y la lista de doctores visibles, y dibuja:

- Un eje de horas vertical (ej. 7:00 a 21:00, configurable, calculado a
  partir de `sucursal.hora_apertura/hora_cierre` cuando existan) con una
  fila por cada intervalo (ej. cada 30 o 60 min, a definir con el
  usuario al implementar).
- Una columna por doctor visible, con su nombre + avatar (iniciales) en
  el encabezado.
- Cada cita como un bloque `position: absolute` dentro de la columna de
  su doctor, con `top`/`height` calculados desde `hora_inicio`/`hora_fin`
  respecto al primer/ultimo slot del eje (helper puro,
  ej. `minutosDesdeInicioEje(hora, horaEjeInicio)`), y color de fondo
  segun `estado` (mapeo de badges ya existente).
- Manejo basico de solapes: si dos citas del mismo doctor se cruzan en
  el tiempo (no deberia pasar por las validaciones de backend, pero
  puede pasar con datos historicos/urgencias), dividir el ancho de la
  columna entre los bloques que se solapan (mismo problema que
  cualquier calendario tipo Google Calendar/Booksy -- algoritmo simple
  de "cuantas columnas concurrentes hay en este rango").
- Sombreado de las horas en que el doctor NO atiende (a partir de
  `DoctoresService.disponibilidad(doctorId, fecha)`, ya existente) --
  opcional para una primera iteracion, se puede dejar en blanco si se
  quiere simplificar el primer corte.
- Clic en una celda vacia -> abre el formulario de "Nueva cita" ya
  existente, pre-cargando `doctor_id` (la columna) y
  `hora_inicio`/`hora_fin` redondeados al slot clickeado (mismo patron
  que `elegirFranja()` ya usa hoy con los chips de disponibilidad).
- Clic en un bloque -> abre la tarjeta de detalle (ver seccion 3), NO el
  formulario de edicion completo (para eso esta el boton "Editar"/lapiz
  dentro de la tarjeta, reutilizando `abrirEditar(cita)`).

### 2. Barra superior del calendario

Dentro de la pantalla de Citas, junto al toggle Lista/Calendario:
- Navegacion Hoy / anterior / siguiente (dia -1 / dia +1), fecha grande
  legible (ej. "Jueves, 06 de mayo de 2026").
- Refrescar (vuelve a pedir `listar()` con el mismo rango).
- Imprimir (usa el mismo patron ya usado en Reportes si existe uno de
  `window.print()`; si no existe, es un simple `window.print()` con una
  media query `@media print` que oculta el sidebar/toolbar).
- El toggle Dia/Semana se muestra pero **solo Dia queda funcional en
  esta v1**; Semana puede quedar deshabilitado con un tooltip "Proximamente"
  hasta la fase 2, para no prometer algo a medias.
- Boton "Nuevo" -> abre el mismo formulario de creacion ya existente,
  sin doctor/hora pre-cargados.

### 3. Tarjeta de detalle (popover)

Nuevo componente standalone, ej. `CitaDetallePopoverComponent`, anclado
cerca del bloque clickeado (posicionamiento simple:
`getBoundingClientRect()` del bloque + `position: fixed`, cerrado con un
backdrop transparente a clic-afuera -- no es necesaria una libreria de
popovers para esto). Contenido, todo con datos que `Cita` ya trae:

- Nombre del paciente, motivo, fecha/hora, doctor.
- Telefono + boton "Hablar por WhatsApp" (reutiliza `whatsappUrl(c)` /
  `puedeCompartirUbicacion(c)` ya existentes).
- Observaciones (si las hay).
- Pills de estado clicables (Pendiente/Confirmada/Atendida/Cancelada/No
  asistio/Reagendar) que llaman `CitasService.actualizar(id, {estado})`
  y refrescan el bloque -- no hace falta un endpoint nuevo.
- Accesos rapidos a Historia/Signos/Recetas/Laboratorio -- mismos
  botones/iconos que hoy tiene la fila de la tabla, llamando a los
  mismos metodos (`abrirHistoria`, `abrirSignos`, `abrirRecetas`,
  `abrirLaboratorio`) que ya existen en `citas.component.ts`.
- Editar (abre el formulario completo, `abrirEditar(cita)`) y Eliminar
  (`eliminarCita(cita)`, ya existente, con su mismo confirm()).

### 4. Sidebar de filtros

Nuevo bloque dentro de la pantalla de Citas (visible solo en la vista
Calendario):
- Dropdown Sucursal -- `SucursalesService.listar()`, ya existente.
- Dropdown/lista "Doctor" -- multi-seleccion con iniciales como avatar
  (`DoctoresService.listar()`, ya existente; ver nota de avatares en
  Decisiones de alcance).
- Filtro de estado -- checkboxes con el mismo color de badge que ya
  existe, para ocultar/mostrar bloques por estado sin volver a pedir al
  backend (filtro en cliente sobre lo ya cargado del dia).
- **Mini-calendario de mes** -- unico componente realmente nuevo desde
  cero (no existe nada parecido hoy en el codebase): un
  `MiniCalendarioMesComponent` standalone, con su propia logica de
  "generar la grilla de 6x7 dias para un mes dado" (helper puro,
  testeable, sin dependencias), que emite la fecha elegida hacia arriba
  para mover el calendario principal.

### 5. Cambio de estrategia de consulta en la pantalla de Citas

Hoy `cargar()` pide TODAS las citas sin filtro y filtra en cliente. Para
que la vista Calendario sea rapida a medida que crece el historial, el
`cargar()` de la vista Calendario debe pedir solo
`{ desde: fechaVisible, hasta: fechaVisible }` (mas
`doctor_id`/`sucursal_id` si el sidebar los tiene seleccionados) en vez
de todo. La vista Lista (tabla) puede seguir como esta hoy sin tocarla,
ya que es un cambio no relacionado y fuera de alcance de este pedido.

## Archivos que se tocarian al implementar

- `frontend/src/app/features/citas/citas.component.ts/.html/.css` --
  agregar el toggle Lista/Calendario y el estado de la vista activa;
  todo lo demas (form, drawers, metodos existentes) se reutiliza.
- Nuevos, bajo `frontend/src/app/features/citas/calendario/` (nombre de
  carpeta sugerido):
  - `calendario-dia.component.ts/.html/.css`
  - `cita-detalle-popover.component.ts/.html/.css`
  - `mini-calendario-mes.component.ts/.html/.css`
  - un archivo de utilidades puras (ej. `calendario.util.ts`) con las
    funciones de posicionamiento por hora, deteccion de solapes, y
    generacion de la grilla del mini-calendario -- separadas de los
    componentes para poder probarlas sin Angular.
- Sin cambios de backend ni de base de datos para esta v1 (todo lo que
  hace falta ya existe); la unica excepcion seria si se decide agregar
  el endpoint batch de disponibilidad multi-doctor mencionado abajo.

## Fuera de alcance de esta v1 (candidatos a fase 2)

- Vista Semana (mismo motor, layout distinto).
- Drag-and-drop para reagendar arrastrando un bloque (hoy se reagenda
  editando la cita con el formulario existente).
- Endpoint batch de disponibilidad multi-doctor (hoy solo existe
  per-doctor; para sombrear "no atiende" en muchas columnas a la vez
  bastaria llamar el endpoint existente una vez por doctor visible, que
  es aceptable para un dia con pocos doctores).
- Foto real de doctor (columna `foto` + upload) -- v1 usa iniciales.
- Boton de pago / facturacion (explicitamente fuera, ver Contexto).
- Buscador de paciente por nombre/identificacion tipo autocomplete al
  crear una cita (existe un patron reutilizable,
  `BuscadorAntecedenteComponent`, para cuando se quiera mejorar el
  `<select>` plano actual de paciente).

## Verificacion (cuando se implemente)

1. `npx tsc --noEmit` + `ng build` en frontend.
2. QA con JWT/cuenta de prueba: crear citas de prueba en distintos
   horarios/doctores/estados el mismo dia, confirmar que el calendario
   las posiciona correctamente, que los solapes se ven bien, que los
   pills de estado en la tarjeta persisten via `actualizar()`, y que
   los accesos a Historia/Signos/Recetas/Laboratorio abren los mismos
   drawers que ya funcionan desde la tabla.
3. Probar el mini-calendario navegando entre meses y seleccionando una
   fecha con y sin citas.
4. Probar en mobile/pantalla angosta -- el layout de columnas por
   doctor es el punto mas dificil de adaptar a pantallas chicas (fuera
   de alcance definir la solucion exacta en este plan; se decide al
   implementar, probablemente con scroll horizontal de columnas).
5. Confirmar que la vista Lista (tabla) sigue funcionando exactamente
   igual que hoy, sin regresiones.
