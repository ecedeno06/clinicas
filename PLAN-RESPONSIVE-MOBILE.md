# Ajuste a dispositivos moviles -- control de avance

Auditoria hecha el 2026-09-16 sobre el estado real del codigo (no hay
ningun breakpoint de ancho en todo el proyecto salvo uno, en el
calendario de citas). Estimados de esfuerzo humano tradicional y de
esfuerzo IA (este asistente implementando directamente) -- ver el
historial de conversacion para el detalle completo de cada estimado.

Convenciones:
- [x] hecho -- [ ] pendiente
- "Esfuerzo IA" es horas de trabajo activo (build + QA visual), no
  tiempo de reloj -- no incluye las idas y vueltas de revision/diseno
  contigo, que siguen siendo el cuello de botella real.

## Trabajo base (una sola vez, desbloquea el resto)

| Ítem | Esfuerzo humano | Esfuerzo IA | Estado |
|---|---|---|---|
| Menu lateral/topbar para mobile (hamburguesa + off-canvas) | 1–1.5 dias | ~2.5 h | [x] Hecho 2026-09-16 |
| Utilidad de `flex-wrap` + retocar los ~86 usos de `.flex` | 1–1.5 dias | ~2 h | [ ] Pendiente |
| `max-width:100%` en `.auth-card` (login/restablecer/recuperar-2fa) | 0.25 dias | ~15 min | [ ] Pendiente |
| Rediseno del grid semanal de horario (7 columnas) a vista por-dia | 1 dia | ~2 h | [ ] Pendiente |

### Detalle de lo hecho: Menu lateral/topbar (2026-09-16)

- `frontend/src/app/features/layout/layout.component.ts`: nuevo signal
  `sidebarMobileAbierto` (independiente de `sidebarColapsado`, que es el
  modo "solo iconos" de escritorio); se cierra solo al navegar
  (suscripcion a `Router.events` filtrando `NavigationEnd`), no con un
  `(click)` por link (para no cerrarse tambien al abrir el submenu de
  "Reportes").
- `layout.component.html`: boton de hamburguesa nuevo en el topbar
  (`.hamburger-btn`, oculto en escritorio), backdrop semitransparente
  (`.sidebar-backdrop`) que cierra el menu al tocarlo, boton "X"
  (`.sidebar-close-mobile`) dentro del sidebar. Se ocultan en mobile
  (`.hide-mobile`) el nombre de la clinica, el badge de base de datos,
  el cronometro de sesion y el nombre/rol del usuario en el topbar --
  info secundaria, sigue disponible completa en escritorio.
- `styles.css`: nuevo breakpoint `@media (max-width: 860px)` (mismo
  ancho que ya usaba el calendario de citas) que convierte el sidebar en
  panel off-canvas (`position:fixed`, `transform:translateX(-100%)` /
  `.mobile-open` lo desliza a la vista), con reglas especificas para que
  el modo "colapsado" de escritorio no interfiera si el usuario lo tenia
  activo antes de ver la app en mobile.
- Bug encontrado y corregido en el camino: `.hamburger-btn { display:
  none }` no aplicaba en escritorio por un empate de especificidad CSS
  contra `.btn-icon` (definida mas abajo en el archivo, con la misma
  especificidad) -- se resolvio combinando ambas clases en el selector
  (`.btn-icon.hamburger-btn`).
- Verificado con Playwright: mobile (375px) con menu cerrado/abierto,
  cierre automatico al navegar a otra pantalla, y escritorio (1400px)
  sin ningun cambio visual.

## Por pantalla

| Pantalla | Ruta | Esfuerzo humano | Esfuerzo IA | Estado |
|---|---|---|---|---|
| Login | /login | 0.25 dias | ~15 min | [ ] Pendiente |
| Restablecer password | /restablecer-password | 0.25 dias | ~15 min | [ ] Pendiente |
| Recuperar 2FA | /recuperar-2fa | 0.25 dias | ~15 min | [ ] Pendiente |
| Politica de password | /politica-password | 0.25 dias | ~15 min | [ ] Pendiente |
| Seguridad (2FA) | drawer, sin ruta propia | 0.25 dias | ~15 min | [ ] Pendiente |
| Especialidades | /especialidades | 0.5 dias | ~30 min | [ ] Pendiente |
| Catalogo antecedentes | /catalogo-antecedentes | 0.5 dias | ~30 min | [ ] Pendiente |
| Catalogo examenes lab | /catalogo-examenes-laboratorio | 0.5 dias | ~30 min | [ ] Pendiente |
| Reporte de campanas | /reportes/campanas | 0.5 dias | ~30 min | [ ] Pendiente |
| Dashboard | /dashboard | 1 dia | ~1 h | [ ] Pendiente |
| Reporte de citas | /reportes/citas | 1 dia | ~1 h | [ ] Pendiente |
| Empresas | /empresas | 1 dia | ~1 h | [ ] Pendiente |
| Usuarios | /usuarios | 1 dia | ~1 h | [ ] Pendiente |
| Sucursales | /sucursales | 1 dia | ~1 h | [ ] Pendiente |
| Portal doctor -- Mi Perfil | /portal-doctor/perfil | 0.75 dias | ~45 min | [ ] Pendiente |
| Campanas | /campanas | 1.5 dias | ~1.5 h | [ ] Pendiente |
| Doctores | /doctores | 1.5 dias | ~1.5 h | [ ] Pendiente |
| Portal paciente -- Mi Perfil | /portal/perfil | 1 dia | ~1 h | [ ] Pendiente |
| Portal paciente -- Mis Citas | /portal/citas | 2 dias | ~2 h | [ ] Pendiente |
| Pacientes | /pacientes | 2.5 dias | ~2.5 h | [ ] Pendiente |
| Citas -- Lista | /citas | 3 dias | ~3 h | [ ] Pendiente |
| Citas -- Calendario | /citas (vista calendario) | 3–4 dias | ~4 h | [ ] Pendiente -- necesita decidir reemplazo del drag-and-drop en tactil |

## Totales

| | Esfuerzo humano | Esfuerzo IA |
|---|---|---|
| Total | ~28 dias | ~32 h |
| Hecho | ~1–1.5 dias | ~2.5 h |
| Restante | ~26.5–27 dias | ~29.5 h |
