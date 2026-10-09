import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileStack,
  FolderTree,
  History,
  Layers3,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Percent,
  Receipt,
  Ruler,
  Settings2,
  Shapes,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'

// Roles canónicos del sistema (issue CA-01). "Cliente Web" no es un rol
// interno: nunca aparece en `usuarios_internos.rol_id` ni en estas listas,
// solo existe para la tienda (/tienda), fuera de este menú.
export const ROL_ADMINISTRADOR = 'Administrador'
export const ROL_VENDEDOR = 'Vendedor'
export const ROL_ENCARGADO_DEPOSITO = 'Encargado de Depósito'
export const ROL_COMPRAS_PROVEEDORES = 'Compras / Proveedores'
export const ROL_TESORERO = 'Tesorero'

export const ROLES_CANONICOS = [
  ROL_ADMINISTRADOR,
  ROL_VENDEDOR,
  ROL_ENCARGADO_DEPOSITO,
  ROL_COMPRAS_PROVEEDORES,
  ROL_TESORERO,
]

// Secciones del menú lateral. Cada sección se despliega con su flecha (ver
// Sidebar.jsx). `module` es el módulo que muestra el encabezado de la página;
// un ítem puede sobrescribirlo cuando la sección junta pantallas de varios
// módulos (por ejemplo, Compras incluye Proveedores y Tesorería).
//
// `roles`: lista de roles canónicos habilitados para ver el ítem (CA-02).
// Administrador siempre puede ver todo, así que no hace falta repetirlo.
// Un ítem sin `roles` (como "Ver tienda") no tiene restricción: es visible
// para cualquier interno. Un ítem con `roles: []` queda reservado a
// Administrador porque ningún rol no-admin aparece en la matriz del issue.
export const navigationGroups = [
  {
    id: 'stock',
    label: 'Stock',
    icon: Boxes,
    module: 'Stock',
    items: [
      { id: 'stock', label: 'Stock', icon: Boxes, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'movimientos', label: 'Movimientos', icon: Layers3, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'alertas-stock', label: 'Alertas', icon: AlertTriangle, roles: [ROL_ENCARGADO_DEPOSITO] },
    ],
  },
  {
    id: 'articulos',
    label: 'Artículos',
    icon: PackageOpen,
    module: 'Stock',
    items: [
      { id: 'articulos', label: 'Artículos', icon: PackageOpen, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'categorias', label: 'Categorías', icon: Shapes, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'marcas', label: 'Marcas', icon: Tags, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'unidades', label: 'Unidades', icon: Ruler, roles: [ROL_ENCARGADO_DEPOSITO] },
    ],
  },
  {
    id: 'control',
    label: 'Control y ajustes',
    icon: Settings2,
    module: 'Stock',
    items: [
      { id: 'inventario-fisico', label: 'Inventario físico', icon: ClipboardCheck, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'reportes', label: 'Reportes', icon: FileBarChart, roles: [ROL_ENCARGADO_DEPOSITO, ROL_TESORERO] },
      { id: 'depositos', label: 'Depósitos', icon: Building2, roles: [ROL_ENCARGADO_DEPOSITO] },
      { id: 'configuracion-stock', label: 'Configuración', icon: Settings2, roles: [ROL_ENCARGADO_DEPOSITO] },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    icon: ShoppingCart,
    module: 'Compras',
    items: [
      { id: 'proveedores', label: 'Proveedores', icon: Truck, module: 'Proveedores', roles: [ROL_COMPRAS_PROVEEDORES] },
      { id: 'rubros', label: 'Rubros', icon: FolderTree, module: 'Proveedores', roles: [ROL_COMPRAS_PROVEEDORES] },
      { id: 'ordenes-compra', label: 'Órdenes de Compra', icon: ShoppingCart, roles: [ROL_COMPRAS_PROVEEDORES] },
      { id: 'recepciones', label: 'Recepciones', icon: PackageCheck, roles: [ROL_COMPRAS_PROVEEDORES, ROL_ENCARGADO_DEPOSITO] },
      { id: 'notas-proveedor', label: 'Notas de Crédito/Débito', icon: FileStack, roles: [ROL_COMPRAS_PROVEEDORES] },
      { id: 'facturas-proveedor', label: 'Facturas de Proveedor', icon: Receipt, module: 'Tesorería', roles: [ROL_TESORERO] },
      { id: 'ordenes-pago', label: 'Órdenes de Pago', icon: Wallet, module: 'Tesorería', roles: [ROL_TESORERO] },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: Users,
    module: 'Clientes',
    items: [
      { id: 'clientes', label: 'Clientes', icon: Users, roles: [ROL_VENDEDOR] },
      { id: 'historial-cliente', label: 'Historial de cliente', icon: History, roles: [ROL_VENDEDOR] },
      { id: 'importar-clientes', label: 'Importar clientes', icon: Upload, roles: [ROL_VENDEDOR] },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    icon: Receipt,
    module: 'Ventas',
    items: [
      { id: 'nueva-venta', label: 'Nueva venta', icon: ShoppingCart, roles: [ROL_VENDEDOR] },
      { id: 'ventas', label: 'Ventas', icon: Receipt, roles: [ROL_VENDEDOR] },
      { id: 'supervision-ventas', label: 'Supervisión de ventas', icon: ClipboardList, roles: [] },
      { id: 'listas-precio', label: 'Listas de precios', icon: Tags, roles: [ROL_VENDEDOR] },
      { id: 'descuentos', label: 'Descuentos', icon: Percent, roles: [] },
      { id: 'cajas', label: 'Cajas', icon: Wallet, module: 'Tesorería', roles: [ROL_VENDEDOR, ROL_TESORERO] },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    icon: Store,
    module: 'E-commerce',
    items: [
      { id: 'ver-tienda', label: 'Ver tienda', icon: Store, href: '/tienda', newTab: true },
      { id: 'publicacion-web', label: 'Publicación web', icon: Store, roles: [] },
      { id: 'pedidos-web', label: 'Pedidos web', icon: PackageSearch, roles: [] },
    ],
  },
]

// Páginas que no tienen entrada propia en el menú pero reutilizan la
// pantalla/rol de otra (p. ej. el historial de movimientos se abre desde
// Movimientos). Mantiene paginaVisibleParaRol() consistente con el
// agrupamiento que ya usa Sidebar.jsx para la sección abierta.
const ALIAS_PAGINA = {
  'historial-movimientos': 'movimientos',
}

function buscarItem(pageId) {
  for (const group of navigationGroups) {
    const item = group.items.find((candidato) => candidato.id === pageId)
    if (item) return item
  }
  return null
}

export function itemVisibleParaRol(item, rol) {
  if (!item.roles) return true
  if (rol === ROL_ADMINISTRADOR) return true
  return item.roles.includes(rol)
}

// CA-02: ítems del grupo que el rol puede ver (para filtrar el Sidebar).
export function itemsVisiblesDeGrupo(group, rol) {
  return group.items.filter((item) => itemVisibleParaRol(item, rol))
}

// CA-03: ¿el rol puede ver esta página si fuerza la navegación? Las páginas
// sin entrada en el menú (ninguna hoy) quedan visibles por defecto.
export function paginaVisibleParaRol(pageId, rol) {
  const idReal = ALIAS_PAGINA[pageId] ?? pageId
  const item = buscarItem(idReal)
  return item ? itemVisibleParaRol(item, rol) : true
}

// Primera pantalla (sin contar links externos como "Ver tienda") que el rol
// puede ver. Sirve de destino por defecto al entrar sin hash en la URL y
// para el botón "Volver" de la vista de Acceso Denegado.
export function primeraPaginaVisibleParaRol(rol) {
  for (const group of navigationGroups) {
    const visible = itemsVisiblesDeGrupo(group, rol).find((item) => !item.href)
    if (visible) return visible.id
  }
  return 'stock'
}

export const pageTitles = Object.fromEntries(
  navigationGroups.flatMap((group) =>
    group.items.map((item) => [item.id, item.label]),
  ),
)

pageTitles['historial-movimientos'] = 'Historial de movimientos'

export const pageModules = Object.fromEntries(
  navigationGroups.flatMap((group) =>
    group.items.map((item) => [item.id, item.module ?? group.module]),
  ),
)

pageModules['historial-movimientos'] = 'Stock'
