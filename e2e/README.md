# Smoke E2E local

Ejecutar desde la raíz con Node.js 24 y las variables QA_EMAIL y QA_PASSWORD
definidas en el entorno de la terminal:

```powershell
npm.cmd run test:e2e
npm.cmd run test:e2e:report
```

Alternativamente, crear personalmente `.env.qa.local` con ambas variables y ejecutar:

```powershell
node --env-file=.env.qa.local ./node_modules/@playwright/test/cli.js test
```

No se crea ni se carga automáticamente ese archivo. `.env` y `.env.*` están
ignorados, excepto `.env.example`, que nunca debe contener credenciales reales.
Usar una cuenta QA y el entorno de pruebas ya configurado para la aplicación.

Playwright inicia Vite en localhost:5173 o reutiliza el servidor existente.
Solo usa Chromium, en un contexto nuevo, sin reutilizar la sesión del navegador
personal. Sin credenciales, verifica el login y falla con un mensaje BLOQUEADO.

El recorrido inicia sesión, abre Stock y Movimientos, y no envía formularios de
negocio ni modifica datos. La autenticación sí crea una sesión normal.
Los selectores usan roles y etiquetas; `.feedback-error` depende de una clase
CSS existente para detectar errores que no tienen un rol accesible.

Evidencia: `qa/playwright/results/` (capturas y JSON adjunto de errores) y
`qa/playwright/report/` (informe HTML). Son locales e ignorados por Git;
pueden mostrar el email y datos de la interfaz. Cada ejecución reemplaza los
resultados anteriores de Playwright; no toca los otros directorios de QA.
No se guardan estados de autenticación, videos ni trazas con datos de login.

Todos los console.error sin origen explícito de extensión y las excepciones
JavaScript no controladas fallan el test. Esto incluye errores de recursos o
servicios consumidos por la app; revisar el JSON para diagnosticar su causa.
El monitoreo abarca el recorrido, no errores que sucedan después de cerrarlo.

Vitest conserva sus scripts y configuración salvo la exclusión de `e2e/**`
para que no intente ejecutar la suite de Playwright.
