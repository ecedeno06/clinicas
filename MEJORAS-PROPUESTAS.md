# Mejoras propuestas para el sistema de clinica medica

> Basado en una recomendacion externa sobre arquitectura de sistemas clinicos,
> contrastada contra el estado actual de este proyecto (`backend/` Node+Express+PostgreSQL,
> `frontend/` Angular). Sirve como hoja de ruta para decidir que construir despues.

## Estado actual del proyecto

Ya implementado (ver `backend/database/schema.sql` y `backend/src/routes/`):

- Multi-tenant por `empresa_id` en todas las tablas (clinicas independientes comparten esquema).
- Modulos: Pacientes, Citas, Doctores, Especialidades, Usuarios, Empresas (clinicas).
- Historia clinica basica: una fila en `historias_clinicas` por cita (`motivo_consulta`,
  `diagnostico`, `tratamiento`, `notas`).
- Roles: `admin`, `doctor`, `recepcionista` por clinica (`usuarios_empresas_rol`), mas
  `es_super_admin` global. Permisos simples ya aplicados en frontend (`auth.puedeEditar()`,
  `auth.puedeEliminar()`) y validados en backend (middleware `auth.js`).
- Autenticacion con JWT (`JWT_SECRET`, `JWT_EXPIRES_IN`).
- Cambio de contrasena, avatar de usuario, logo de clinica (base64 en BD).
- Signos vitales por cita (`signos_vitales`): temperatura, peso, talla/IMC, presion
  arterial, glucosa y glucosa glicosilada (HbA1c). Ver seccion 2.
- Recetas por cita (`recetas` + `receta_medicamentos`): N medicamentos por receta
  (medicamento, dosis, frecuencia, duracion, indicaciones), impresion via `window.print()`
  (el navegador permite "Guardar como PDF" sin agregar ninguna libreria).

No implementado todavia (lo que cubre este documento): laboratorio, imagenes, facturacion,
hospitalizacion, inventario, MFA, auditoria, reportes/dashboard, portal de paciente,
notificaciones, telemedicina, y varios campos clinicos mas ricos (examen fisico,
antecedentes, alergias estructuradas, medicamentos actuales, evoluciones).

---

## 1. Modulos por agregar

| Modulo | Que cubre | Prioridad sugerida |
|---|---|---|
| Historia clinica (ampliada) | ~~Signos vitales~~ (implementado), examen fisico, antecedentes, alergias estructuradas, medicamentos actuales, evoluciones | Alta |
| ~~Recetas~~ | ~~Medicamentos, dosis, frecuencia, duracion, indicaciones, impresion en PDF~~ (implementado) | Alta |
| Laboratorio | Ordenes, resultados, archivos adjuntos, valores de referencia | Media |
| Imagenes medicas | Ordenes, informes, archivos asociados | Media |
| Facturacion | Servicios, consultas, facturas, pagos, saldos, copagos, seguros | Media |
| Hospitalizacion | Habitaciones, camas, admisiones, altas, evolucion durante internamiento | Baja (solo si aplica al negocio) |
| Inventario | Medicamentos/insumos, lotes, vencimientos, movimientos | Baja (solo si la clinica maneja farmacia propia) |
| Reportes / Dashboard | Pacientes, consultas, ingresos, medicos, diagnosticos, indicadores | Alta |
| Configuracion | Sucursales, servicios, catalogos (ya existe especialidades; falta el resto) | Media |

## 2. Historia clinica: modelo propuesto

Estructura recomendada, construyendo sobre lo que ya existe (`pacientes`, `citas`, `historias_clinicas`):

```
Paciente
 -> Informacion personal          (ya existe: pacientes)
 -> Contactos de emergencia       (ya existe: pacientes.contacto_emergencia)
 -> Antecedentes                  (nuevo: antecedentes_medicos)
 -> Alergias                      (ya existe como texto libre; considerar tabla estructurada)
 -> Medicamentos actuales         (nuevo: medicamentos_paciente)
 -> Citas
     -> Signos vitales            (nuevo: tabla signos_vitales, 1 por cita — ver detalle abajo)
     -> Historia clinica (0 o 1)  (ya existe: historias_clinicas)
         -> Examen fisico         (nuevo: campo)
         -> Diagnostico           (ya existe)
         -> Tratamiento           (ya existe)
         -> Recetas               (nuevo: modulo recetas)
         -> Ordenes de laboratorio (nuevo: modulo laboratorio)
         -> Ordenes de imagenes   (nuevo: modulo imagenes)
         -> Evolucion             (nuevo: notas_evolucion, para seguimiento post-consulta)
```

### Signos vitales (tomados al llegar el paciente a su cita)

Se ata a `cita_id`, **no** a `historia_clinica_id`: en la practica se toman en
recepcion/enfermeria cuando el paciente llega, antes de que el doctor abra la consulta
y registre diagnostico. Si dependieran de la historia clinica, no se podrian capturar
hasta que el doctor ya hubiera creado esa fila.

