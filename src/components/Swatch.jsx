export default function Swatch({ hex, size = 16 }) {
  const style = { width: size, height: size }
  if (hex === 'linear') {
    style.background =
      'conic-gradient(#e8762c, #f1c40f, #2e9e5b, #2e6fb0, #7d3c98, #c2185b, #e8762c)'
  } else {
    style.background = hex || '#ccc'
  }
  return <span className="swatch" style={style} />
}
