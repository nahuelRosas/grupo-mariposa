# Sistema de Gestión de Biblioteca (Library Management System)

Un sistema de gestión de biblioteca compuesto por dos microservicios, cumpliendo de extremo a extremo con las especificaciones de la **prueba técnica**: un servicio en TypeScript/NestJS para el catálogo, usuarios y autenticación, y un servicio en Go para el ciclo de vida de los préstamos. Ambos servicios comparten una única instancia de PostgreSQL con bases de datos lógicas separadas (`db_catalog` y `db_loans`).

```
┌──────────────────────────┐         HTTP          ┌──────────────────────────┐
│  Catalog Service         │ ────────────────────▶ │  Loan Service             │
│  NestJS / TypeScript     │   /loans, /availability│  Go 1.24 / Gin / GORM    │
│  Puerto 3000 (REST)      │                         │  Puerto 8080 (REST)       │
│  Prisma · JWT · Swagger  │ ◀──────────────────── │  Puerto 50051 (gRPC bonus)│
│                          │  /books/:id (catalogo)  │  slog · testify           │
└──────────┬───────────────┘                         └──────────┬───────────────┘
           │ db_catalog                                         │ db_loans
           ▼                                                    ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │           Única instancia PostgreSQL 16 (library-net)            │
       │   POSTGRES_USER=library · POSTGRES_PASSWORD=<auto-rotado>        │
       │   init.sql.template (templatizado en el primer inicio)           │
       └──────────────────────────────────────────────────────────────────┘
```

## Índice

