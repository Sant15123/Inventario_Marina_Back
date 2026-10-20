# SIGA - Backend & Servicios de Persistencia

Sistema Integral de Gestión de Activos y Consumibles (**SIGA**) de la **Fundación Marina Orth (FMO)**. Capa de servidor, lógica transaccional y persistencia relacional desarrollada sobre **Node.js**, **Express** y **PostgreSQL** (alojado en **Supabase** a través del Transaction Pooler / PgBouncer).

---

## 📌 Descripción General

El backend de SIGA centraliza y asegura toda la integridad operativa del inventario institucional de la Fundación Marina Orth, garantizando:
- **Control Atómico de Existencias:** Prevención estricta de condiciones de carrera y sobre-asignaciones mediante transacciones SQL con bloqueos explícitos (`FOR UPDATE`) y cláusulas de salvaguarda (`disponible >= cantidad`).
- **Lógica Transaccional de Préstamos y Entregas:** Registro de salidas temporales para equipos tecnológicos con seguimiento de custodio y fechas estimadas de devolución, así como salidas definitivas (consumos de robótica/materiales de taller) con trazabilidad de proyecto y responsable.
- **Cálculo de Autoconsecutivos Institucionales:** Soporte a esquemas de codificación unificada tipo `P{n+1}` (Placas de Activos Tecnológicos) y `Rob{n+1}` con padding de 4 dígitos (`Rob0001` - `Rob9999`) para consumibles y kits.
- **Normalización de Tiempos y Fechas en UTC:** Estandarización de marcas de tiempo (`TIMESTAMPTZ` / `ISO 8601`) para erradicar desfases de zona horaria o errores de *'Invalid Date'* entre clientes web, móviles y la base de datos.
- **Restricciones de Unicidad y Concurrencia:** Índices únicos condicionales sobre números de serie (`idx_activos_serial_unique`) y códigos de placa (`uq_activos_placa`), devolviendo respuestas `HTTP 409 Conflict` estructuradas ante colisiones de datos.

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología | Detalle |
| :--- | :--- | :--- |
| **Entorno de Ejecución** | Node.js (ES Modules `type: module`) | Node v18+ / v20+ LTS |
| **Framework Web** | Express.js 5.x | Enrutamiento modular, validaciones y middlewares |
| **Persistencia / Driver** | `pg` (node-postgres Pool) | Conexión con SSL hacia PostgreSQL / Supabase Pooler |
| **Capa de Base de Datos** | PostgreSQL 15+ / Supabase | Tablas relacionales, índices condicionales, llaves foráneas y RLS |
| **Seguridad HTTP** | Helmet, CORS dinámico | Cabeceras HTTP protegidas y control de orígenes cruzados |
| **Logging y Diagnóstico** | Morgan (`dev` format) | Trazabilidad de peticiones HTTP entrantes |
| **Procesamiento Masivo** | SheetJS (`xlsx`) | Soporte para seeders e importación masiva de inventarios Excel |
| **Pruebas y Calidad** | Jest, Supertest, ESLint | Pruebas de integración de endpoints y cobertura de código |

---

## 🔄 Diagrama y Orden de Flujo del Proyecto

El siguiente diagrama detalla el ciclo de vida de los datos desde la interacción del cliente frontend hasta la persistencia atómica en PostgreSQL:

