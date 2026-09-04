import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardCheck,
  FileBarChart,
  FolderTree,
  Layers3,
  PackageCheck,
  PackageOpen,
  Ruler,
  Settings2,
  Shapes,
  Tags,
  Truck,
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

