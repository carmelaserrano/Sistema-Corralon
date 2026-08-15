import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // El umbral del 70% se mide solo sobre la capa de acceso a datos
      // (src/modules/**/api/**) y utilidades (src/lib/**), que es donde el
      // equipo escribe tests unitarios durante el Sprint 1. Las pantallas
      // React (src/modules/**/pages/**) se validan con pruebas manuales por
      // ahora y se van a ir sumando al alcance de cobertura en sprints
      // siguientes. Sin este recorte el umbral del 70% sería inalcanzable
      // hoy y el equipo terminaría desactivando el control por completo,
      // que es peor que tenerlo acotado y explícito.
      include: ['src/modules/**/api/**', 'src/lib/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
