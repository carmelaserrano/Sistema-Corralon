# Cómo contribuir al Sistema-Corralón

Esta guía explica cómo trabajamos en equipo con Git y GitHub en este proyecto.
Está pensada para que la pueda seguir cualquiera, incluso si nunca hiciste un
_pull request_. Si algo no se entiende, preguntá en el grupo antes de romper algo. 🙂

## Modelo de ramas

Trabajamos con tres tipos de ramas:

- **`main`**: código estable y entregable. **Nunca** se commitea directo acá.
- **`develop`**: donde se integra todo lo que ya funciona. Es la rama que se
  despliega en Vercel. **Tampoco** se commitea directo acá.
- **`feature/*`** (y `fix/*`, `docs/*`, `infra/*`): son las ramas donde
  realmente se trabaja. Cada una sale de `develop` y vuelve a `develop`.

La regla de oro:

> Siempre trabajás sobre una rama propia salida de `develop`.
> Nunca commiteás directo a `develop` ni a `main`.

Los cambios entran a `develop` únicamente a través de un _pull request_ (PR)
que revisa otra persona del equipo.

## Cómo nombrar las ramas

El nombre de la rama arranca con un prefijo según el tipo de trabajo, seguido de
una descripción corta en minúsculas y con guiones. Cuando la rama corresponde a
una historia de usuario, incluimos su código (por ejemplo `us-stk-01`).

Prefijos:

- `feature/` → una funcionalidad nueva.
- `fix/` → corrección de un error.
- `infra/` → configuración, herramientas, plantillas.
- `docs/` → documentación (README, wiki, guías).

Ejemplos reales del proyecto:

```
feature/us-stk-01-alta-articulos
fix/stock-cantidad-negativa
infra/plantillas-y-convenciones
docs/wiki-modelo-datos
```

## Cómo escribir los commits

Usamos **Conventional Commits** en español. Cada commit se escribe así:

```
tipo(alcance): descripción en minúscula y en infinitivo o presente
```

- **tipo**: qué clase de cambio es (ver la lista de abajo).
- **alcance**: la parte del sistema que tocás (`stock`, `movimientos`,
  `depositos`, `auth`, etc.). Es opcional, pero conviene ponerlo.
- **descripción**: qué hace el commit, corta, en minúscula y sin punto final.
  Usá infinitivo o presente ("agregar", "corregir", "agrega", "corrige"),
  no pasado.

Tipos permitidos:

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | Una funcionalidad nueva |
| `fix` | Corrección de un error |
| `docs` | Cambios solo en documentación |
| `style` | Formato, espacios, comas (no cambia la lógica) |
| `refactor` | Reordenar código sin cambiar lo que hace |
| `test` | Agregar o corregir tests |
| `chore` | Tareas varias: dependencias, configuración, mantenimiento |

Ejemplos concretos del proyecto:

```
feat(stock): agregar alta de artículos con SKU y categoría
fix(movimientos): validar que la cantidad no sea negativa
feat(depositos): listar depósitos ordenados por nombre
docs(stock): documentar las funciones de acceso a datos
chore(auth): actualizar el cliente de Supabase
```

## El flujo de trabajo, paso a paso

Supongamos que te toca la historia "Alta de artículos".

1. **Parate en `develop` y traé lo último:**

   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Creá tu rama a partir de `develop`:**

   ```bash
   git checkout -b feature/us-stk-01-alta-articulos
   ```

3. **Trabajá y commiteá** siguiendo la convención de commits. Podés hacer
   varios commits chicos:

   ```bash
   git add .
   git commit -m "feat(stock): agregar formulario de alta de artículos"
   ```

4. **Subí tu rama a GitHub:**

   ```bash
   git push -u origin feature/us-stk-01-alta-articulos
   ```

5. **Abrí el Pull Request contra `develop`** desde la interfaz de GitHub
   (botón "Compare & pull request"). Verificá que la base sea `develop` y no
   `main`. Completá la plantilla del PR (descripción, issue que cierra,
   checklist).

6. **Pedí revisión** a otra persona del equipo. Avisá en el grupo que tu PR
   está listo para revisar.

7. **Resolvé los comentarios** si te piden cambios: hacés más commits en la
   misma rama y volvés a pushear; el PR se actualiza solo.

8. **Mergeá el PR** una vez aprobado (botón "Merge pull request" en GitHub).

9. **Borrá la rama** cuando ya se mergeó (GitHub te ofrece el botón
   "Delete branch"). Localmente también podés limpiarla:

   ```bash
   git checkout develop
   git pull origin develop
   git branch -d feature/us-stk-01-alta-articulos
   ```

## Revisión: nadie aprueba su propio PR

**Ningún PR se aprueba a sí mismo.** Siempre lo revisa **otra persona** del
equipo antes de mergear. Esto no es para desconfiar de nadie: sirve para
detectar errores a tiempo y para que más de uno entienda cómo va quedando el
sistema. Si sos quien revisa, mirá el código con calma y usá el checklist del PR.

## Cómo referenciar los issues

Cada rama nace de un issue (una historia de usuario, una tarea o un bug). Conectá
tu trabajo con ese issue así:

- **En el PR**: escribí `Closes #N` en la descripción (donde `N` es el número
  del issue). Cuando el PR se mergea, GitHub cierra ese issue automáticamente.
- **En un commit**: podés mencionar el issue agregando `(#N)` al final de la
  descripción. Por ejemplo:

  ```
  feat(stock): agregar alta de artículos (#12)
  ```

Si un cambio resuelve varios issues, repetí `Closes #12, Closes #13` en el PR.
