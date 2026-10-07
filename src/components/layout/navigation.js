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

// Secciones del menú lateral. Cada sección se despliega con su flecha (ver
// Sidebar.jsx). `module` es el módulo que muestra el encabezado de la página;
// un ítem puede sobrescribirlo cuando la sección junta pantallas de varios
// módulos (por ejemplo, Compras incluye Proveedores y Tesorería).
export const navigationGroups = [
  {
    id: 'stock',
    label: 'Stock',
    icon: Boxes,
    module: 'Stock',
    items: [
      { id: 'stock', label: 'Stock', icon: Boxes },
      { id: 'movimientos', label: 'Movimientos', icon: Layers3 },
      { id: 'alertas-stock', label: 'Alertas', icon: AlertTriangle },
    ],
  },
  {
    id: 'articulos',
    label: 'Artículos',
    icon: PackageOpen,
    module: 'Stock',
    items: [
      { id: 'articulos', label: 'Artículos', icon: PackageOpen },
      { id: 'categorias', label: 'Categorías', icon: Shapes },
      { id: 'marcas', label: 'Marcas', icon: Tags },
      { id: 'unidades', label: 'Unidades', icon: Ruler },
    ],
  },
  {
    id: 'control',
    label: 'Control y ajustes',
    icon: Settings2,
    module: 'Stock',
    items: [
      { id: 'inventario-fisico', label: 'Inventario físico', icon: ClipboardCheck },
      { id: 'reportes', label: 'Reportes', icon: FileBarChart },
      { id: 'depositos', label: 'Depósitos', icon: Building2 },
      { id: 'configuracion-stock', label: 'Configuración', icon: Settings2 },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    icon: ShoppingCart,
    module: 'Compras',
    items: [
      { id: 'proveedores', label: 'Proveedores', icon: Truck, module: 'Proveedores' },
      { id: 'rubros', label: 'Rubros', icon: FolderTree, module: 'Proveedores' },
      { id: 'ordenes-compra', label: 'Órdenes de Compra', icon: ShoppingCart },
      { id: 'recepciones', label: 'Recepciones', icon: PackageCheck },
      { id: 'notas-proveedor', label: 'Notas de Crédito/Débito', icon: FileStack },
      { id: 'facturas-proveedor', label: 'Facturas de Proveedor', icon: Receipt, module: 'Tesorería' },
      { id: 'ordenes-pago', label: 'Órdenes de Pago', icon: Wallet, module: 'Tesorería' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: Users,
    module: 'Clientes',
    items: [
      { id: 'clientes', label: 'Clientes', icon: Users },
      { id: 'historial-cliente', label: 'Historial de cliente', icon: History },
      { id: 'importar-clientes', label: 'Importar clientes', icon: Upload },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    icon: Receipt,
    module: 'Ventas',
    items: [
      { id: 'nueva-venta', label: 'Nueva venta', icon: ShoppingCart },
      { id: 'ventas', label: 'Ventas', icon: Receipt },
      { id: 'supervision-ventas', label: 'Supervisión de ventas', icon: ClipboardList },
      { id: 'listas-precio', label: 'Listas de precios', icon: Tags },
      { id: 'descuentos', label: 'Descuentos', icon: Percent },
      { id: 'cajas', label: 'Cajas', icon: Wallet, module: 'Tesorería' },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    icon: Store,
    module: 'E-commerce',
    items: [
      { id: 'ver-tienda', label: 'Ver tienda', icon: Store, href: '/tienda', newTab: true },
      { id: 'publicacion-web', label: 'Publicación web', icon: Store },
      { id: 'pedidos-web', label: 'Pedidos web', icon: PackageSearch },
    ],
  },
]

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
