import { useEffect, useState } from 'react'

// Indicador discreto de sincronización con la nube. Muestra "hace X seg" y
// permite forzar un refresh manual al darle clic. Se actualiza cada segundo
// para que el contador se sienta vivo sin disparar requests.
export default function SyncIndicator({ lastSync, syncing, paused, onRefresh }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const ago = lastSync ? Math.floor((Date.now() - lastSync) / 1000) : null
  let label = '—'
  if (syncing) label = 'Sincronizando…'
  else if (paused) label = 'En pausa (ficha abierta)'
  else if (ago == null) label = '—'
  else if (ago < 5) label = 'Recién actualizado'
  else if (ago < 60) label = `Hace ${ago} seg`
  else if (ago < 3600) label = `Hace ${Math.floor(ago / 60)} min`
  else label = `Hace ${Math.floor(ago / 3600)} h`

  const stale = !paused && !syncing && ago != null && ago > 60

  return (
    <button type="button" className={'sync-indicator' + (stale ? ' stale' : '') + (syncing ? ' active' : '')}
      onClick={onRefresh} disabled={syncing}
      title={paused ? 'La sincronización se pausa mientras editas. Cierra la ficha para reanudar.' : 'Clic para refrescar ahora'}>
      <span className={'sync-dot' + (syncing ? ' spin' : '')}>●</span>
      <span className="sync-label">{label}</span>
    </button>
  )
}