```mermaid
flowchart TD
    A["Cliente Frontend (Vite / React / Móvil)"] -->|Petición HTTP REST JSON| B["Capa de Middlewares (Express)"]
    
    subgraph Express_App ["Servidor Node.js / Express"]
        B --> B1["Helmet (Seguridad)"]
        B1 --> B2["CORS Permisivo / Orígenes"]
        B2 --> B3["Express JSON Parser & Morgan"]
        B3 --> C{"Enrutador API (/api)"}
        
        subgraph Validaciones ["Capa de Validación y Reglas de Negocio"]
            C -->|POST / PUT /api/activos| V1["Validar Placa & Serial Únicos<br/>Check cantidad = 1"]
            C -->|POST /api/consumibles/entregas| V2["Validar Stock Atómico:<br/>disponible >= cantidad_solicitada"]
            C -->|Autoconsecutivos| V3["Generación Códigos:<br/>Equipos: P{n+1} | Consumibles: Rob{n+1} (4 dígitos)"]
            C -->|Fechas| V4["Normalización ISO 8601 en UTC<br/>Evitar 'Invalid Date'"]
        end
        
        subgraph Transaccion ["Gestión Transaccional (pg Pool)"]
            V2 --> T1["BEGIN TRANSACTION"]
            T1 --> T2["SELECT * FROM consumibles WHERE id = $1 FOR UPDATE"]
            T2 --> T3{"¿Stock Suficiente?"}
            T3 -- NO --> T4["ROLLBACK<br/>HTTP 400 Stock Insuficiente"]
            T3 -- SÍ --> T5["UPDATE consumibles SET disponible = disponible - N"]
            T5 --> T6["INSERT INTO entregas_consumibles (...) RETURNING *"]
            T6 --> T7["COMMIT"]
        end
    end

    subgraph Base_Datos ["Capa de Persistencia (PostgreSQL / Supabase)"]
        V1 --> D1[("Tabla: activos")]
        T5 --> D2[("Tabla: consumibles")]
        T6 --> D3[("Tabla: entregas_consumibles")]
        C -->|POST /api/prestamos| D4[("Tabla: prestamos")]
    end

    T7 --> R["Respuesta HTTP 200 / 201 JSON"]
    T4 --> R
    D1 --> R
    R -->|Sincronización Reactiva| A
```

---

## 🗄️ Esquema de Base de Datos y Modelos

### 1. Tabla `activos` (Equipos Tecnológicos)
Representa cada equipo físico individual (laptops, tablets, impresoras 3D, robótica). Cada fila equivale a una unidad física única (`cantidad = 1`).

| Columna | Tipo | Restricción / Propósito |
| :--- | :--- | :--- |
| `id` | SERIAL PRIMARY KEY | Identificador numérico interno autoincremental. |
| `placa` | VARCHAR(100) UNIQUE | Código o placa de inventario FMO (ej. `FMO-EQ-001`, `P015`). |
| `nombre` | VARCHAR(255) NOT NULL | Nombre descriptivo del equipo. |
| `marca`, `modelo` | VARCHAR(100) | Marca y modelo del fabricante. |
| `serial` | VARCHAR(100) | Número de serie del fabricante (con índice único condicional). |
| `sede` | VARCHAR(100) | Sede principal (`Medellín`, `El Carmen de Viboral`, etc.). |
| `ubicacion` | VARCHAR(255) | Detalle de ubicación física (ej. *Oficina Medellín - Bodega*). |
| `ubicacion_estante` | VARCHAR(255) | Estante, caja o gaveta asignada (ej. *Estante C-2, Caja Rimax 12*). |
| `estado` | VARCHAR(50) | Estado operativo (`Disponible`, `En Prestamo`, `En Reparacion`, `De Baja`). |
| `condicion` | VARCHAR(100) | Condición física del activo (`Nuevo`, `Usado`, `Donación`). |
| `area` | VARCHAR(100) | Área institucional (`Tecnología`, `Robótica`, `Formación`). |
| `custodio` / `responsable` | VARCHAR(255) | Responsable o custodio actual del bien. |
| `caracteristica_1, 2, 3` | VARCHAR(255) | Especificaciones técnicas detalladas (CPU, RAM, Disco / Pantalla). |
| `proveedor`, `valor_compra` | VARCHAR / NUMERIC | Información de adquisición contable. |
| `fecha_compra`, `garantia` | DATE | Fechas de adquisición y vencimiento de garantía técnica. |
| `claves_otros` | TEXT | Credenciales, pines o licencias vinculadas. |
| `observaciones` | TEXT | Bitácora y notas adicionales. |

