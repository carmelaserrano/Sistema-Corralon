import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import { navigationGroups } from '../layout/navigation'

export default function CommandPalette({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  // Aplanar todos los ítems de navegación con su módulo
  const allItems = navigationGroups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      group: group.label,
      module: group.module,
    })),
  )

  const filteredItems = query.trim()
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.module.toLowerCase().includes(query.toLowerCase()) ||
          item.group.toLowerCase().includes(query.toLowerCase()),
      )
    : allItems

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev === 0 ? Math.max(0, filteredItems.length - 1) : prev - 1,
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          onNavigate(filteredItems[selectedIndex].id)
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems, isOpen, onClose, onNavigate, selectedIndex])

  if (!isOpen) return null

  return (
    <div className="command-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        role="combobox"
        aria-expanded="true"
      >
        <div className="command-palette-header">
          <Search size={18} className="command-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="command-search-input"
            placeholder="Ir a un módulo o buscar pantalla… (ej. Stock, Clientes, Facturas)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="command-clear-btn"
              onClick={() => setQuery('')}
              aria-label="Borrar texto"
            >
              <X size={15} />
            </button>
          )}
          <span className="command-shortcut-hint">ESC para cerrar</span>
        </div>

        <div className="command-palette-list">
          {filteredItems.length === 0 ? (
            <div className="command-palette-empty">
              No se encontraron pantallas con &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon
              const isSelected = index === selectedIndex
              return (
                <div
                  key={item.id}
                  className={`command-palette-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    onNavigate(item.id)
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="command-item-left">
                    {Icon && <Icon size={18} className="command-item-icon" aria-hidden="true" />}
                    <div className="command-item-text">
                      <span className="command-item-title">{item.label}</span>
                      <span className="command-item-module">{item.module} · {item.group}</span>
                    </div>
                  </div>
                  <ArrowRight size={14} className="command-item-arrow" aria-hidden="true" />
                </div>
              )
            })
          )}
        </div>

        <div className="command-palette-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> para navegar</span>
          <span><kbd>↵</kbd> para seleccionar</span>
          <span><kbd>esc</kbd> para salir</span>
        </div>
      </div>
    </div>
  )
}
