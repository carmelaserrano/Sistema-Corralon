# Sistema-Corralon

Sistema Integral Web para Corralón Multisucursal (+ e-commerce).

## Stack

- **Frontend**: React + Vite (JavaScript)
- **Backend**: Supabase (Auth + Base de datos)
- **Base de datos**: PostgreSQL (incluida en Supabase)
- **Control de versiones**: Git + GitHub (`main`, `develop`, `feature/*`)
- **Despliegue**: Vercel (frontend) + Supabase (backend)

## Puesta en marcha (primera vez)

### 1. Cloná el repo e instalá dependencias

```bash
git clone <url-del-repo>
cd Sistema-Corralon
npm install
```

Necesitás tener [Node.js](https://nodejs.org/) instalado (v18 o superior).

### 2. Conseguí las credenciales de Supabase

Pedile a un integrante del equipo la **URL del proyecto** y la **anon/publishable key** de Supabase (no son secretas de alto riesgo, pero no se suben al repositorio).

### 3. Creá tu archivo de variables de entorno

En la raíz del proyecto (al lado de `package.json`), creá un archivo llamado `.env.local` con este contenido (usá `.env.example` como referencia):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Este archivo es personal de cada uno y **no se sube a git** (ya está en `.gitignore`).

### 4. Pedí que te creen un usuario

El login se hace con Supabase Auth (email + contraseña). Pedile a quien administra el proyecto de Supabase que te cree un usuario desde el dashboard (**Authentication → Users → Add user**, con "Auto Confirm User" tildado).

### 5. Corré el proyecto

```bash
npm run dev
```

Abrí `http://localhost:5173`, logueate con tu usuario y listo.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo |
| `npm run build` | Genera el build de producción en `dist/` |
| `npm run lint` | Corre ESLint sobre el proyecto |
| `npm run preview` | Sirve localmente el build de producción |
| `npm run test` | Corre los tests una sola vez |
| `npm run test:watch` | Corre los tests de nuevo cada vez que guardás un archivo |
| `npm run test:coverage` | Corre los tests y muestra el % de cobertura |
| `npm run validate:migrations` | Valida nombres y numeración de `supabase/migrations/` |

## CI/CD

Cada Pull Request hacia `develop` o `main` (y cada push a `develop`) dispara
automáticamente el workflow [`ci.yml`](.github/workflows/ci.yml), que corre:

1. Instalación de dependencias (`npm ci`).
2. Validación de nombres/numeración de las migraciones SQL.
3. Lint (`npm run lint`).
4. Tests con cobertura (`npm run test:coverage`).
5. Build de producción (`npm run build`).

**La cobertura mínima exigida es 70%** (statements, branches, functions y
lines), medida sobre `src/modules/**/api/**` y `src/lib/**` (la capa de
acceso a datos). El umbral está configurado en `vite.config.js`
(`test.coverage.thresholds`), así que `npm run test:coverage` también falla
localmente si baja del 70%, no solo en CI.

Un push a `develop` con los secrets del proyecto de Supabase de staging ya
cargados dispara además el job **migraciones** (aplica las migraciones
pendientes a esa base). Detalle completo del pipeline, cómo correrlo en local
antes de pushear y cómo leer un check en rojo:
[`docs/ci-y-despliegue.md`](docs/ci-y-despliegue.md).

## Estructura del proyecto

```
src/
  lib/                     # Cliente de Supabase, contexto de autenticación
  modules/
    auth/                  # Pantalla de login
    stock/
      api/                 # Funciones que consultan Supabase
      pages/                # Pantallas del módulo de stock
supabase/
  migrations/               # Scripts SQL para crear las tablas en Supabase
```

Cada módulo del sistema (stock, ventas, ecommerce, etc.) vive en su propia carpeta dentro de `src/modules/`.

## Base de datos

El esquema de tablas del módulo de stock está en [`supabase/migrations/0001_init_stock.sql`](supabase/migrations/0001_init_stock.sql). Para crear las tablas en un proyecto de Supabase nuevo, copiá y pegá ese archivo en el **SQL Editor** de Supabase y ejecutalo (o corré `npx supabase db push` si tenés el [Supabase CLI](https://supabase.com/docs/guides/cli) instalado y tu proyecto linkeado con `supabase link`).

Tablas: `categorias`, `marcas`, `unidades_medida`, `tipos_deposito`, `depositos`, `productos`, `stock_x_deposito`, `tipos_movimiento`, `movimientos_stock`, `detalle_movimiento`.

### Migraciones

Las migraciones viven en `supabase/migrations/`, versionadas en Git, con el
patrón `NNNN_nombre_descriptivo.sql` (numeración correlativa de 4 dígitos, sin
huecos ni repetidos). El pipeline de CI valida ese formato en cada PR con
`npm run validate:migrations`.

- **Para crear una migración nueva:** agregá un archivo con el próximo número
  (por ejemplo, después de `0001_init_stock.sql` vendría
  `0002_nombre_del_cambio.sql`).
- **Regla importante: una migración ya mergeada a `develop` no se modifica.**
  Si necesitás cambiar algo de un archivo que ya se aplicó, creá una migración
  nueva que haga el ajuste (por ejemplo, un `ALTER TABLE`), nunca edites el
  archivo viejo. Editarlo retroactivamente hace que las bases que ya lo
  corrieron queden desincronizadas con las que lo corran después.
- **En Staging se aplican solas:** el job `migraciones` del pipeline corre
  `supabase db push` en cada push a `develop`, que solo aplica las
  migraciones todavía no aplicadas (Supabase lleva su propio registro de qué
  ya corrió, así que reejecutar el pipeline no las vuelve a aplicar).

Más detalle (incluyendo por qué importa la numeración) en
[`docs/ci-y-despliegue.md`](docs/ci-y-despliegue.md).

## Staging

No hay un servidor de staging propio: el despliegue lo maneja la integración
nativa de **Vercel** con este repositorio de GitHub (no vive en este repo como
workflow propio).

- **Cada Pull Request** genera automáticamente un deploy de preview en
  Vercel (Vercel lo comenta en el PR).
- **Cada push a `develop`** despliega la versión que el equipo usa día a día
  como entorno de staging.
- En el mismo push a `develop`, si ya están cargados los secrets del
  proyecto de Supabase de staging, el pipeline de CI aplica las migraciones
  pendientes a esa base (ver sección de arriba).

**Secrets necesarios para que las migraciones de staging se apliquen solas**
(se cargan en **Settings → Secrets and variables → Actions** del repo, nunca
en el código): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_PROJECT_REF`. Mientras no estén cargados, ese paso se saltea solo
(no rompe el pipeline). Requiere permisos de administrador del repositorio;
pasos exactos en [`docs/ci-y-despliegue.md`](docs/ci-y-despliegue.md).

No hay todavía una URL fija de staging para documentar acá: cada deploy de
Vercel tiene su propia URL, visible en el PR o en el dashboard de Vercel.

## Ramas

- `main`: código estable/entregable.
- `develop`: integración de features ya funcionando (es la rama que se despliega en Vercel por ahora).
- `feature/*`: una rama por módulo o funcionalidad en desarrollo (ej: `feature/stock`).

## Cómo contribuir

Antes de tocar código, leé la [guía de contribución](CONTRIBUTING.md): explica el
modelo de ramas, cómo nombrar las ramas y los commits, y el flujo completo para
abrir un pull request.

Documentación adicional para quien administra el repositorio:

- [`docs/setup-github.md`](docs/setup-github.md): cómo proteger `main` y
  `develop` (PR obligatorio + 1 aprobación). Requiere permisos de administrador.
- [`docs/ci-y-despliegue.md`](docs/ci-y-despliegue.md): qué corre el pipeline de
  CI, cómo se aplican las migraciones y cómo queda armado el despliegue en
  Vercel.
