# CI y despliegue

Esta guía explica qué hace el pipeline automático que corre en GitHub Actions
cada vez que subís código, cómo correr lo mismo en tu máquina antes de
pushear, y cómo queda armado el despliegue del proyecto. Está pensada para
alguien que nunca trabajó con integración continua.

## Qué corre en cada Pull Request

Cuando abrís un PR contra `develop` o `main` (o cuando se hace push directo a
`develop`), se dispara automáticamente el workflow definido en
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Corre un job
llamado **verificar**, que hace, en orden:

1. **Descarga el código** y **instala las dependencias** (`npm ci`).
2. **Valida las migraciones SQL**: chequea que los archivos de
   `supabase/migrations/` estén bien nombrados y numerados (ver más abajo).
3. **Lint**: corre `npm run lint` para chequear el estilo del código.
4. **Tests con cobertura**: corre `npm run test:coverage`.
5. **Build**: corre `npm run build`, el mismo build que se usa en producción.
6. **Sube el reporte de cobertura** como un archivo descargable (artifact) del
   workflow, para que quede la evidencia de qué se testeó en cada sprint.

Si sos parte del equipo, vas a ver estos pasos como un **check** en la parte
de abajo de tu Pull Request en GitHub, con un ✅ (pasó), ❌ (falló) o 🟡
(todavía corriendo).

### Qué significa que un check quede en rojo

Que el check `verificar` quede en rojo (❌) significa que **algo** de la
lista de arriba falló: puede ser un error de lint, un test roto, la cobertura
por debajo del 70%, un problema en el build, o una migración mal nombrada.
**Un PR con el check en rojo no se debería mergear.** Hacé clic en el check
para abrir el detalle en GitHub Actions y ver exactamente qué paso falló y
por qué (el log te muestra el error tal cual sale en tu terminal).

Además de este check, cada PR también genera un **deploy de preview en
Vercel** (lo vas a ver como otro check, con un link). Ver la sección
"Despliegue" más abajo.

## Cómo correr los tests y ver la cobertura en tu máquina

Antes de pushear, conviene correr localmente lo mismo que corre el pipeline:

```bash
npm run lint            # chequea el estilo del código
npm run test            # corre los tests una sola vez
npm run test:coverage   # corre los tests y muestra el % de cobertura
npm run build            # genera el build, igual que en producción
```

Si estás escribiendo tests y querés que se vuelvan a correr solos cada vez
que guardás un archivo, usá:

```bash
npm run test:watch
```

### Cómo leer el reporte de cobertura

Al correr `npm run test:coverage` te va a aparecer una tabla en la terminal
con el porcentaje de líneas, funciones, ramas (branches) y statements
cubiertos por tests. El pipeline exige que ese porcentaje sea **70% o más**.

Importante: ese 70% **no se mide sobre todo `src/`**, sino solo sobre
`src/modules/**/api/**` (las funciones que consultan Supabase) y `src/lib/**`
(el cliente de Supabase y el contexto de autenticación). Esa configuración
está en `vite.config.js`, en la sección `test.coverage`, con un comentario
que explica por qué. Las pantallas de React (`src/modules/**/pages/**`)
todavía se validan a mano durante el Sprint 1; van a sumarse al alcance de
cobertura en sprints siguientes, a medida que el equipo escriba tests para
componentes.

También se genera un reporte más detallado en la carpeta `coverage/` (no se
sube al repo, está en `.gitignore`). Podés abrir
`coverage/lcov-report/index.html` en el navegador para ver, archivo por
archivo, qué líneas están cubiertas y cuáles no.

## Cómo se nombran las migraciones nuevas

Cada archivo de `supabase/migrations/` tiene que seguir este patrón:

```
NNNN_nombre_descriptivo.sql
```

- `NNNN`: cuatro dígitos (`0001`, `0002`, `0003`, ...).
- `nombre_descriptivo`: en minúsculas, separado por guiones bajos
  (snake_case). Ejemplo: `agrega_tabla_proveedores`.

Por ejemplo, la próxima migración después de `0001_init_stock.sql` sería
`0002_agrega_tabla_proveedores.sql`.

### Por qué importa la numeración

Supabase (y cualquier herramienta de migraciones) aplica los archivos **en
orden**, uno atrás del otro, para ir armando el esquema de la base paso a
paso. Si dos personas crean una migración con el mismo número, o si queda un
hueco en la numeración (por ejemplo, existe `0001` y `0003` pero no `0002`),
no queda claro en qué orden se tienen que aplicar los cambios, y se puede
romper la base de otro integrante del equipo o la de staging.

Por eso el pipeline corre `npm run validate:migrations`
(`scripts/validar-migraciones.mjs`) en cada PR. Ese script revisa que:

