import qrcode from "qrcode-generator";

// A QR code as inline SVG, so it inherits the page's colors and needs no
// image request. One path covers every dark module.
export function QrCode({ value, label }: { value: string; label: string }) {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const size = code.getModuleCount();
  let path = "";
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++)
      if (code.isDark(row, column)) path += `M${column} ${row}h1v1h-1z`;
  return (
    <svg
      className="qr-code"
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