> **Índice único condicional sobre serial:**  
> Evita números de serie duplicados en equipos activos, ignorando valores vacíos, `S/N`, `N/A` o no identificables:
> ```sql
> CREATE UNIQUE INDEX idx_activos_serial_unique 
> ON activos (LOWER(TRIM(serial))) 
> WHERE serial IS NOT NULL AND TRIM(serial) <> '' AND UPPER(TRIM(serial)) NOT IN ('S/N', 'N/A', 'NA', 'NO REGISTRO');
> ```

---

### 2. Tabla `consumibles` (Materiales y Componentes de Robótica)
Gestiona existencias por lotes o existencias numéricas de materiales fungibles (cables, servomotores, sensores, tornillería).

| Columna | Tipo | Restricción / Propósito |
| :--- | :--- | :--- |
| `id` | VARCHAR(100) PRIMARY KEY | Código del material con prefijo (ej. `Rob0001`, `Rob0142`). |
| `material` | VARCHAR(255) NOT NULL | Nombre comercial / institucional del consumible. |
| `categoria` | VARCHAR(100) | Categoría (`Robótica`, `Electrónica`, `Papelería`, `Ferretería`). |
| `disponible` | INT NOT NULL DEFAULT 0 | Stock físico disponible en inventario. |
| `minimo` | INT NOT NULL DEFAULT 5 | Umbral crítico para alertas automáticas de reabastecimiento. |
| `ubicacion` | VARCHAR(100) | Ubicación general (ej. *Oficina FMO*). |
| `ubicacion_estante` | VARCHAR(255) | Contenedor físico o gavetero (ej. *Caja 5, Gaveta 3*). |
| `condicion` / `estado` | VARCHAR(50) | Condición (`Nuevo`, `Usado`) y estado operativo (`Bueno`, `Regular`). |
| `descripcion` | TEXT | Detalle técnico, valor unitario y especificaciones. |

---

### 3. Tabla `entregas_consumibles` (Salidas Definitivas de Material)
Registra la trazabilidad de insumos consumidos que reducen definitivamente el stock disponible:

| Columna | Tipo | Restricción / Propósito |
| :--- | :--- | :--- |
| `id` | UUID PRIMARY KEY | Identificador único (`gen_random_uuid()`). |
| `material_id` | VARCHAR(50) | Código del material entregado (`consumibles.id`). |
| `material_nombre` | VARCHAR(150) | Nombre del material al momento de la salida. |
| `cantidad` | INT NOT NULL | Unidades entregadas (descontadas del inventario). |
| `responsable` | VARCHAR(150) NOT NULL | Nombre de quien recibe el insumo (formador, líder de sede). |
| `sede` | VARCHAR(150) | Sede donde se destina el material. |
| `proyecto_motivo` | TEXT | Motivo o proyecto específico del taller pedagógico. |
| `tipo` | VARCHAR(50) | Tipo de movimiento (`Consumido`, `Baja`, `Ajuste`). |
| `created_at` | TIMESTAMPTZ | Fecha y hora exacta de la entrega en UTC. |

---

### 4. Tabla `prestamos` (Préstamos Temporales)
Administra las salidas temporales de equipos tecnológicos o materiales devueltos a futuro.

