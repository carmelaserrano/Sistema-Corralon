import { test, expect } from '@playwright/test'
import { env } from 'node:process'

test('QA: login, Stock y Movimientos sin editar datos', async ({ page }, testInfo) => {
  const email = env.QA_EMAIL
  const password = env.QA_PASSWORD
  const errors = []
  const redact = (text) => [email, password].filter(Boolean)
    .reduce((value, secret) => value.replaceAll(secret, '[REDACTED]'), text)

  // A fresh browser context has no extensions. Treat all console errors as
  // failures except messages explicitly originating in browser extensions.
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const url = message.location().url
    errors.push({
      type: 'console.error',
      text: redact(message.text()),
      source: redact(url),
      app: !/^(chrome|moz)-extension:\/\//.test(url),
    })
  })
  page.on('pageerror', (error) => {
    errors.push({ type: 'pageerror', text: redact(error.message), app: true })
  })

  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ingresar', exact: true })).toBeVisible()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
    expect(Boolean(email && password),
      'BLOQUEADO: definir QA_EMAIL y QA_PASSWORD en el entorno local; no se intentó iniciar sesión.',
    ).toBe(true)

    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Salir', exact: true })).toBeVisible()

    const menu = page.getByRole('complementary', { name: 'Menú principal' })
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Stock', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Stock por depósito', exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('table')).toBeVisible()
    await expect(page.locator('.feedback-error')).toHaveCount(0)

    await menu.getByRole('button', { name: 'Movimientos', exact: true }).click()
    await expect(menu.getByRole('button', { name: 'Movimientos', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Nuevo movimiento', exact: true })).toBeVisible()
    await expect(page.getByLabel('Depósito de operación', { exact: true })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('.feedback-error')).toHaveCount(0)
  } finally {
    // Evidence is also produced for blocked login or failed assertions.
    if (!page.isClosed()) {
      await testInfo.attach('pantalla', {
        body: await page.screenshot({ path: testInfo.outputPath('pantalla.png'), fullPage: true }),
        contentType: 'image/png',
      })
    }
    await testInfo.attach('console-errors', {
      body: JSON.stringify(errors, null, 2),
      contentType: 'application/json',
    })
    expect.soft(errors.filter((error) => error.app), 'Errores de consola o JavaScript de la app').toEqual([])
  }
})
