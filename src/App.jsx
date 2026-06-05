import { useEffect, useMemo, useState } from 'react'
import Login from './components/Login.jsx'
import DashboardView from './components/DashboardView.jsx'
import ResumenView from './components/ResumenView.jsx'
import AreaView from './components/AreaView.jsx'
import CostosView from './components/CostosView.jsx'
import SeguimientoView from './components/SeguimientoView.jsx'
import ColeccionView from './components/ColeccionView.jsx'
import AutorizacionesView from './components/AutorizacionesView.jsx'
import ImportModal from './components/ImportModal.jsx'
import RefForm from './components/RefForm.jsx'
import RefSearch from './components/RefSearch.jsx'
import RefDetail from './components/RefDetail.jsx'
import PendientesModal from './components/PendientesModal.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import Lightbox from './components/Lightbox.jsx'
import { supabase } from './lib/supabase.js'
import {
  dbLoadOrders, dbLoadRefs, dbLoadSettings,
  dbUpsertRef, dbDeleteRef, dbReplaceOrders, dbSaveSettings,
} from './lib/db.js'
import { buildRefIndex, emptyRef, refTracks, normalizeTelas } from './lib/domain.js'
import { DEFAULT_TELAS, DEFAULT_COLORS, DEFAULT_MARCAS, formatPrice } from './lib/constants.js'