| Columna | Tipo | Restricción / Propósito |
| :--- | :--- | :--- |
| `id` | SERIAL PRIMARY KEY | Número correlativo del préstamo. |
| `placa_activo` | VARCHAR(100) | Placa del equipo prestado. |
| `tipo_item` | VARCHAR(50) | Tipo de activo prestado (`activo`, `consumible`). |
| `cantidad` | INT DEFAULT 1 | Cantidad de unidades prestadas. |
| `solicitante` | VARCHAR(255) NOT NULL | Persona que recibe el préstamo. |
| `sede` | VARCHAR(100) NOT NULL | Sede donde operará el bien. |
| `motivo` | VARCHAR(255) | Propósito del préstamo o evento. |
| `fecha_salida` | DATE DEFAULT CURRENT_DATE | Fecha de entrega del activo. |
| `fecha_devolucion_esperada` | DATE NOT NULL | Fecha estimada de retorno. |
| `fecha_devolucion_real` | DATE | Fecha en que fue retornado a bodega. |
| `estado` | VARCHAR(50) | Estado (`Activo`, `Devuelto`, `Vencido`). |

---

### 5. Políticas RLS (Row Level Security) en Supabase
Para proyectos en producción o clientes que se comunican vía `@supabase/supabase-js`, las políticas de seguridad a nivel de fila aseguran que:
- **Lectura Pública / Autenticada:** Cualquier cliente autorizado puede consultar activos y consumibles disponibles.
- **Escritura Protegida:** Las mutaciones críticas de stock, cambios de estado en préstamos y auditorías de entregas requieren privilegios autenticados o se canalizan mediante el backend Node.js utilizando el `SERVICE_ROLE_KEY` o conexión directa de base de datos (`DATABASE_URL`).

---

## 🚀 Instrucciones de Instalación y Uso

### Prerrequisitos
- **Node.js** v18.0.0 o superior instalado.
- Servidor de base de datos **PostgreSQL** o proyecto activo en **Supabase**.

### 1. Clonar el repositorio y configurar variables de entorno
Crear un archivo `.env` en la raíz del backend a partir de las siguientes variables:

```env
PORT=3000
NODE_ENV=development

# Conexión directa a PostgreSQL / Supabase Pooler (PgBouncer en puerto 6543 o 5432)
DATABASE_URL=postgres://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true

# Credenciales de API Supabase (Opcional si se consume la API REST de Supabase)
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...[TU_SERVICE_ROLE_KEY]
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Ejecutar migraciones o seeders iniciales
El backend cuenta con scripts automatizados para sembrar la base de datos a partir de los libros maestros de Excel:
```bash
# Cargar los 187 activos iniciales de la hoja de inventario general
npm run seed:activos

# Cargar los 142 consumibles de robótica (Rob0001 a Rob0142)
npm run seed:consumibles
```

### 4. Iniciar el servidor
```bash
# Modo desarrollo con recarga en caliente (Nodemon)
npm run dev

# Modo producción
npm start
```
El servicio estará disponible en `http://localhost:3000`.

---

## 📡 Endpoints de la API REST

### 1. Activos Tecnológicos (`/api/activos`)

