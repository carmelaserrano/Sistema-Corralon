import { Download, Search, X } from 'lucide-react'
import Button from './Button'

export default function DataTable({
  actions,
  children,
  className = '',
  empty = false,
  emptyComponent,
  filters,
  loading = false,
  loadingComponent,
  onExport,
  onPageChange,
  onSearchChange,
  page = 1,
  pageSize = 50,
  search = '',
  searchPlaceholder = 'Buscar...',
  total = 0,
  totalPages = 1,
}) {
  const mostrandoDesde = total === 0 ? 0 : (page - 1) * pageSize + 1
  const mostrandoHasta = Math.min(page * pageSize, total)

  return (
    <div className={`data-table-card ${className}`.trim()}>
      {(onSearchChange || filters || actions || onExport) && (
        <div className="data-table-toolbar">
          <div className="data-table-toolbar-left">
            {onSearchChange && (
              <div className="data-table-search">
                <Search size={16} className="search-icon" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="data-table-search-input"
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => onSearchChange('')}
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            {filters && <div className="data-table-filters">{filters}</div>}
          </div>

          <div className="data-table-toolbar-right">
            {onExport && (
              <Button
                type="button"
                variant="ghost"
                icon={Download}
                onClick={onExport}
                title="Exportar a CSV"
              >
                Exportar CSV
              </Button>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="data-table-scroll-container">
        {loading && loadingComponent ? (
          loadingComponent
        ) : empty && emptyComponent ? (
          emptyComponent
        ) : (
          children
        )}
      </div>

      {onPageChange && (
        <div className="data-table-footer">
          <div className="data-table-count">
            {total > 0 ? (
              <span>
                Mostrando <strong>{mostrandoDesde}</strong> a{' '}
                <strong>{mostrandoHasta}</strong> de <strong>{total}</strong> registros
              </span>
            ) : (
              <span>0 registros</span>
            )}
          </div>

          <div className="data-table-pagination" role="navigation" aria-label="Paginación de tabla">
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
              title="Primera página"
            >
              «
            </button>
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Anterior
            </button>

            <span className="pagination-current">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              Siguiente
            </button>
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              title="Última página"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