1. [Inicio Rápido (Quick Start)](#inicio-rápido-quick-start)
2. [Justificaciones y Decisiones Arquitectónicas](#justificaciones-y-decisiones-arquitectónicas)
3. [Resiliencia, Comunicación y Manejo de Errores](#resiliencia-comunicación-y-manejo-de-errores)
4. [Ejemplos de la API](#ejemplos-de-la-api)
5. [Estructura del Proyecto](#estructura-del-proyecto)
6. [Testing](#testing)

---

## Inicio Rápido (Quick Start)

### Prerrequisitos

- Docker + Docker Compose v2 (o v1, el `Makefile` lo detecta automáticamente).
- `make` (GNU o BSD).
- Para desarrollo local sin Docker: Node.js 20, Go 1.21+, cliente PostgreSQL (`psql`).

### Pasos para levantar el entorno

```bash
# 1. Generar los archivos .env (idempotente, rota secretos automáticamente).
make env

# 2. Levantar el stack completo.
make up

# 3. Verificar que los servicios responden correctamente.
curl http://localhost:3000/health         # -> {"status":"ok","db":"up",...}
curl http://localhost:8080/healthz        # -> {"status":"ok","db":"up"}

# 4. Iniciar sesión como el administrador precargado (seed).
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"secret"}' | jq -r .accessToken)

# 5. Crear un libro y registrar un préstamo.
BOOK_ID=$(curl -s -X POST http://localhost:3000/books \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"isbn":"978-0-13-468599-1","title":"The Pragmatic Programmer","author":"Hunt","totalStock":2}' | jq -r .id)

curl -s -X POST http://localhost:3000/loans \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"bookId\":\"$BOOK_ID\"}"
```

---

## Justificaciones y Decisiones Arquitectónicas

En esta sección se explican las decisiones tomadas para satisfacer cada punto exigido en los requerimientos del proyecto.

### 1. Separación de Responsabilidades (Catalog Service vs Loan Service)

**Decisión**: `Catalog Service` maneja libros, usuarios, autenticación (JWT) y expone el front de la API. `Loan Service` se encarga exclusivamente del ciclo de vida del préstamo (crear, listar activos, historial, devolver) y validar disponibilidad con el catálogo.
**Justificación**: Agrupar usuarios y catálogo en un solo lugar facilita la autenticación, ya que solo el Catalog Service necesita conocer los roles (Admin vs User). El Loan Service se mantiene como un microservicio completamente puro y acotado, dedicado a una única entidad transaccional: el préstamo.

### 2. Bases de Datos Separadas vs Una Sola Instancia

**Decisión**: Se utiliza una **única instancia de PostgreSQL** (un contenedor Docker) pero con **dos bases de datos lógicas separadas** (`db_catalog` y `db_loans`).
**Justificación**: Los requerimientos pedían que el Loan Service persista sus propios datos, con BD o tabla separada justificando la decisión. Elegir bases de datos lógicas proporciona un **aislamiento real** a nivel de motor (distintos esquemas, distintas tablas, cero posibilidad de hacer un JOIN accidental cruzado), asegurando la pureza de microservicios, pero sin incurrir en el costo en memoria y complejidad operacional de levantar dos contenedores de Postgres distintos.

### 3. Framework HTTP en Go (Loan Service)

**Decisión**: Se eligió **Gin** en lugar de `net/http` estándar u otras opciones como Echo o Fiber.
**Justificación**: Gin es el framework más maduro y utilizado en el ecosistema Go. Nos brinda de manera inmediata una capa muy robusta de middleware (recovery de panics, request logging estructurado, CORS, manejo de errores) lo cual permite enfocarse rápidamente en la lógica de negocio. Además, el binding automático de JSON (validación de DTOs) en Gin es sumamente eficiente y simplifica drásticamente el manejo de requests HTTP.

### 4. ORM en Go (Loan Service)

**Decisión**: Se utilizó **GORM** en lugar de usar `database/sql` + `pgx` nativo.
**Justificación**: Dado que el Loan Service es fuertemente transaccional pero de esquema simple (una sola tabla principal), GORM facilita inmensamente el desarrollo rápido mediante la funcionalidad de `AutoMigrate`, eliminando la necesidad de configurar herramientas externas de migración. Las consultas (CRUD) de la tabla de préstamos son directas y GORM las maneja perfectamente, manteniendo el código limpio, fuertemente tipado y sin _boilerplate_ SQL manual.

### 5. Bonus Opcionales Implementados

- **Documentación Swagger / OpenAPI**: Disponible en ambos servicios (NestJS expone `/api/docs` y Go expone Swagger estático auto-generado vía `swag init`).
- **gRPC como Bonus**: Además de HTTP, el Loan Service expone un servidor gRPC. El Catalog Service puede comunicarse con el Loan Service tanto vía HTTP (por defecto, para cumplir los requerimientos base) como vía gRPC. La comunicación inversa (Loan Service consultando stock al Catalog Service) también soporta gRPC de manera optativa.
- **Healthchecks**: Rutas `/health` y `/health/full` implementadas, que verifican el estado completo del sistema y la base de datos subyacente.
- **Rate Limiting**: Implementado vía `@nestjs/throttler` en el Catalog Service para prevenir ataques repetitivos en los endpoints públicos.
- **Logging estructurado**: Se utiliza el paquete estándar `log/slog` introducido recientemente en Go 1.21+ para tener logs en formato nativo y estructurado JSON.

---

## Resiliencia, Comunicación y Manejo de Errores

### Comunicación entre Servicios y Consistencia (Patrón Saga)

Para evitar la complejidad de transacciones distribuidas (como 2PC) que acoplan temporalmente los servicios de manera fuerte, se implementó una **Saga coreografiada (manual de dos pasos)** manejada por el `Catalog Service` al crear préstamos:

1. **Paso 1 (Transacción Local en Catalog Service)**: El Catalog Service inicia una transacción de base de datos local donde **resta el stock disponible** del libro y marca un estado temporal.
2. **Paso 2 (Llamada HTTP a Loan Service)**: El Catalog Service llama vía HTTP al Loan Service para registrar el préstamo definitivamente.
3. **Paso 3 (Compensación ante Fallo)**: Si el Loan Service responde con un error 500, un timeout de red, o si el contenedor está inalcanzable, el Catalog Service captura este fallo de red, **ejecuta una transacción de compensación** devolviendo el stock al libro de manera automática, y responde al usuario con un error `503 Service Unavailable`. De esta manera se asegura la **consistencia eventual** de los datos sin bloquear ambas bases de datos.

### Validación Inversa (El requerimiento "Valida con A")

Antes de aceptar el alta de un préstamo y confirmarlo, el `Loan Service` ejecuta un request inverso hacia `Catalog Service` (vía HTTP a `/internal/books/:id`) para certificar explícitamente que el libro existe en el maestro de datos y que efectivamente tiene stock, previniendo discrepancias de información si la API del Loan Service se invocara de manera directa o expuesta por error.

### Idempotencia y Manejo de Errores Idiomático

- **Idempotencia Transaccional**: Se propaga el header `Idempotency-Key`. Si el cliente envía una petición repetida (por ejemplo, por un fallo de conexión inestable de Wi-Fi perdiendo el `201 Created` e intentándolo nuevamente), el `Loan Service` filtra inteligentemente el duplicado utilizando un índice único parcial en la base de datos sin fallar.
- **Go Errores**: En el `Loan Service`, todos los errores son manejados como valores tipados y envueltos (`errors.Join`, `fmt.Errorf("%w")`), evitando absolutamente el uso de `panics`. El `context.Context` de la petición HTTP o gRPC viaja transversalmente a través de las capas de control, servicio y base de datos asegurando cancelaciones correctas y liberación de recursos si la conexión HTTP expira.

---

## Ejemplos de la API

### Catálogo y Usuarios (Catalog Service)

```bash
# Iniciar sesión (Login para obtener JWT)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"secret"}' | jq -r .accessToken)

# Listar libros con paginación y filtros de búsqueda
curl "http://localhost:3000/books?page=1&pageSize=20&search=Pragmatic&availability=true" \
  -H "Authorization: Bearer $TOKEN"

# Crear un libro nuevo en el sistema (Requiere rol Admin)
curl -X POST http://localhost:3000/books \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"isbn":"978-0-13-468599-1","title":"The Pragmatic Programmer","author":"Hunt","totalStock":3}'
```

### Préstamos (Loan Service)

```bash
# Crear préstamo de un libro utilizando el flujo completo de Saga
curl -X POST http://localhost:3000/loans \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"bookId\":\"<UUID_DEL_LIBRO>\"}"

# Listar mis prestamos activos
curl -s http://localhost:3000/loans/active \
  -H "Authorization: Bearer $TOKEN"

# Devolver el préstamo (Llamando directamente a la capa final de Loan Service)
curl -X POST http://localhost:8080/loans/<UUID_DEL_PRESTAMO>/return
```

---

## Estructura del Proyecto

El código está estructurado siguiendo patrones de Arquitectura Hexagonal y diseño de Puertos y Adaptadores para garantizar un código modularizado y testeable, independiente de la capa de transporte (HTTP vs gRPC) o persistencia (Postgres vs InMemory).

```text
.
├── docker-compose.yml             # Composición de toda la infraestructura
├── Makefile                       # Tareas, tests, formateo y automatizaciones
├── catalog-service/               # Catalog Service (Microservicio TypeScript/NestJS)
│   └── src/
│       ├── application/           # Casos de uso de negocio (Use cases, mappers, DTOs)
│       ├── domain/                # Entidades agnósticas, tipos e interfaces
│       └── infrastructure/        # Controladores HTTP Nest, adaptadores Prisma DB
└── loan-service/                  # Loan Service (Microservicio puro Go 1.24)
    ├── cmd/server/                # Punto de entrada de la aplicación Go (main.go)
    └── internal/
        ├── application/           # Lógica central del servicio de préstamos
        ├── domain/                # Estructuras de entidades puras y definición de errores
        └── infrastructure/        # Endpoints Gin, GORM PostgreSQL, Implementación gRPC
```

---

## Testing

Existen múltiples suites de pruebas garantizando estabilidad estructural y tolerancia a fallas de integración.

```bash
# Ejecutar TODO el entorno de pruebas completo (Formateo + Shell + Pruebas Go + Pruebas TS)
make test

# Ejecutar las pruebas unitarias y e2e exclusivas del Catálogo (NestJS / TypeScript)
make test-node

# Ejecutar las pruebas unitarias idiomáticas de Go (incluye detector de carreras de datos -race)
make test-go

# Ejecutar humo (smoke tests) verificando el flujo End-to-End con HTTP real hacia los contenedores
make smoke
```

Dentro de los tests destacan comprobaciones explícitas E2E que levantan y cortan las conexiones de manera simulada hacia las bases de datos para comprobar que los "rollbacks" y las compensaciones actúan en milisegundos salvaguardando los activos de la biblioteca en casos críticos.

---

## Pendientes y Trade-offs

Se completaron **todos los requerimientos obligatorios** y la **mayoría de los bonus opcionales** (Swagger, gRPC, healthchecks, rate limiting, logging estructurado, CI). A continuación se documentan decisiones conscientes y posibles mejoras futuras:

- **Logging estructurado en NestJS**: Se usa el `Logger` nativo de NestJS. Para producción real, migrar a `pino` o `winston` con formato JSON sería el siguiente paso. En Go se usa `log/slog` que ya emite JSON nativo.
- **gRPC bidireccional completo**: La comunicación gRPC funciona en ambas direcciones (Catalog → Loan y Loan → Catalog), pero en Docker Compose el default es HTTP para simplicidad. El switch a gRPC se activa con `LOAN_TRANSPORT=grpc`.
- **Caching**: No se implementó caché (Redis) para consultas de libros frecuentes. Sería un upgrade natural para escalar lecturas.
- **Observabilidad avanzada**: No se agregó tracing distribuido (OpenTelemetry). Los trace IDs en las respuestas de error del Loan Service son UUIDs locales, no spans correlacionados entre servicios.