| Método | Ruta | Descripción | Payload Esperado (Body) | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/activos` | Lista todos los activos ordenados por placa | Ninguno | `200 OK` `{ success: true, data: [...] }` |
| `GET` | `/api/activos/:placa` | Obtiene el detalle completo de un activo | Ninguno (placa en URL) | `200 OK` `{ success: true, data: { ... } }` |
| `POST` | `/api/activos` | Registra un nuevo equipo con validación de placa/serial | Objeto JSON con ficha técnica completa (`placa`, `nombre`, `marca`, `serial`, `ubicacion_estante`, etc.) | `201 Created` `{ success: true, data: { ... } }` |
| `PUT` | `/api/activos/:id` | Actualiza la ficha técnica completa de un activo | Objeto JSON con campos modificados | `200 OK` `{ success: true, data: { ... } }` |
| `PATCH` | `/api/activos/:placa` | Actualización parcial de estado o custodio | `{ estado?, custodio?, ubicacion_estante? }` | `200 OK` `{ success: true, data: { ... } }` |
| `DELETE`| `/api/activos/:placa` | Elimina lógicamente o remueve un activo | Ninguno | `200 OK` `{ success: true, message: "..." }` |

> En caso de duplicidad de placa o serial único, el servidor responde:
> ```json
> HTTP 409 Conflict
> {
>   "success": false,
>   "message": "Ya existe un activo registrado con esta placa/código o número de serial."
> }
> ```

---

### 2. Consumibles y Salidas Definitivas (`/api/consumibles`)

| Método | Ruta | Descripción | Payload Esperado (Body) | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/consumibles` | Lista todos los consumibles y niveles de stock | Ninguno | `200 OK` `{ success: true, data: [...] }` |
| `POST` | `/api/consumibles` | Registra un nuevo consumible | `{ id, material, categoria, disponible, minimo, ubicacion_estante }` | `201 Created` `{ success: true, data: { ... } }` |
| `PUT` | `/api/consumibles/:id`| Modifica datos o niveles de existencias | Objeto JSON con datos del material | `200 OK` `{ success: true, data: { ... } }` |
| `POST` | `/api/consumibles/entregas` | Salida definitiva y descuento atómico de stock | `{ material_id, cantidad, responsable, sede, proyecto_motivo }` | `201 Created` `{ success: true, data: { ... } }` |
| `GET` | `/api/consumibles/entregas` | Historial de entregas realizadas | Ninguno | `200 OK` `{ success: true, data: [...] }` |

---

### 3. Préstamos de Equipos (`/api/prestamos`)

| Método | Ruta | Descripción | Payload Esperado (Body) | Respuesta Exitosa |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/prestamos` | Lista préstamos activos e históricos | Ninguno | `200 OK` `{ success: true, data: [...] }` |
| `POST` | `/api/prestamos` | Registra préstamo y actualiza activo a `'En Prestamo'` | `{ placa_activo, solicitante, sede, motivo, fecha_devolucion_esperada }` | `201 Created` `{ success: true, data: { ... } }` |
| `PATCH` | `/api/prestamos/:id/devolucion` | Registra retorno del bien y libera el activo a `'Disponible'` | `{ fecha_devolucion_real? }` | `200 OK` `{ success: true, message: "..." }` |

---

### 4. Diagnóstico y Salud (`/health` y `/api/health`)
- **Ruta:** `GET /health`
- **Respuesta:** `200 OK` `{"status": "OK", "timestamp": "2026-10-20T16:00:00.000Z"}`

---

## 🧪 Pruebas Automatizadas

El backend incluye suites de pruebas unitarias y de integración para validar la lógica de controladores y aislamiento de errores:
```bash
# Ejecutar todas las pruebas con reporte de cobertura
npm test

# Modo observador para desarrollo guiado por pruebas (TDD)
npm run test:watch
```

---

## 🏛️ Organización del Directorio Backend

```text
Inventario_Marina_Back/
├── docs/                     # Diagramas ERD y especificaciones de base de datos
├── src/
│   ├── controllers/          # Controladores de lógica de aplicación
│   ├── db/
│   │   ├── migrations/       # Scripts SQL de esquema (01_init_schema.sql)
│   │   └── seeds/            # Scripts de carga inicial (seed_consumibles.js)
│   ├── middleware/           # Middlewares (errorHandler, notFound, autenticación)
│   ├── models/               # Modelos y abstracciones de datos
│   ├── routes/               # Rutas REST (api.routes.js, inventory.routes.js)
│   ├── services/             # Lógica de cálculo, validación y transacciones
│   ├── app.js                # Configuración de Express, middlewares y rutas
│   ├── db.js                 # Pool de conexión pg y DDL automático de arranque
│   ├── seedActivos.js        # Script de importación para activos de Excel
│   └── server.js             # Punto de entrada HTTP y apertura del puerto
├── .env.example              # Plantilla de variables de entorno
├── package.json              # Metadatos del proyecto y dependencias
└── README.md                 # Documentación técnica integral del backend
```

---

*Desarrollado para el proyecto SIGA - Fundación Marina Orth.*
