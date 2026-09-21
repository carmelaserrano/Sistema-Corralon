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

export const navigationGroups = [
  {
    label: 'Operación',
    module: 'Stock',
    items: [
      { id: 'stock', label: 'Stock', icon: Boxes },
      { id: 'movimientos', label: 'Movimientos', icon: Layers3 },
      { id: 'recepciones', label: 'Recepciones', icon: PackageCheck },
    ],
  },
  {
    label: 'Catálogos',
    module: 'Stock',
    items: [
      { id: 'articulos', label: 'Artículos', icon: PackageOpen },
      { id: 'categorias', label: 'Categorías', icon: Shapes },
      { id: 'marcas', label: 'Marcas', icon: Tags },
      { id: 'unidades', label: 'Unidades', icon: Ruler },
    ],
  },
  {
    label: 'Control',
    module: 'Stock',
    items: [
      { id: 'depositos', label: 'Depósitos', icon: Building2 },
      {
        id: 'configuracion-stock',
        label: 'Configuración',
        icon: Settings2,
      },
      {
        id: 'inventario-fisico',
        label: 'Inventario',
        icon: ClipboardCheck,
      },
      { id: 'alertas-stock', label: 'Alertas', icon: AlertTriangle },
      { id: 'reportes', label: 'Reportes', icon: FileBarChart },
    ],
  },
  {
    label: 'Proveedores',
    module: 'Proveedores',
    items: [
      { id: 'proveedores', label: 'Proveedores', icon: Truck },
      { id: 'rubros', label: 'Rubros', icon: FolderTree },
    ],
  },
  {
    label: 'Compras',
    module: 'Compras',
    items: [
      { id: 'ordenes-compra', label: 'Órdenes de Compra', icon: ShoppingCart },
      { id: 'notas-proveedor', label: 'Notas de Crédito/Débito', icon: FileStack },
    ],
  },
  {
    label: 'Tesorería',
    module: 'Tesorería',
    items: [
      { id: 'facturas-proveedor', label: 'Facturas de Proveedor', icon: Receipt },
      { id: 'ordenes-pago', label: 'Órdenes de Pago', icon: Wallet },
    ],
  },
  {
    label: 'Clientes',
    module: 'Clientes',
    items: [
      { id: 'clientes', label: 'Clientes', icon: Users },
      { id: 'historial-cliente', label: 'Historial de cliente', icon: History },
      { id: 'importar-clientes', label: 'Importar clientes', icon: Upload },
    ],
  },
  {
    label: 'Ventas',
    module: 'Ventas',
    items: [
      { id: 'nueva-venta', label: 'Nueva venta', icon: ShoppingCart },
      { id: 'ventas', label: 'Ventas', icon: Receipt },
      { id: 'supervision-ventas', label: 'Supervisión de ventas', icon: ClipboardList },
      { id: 'listas-precio', label: 'Listas de precios', icon: Tags },
      { id: 'descuentos', label: 'Descuentos', icon: Percent },
    ],
  },
  {
    label: 'E-commerce',
    module: 'E-commerce',
    items: [
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
    group.items.map((item) => [item.id, group.module]),
  ),
)

pageModules['historial-movimientos'] = 'Stock'