const TABS = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'resumen', label: 'Resumen' },
  { key: 'trazos', label: 'Trazos' },
  { key: 'corte', label: 'Corte' },
  { key: 'enviar', label: 'Por enviar' },
  { key: 'talleres', label: 'En talleres' },
  { key: 'entrega', label: 'Entrega ensamble' },
  { key: 'ensamble', label: 'Seguimiento' },
  { key: 'coleccion', label: 'Colección' },
  { key: 'autorizaciones', label: 'Autorizaciones' },
  { key: 'costos', label: 'Costos' },
]
const AREA_KEYS = ['trazos', 'corte', 'enviar', 'talleres', 'entrega']
const TAB_KEY = 'desarrollo-colecciones:tab'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [orders, setOrders] = useState([])
  const [refs, setRefs] = useState([])
  const [settings, setSettings] = useState({ telas: normalizeTelas(DEFAULT_TELAS), colors: DEFAULT_COLORS, proveedores: [], decorados: ['Flor'], marcas: DEFAULT_MARCAS })

  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.key === saved) ? saved : 'inicio'
  })

  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [detailRefId, setDetailRefId] = useState(null)
  const [pendientesOpen, setPendientesOpen] = useState(false)

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session && session.user ? session.user.id : null
  useEffect(() => {
    if (!userId) { setLoaded(false); return }
    let cancelled = false
    Promise.all([dbLoadOrders(), dbLoadRefs(), dbLoadSettings()])
      .then(([o, r, s]) => {
        if (cancelled) return
        setOrders(o)
        // Migración silenciosa: corregir "Maricet" → "Mariset" Y eliminar
        // cualquier campo "_stub" que se haya persistido por error.
        const refsFixed = r.map((rr) => {
          const { _stub: _ignore, ...clean } = rr
          if (clean.marca === 'Maricet') clean.marca = 'Mariset'
          return clean
        })
        setRefs(refsFixed)
        r.forEach((rr) => {
          if (rr._stub || rr.marca === 'Maricet') {
            const { _stub: _ignore, ...clean } = rr
            if (clean.marca === 'Maricet') clean.marca = 'Mariset'
            dbUpsertRef(clean).catch((e) => console.error(e))
          }
        })

        const st = s || {}
        const rawMarcas = st.marcas && st.marcas.length ? st.marcas : DEFAULT_MARCAS
        const marcasFixed = rawMarcas.map((m) => (m === 'Maricet' ? 'Mariset' : m))
        const next = {
          ...st,
          telas: normalizeTelas(st.telas && st.telas.length ? st.telas : DEFAULT_TELAS),
          colors: st.colors && st.colors.length ? st.colors : DEFAULT_COLORS,
          proveedores: st.proveedores || [],
          decorados: st.decorados && st.decorados.length ? st.decorados : ['Flor'],
          marcas: marcasFixed,
        }
        setSettings(next)
        if (JSON.stringify(rawMarcas) !== JSON.stringify(marcasFixed)) {
          dbSaveSettings(next).catch((e) => console.error(e))
        }
        setLoaded(true)
      })
      .catch((e) => { console.error('Cargar datos:', e); if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => { localStorage.setItem(TAB_KEY, tab) }, [tab])

  // Índice unificado de referencias (resumen + costos + foto).
  const refIndex = useMemo(() => buildRefIndex(orders, refs), [orders, refs])
  const refMap = useMemo(() => new Map(refIndex.map((r) => [r.id, r])), [refIndex])
  const tracksByRef = useMemo(() => {
    const m = new Map()
    refIndex.forEach((r) => m.set(r.id, refTracks(orders, r.id)))
    return m
  }, [refIndex, orders])

  function openDetail(id) { setDetailRefId(id) }
  function openFichaFromDetail(id) {
    setDetailRefId(null)
    openEdit(refMap.get(id) || { id, referencia: id, _stub: true })
  }

  async function handleImported(origen, newOrders) {
    await dbReplaceOrders(origen, newOrders)
    setOrders((prev) => [...prev.filter((o) => o.origen !== origen), ...newOrders])
  }

  // Asigna una foto a una referencia (creando el registro si no existía).
  async function handleAssignPhoto(refId, dataUrl) {
    const current = refMap.get(refId)
    const base = current && !current._stub ? current : emptyRef(refId)
    const updated = { ...base, id: refId, referencia: refId, image: dataUrl, updatedAt: Date.now() }
    setRefs((list) => {
      const idx = list.findIndex((r) => r.id === refId)
      if (idx >= 0) return list.map((r) => (r.id === refId ? updated : r))
      return [updated, ...list]
    })
    await dbUpsertRef(updated)
  }

  function openEdit(ref) {
    setEditing(ref && !ref._stub ? ref : { ...emptyRef(ref.id), referencia: ref.referencia, _stub: true })
    setFormOpen(true)
  }
  function openNew() { setEditing(null); setFormOpen(true) }

  function upsertRefState(ref) {
    setRefs((list) => {
      const idx = list.findIndex((r) => r.id === ref.id)
      if (idx >= 0) return list.map((r) => (r.id === ref.id ? ref : r))
      return [ref, ...list]
    })
  }

  // Vincula (o desvincula) la referencia pareja del conjunto.
  function linkPartner(partnerId, refId, conjunto) {
    if (!partnerId) return
    const cur = refMap.get(partnerId)
    const base = cur && !cur._stub ? cur : emptyRef(partnerId)
    const updated = { ...base, id: partnerId, referencia: partnerId, conjunto, conjuntoRef: refId, updatedAt: Date.now() }
    upsertRefState(updated)
    dbUpsertRef(updated).catch((e) => console.error(e))
  }

  function handleSave(rawRef) {
    const { _stub: _ignore, ...ref } = rawRef

    // ── REGLA ANTI-BORRADO ────────────────────────────────────────────
    // Si un campo importante tenía valor y ahora va a quedar vacío,
    // pedimos confirmación. Si el usuario cancela, NO se guarda nada y
    // la ficha queda abierta intacta. Así no se pierde información de
    // costos / cantidades / fotos por accidente.
    const existing = refMap.get(ref.id)
    if (existing && !existing._stub) {
      const watched = [
        { k: 'costo',        label: 'Costo',        money: true  },
        { k: 'cantidad',     label: 'Cantidad'                   },
        { k: 'tipo',         label: 'Tipo'                       },
        { k: 'marca',        label: 'Marca'                      },
        { k: 'colorMuestra', label: 'Color de muestra'           },
        { k: 'image',        label: 'Foto',         photo: true  },
        { k: 'comentario',   label: 'Comentario'                 },
      ]
      const perdidos = []
      watched.forEach(({ k, label, money, photo }) => {
        const antes = existing[k]
        const ahora = ref[k]
        const teniaValor = antes != null && String(antes).trim() !== ''
        const quedaVacio = !ahora || String(ahora).trim() === ''
        if (teniaValor && quedaVacio) {
          const v = photo ? '(foto guardada)' : money ? formatPrice(antes) : String(antes)
          perdidos.push(`• ${label}: ${v}`)
        }
      })
      // Telas (array): si antes había telas y ahora no, marcar pérdida.
      const telasAntes = (existing.telas || []).filter((t) => t && t.nombre).map((t) => t.nombre)
      const telasAhora = (ref.telas || []).filter((t) => t && t.nombre).map((t) => t.nombre)
      const telasPerdidas = telasAntes.filter((n) => !telasAhora.includes(n))
      if (telasPerdidas.length) perdidos.push(`• Telas: ${telasPerdidas.join(', ')}`)

      if (perdidos.length) {
        const seguir = window.confirm(
          'ATENCIÓN: vas a BORRAR los siguientes campos que tenían información guardada:\n\n' +
          perdidos.join('\n') +
          '\n\n¿Quieres continuar de todos modos?\n(Cancelar deja la ficha abierta sin perder nada)'
        )
        if (!seguir) return  // aborta el guardado, ficha queda abierta
      }
    }
    // ── FIN regla ─────────────────────────────────────────────────────

    // Actualización OPTIMISTA: la UI se actualiza al instante; el guardado
    // remoto va en segundo plano. Si falla, mostramos alerta y el dato
    // queda en estado local hasta el próximo intento o recarga.
    upsertRefState(ref)

    // Espejo del conjunto (también optimista, en paralelo).
    const prevPartner = editing && editing.conjuntoRef
    const newPartner = ref.conjunto && ref.conjuntoRef ? ref.conjuntoRef : ''
    if (prevPartner && prevPartner !== newPartner) linkPartner(prevPartner, '', false)
    if (newPartner) linkPartner(newPartner, ref.id, true)

    // Cerrar la ventana de inmediato.
    setFormOpen(false)
    setEditing(null)

    // Persistir en Supabase sin bloquear la UI.
    dbUpsertRef(ref).catch((e) => {
      console.error('Error guardando referencia:', e)
      const msg = (e && (e.message || e.error_description || e.error)) || 'error desconocido'
      alert(
        'No se pudo guardar la referencia "' + (ref.referencia || '') + '" en la nube:\n\n' + msg +
        '\n\nReintenta abriendo la ficha y guardando de nuevo.',
      )
    })
  }

  function addTela(name) {
    const v = (name || '').trim()
    if (!v || settings.telas.some((t) => t.nombre.toLowerCase() === v.toLowerCase())) return
    const next = { ...settings, telas: [...settings.telas, { nombre: v, precio: '', proveedor: '' }] }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  function editTela(oldName, newName) {
    const v = (newName || '').trim()
    if (!v) return
    const next = { ...settings, telas: settings.telas.map((t) => (t.nombre === oldName ? { ...t, nombre: v } : t)) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
    // Renombra la tela en las referencias que la usaban (campo único y array).
    const affected = refs.filter((r) => r.tela === oldName || (r.telas || []).some((x) => x.nombre === oldName))
    affected.forEach((r) => {
      const u = {
        ...r,
        tela: r.tela === oldName ? v : r.tela,
        telas: (r.telas || []).map((x) => (x.nombre === oldName ? { ...x, nombre: v } : x)),
      }
      upsertRefState(u); dbUpsertRef(u).catch((e) => console.error(e))
    })
  }
  function deleteTela(name) {
    const next = { ...settings, telas: settings.telas.filter((t) => t.nombre !== name) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  // Actualiza precio/proveedor de una tela del catálogo (heredado por todas las referencias).
  function updateTela(nombre, patch) {
    const next = { ...settings, telas: settings.telas.map((t) => (t.nombre === nombre ? { ...t, ...patch } : t)) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }

  // Catálogo de proveedores.
  function addProveedor(name) {
    const v = (name || '').trim()
    if (!v || settings.proveedores.some((p) => p.toLowerCase() === v.toLowerCase())) return
    const next = { ...settings, proveedores: [...settings.proveedores, v] }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  function editProveedor(oldName, newName) {
    const v = (newName || '').trim()
    if (!v) return
    const next = {
      ...settings,
      proveedores: settings.proveedores.map((p) => (p === oldName ? v : p)),
      telas: settings.telas.map((t) => (t.proveedor === oldName ? { ...t, proveedor: v } : t)),
    }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  function deleteProveedor(name) {
    const next = { ...settings, proveedores: settings.proveedores.filter((p) => p !== name) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }

  // Catálogo de decorados (Flor, etc.).
  function addDecorado(name) {
    const v = (name || '').trim()
    if (!v || settings.decorados.some((d) => d.toLowerCase() === v.toLowerCase())) return
    const next = { ...settings, decorados: [...settings.decorados, v] }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  function editDecorado(oldName, newName) {
    const v = (newName || '').trim()
    if (!v) return
    const next = { ...settings, decorados: settings.decorados.map((d) => (d === oldName ? v : d)) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  function deleteDecorado(name) {
    const next = { ...settings, decorados: settings.decorados.filter((d) => d !== name) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }

  // Catálogo de marcas (Maricet, Casania, …)
  function addMarca(name) {
    const v = (name || '').trim()
    if (!v || settings.marcas.some((m) => m.toLowerCase() === v.toLowerCase())) return
    const next = { ...settings, marcas: [...settings.marcas, v] }
    setSettings(next); dbSaveSettings(next).catch((e) => console.error(e))
  }
  function editMarca(oldName, newName) {
    const v = (newName || '').trim()
    if (!v) return
    const next = { ...settings, marcas: settings.marcas.map((m) => (m === oldName ? v : m)) }
    setSettings(next); dbSaveSettings(next).catch((e) => console.error(e))
    const affected = refs.filter((r) => r.marca === oldName)
    affected.forEach((r) => { const u = { ...r, marca: v }; upsertRefState(u); dbUpsertRef(u).catch((e) => console.error(e)) })
  }
  function deleteMarca(name) {
    const next = { ...settings, marcas: settings.marcas.filter((m) => m !== name) }
    setSettings(next); dbSaveSettings(next).catch((e) => console.error(e))
  }

  function addColor(color) {
    if (!color || !color.name) return
    if (settings.colors.some((c) => c.name.toLowerCase() === color.name.toLowerCase())) return
    const next = { ...settings, colors: [...settings.colors, color] }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }
  function editColor(oldName, color) {
    const next = {
      ...settings,
      colors: settings.colors.map((c) => (c.name === oldName ? { name: color.name, hex: color.hex } : c)),
    }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
    // Renombra/recolorea en las referencias que lo usaban.
    const affected = refs.filter((r) => (r.colores || []).some((c) => c.name === oldName))
    affected.forEach((r) => {
      const u = { ...r, colores: r.colores.map((c) => (c.name === oldName ? { name: color.name, hex: color.hex } : c)) }
      upsertRefState(u); dbUpsertRef(u).catch((e) => console.error(e))
    })
  }
  function deleteColor(name) {
    const next = { ...settings, colors: settings.colors.filter((c) => c.name !== name) }
    setSettings(next)
    dbSaveSettings(next).catch((e) => console.error(e))
  }

  function handleDelete() {
    const id = deleteTarget.id
    setRefs((list) => list.filter((r) => r.id !== id))
    dbDeleteRef(id).catch((e) => console.error(e))
    setDeleteTarget(null)
    setFormOpen(false)
    setEditing(null)
  }

  if (!authReady) return <div className="boot"><div className="boot-mark">MG</div></div>
  if (!session) return <Login />
  if (!loaded) return <div className="boot"><div className="boot-mark">MG</div></div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">MG</div>
          <div className="brand-text">
            <span className="brand-name">Desarrollo de Colecciones</span>
            <span className="brand-tag">Control de producción</span>
          </div>
        </div>
        <div className="topbar-right">
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.key}
                className={'tab' + (tab === t.key ? ' active' : '')}
                onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>
          <RefSearch refIds={refIndex.map((r) => r.id)} onSelect={openDetail} />
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>Importar</button>
          <button className="logout-btn" onClick={() => supabase.auth.signOut()} title="Cerrar sesión">Salir</button>
        </div>
      </header>

      <main className="content">
        {tab === 'inicio' && (
          <DashboardView
            orders={orders}
            refs={refIndex}
            onGoArea={(k) => setTab(k)}
            onGoTab={(t) => setTab(t)}
            onImport={() => setImportOpen(true)}
            onShowPendientes={() => setPendientesOpen(true)}
          />
        )}
        {tab === 'resumen' && (
          <ResumenView
            refs={refIndex}
            tracksByRef={tracksByRef}
            onEdit={openEdit}
            onNew={openNew}
            onViewImage={setLightbox}
            onOpenDetail={openDetail}
          />
        )}
        {AREA_KEYS.includes(tab) && (
          <AreaView areaKey={tab} orders={orders} refMap={refMap} onViewImage={setLightbox} />
        )}
        {tab === 'ensamble' && (
          <SeguimientoView orders={orders} refMap={refMap} onViewImage={setLightbox} onOpenRef={openEdit} />
        )}
        {tab === 'coleccion' && (
          <ColeccionView refs={refIndex} marcas={settings.marcas} tracksByRef={tracksByRef}
            onOpenRef={openEdit} onNew={openNew} onViewImage={setLightbox} />
        )}
        {tab === 'autorizaciones' && (
          <AutorizacionesView refs={refIndex} tracksByRef={tracksByRef} marcas={settings.marcas}
            onOpenRef={openEdit} onViewImage={setLightbox} />
        )}
        {tab === 'costos' && (
          <CostosView refs={refIndex} telasCatalog={settings.telas} onEdit={openEdit} onNew={openNew} onViewImage={setLightbox} />
        )}
      </main>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
        refIds={refIndex.map((r) => r.id)}
        onAssignPhoto={handleAssignPhoto}
      />

      <RefForm
        open={formOpen}
        initial={editing}
        telas={settings.telas.map((t) => t.nombre)}
        telasCatalog={settings.telas}
        onAddTela={addTela}
        onEditTela={editTela}
        onDeleteTela={deleteTela}
        onUpdateTela={updateTela}
        proveedores={settings.proveedores}
        onAddProveedor={addProveedor}
        onEditProveedor={editProveedor}
        onDeleteProveedor={deleteProveedor}
        decorados={settings.decorados}
        onAddDecorado={addDecorado}
        onEditDecorado={editDecorado}
        onDeleteDecorado={deleteDecorado}
        marcas={settings.marcas}
        onAddMarca={addMarca}
        onEditMarca={editMarca}
        onDeleteMarca={deleteMarca}
        savedColors={settings.colors}
        onAddColor={addColor}
        onEditColor={editColor}
        onDeleteColor={deleteColor}
        refIds={refIndex.map((r) => r.id)}
        onSave={handleSave}
        onDelete={(r) => setDeleteTarget(r)}
        onClose={() => { setFormOpen(false); setEditing(null) }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar referencia"
        message={deleteTarget ? `¿Eliminar la referencia "${deleteTarget.referencia}"? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <PendientesModal
        open={pendientesOpen}
        pendientes={refIndex.filter((r) => r.pendiente)}
        onClose={() => setPendientesOpen(false)}
        onOpenRef={(r) => { setPendientesOpen(false); openEdit(r) }}
        onViewImage={setLightbox}
      />

      <RefDetail
        open={!!detailRefId}
        refId={detailRefId}
        refRecord={detailRefId ? refMap.get(detailRefId) : null}
        tracks={detailRefId ? tracksByRef.get(detailRefId) : []}
        onClose={() => setDetailRefId(null)}
        onOpenFicha={openFichaFromDetail}
        onOpenDetail={openDetail}
      />

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
