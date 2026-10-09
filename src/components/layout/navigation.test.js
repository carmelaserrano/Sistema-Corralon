import { describe, expect, it } from 'vitest'
import {
  ROL_ADMINISTRADOR,
  ROL_COMPRAS_PROVEEDORES,
  ROL_ENCARGADO_DEPOSITO,
  ROL_TESORERO,
  ROL_VENDEDOR,
  itemVisibleParaRol,
  itemsVisiblesDeGrupo,
  navigationGroups,
  paginaVisibleParaRol,
  primeraPaginaVisibleParaRol,
} from './navigation'

describe('itemVisibleParaRol', () => {
  it('un ítem sin "roles" es visible para cualquier rol (ej. Ver tienda)', () => {
    expect(itemVisibleParaRol({ roles: undefined }, ROL_VENDEDOR)).toBe(true)
    expect(itemVisibleParaRol({ roles: undefined }, 'cualquier-cosa')).toBe(true)
  })

  it('Administrador siempre ve todo, incluso ítems con roles: []', () => {
    expect(itemVisibleParaRol({ roles: [] }, ROL_ADMINISTRADOR)).toBe(true)
    expect(itemVisibleParaRol({ roles: [ROL_TESORERO] }, ROL_ADMINISTRADOR)).toBe(true)
  })

  it('un ítem con roles: [] no es visible para ningún rol que no sea Administrador', () => {
    expect(itemVisibleParaRol({ roles: [] }, ROL_VENDEDOR)).toBe(false)
    expect(itemVisibleParaRol({ roles: [] }, ROL_ENCARGADO_DEPOSITO)).toBe(false)
  })

  it('respeta la lista explícita de roles', () => {
    const item = { roles: [ROL_VENDEDOR, ROL_TESORERO] }
    expect(itemVisibleParaRol(item, ROL_VENDEDOR)).toBe(true)
    expect(itemVisibleParaRol(item, ROL_TESORERO)).toBe(true)
    expect(itemVisibleParaRol(item, ROL_COMPRAS_PROVEEDORES)).toBe(false)
  })
})

describe('itemsVisiblesDeGrupo', () => {
  it('filtra los ítems de un grupo según el rol', () => {
    const grupoVentas = navigationGroups.find((g) => g.id === 'ventas')
    const visiblesVendedor = itemsVisiblesDeGrupo(grupoVentas, ROL_VENDEDOR).map((i) => i.id)
    expect(visiblesVendedor).toEqual(
      expect.arrayContaining(['nueva-venta', 'ventas', 'listas-precio', 'cajas']),
    )
    expect(visiblesVendedor).not.toContain('supervision-ventas')
    expect(visiblesVendedor).not.toContain('descuentos')
  })

  it('un grupo entero puede quedar sin ítems visibles para un rol', () => {
    const grupoClientes = navigationGroups.find((g) => g.id === 'clientes')
    expect(itemsVisiblesDeGrupo(grupoClientes, ROL_TESORERO)).toEqual([])
  })
})

describe('paginaVisibleParaRol (CA-03)', () => {
  it('Vendedor puede ver nueva-venta pero no proveedores', () => {
    expect(paginaVisibleParaRol('nueva-venta', ROL_VENDEDOR)).toBe(true)
    expect(paginaVisibleParaRol('proveedores', ROL_VENDEDOR)).toBe(false)
  })

  it('Encargado de Depósito puede ver recepciones, Compras / Proveedores también', () => {
    expect(paginaVisibleParaRol('recepciones', ROL_ENCARGADO_DEPOSITO)).toBe(true)
    expect(paginaVisibleParaRol('recepciones', ROL_COMPRAS_PROVEEDORES)).toBe(true)
    expect(paginaVisibleParaRol('recepciones', ROL_VENDEDOR)).toBe(false)
  })

  it('historial-movimientos hereda la visibilidad de movimientos (alias)', () => {
    expect(paginaVisibleParaRol('historial-movimientos', ROL_ENCARGADO_DEPOSITO)).toBe(true)
    expect(paginaVisibleParaRol('historial-movimientos', ROL_VENDEDOR)).toBe(false)
  })

  it('Administrador puede ver cualquier página del menú', () => {
    for (const group of navigationGroups) {
      for (const item of group.items) {
        expect(paginaVisibleParaRol(item.id, ROL_ADMINISTRADOR)).toBe(true)
      }
    }
  })

  it('una página que no está en el menú queda visible por defecto', () => {
    expect(paginaVisibleParaRol('pagina-inexistente', ROL_VENDEDOR)).toBe(true)
  })
})

describe('primeraPaginaVisibleParaRol', () => {
  it('devuelve una página real (no un link externo) para cada rol canónico', () => {
    for (const rol of [
      ROL_ADMINISTRADOR,
      ROL_VENDEDOR,
      ROL_ENCARGADO_DEPOSITO,
      ROL_COMPRAS_PROVEEDORES,
      ROL_TESORERO,
    ]) {
      const primera = primeraPaginaVisibleParaRol(rol)
      expect(primera).toBeTruthy()
      expect(paginaVisibleParaRol(primera, rol)).toBe(true)
      expect(primera).not.toBe('ver-tienda')
    }
  })

  it('Vendedor cae en Stock (primer grupo) seguido por Clientes como primer visible', () => {
    expect(primeraPaginaVisibleParaRol(ROL_VENDEDOR)).toBe('clientes')
  })
})
