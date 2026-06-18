import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, X, Loader2 } from 'lucide-react'
import { searchPlaces } from '../lib/api.js'

export default function AddressInput({ value, onChange, placeholder, label, icon: Icon = MapPin }) {
  const [query, setQuery] = useState(value?.shortLabel || value?.label || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  // Sync si value change depuis l'extérieur
  useEffect(() => {
    if (value?.shortLabel && value.shortLabel !== query) {
      setQuery(value.shortLabel)
    }
  }, [value?.shortLabel])

  // Fermer dropdown si clic à l'extérieur
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const search = useCallback(async (q) => {
    if (q.length < 3) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const res = await searchPlaces(q)
      setResults(res)
      setOpen(res.length > 0)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    if (!q) {
      onChange(null)
      setResults([])
      setOpen(false)
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 350)
  }

  function handleSelect(place) {
    setQuery(place.shortLabel || place.label.split(',').slice(0, 2).join(','))
    onChange(place)
    setOpen(false)
    setResults([])
  }

  function handleClear() {
    setQuery('')
    onChange(null)
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="label">{label}</label>}
      <div className="relative">
        <Icon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || 'Ville, adresse, code postal…'}
          className="input-field pl-9 pr-8"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading
            ? <Loader2 size={14} className="text-muted animate-spin" />
            : query
              ? <button onClick={handleClear} className="text-muted hover:text-text transition-colors">
                  <X size={14} />
                </button>
              : null
          }
        </div>
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-bg-card border border-bg-border rounded-xl shadow-2xl overflow-hidden">
          {results.map((place, i) => (
            <button
              key={place.id || i}
              onMouseDown={() => handleSelect(place)}
              className="w-full text-left px-3 py-2.5 hover:bg-bg-elevated transition-colors flex items-start gap-2.5 border-b border-bg-border last:border-b-0"
            >
              <MapPin size={14} className="text-accent mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-text text-sm font-medium truncate">
                  {place.shortLabel || place.label.split(',')[0]}
                </div>
                <div className="text-muted text-xs truncate mt-0.5">
                  {place.label}
                </div>
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 text-muted text-xs border-t border-bg-border bg-bg-deep/50">
            © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  )
}
