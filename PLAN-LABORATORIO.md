# Plan de Implementación - Módulo de Laboratorio Clínico

> **Proyecto:** Clínica Médica (multitenant) — `C:\proyectos\clinica`  
> **Fecha:** 2026-09-03  
> **Estado:** Propuesto — Pendiente de inicio de desarrollo  
> **Documento de Diseño relacionado:** [`DISENO-LABORATORIO.md`](file:///C:/proyectos/clinica/DISENO-LABORATORIO.md)

---

## 1. Resumen Ejecutivo

Este plan describe los pasos técnicos para incorporar el módulo completo de **Laboratorio Clínico** en el sistema.
El módulo abarcará:
- **Catálogo de Pruebas y Parámetros:** Pruebas predefinidas globales y personalizadas por clínica con plantillas de parámetros y rangos de referencia.
- **Solicitud de Órdenes:** Creación de órdenes de laboratorio desde la atención médica (citas) o recepción.
- **Control de Estados y Prioridades:** Estados (`solicitado`, `muestra_tomada`, `en_proceso`, `completado`, `cancelado`) y banderas de urgencia (`normal`, `urgente`).
- **Captura de Resultados:** Formulario estructurado para ingresar valores por parámetro, detección visual de valores anormales y observaciones.
- **Adjuntos e Impresión:** Carga de reportes PDF/Imágenes escaneados y plantilla de impresión en papel/PDF corporativa (`window.print()`).

---

## 2. Puntos Abiertos y Decisiones de Arquitectura

1. **Almacenamiento de Adjuntos (PDFs/Imágenes)**:
   - *Propuesta:* Guardar adjuntos escaneados en formato `Base64` en PostgreSQL (tabla `laboratorio_adjuntos`), igual que avatares y logos actualmente.

2. **Gestión de Roles**:
   - *Propuesta:* Los roles actuales (`doctor`, `recepcionista`, `admin`) tendrán permisos de solicitud y captura de resultados. Se puede evaluar añadir el rol `laboratorista` si la clínica cuenta con personal exclusivo para esta área.

---

## 3. Cambios Propuestos por Componente

### A. Base de Datos (`backend/database`)

#### `[NUEVO]` [`007_laboratorio.sql`](file:///C:/proyectos/clinica/backend/database/migrations/007_laboratorio.sql)
- **`catalogo_laboratorio`**: `id`, `empresa_id` (NULL = global), `codigo`, `nombre`, `categoria`, `descripcion`, `parametros` (JSONB con unidades y rangos ref.), `activo`.
- **`ordenes_laboratorio`**: `id`, `empresa_id`, `paciente_id`, `cita_id`, `doctor_id`, `estado`, `prioridad`, `notas_medicas`, `fecha_orden`.
- **`orden_laboratorio_detalles`**: `id`, `orden_laboratorio_id`, `catalogo_laboratorio_id`, `observaciones`.
- **`resultados_laboratorio`**: `id`, `orden_detalle_id`, `parametro_nombre`, `resultado_valor`, `unidad`, `rango_referencia`, `es_anormal`, `observaciones`, `registrado_por`.
- **`laboratorio_adjuntos`**: `id`, `orden_laboratorio_id`, `nombre_archivo`, `mime_type`, `archivo_base64`, `tamano_bytes`, `subido_por`.
- **Seeds**: Carga de catálogo básico (Hemograma completo, Perfil Lipídico, Glucosa en Ayunas, Examen General de Orina, etc.).

---

### B. Backend REST API (`backend/src`)

#### `[NUEVO]` [`src/controllers/laboratorio.controller.js`](file:///C:/proyectos/clinica/backend/src/controllers/laboratorio.controller.js)
- Métodos CRUD para catálogo: `listarCatalogo`, `crearPrueba`, `actualizarPrueba`, `eliminarPrueba`.
- Métodos para órdenes: `listarOrdenes`, `obtenerOrdenPorId`, `crearOrden`, `actualizarEstadoOrden`, `cancelarOrden`.
- Métodos para resultados: `guardarResultados`.
- Métodos para adjuntos: `subirAdjunto`, `descargarAdjunto`, `eliminarAdjunto`.

#### `[NUEVO]` [`src/routes/laboratorio.js`](file:///C:/proyectos/clinica/backend/src/routes/laboratorio.js)
- Definición de rutas protegidas con middleware de autenticación JWT.

#### `[MODIFICAR]` [`src/server.js`](file:///C:/proyectos/clinica/backend/src/server.js)
- Registrar middleware y rutas `/api/laboratorio`.

---

### C. Frontend Angular 18 (`frontend/src/app`)

#### `[NUEVO]` Modelos y Servicios
- **`services/laboratorio.service.ts`**: Métodos HTTP para la API de laboratorio.
- **`models.ts`**: Adición de interfaces TypeScript (`CatalogoLaboratorio`, `OrdenLaboratorio`, `ResultadoLaboratorio`, `LaboratorioAdjunto`).

#### `[NUEVO]` Componentes UI
- **`laboratorio/laboratorio-list.component.ts`**: Bandeja de órdenes con filtros por estado (`Solicitados`, `Muestra tomada`, `En proceso`, `Completados`), prioridad y paciente.
- **`laboratorio/laboratorio-form.component.ts`**: Modal para prescribir exámenes o registrar/validar resultados.
- **`laboratorio/laboratorio-print.component.ts`**: Formato de impresión corporativo (`window.print()`).

#### `[MODIFICAR]` Ficha de Citas / Consulta Médica
- Incorporar pestaña **"Laboratorio"** en la atención médica para solicitar exámenes directamente sin salir de la consulta.

---

## 4. Plan de Verificación y Pruebas

### Pruebas Automatizadas y de Backend
1. Aplicación de la migración `007_laboratorio.sql` en PostgreSQL local / Neon.
2. Pruebas de endpoints via HTTP/curl:
   - Creación de orden de laboratorio asociada a paciente y cita.
   - Cambio de estado de orden (`solicitado` -> `muestra_tomada` -> `en_proceso` -> `completado`).
   - Envío de lote de resultados numéricos y archivo PDF adjunto.
   - Verificación de consulta de resultados y detección de valores anormales.

### Pruebas Manuales (Frontend)
1. Inicio de sesión como médico (`doctor`) y creación de orden desde la ficha de cita.
2. Cambio de rol a recepción/laboratorio para procesar la orden y capturar resultados.
3. Impresión del reporte de laboratorio y verificación visual del membrete y tabla de resultados.
