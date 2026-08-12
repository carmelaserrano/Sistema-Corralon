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

El esquema de tablas del módulo de stock está en [`supabase/migrations/0001_init_stock.sql`](supabase/migrations/0001_init_stock.sql). Para crear las tablas en un proyecto de Supabase nuevo, copiá y pegá ese archivo en el **SQL Editor** de Supabase y ejecutalo.

Tablas: `categorias`, `marcas`, `unidades_medida`, `tipos_deposito`, `depositos`, `productos`, `stock_x_deposito`, `tipos_movimiento`, `movimientos_stock`, `detalle_movimiento`.

## Ramas

- `main`: código estable/entregable.
- `develop`: integración de features ya funcionando (es la rama que se despliega en Vercel por ahora).
- `feature/*`: una rama por módulo o funcionalidad en desarrollo (ej: `feature/stock`).
