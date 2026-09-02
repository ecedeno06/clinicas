# Clinica Medica (multitenant)

Sistema de gestion para clinicas medicas, multitenant (varias clinicas
comparten el mismo sistema, cada una viendo solo sus propios datos).
Arquitectura identica a la del proyecto "Servicio-Horas": Node.js +
Express + PostgreSQL en el backend, Angular 18 (standalone components)
en el frontend, mismo sistema de diseño (ver `PLANTILLA-UI.md` de ese
proyecto).

## Modulos (v1)

- **Pacientes**: catalogo de pacientes con datos personales, contacto de
  emergencia y alergias.
- **Doctores**: catalogo de doctores, cada uno con su especialidad.
- **Especialidades**: catalogo de especialidades medicas de la clinica.
- **Citas**: agenda paciente/doctor, con validacion de choque de horario
  para un mismo doctor.
- **Historias clinicas**: una por cita atendida (motivo, diagnostico,
  tratamiento, notas) — visible solo para roles `admin` y `doctor`.

## Roles

- **admin**: gestiona todo dentro de su clinica (pacientes, doctores,
  especialidades, citas, usuarios).
- **recepcionista**: gestiona pacientes y agenda citas. No ve historias
  clinicas.
- **doctor**: ve su agenda, registra/edita historias clinicas.
- **super-admin** (atributo del usuario, no un rol de clinica): gestiona
  las clinicas mismas (alta de nuevas clinicas) desde la pantalla
  "Clinicas", igual que en Servicio-Horas.

## 1. Base de datos

Este proyecto quedo configurado para apuntar por defecto a un Postgres
local en `192.168.0.19` (mismo servidor que usa Servicio-Horas), con una
base de datos nueva: `clinica_medica`.

```bash
# 1. Crear la base de datos (ejecutar contra el servidor de Postgres)
psql "postgresql://postgres:TU_PASSWORD@192.168.0.19:5432/postgres" -c "create database clinica_medica;"

# 2. Cargar el esquema
psql "postgresql://postgres:TU_PASSWORD@192.168.0.19:5432/clinica_medica" -f backend/database/schema.sql
```

### Crear el primer usuario (super-admin)

```bash
cd backend
node -e "console.log(require('bcryptjs').hashSync('TU_PASSWORD_AQUI', 10))"
```

Con el hash que imprima, correr:

```sql
insert into usuarios (nombre, email, password_hash, es_super_admin)
values ('Super Admin', 'admin@clinica.com', '<pegar-el-hash-aqui>', true);
```

Con ese usuario puedes entrar, crear la primera clinica desde la pantalla
"Clinicas", y luego asociar/crear el resto de usuarios (admin de esa
clinica, doctores, recepcionistas) desde ahi o desde "Usuarios".

## 2. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con la DATABASE_URL real
npm install   # ya se corrio una vez durante la creacion del proyecto
npm run dev   # nodemon, puerto 3001 por defecto
```

## 3. Frontend

```bash
cd frontend
npm install   # ya se corrio una vez durante la creacion del proyecto
npm start     # ng serve, puerto 4201 por defecto
```

Abrir `http://localhost:4201`.

## Puertos

Se usaron puertos distintos a Servicio-Horas (3000/4200) para poder
correr ambos proyectos al mismo tiempo en la misma maquina sin choques:

- Backend: **3001**
- Frontend: **4201**

## Estado actual

- Backend: completo, corriendo contra la base de datos real en
  `192.168.0.19`.
- Frontend: completo, probado en navegador contra el backend real.
- Base de datos: `clinica_medica` creada, esquema cargado, y usuario
  super-admin inicial creado.
- Pasada de pruebas end-to-end (login, crear clinica, crear
  especialidad/doctor/paciente, agendar una cita, marcarla como
  atendida y registrar su historia clinica) completada sin errores,
  tanto por API como en el navegador (login, seleccion de clinica,
  dashboard, listado de pacientes y citas).
