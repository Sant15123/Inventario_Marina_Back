# Documentación Técnica del Modelo de Datos - SIGA FMO

## Diagrama Entidad-Relación (ERD)

```mermaid
erDiagram
    PERFILES ||--o{ PRESTAMOS : "solicita / responsable"
    PERFILES ||--o{ ENTREGAS_CONSUMIBLES : "recibe insumo"
    PERFILES ||--o{ ACTIVOS : "custodio institucional"
    ACTIVOS ||--o{ PRESTAMOS : "prestado en"
    CONSUMIBLES ||--o{ PRESTAMOS : "prestado temporalmente"
    CONSUMIBLES ||--o{ ENTREGAS_CONSUMIBLES : "salida definitiva de"
    PAPELERIA ||--o{ ENTREGAS_CONSUMIBLES : "salida definitiva de"

    PERFILES {
        uuid id PK
        string documento UK
        string nombre_completo
        string telefono
        string email UK
        string rol
        string sede
        boolean activo
        timestamptz created_at
    }

    ACTIVOS {
        integer id PK
        string placa UK
        string serial UK
        string nombre
        string tipo_inventario "tecnologia, mobiliario"
        string categoria
        string condicion
        string marca
        string modelo
        string estado
        string ubicacion
        string ubicacion_estante
        string custodio
        string custodio_documento
        uuid usuario_id FK
        integer cantidad
    }

    CONSUMIBLES {
        string id PK,UK "RobXXXX"
        string material
        string tipo_inventario "robotica"
        string categoria
        integer disponible
        integer minimo
        string ubicacion
        string ubicacion_estante
        string estado
        string condicion
    }

    PAPELERIA {
        string id PK,UK "PapeXXXX (Pape1001, Pape2001...)"
        string material
        string descripcion
        integer disponible
        integer minimo
        string sede
        string ubicacion_estante "CAJA #1 a #11, Fuera de cajas"
        string condicion "Nuevos, Usados, Mixto"
        string estado "Bueno, Regular"
        string responsable
        string observaciones
        timestamptz created_at
    }

    PRESTAMOS {
        integer id PK
        string placa_activo FK
        string tipo_item "activo, consumible"
        integer cantidad
        string solicitante
        string solicitante_documento
        uuid usuario_id FK
        string sede
        string motivo
        date fecha_salida
        date fecha_devolucion_esperada
        date fecha_devolucion_real
        string estado
    }

    ENTREGAS_CONSUMIBLES {
        uuid id PK
        string material_id FK
        string material_nombre
        integer cantidad
        string responsable
        string responsable_documento
        uuid usuario_id FK
        string sede
        string proyecto_motivo
        string tipo "Consumido, Consumido Papelería"
        timestamptz created_at
    }
```

## Matriz de Restricciones e Integridad Referencial

| Entidad | Campo | Tipo de Clave / Restricción | Descripción |
| :--- | :--- | :--- | :--- |
| **PERFILES** | `id` | Primary Key (`PK`, `UUID`) | Identificador único del perfil (compatible con `auth.users.id`). |
| **PERFILES** | `documento` | Unique Key (`UK`) | Cédula o documento de identidad único institucional. |
| **PERFILES** | `email` | Unique Key (`UK`) | Correo electrónico institucional único. |
| **PERFILES** | `rol` | Check Constraint | Valores permitidos: `'administrador'`, `'operador'`, `'supervisor'`, `'usuario'`. |
| **ACTIVOS** | `placa` | Primary Key / Unique (`UK`) | Código de placa único institucional (`P{n+1}` para tecnología, `MOB{n+1}` para mobiliario). |
| **ACTIVOS** | `serial` | Unique Index Condicional | Serial de fábrica único por activo físico (excluyendo vacíos, `S/N`, `N/A`). |
| **ACTIVOS** | `tipo_inventario` | Check / Default | Dominio: `'tecnologia'`, `'mobiliario'`. |
| **ACTIVOS** | `ubicacion_estante` | VARCHAR | Estante, caja, gaveta o armario físico. |
| **CONSUMIBLES** | `id` | Primary Key (`PK`, `UK`) | Código alfanumérico identificador (`Rob{n+1}` para robótica). |
| **PAPELERIA** | `id` | Primary Key (`PK`, `UK`) | Código institucional `PapeXXXX` (ej. `Pape1001` - Caja 1, `Pape2001` - Caja 2). |
| **PAPELERIA** | `ubicacion_estante` | VARCHAR(100) | Caja contenedora física (`CAJA #1` a `CAJA #11`, `Fuera de cajas`). |
| **PAPELERIA** | `disponible` | Check Constraint | `disponible >= 0` (Control atómico de existencias). |
| **PRESTAMOS** | `id` | Primary Key (`PK`, `SERIAL`) | Identificador del préstamo. |
| **PRESTAMOS** | `placa_activo` | Reference | Código de activo o consumible prestado. |
| **PRESTAMOS** | `solicitante_documento`| Reference / Lookup | Vínculo con `PERFILES(documento)`. |
| **ENTREGAS_CONSUMIBLES** | `id` | Primary Key (`PK`, `UUID`) | Identificador único de salida definitiva. |
| **ENTREGAS_CONSUMIBLES** | `material_id` | Foreign Key $\rightarrow$ `CONSUMIBLES(id)` / `PAPELERIA(id)` | Insumo entregado. |
| **ENTREGAS_CONSUMIBLES** | `responsable_documento` | Reference / Lookup | Vínculo con `PERFILES(documento)`. |

---

## Políticas de Seguridad RLS (Row Level Security)

1. **`admin_all_perfiles`:** Acceso total (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) para usuarios con rol `'administrador'`.
2. **`staff_select_perfiles`:** Permisos de solo lectura (`SELECT`) para usuarios con rol `'supervisor'` y `'operador'`.
3. **`user_own_perfil`:** Los usuarios con rol `'usuario'` solo pueden consultar y actualizar su propio perfil (`id = auth.uid()` o coincidencia de correo).
4. **`Acceso completo a papeleria`:** `CREATE POLICY "Acceso completo a papeleria" ON public.papeleria FOR ALL TO public USING (true) WITH CHECK (true);`