**Momento de captura vs. momento de agendado**: una cita puede agendarse con dias o
semanas de anticipacion (`estado='pendiente'`), pero la fila de `signos_vitales` no se
crea en ese momento — se crea el mismo dia, cuando el paciente llega fisicamente a la
clinica para esa cita puntual. `cita_id` solo indica a que visita pertenecen los datos,
no cuando se capturaron (eso ya lo registra `created_at`). Es el mismo patron que ya usa
`historias_clinicas` hoy: se crea solo cuando el doctor atiende, sin importar cuanto
tiempo llevaba agendada la cita, y sin necesidad de un estado intermedio nuevo en
`citas.estado` — la sola existencia de la fila ya funciona como senal de "el paciente
llego y le tomaron signos vitales".

Campos minimos:

| Campo | Tipo | Unidad |
|---|---|---|
| Temperatura | numeric | °C |
| Peso | numeric | kg |
| Talla / estatura | numeric | cm |
| IMC | numeric, calculado (peso / talla²) | kg/m² |
| Presion arterial sistolica | integer | mmHg |
| Presion arterial diastolica | integer | mmHg |
| Glucosa | numeric | mg/dL |
| Glucosa glicosilada (HbA1c) | numeric | % |

Se guardan como una tabla `signos_vitales` (1 fila por `historia_clinica_id`, igual que
`historias_clinicas` es 1 fila por `cita_id`), en vez de columnas sueltas en
`historias_clinicas`, para poder llevar tendencia del paciente en el tiempo (ej. grafica
de peso o presion arterial a lo largo de sus consultas) sin tener que pasar por la tabla
de citas.

Recomendacion concreta: antes de agregar tablas nuevas, decidir si "antecedentes",
"alergias" y "medicamentos actuales" quedan como texto libre (rapido, ya es el patron
actual en `pacientes.alergias`) o se normalizan en tablas catalogadas (mejor para
reportes y alertas de interaccion medicamentosa, pero mas trabajo).

## 3. Seguridad

Con lo que ya hay (roles + JWT) como base, faltaria:

- **RBAC mas granular**: hoy el control es basicamente admin/doctor/recepcionista a nivel
  de modulo. Si se agrega laboratorio/facturacion, cada rol necesita permisos explicitos
  por modulo (ej. facturacion no deberia ver diagnosticos; enfermeria no deberia editar
  historia completa).
- **MFA/OTP** en login, al menos opcional para roles admin.
- **Auditoria**: tabla `auditoria` (quien, que registro, que cambio, cuando, desde que IP).
  Aplica sobre todo a historias clinicas, recetas y facturacion.
- **Cifrado de datos sensibles** en reposo (o al menos evaluar que campos lo requieren:
  identificacion, diagnosticos).
- **Backups automaticos** de la base (independiente del proveedor: Neon/Supabase suelen
  ofrecer point-in-time recovery, pero conviene confirmar la politica de retencion).

## 4. Multi-clinica / multi-sucursal

Ya resuelto en el modelo actual (`empresa_id` en todas las tablas). Si se agregan
sucursales dentro de una misma clinica, evaluar si conviene una tabla `sucursales`
(N sucursales por `empresa_id`) en vez de tratarlas como clinicas separadas — depende
de si comparten pacientes/doctores o no.

## 5. Extras a considerar (no urgentes, pero a tener en el radar)

- Portal del paciente (ver sus propias citas/recetas/resultados).
- Recordatorios de citas por WhatsApp/SMS/email.
- Telemedicina (videollamada integrada).
- Firma digital y consentimientos informados en PDF.
- Certificados medicos e incapacidades generadas desde el sistema.
- Referencias/interconsultas entre especialistas.
- Gestion de seguros, autorizaciones y copagos (ligado a facturacion).
- Integracion con laboratorios externos (recepcion de resultados por API/HL7).

## 6. Arquitectura de referencia

Vale la pena adoptarla progresivamente, no de una vez:

```
Angular (frontend)
      |
API REST / HTTPS
      |
Node.js + Express (backend actual)
      |
  +---+-------------------+
  |                       |
PostgreSQL            Storage (archivos)
(ya en uso)           - documentos
                       - resultados de laboratorio
                       - imagenes medicas
```

Capas transversales a reforzar sobre el backend actual:

```
Authentication      (ya existe: JWT)
Authorization/RBAC  (existe basico; falta granularidad por modulo)
Audit Log           (no existe)
Business Modules     (pacientes/citas/doctores/etc. ya existen)
```

Nota sobre `Redis` y storage de archivos: no son necesarios para el alcance actual
(sin colas, sin cache pesado, sin archivos binarios grandes fuera de logos/avatares en
base64). Solo se vuelven relevantes cuando se agreguen laboratorio/imagenes con archivos
reales, o si el volumen de trafico lo justifica — no agregarlos antes de tener la
necesidad concreta.

## 7. Orden sugerido de implementacion

1. Ampliar historia clinica: primero signos vitales (temperatura, peso, talla/IMC,
   presion arterial, glucosa — tabla nueva, esfuerzo bajo, se toma en toda atencion),
   luego examen fisico, antecedentes y evolucion.
2. Recetas (modulo pequeno, alto valor, reusa el patron de `historias_clinicas`).
3. Reportes/Dashboard basico (aprovecha los datos que ya existen, no requiere nuevas tablas).
4. RBAC mas granular + auditoria (antes de agregar modulos con datos mas sensibles como
   facturacion o laboratorio).
5. Laboratorio e imagenes (requieren storage de archivos).
6. Facturacion (requiere definir reglas de negocio: servicios, precios, seguros).
7. Hospitalizacion / inventario, solo si el modelo de negocio de la clinica los necesita.