- todos los archivos respeten el patrón `NNNN_nombre_descriptivo.sql`,
- la numeración sea correlativa y sin huecos, empezando en `0001`,
- no haya números repetidos,
- ningún archivo esté vacío.

Si rompiste alguna de estas reglas, el script te va a decir exactamente cuál
archivo y por qué, y el check del PR queda en rojo hasta que lo corrijas.
Podés correrlo en tu máquina antes de pushear:

```bash
npm run validate:migrations
```

## Cómo crear el proyecto de Supabase para staging

> ⚠️ Cargar los secrets en GitHub requiere **permisos de administrador** del
> repositorio. Si no los tenés, pedile a la dueña del repositorio que lo haga
> o que te dé acceso.

El pipeline tiene un segundo job, **migraciones**, que aplica automáticamente
las migraciones nuevas a un proyecto de Supabase de "staging" cada vez que se
pushea a `develop`. Mientras el equipo no haya creado ese proyecto, este job
se **saltea solo** (no rompe el pipeline, simplemente no corre). Para
activarlo:

### 1. Creá un segundo proyecto en Supabase

Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) y creá un
proyecto nuevo (separado del que ya usás para desarrollar), por ejemplo
llamado `sistema-corralon-staging`. Va a ser la base de datos "de prueba"
contra la que corren las migraciones automáticas antes de llegar a
producción.

### 2. Conseguí los tres valores que necesita el pipeline

En el dashboard del proyecto de **staging** que acabás de crear:

| Secret en GitHub | De dónde se saca en Supabase |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | **Account → Access Tokens** (arriba a la derecha, en tu perfil de cuenta, no en el proyecto). Generá un token nuevo con "Generate new token". |
| `SUPABASE_PROJECT_REF` | **Project Settings → General → Reference ID** del proyecto de staging. |
| `SUPABASE_DB_PASSWORD` | **Project Settings → Database → Database password**. Es la contraseña que elegiste al crear el proyecto (si no la tenés, se puede resetear ahí mismo). |

### 3. Cargá los secrets en GitHub

En el repositorio, andá a **Settings → Secrets and variables → Actions →
New repository secret**, y cargá los tres, uno por uno, con estos nombres
**exactos**:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

Una vez cargados los tres, el job **migraciones** se va a activar solo en el
próximo push a `develop`: no hace falta tocar el workflow.

## Despliegue: Vercel y los distintos entornos

- **Cada Pull Request genera un deploy de preview automático en Vercel.**
  Vercel comenta el link directo en el PR (o aparece como check). Ese preview
  es una versión completa y funcional del sistema con tu cambio, corriendo
  contra Supabase, y es el entorno donde el equipo valida el incremento
  **antes** de mergear. Este preview cubre el requisito de "despliegue a
  Staging" del sprint: cada PR ya tiene su propio ambiente de prueba
  desplegado, sin que nadie tenga que hacer nada manualmente.
- **`develop`** es la rama "estable en desarrollo": cuando se mergea un PR
  ahí, Vercel despliega esa versión al entorno que usa el equipo día a día
  para ver cómo va quedando el sistema integrado.
- **`main`** queda reservada para las versiones entregables/estables del
  proyecto.

## Cuando falla el pipeline

Los errores más comunes que te vas a encontrar, y cómo resolverlos:

### 1. Falla el lint

```
✖ X problems (Y errors, Z warnings)
```

Corré `npm run lint` en tu máquina para ver el detalle. La mayoría de los
errores de ESLint te dicen la línea exacta y qué está mal (variable sin usar,
falta una dependencia en un `useEffect`, etc.). Corregí el código y volvé a
pushear.

### 2. Falla `test:coverage` (un test roto o la cobertura por debajo del 70%)

Corré `npm run test:coverage` localmente. Si un test falla, el mensaje te
muestra qué esperaba y qué recibió. Si en cambio todos los tests pasan pero
la cobertura queda debajo del 70%, significa que agregaste código nuevo
dentro de `src/modules/**/api/**` o `src/lib/**` sin tests: escribí un test
que cubra el camino feliz y el camino de error de esa función nueva.

### 3. Falla la validación de migraciones

```
Se encontraron problemas en "supabase/migrations": ...
```

El mensaje te dice exactamente qué archivo está mal (nombre, numeración
duplicada, hueco, o archivo vacío). Renombrá o corregí el archivo según la
convención de la sección de arriba y volvé a pushear. Si el problema es un
**hueco** o una **numeración duplicada**, probablemente significa que dos
personas crearon una migración al mismo tiempo en ramas distintas: pónganse
de acuerdo en el orden y renumeren la que se mergeó después.
