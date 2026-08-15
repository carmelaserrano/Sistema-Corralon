# Configuración de GitHub: proteger `main` y `develop`

La protección de rama **no se puede configurar desde el código**: es una opción
de GitHub que se activa en la web (o con la línea de comandos). Este documento
explica cómo hacerlo.

> ⚠️ **Hace falta permiso de administrador** sobre el repositorio. En nuestro
> proyecto eso lo tiene la dueña del repositorio. Si no sos vos, pedile que siga
> estos pasos.

El objetivo es que **nadie pueda pushear directo** a `main` ni a `develop`, y
que todo cambio entre por un _pull request_ con **al menos 1 aprobación**.

## Opción A: por la interfaz web (recomendada)

Hay que repetir estos pasos **dos veces**: una para `main` y otra para `develop`.

1. Entrá al repositorio en GitHub.
2. Andá a **Settings** (Configuración), en el menú de arriba del repo.
3. En el menú de la izquierda, elegí **Branches**.
4. En la sección "Branch protection rules", hacé clic en **Add rule**
   (o **Add branch protection rule**).
5. En **Branch name pattern**, escribí el nombre exacto de la rama: `main`
   (y después, en la segunda pasada, `develop`).
6. Tildá **Require a pull request before merging**.
   - Al tildarla se despliega **Require approvals**: dejá el número en **1**.
7. (Recomendado) Tildá **Do not allow bypassing the above settings** para que la
   regla también aplique a los administradores.
8. Hacé clic en **Create** (o **Save changes**) abajo de todo.
9. Repetí desde el paso 4 para la otra rama.

Cuando termines, deberías ver **dos reglas** en la lista: una para `main` y otra
para `develop`.

## Opción B: por consola con GitHub CLI

Para quien prefiere la terminal. Necesitás tener instalado
[GitHub CLI](https://cli.github.com/) y estar autenticado (`gh auth login`).

Proteger `main`:

```bash
gh api --method PUT repos/carmelaserrano/Sistema-Corralon/branches/main/protection \
  --input - <<'JSON'
{
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "required_status_checks": null,
  "enforce_admins": true,
  "restrictions": null
}
JSON
```

Proteger `develop` (es el mismo comando cambiando el nombre de la rama):

```bash
gh api --method PUT repos/carmelaserrano/Sistema-Corralon/branches/develop/protection \
  --input - <<'JSON'
{
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "required_status_checks": null,
  "enforce_admins": true,
  "restrictions": null
}
JSON
```

- `required_approving_review_count: 1` → exige 1 aprobación en el PR.
- `enforce_admins: true` → la regla aplica también a los administradores.
- `restrictions: null` → no limitamos quién puede pushear más allá de la regla
  del PR (cualquiera del equipo puede abrir su PR).

## Cómo comprobar que quedó activo

- En la web: **Settings → Branches** muestra las dos reglas.
- Probá pushear algo directo a `develop`: GitHub debería **rechazarlo** y pedir
  que abras un pull request.
