import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardCheck,
  FileBarChart,
  Layers3,
  PackageCheck,
  PackageOpen,
  Ruler,
  Settings2,
  Shapes,
  Tags,
} from 'lucide-react'

export const navigationGroups = [
  {
    label: 'Operación',
    items: [
      { id: 'stock', label: 'Stock', icon: Boxes },
      { id: 'movimientos', label: 'Movimientos', icon: Layers3 },
      { id: 'recepciones', label: 'Recepciones', icon: PackageCheck },
    ],
  },
  {
    label: 'Catálogos',
    items: [
      { id: 'articulos', label: 'Artículos', icon: PackageOpen },
      { id: 'categorias', label: 'Categorías', icon: Shapes },
      { id: 'marcas', label: 'Marcas', icon: Tags },
      { id: 'unidades', label: 'Unidades', icon: Ruler },
    ],
  },
  {
    label: 'Control',
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
]

export const pageTitles = Object.fromEntries(
  navigationGroups.flatMap((group) =>
    group.items.map((item) => [item.id, item.label]),
  ),
)

pageTitles['historial-movimientos'] = 'Historial de movimientos'

