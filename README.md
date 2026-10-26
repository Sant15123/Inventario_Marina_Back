# SIGA-FMO Backend API

> **Sistema Integral de Gestión de Activos, Mobiliario y Consumibles (SIGA)**  
> **Fundación Marina Orth (FMO)**  
> API RESTful modular de alto rendimiento para la administración, trazabilidad en tiempo real, control transaccional de stock y asignación pedagógica de activos tecnológicos, mobiliario formativo, consumibles de robótica/papelería y requerimientos institucionales.

---

## 📌 Tabla de Contenidos

- [1. Descripción General](#1-descripción-general)
- [2. Stack Tecnológico y Dependencias](#2-stack-tecnológico-y-dependencias)
- [3. Arquitectura y Esquema Relacional de Base de Datos](#3-arquitectura-y-esquema-relacional-de-base-de-datos)
- [4. Diagrama de Flujo y Ciclo de Vida de los Datos](#4-diagrama-de-flujo-y-ciclo-de-vida-de-los-datos)
- [5. Autenticación, Roles y Seguridad](#5-autenticación-roles-y-seguridad)
- [6. Catálogo de Endpoints de la API REST](#6-catálogo-de-endpoints-de-la-api-rest)
- [7. Despliegue en Render y Variables de Entorno](#7-despliegue-en-render-y-variables-de-entorno)
- [8. Guía de Instalación, Pruebas y Desarrollo Local](#8-guía-de-instalación-pruebas-y-desarrollo-local)
- [9. Estructura del Proyecto](#9-estructura-del-proyecto)

---

## 1. Descripción General

**SIGA-FMO Backend API** centraliza y salvaguarda la integridad de las operaciones de inventario de la Fundación Marina Orth a través de múltiples sedes educativas (Medellín, El Carmen de Viboral y zonas de impacto regional).

### Principales capacidades del sistema:
- **Trazabilidad Integral y Préstamos:** Ciclo de vida completo para equipos físicos y mobiliario con asignación de custodios verificados, control de plazos pactados y auditoría de retorno.
- **Gestión Especializada de Mobiliario:** Módulo independiente para muebles y enseres de aulas STEAM (`MOB-XXXX`) con métricas de conservación física, materiales, colores y ubicación por sede.
- **Control Atómico de Existencias:** Prevención estricta de condiciones de carrera y sobre-asignaciones mediante transacciones SQL con bloqueos explícitos (`FOR UPDATE`) y cláusulas de salvaguarda (`disponible >= cantidad`).
- **Flujo de Radicación y Aprobación Pedagógica:** Gestión de solicitudes de inventario (`solicitudes_inventario` e `items_solicitud`) con soporte de despacho inmediato hacia préstamos activos o rechazo motivado.
- **Auditoría Centralizada:** Registro inmutable de cada entrada, salida, préstamo, devolución y ajuste en `historial_movimientos` con estampas de tiempo en UTC (`TIMESTAMPTZ`).
- **KPIs y Dashboard en Tiempo Real:** Métricas agregadas y funciones RPC nativas en PostgreSQL para visualización gerencial de inventario crítico, préstamos activos y vencimientos.

---

## 2. Stack Tecnológico y Dependencias

| Componente | Tecnología | Versión / Detalle |
| :--- | :--- | :--- |
| **Runtime** | [Node.js](https://nodejs.org/) | v18+ / v20+ LTS (ES Modules nativos `type: "module"`) |
| **Framework Web** | [Express.js](https://expressjs.com/) | v5.x (enrutamiento modular, controladores asíncronos) |
| **Base de Datos** | [PostgreSQL](https://www.postgresql.org/) | PostgreSQL 15+ gestionado en [Supabase Cloud](https://supabase.com/) |
| **Capa de Conexión / Driver** | `pg` (node-postgres) | Pool de conexiones SSL con soporte a PgBouncer / Transaction Pooler |
| **SDK Complementario** | `@supabase/supabase-js` | Cliente oficial para operaciones administrativas y almacenamiento |
| **Autenticación y Cifrado** | `bcrypt` + `pgcrypto` | Hasheo seguro de contraseñas (10 rondas de salt) y tokens JWT |
| **Tokens Web** | `jsonwebtoken` | Autenticación stateless vía Bearer Token con expiración y roles |
| **Seguridad HTTP** | `helmet`, `cors`, `express-rate-limit` | Cabeceras seguras, control de orígenes cruzados y rate limiting |
| **Procesamiento de Archivos** | `xlsx` (SheetJS) | Carga masiva de inventarios iniciales e importación de catálogos |
| **Pruebas y Calidad** | [Jest](https://jestjs.io/), [Supertest](https://github.com/ladjs/supertest) | Pruebas de integración, aserciones HTTP y cobertura de código |
| **Plataforma de Despliegue** | [Render](https://render.com/) | Web Service administrado con auto-deploy desde rama `main` |

---

## 3. Arquitectura y Esquema Relacional de Base de Datos

El backend interactúa directamente con un esquema relacional normalizado en PostgreSQL con integridad referencial, índices condicionales y disparadores.

```mermaid
erDiagram
    PERFILES ||--o{ SOLICITUDES_INVENTARIO : "radica"
    PERFILES ||--o{ PRESTAMOS : "custodio / solicitante"
    PERFILES ||--o{ ENTREGAS_CONSUMIBLES : "responsable"
    PERFILES ||--o{ HISTORIAL_MOVIMIENTOS : "ejecuta accion"
    
    SOLICITUDES_INVENTARIO ||--|{ ITEMS_SOLICITUD : "contiene"
    SOLICITUDES_INVENTARIO ||--o| PRESTAMOS : "origina despacho"
    
    PROYECTOS_STEAM ||--o{ PRESTAMOS : "vinculado a"
    PROYECTOS_STEAM ||--o{ ENTREGAS_CONSUMIBLES : "destinado a"

    ACTIVOS ||--o{ PRESTAMOS : "asignado en"
    CONSUMIBLES ||--o{ ENTREGAS_CONSUMIBLES : "salida en"
    PAPELERIA ||--o{ ENTREGAS_CONSUMIBLES : "despacho en"

    MOBILIARIO {
        uuid id PK
        varchar placa UK "MOB-XXXX"
        varchar nombre
        varchar categoria
        varchar sede
        varchar ubicacion_especifica
        varchar material
        varchar color
        varchar dimensiones
        varchar estado_conservacion
        int cantidad
        date fecha_adquisicion
        varchar proveedor_origen
        text observaciones
    }

    SOLICITUDES_INVENTARIO {
        uuid id PK
        uuid usuario_id FK
        varchar usuario_nombre
        varchar usuario_documento
        varchar sede
        varchar tipo_solicitud
        text motivo
        date fecha_devolucion_estimada
        varchar estado "PENDIENTE, APROBADA, RECHAZADA"
        text observaciones_admin
        timestamptz fecha_resolucion
    }

    ITEMS_SOLICITUD {
        serial id PK
        uuid solicitud_id FK
        varchar tipo_item "ACTIVO, CONSUMIBLE"
        varchar item_id
        varchar nombre_item
        int cantidad
    }
```

### Tablas Principales del Sistema

#### 1. `activos` (Equipos Tecnológicos)
Representa la ficha técnica individual de equipos tecnológicos (laptops, impresoras 3D, tabletas, visores VR, proyectores).
- **Columnas clave:** `id`, `placa` (única, ej. `FMO-EQ-001`), `serial` (con índice único condicional que ignora `S/N` o `N/A`), `nombre`, `marca`, `modelo`, `sede`, `ubicacion`, `ubicacion_estante`, `estado` (`Disponible`, `En campo`, `En Reparacion`, `De Baja`), `custodio`, `custodio_documento`, `usuario_id` (FK $\rightarrow$ `perfiles.id`).

#### 2. `mobiliario` (Muebles y Enseres de Aulas STEAM - *Nuevo*)
Entidad independiente creada para gestionar mesas modulares, sillas ergonómicas, estantes, tableros y armarios sin mezclar especificaciones informáticas.
- **Columnas clave:** `id` (UUID PK), `placa` (`MOB-XXXX` con índice único), `nombre`, `categoria` (`Mesas`, `Sillas`, `Almacenamiento`, `Tableros`, `Enseres`), `sede` (Default `'Medellín'`), `ubicacion_especifica`, `material`, `color`, `dimensiones`, `estado_conservacion` (`EXCELENTE`, `BUENO`, `REGULAR`, `MALO`), `cantidad`, `fecha_adquisicion`, `proveedor_origen`, `observaciones`.

#### 3. `solicitudes_inventario` e `items_solicitud` (Requerimientos Pedagógicos)
- **`solicitudes_inventario`:** Cabecera de solicitudes radicadas por formadores o líderes de sede. Estados soportados: `'PENDIENTE'`, `'APROBADA'`, `'RECHAZADA'`, `'CANCELADA'`.
- **`items_solicitud`:** Desglose de artículos (`tipo_item: 'ACTIVO' | 'CONSUMIBLE'`), identificador de catálogo (`item_id`), nombre y cantidad requerida.

#### 4. `prestamos` (Préstamos y Asignaciones Temporales)
Control de salidas temporales asociadas a proyectos educativos o formadores.
- **Columnas clave:** `id`, `placa_activo` (FK $\rightarrow$ `activos.placa`), `solicitud_id`, `proyecto_id` (FK $\rightarrow$ `proyectos_steam.id`, opcional / nullable), `solicitante`, `custodio_documento`, `usuario_id` (FK $\rightarrow$ `perfiles.id`), `sede`, `motivo`, `fecha_salida`, `fecha_devolucion_esperada`, `fecha_devolucion_real`, `estado` (`Activo`, `Devuelto`, `Vencido`).

#### 5. `consumibles` y `papeleria` (Insumos Fungibles)
- **`consumibles`:** Componentes de robótica y electrónica (`id: RobXXXX`, `material`, `categoria`, `disponible`, `minimo`).
- **`papeleria`:** Material fungible de oficina y talleres (`id: PapeXXXX`, `material`, `disponible`, `sede`, `ubicacion_estante: CAJA #1 a #11`).

#### 6. `entregas_consumibles` y `remisiones_consumibles` (Salidas Definitivas)
Registro inmutable de consumos con decremento transaccional de stock, custodio receptor y proyecto STEAM beneficiario.

#### 7. `perfiles` (Usuarios y Credenciales)
Tabla de usuarios del sistema con gestión de roles (`administrador`, `operador`, `supervisor`, `usuario`), cédula/documento único, correo en minúsculas y hash de contraseña con `bcrypt`.

#### 8. `proyectos_steam` (Iniciativas Educativas)
Catálogo de proyectos institucionales vinculados a municipios y préstamos (`id` UUID, `nombre`, `sede_municipio`, `descripcion`, `activo`).

#### 9. `historial_movimientos` (Libro Mayor de Auditoría)
Bitácora de eventos con tipo de acción (`Creación`, `Préstamo`, `Devolución`, `Salida Consumible`, `Baja`), elemento, cantidad, responsable, usuario y marca temporal UTC.

---

## 4. Diagrama de Flujo y Ciclo de Vida de los Datos

El siguiente diagrama ilustra el flujo de peticiones, validación transaccional y sincronización reactiva en la base de datos:

```mermaid
flowchart TD
    Client["Cliente Frontend (Vite / React / Web)"] -->|HTTP REST + Bearer JWT| Middlewares["Middlewares Express (Helmet, CORS, RateLimit, Auth)"]
    
    Middlewares --> Router{"Enrutador Principal (/api)"}
    
    Router -->|POST /api/solicitudes| SolicitudHandler["Controlador de Solicitudes"]
    Router -->|POST /api/prestamos| PrestamoHandler["Controlador de Préstamos (Aprobación / Despacho)"]
    Router -->|GET / POST /api/mobiliario| MobiliarioHandler["Controlador de Mobiliario (MOB-XXXX)"]
    Router -->|POST /api/consumibles/entregas| ConsumiblesHandler["Controlador de Salidas Definitivas"]
    
    subgraph TransaccionSQL ["Transacción PostgreSQL (BEGIN ... COMMIT)"]
        PrestamoHandler --> P1["Validar Custodio en perfiles (UUID o Documento)"]
        P1 --> P2["INSERT INTO prestamos (...)"]
        P2 --> P3["UPDATE activos SET estado = 'En campo', custodio = $1"]
        P3 --> P4["UPDATE solicitudes_inventario SET estado = 'APROBADA'"]
        P4 --> P5["INSERT INTO historial_movimientos (...)"]
        
        ConsumiblesHandler --> C1["SELECT disponible FROM consumibles FOR UPDATE"]
        C1 --> C2{"¿disponible >= cantidad?"}
        C2 -- No --> CRollback["ROLLBACK (HTTP 400 Stock Insuficiente)"]
        C2 -- Sí --> C3["UPDATE consumibles SET disponible = disponible - N"]
        C3 --> C4["INSERT INTO entregas_consumibles (...)"]
    end
    
    P5 --> DBCommit[("Base de Datos PostgreSQL / Supabase")]
    C4 --> DBCommit
    MobiliarioHandler --> DBCommit
    SolicitudHandler --> DBCommit
    
    DBCommit --> Response["Respuesta JSON Estandarizada { success: true, data: ... }"]
    Response --> Client
```

---

## 5. Autenticación, Roles y Seguridad

### Esquema de Roles y Permisos

| Rol | Alcance y Capacidades Operativas |
| :--- | :--- |
| **`administrador`** | Control total del sistema: gestión de usuarios, roles, catálogo maestro, aprobación/rechazo de solicitudes, eliminación física y auditoría. |
| **`operador`** | Operación logística y de bodega: registro de préstamos, devoluciones, despacho de solicitudes, entregas de consumibles y actualización de mobiliario. |
| **`supervisor`** | Acceso de supervisión y solo lectura (`GET` en inventarios, préstamos, reportes y dashboards) sin capacidad de mutación o despacho. |
| **`usuario`** | Docentes y formadores: radicación de solicitudes (`POST /api/solicitudes`), consulta de su propio perfil y visualización de catálogo general. |

### Medidas de Seguridad Implementadas:
1. **Protección de Credenciales al Editar:** El endpoint `PUT /api/usuarios/:id` preserva la contraseña preexistente si el payload no contiene un nuevo password o llega como cadena vacía.
2. **Normalización Automática de Correos:** En registro y login, el correo se normaliza a minúsculas (`toLowerCase().trim()`) para evitar duplicidades o bloqueos por mayúsculas.
3. **Exclusión de Hashes Sensibles:** Las respuestas de login, perfiles y listados excluyen el campo `password` para garantizar confidencialidad.
4. **Rate Limiting:** `/api/auth/login` cuenta con limitador por ventana de tiempo (`express-rate-limit`) previniendo ataques de fuerza bruta.

---

## 6. Catálogo de Endpoints de la API REST

### 1. Mobiliario Formativo (`/api/mobiliario`)

| Método | Endpoint | Descripción | Payload / Parámetros | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/mobiliario` | Lista mobiliario con filtros | Query: `?sede=...&categoria=...&search=...` | `200 OK` `{ success: true, count, data: [...] }` |
| `GET` | `/api/mobiliario/siguiente-placa` | Sugiere la siguiente placa correlativa (`MOB-XXXX`) | Ninguno | `200 OK` `{ success: true, data: { siguientePlaca: "MOB-0281" } }` |
| `POST` | `/api/mobiliario` | Registra nuevo mobiliario | `{ placa, nombre, categoria, sede, material?, color?, dimensiones?, estado_conservacion?, cantidad? }` | `201 Created` `{ success: true, data: { ... } }` |
| `PUT` | `/api/mobiliario/:id` | Actualiza atributos o estado de conservación | `{ nombre?, estado_conservacion?, ubicacion_especifica?, observaciones? }` | `200 OK` `{ success: true, data: { ... } }` |
| `DELETE` | `/api/mobiliario/:id` | Elimina registro de mobiliario | ID en URL (UUID) | `200 OK` `{ success: true, message: "..." }` |

### 2. Solicitudes de Inventario (`/api/solicitudes`)

| Método | Endpoint | Descripción | Payload / Parámetros | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/solicitudes` | Lista solicitudes radicadas | Query opcional: `?estado=PENDIENTE&sede=...` | `200 OK` `{ success: true, data: [...] }` |
| `GET` | `/api/solicitudes/:id` | Obtiene solicitud con sus ítems | ID en URL (UUID) | `200 OK` `{ success: true, data: { ...items: [...] } }` |
| `POST` | `/api/solicitudes` | Radica una nueva solicitud pedagógica | `{ sede, tipo_solicitud, motivo, fecha_devolucion_estimada?, items: [{ tipo_item, item_id, nombre_item, cantidad }] }` | `201 Created` `{ success: true, data: { id, estado: "PENDIENTE", ... } }` |
| `PATCH` | `/api/solicitudes/:id/rechazar` | Rechaza solicitud con motivo | `{ motivo_rechazo }` | `200 OK` `{ success: true, message: "Solicitud rechazada exitosamente" }` |
| `PATCH` | `/api/solicitudes/:id/estado` | Actualiza estado administrativo | `{ estado, observaciones_admin }` | `200 OK` `{ success: true, data: { ... } }` |

### 3. Préstamos y Despacho (`/api/prestamos`)

| Método | Endpoint | Descripción | Payload / Parámetros | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/prestamos` | Lista préstamos con datos relacionales | Query opcional: `?estado=Activo` | `200 OK` `{ success: true, data: [...] }` |
| `POST` | `/api/prestamos` | Registra préstamo o despacha solicitud | `{ itemId (o unitCodes / placas), solicitante, sede, motivo, fecha_devolucion?, solicitud_id?, proyecto_id? }` | `201 Created` `{ success: true, data: { ... } }` |
| `PUT` | `/api/prestamos/:id/devolver` | Registra devolución y libera activo | `{ fecha_devolucion_real?, observaciones? }` | `200 OK` `{ success: true, message: "..." }` |

### 4. Activos Tecnológicos (`/api/activos`)

| Método | Endpoint | Descripción | Payload / Parámetros | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/activos` | Catálogo de activos tecnológicos | Query: `?categoria=...&sede=...&search=...` | `200 OK` `{ success: true, data: [...] }` |
| `POST` | `/api/activos` | Alta de equipo tecnológico | `{ placa, nombre, marca, modelo, serial, sede, ubicacion_estante }` | `201 Created` `{ success: true, data: { ... } }` |
| `PUT` | `/api/activos/:id` | Modificación de ficha técnica | Ficha con campos editados | `200 OK` `{ success: true, data: { ... } }` |
| `DELETE` | `/api/activos/:id` | Baja o remoción de activo | ID en URL | `200 OK` `{ success: true, message: "..." }` |

### 5. Consumibles y Papelería (`/api/consumibles` y `/api/papeleria`)

| Método | Endpoint | Descripción | Payload / Parámetros | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/consumibles` | Existencias de componentes de robótica | Ninguno | `200 OK` `{ success: true, data: [...] }` |
| `POST` | `/api/consumibles/entregas` | Salida definitiva con descuento atómico | `{ material_id, cantidad, responsable, sede, proyecto_motivo }` | `201 Created` `{ success: true, data: { ... } }` |
| `GET` | `/api/papeleria` | Inventario de papelería clasificado | Query opcional: `?sede=...` | `200 OK` `{ success: true, data: [...] }` |

### 6. Autenticación, Usuarios y Dashboard

| Método | Endpoint | Descripción | Acceso |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Autenticación con email/password y retorno de JWT | Público (Rate Limited) |
| `POST` | `/api/auth/cambiar-password` | Cambio de contraseña validando password actual con bcrypt | Autenticado |
| `GET` | `/api/usuarios` | Listado de perfiles institucionales | Administrador / Supervisor |
| `PUT` | `/api/usuarios/:id` | Edición de usuario (preserva password si viene vacío) | Administrador |
| `GET` | `/api/dashboard/kpis` | Métricas agregadas (totales, críticos, préstamos) | Autenticado |
| `GET` | `/health` / `/api/health` | Verificación de estado del servicio y uptime | Público |

---

## 7. Despliegue en Render y Variables de Entorno

El backend está configurado para despliegue continuo en la plataforma **Render** conectándose a PostgreSQL en **Supabase** mediante el puerto seguro de PgBouncer.

### Configuración del Servicio en Render:
- **Service Type:** Web Service.
- **Environment:** Node.
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/health` o `/api/health`

### Matriz de Variables de Entorno (`.env`):

| Variable | Tipo | Obligatoria | Descripción / Ejemplo |
| :--- | :--- | :---: | :--- |
| `PORT` | Número | No | Puerto de escucha local (Default: `3000`, asignado dinámicamente en Render). |
| `NODE_ENV` | String | Sí | Entorno de ejecución (`production`, `development`, `test`). |
| `DATABASE_URL` | String (URI) | Sí | Cadena de conexión hacia PostgreSQL / Supabase Pooler con SSL activado.<br/>`postgres://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require` |
| `SUPABASE_URL` | String (URL) | Sí | URL del proyecto Supabase: `https://[PROJECT_REF].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | String (JWT) | Sí | Llave de rol de servicio (`service_role`) para operaciones administrativas en Supabase. |
| `JWT_SECRET` | String | Sí | Semilla criptográfica secreta para firmar y verificar tokens Bearer. |
| `CORS_ORIGIN` | String / CSV | No | Orígenes permitidos en producción (o `true` para reflejar el origen del cliente). |

---

## 8. Guía de Instalación, Pruebas y Desarrollo Local

### Prerrequisitos
- **Node.js** v18.0.0 o v20.x instalado.
- Gestor de paquetes **npm** v9+.
- Acceso a la base de datos de PostgreSQL (local o instancia de Supabase).

### 1. Clonación e Instalación
```bash
git clone https://github.com/Sant15123/Inventario_Marina_Back.git
cd Inventario_Marina_Back
npm install
```

### 2. Configurar Entorno
Copiar la plantilla de configuración y editar las credenciales:
```bash
cp .env.example .env
```

### 3. Ejecución del Servidor
```bash
# Modo desarrollo con recarga automática (Nodemon)
npm run dev

# Modo producción
npm start
```
El servidor responderá en `http://localhost:3000`. Puede validar la conexión consultando `http://localhost:3000/health`.

### 4. Ejecución de Pruebas Automatizadas
El repositorio cuenta con suites de integración desarrolladas con **Jest** y **Supertest** ejecutadas con soporte a módulos ES:
```bash
# Ejecutar todas las pruebas con reporte de cobertura
npm test

# Ejecutar una suite específica (ej. Mobiliario o Solicitudes)
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/mobiliario.test.js
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/solicitudes.test.js
```

---

## 9. Estructura del Proyecto

```text
Inventario_Marina_Back/
├── docs/                         # Especificaciones técnicas, arquitectura y diagramas ERD
│   ├── MODELO_DATOS.md
│   └── ARQUITECTURA.md
├── src/
│   ├── config/                   # Clientes de servicios externos y variables de entorno
│   │   └── supabase.js           # Inicialización cliente Supabase (@supabase/supabase-js)
│   ├── controllers/              # Controladores de la capa de aplicación
│   │   ├── authController.js     # Login, perfiles y gestión de credenciales
│   │   ├── dashboardController.js# KPIs y agregaciones analíticas
│   │   ├── inventory.controller.js
│   │   └── mobiliarioController.js # CRUD y correlativo automático de mobiliario
│   ├── db/
│   │   ├── migrations/           # Scripts DDL de base de datos
│   │   │   ├── 01_init_schema.sql
│   │   │   ├── 02_usuarios_roles_catalogo.sql
│   │   │   ├── 03_papeleria_schema.sql
│   │   │   ├── 05_proyectos_steam_relaciones.sql
│   │   │   └── 06_dashboard_kpis_rpc.sql
│   │   └── seeds/                # Sembradores de datos de prueba e iniciales
│   ├── middleware/               # Middlewares de seguridad, autenticación y validación
│   │   ├── errorHandler.js       # Manejador centralizado de errores
│   │   ├── notFound.js           # Captura de rutas no encontradas (404)
│   │   ├── rateLimiter.js        # Limitador de peticiones para rutas críticas
│   │   ├── roles.js              # Autorización basada en roles (RBAC)
│   │   └── verifyToken.js        # Validación de cabecera Authorization (Bearer JWT)
│   ├── models/                   # Capa de abstracción y persistencia relacional
│   │   ├── Mobiliario.js         # Modelo de datos para mobiliario y correlativos MOB-
│   │   └── inventory.model.js
│   ├── routes/                   # Definición de rutas Express
│   │   ├── api.routes.js         # Rutas de inventario, solicitudes, préstamos y activos
│   │   ├── auth.js               # Rutas de autenticación y tokens
│   │   ├── dashboard.routes.js   # Rutas de métricas y KPIs
│   │   ├── mobiliarioRoutes.js   # Rutas del módulo /api/mobiliario
│   │   └── sedes.routes.js       # Rutas del catálogo de sedes
│   ├── services/                 # Servicios de negocio transaccionales
│   │   ├── historial.service.js  # Registro de auditoría
│   │   └── inventory.service.js
│   ├── validators/               # Esquemas de validación de entradas
│   ├── app.js                    # Ensamblaje de Express, CORS, Helmet y middlewares
│   ├── db.js                     # Pool de PostgreSQL (pg) y migraciones de inicio
│   └── server.js                 # Punto de entrada HTTP y apertura del socket
├── tests/                        # Pruebas automatizadas (Jest + Supertest)
│   ├── integration/
│   │   ├── mobiliario.test.js
│   │   ├── solicitudes.test.js
│   │   ├── proyectos_relaciones.test.js
│   │   └── seguridad_rate_limit.test.js
│   └── unit/
├── package.json                  # Dependencias y scripts del proyecto
└── README.md                     # Documentación técnica integral
```

---

*Sistema Integral de Gestión de Activos y Mobiliario (SIGA) — Fundación Marina Orth.*  
*Transformando comunidades mediante la educación STEAM y la innovación tecnológica.*
