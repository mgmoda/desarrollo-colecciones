import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Renders dropdown content in a portal so it is never clipped by a scrolling
// modal. Repositions on scroll/resize (instead of closing) so it survives the
// mobile virtual keyboard opening. Opens upward when there is more room above.
export default function Dropdown({ anchorRef, open, onClose, children }) {
  const [pos, setPos] = useState(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null)
      return
    }

    function place() {
      const anchor = anchorRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      // visualViewport reflects the area not covered by the mobile keyboard.
      const vv = window.visualViewport
      const viewTop = vv ? vv.offsetTop : 0
      const viewH = vv ? vv.height : window.innerHeight
      const panelH = panelRef.current ? panelRef.current.offsetHeight : 260
      const spaceBelow = viewTop + viewH - r.bottom
      const spaceAbove = r.top - viewTop
      const flipUp = spaceBelow < panelH + 16 && spaceAbove > spaceBelow
      setPos({
        left: r.left,
        width: r.width,
        top: flipUp
          ? Math.max(viewTop + 8, r.top - panelH - 5)
          : r.bottom + 5,
      })
    }

    place()
    const raf = requestAnimationFrame(place)

    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', place)
      vv.addEventListener('scroll', place)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      if (vv) {
        vv.removeEventListener('resize', place)
        vv.removeEventListener('scroll', place)
      }
    }
  }, [open, anchorRef])

  // Close when the user interacts outside this dropdown and its anchor.
  // Capture phase is required: the Modal stops mousedown propagation, so a
  // bubble-phase listener on document would never fire for clicks inside it.
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      const t = e.target
      if (anchorRef.current && anchorRef.current.contains(t)) return
      if (panelRef.current && panelRef.current.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
    }
  }, [open, anchorRef, onClose])

  if (!open || !pos) return null

  return createPortal(
    <div
      ref={panelRef}
      className="dropdown-pop"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      {children}
    </div>,
    document.body,
  )
}
