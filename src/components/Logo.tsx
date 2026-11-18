// Logo de PULSO (opción 1, elegida por Luis 2026-11-18): la P gruesa
// con la línea de pulso cruzando abajo del tallo, degradado rosa →
// lila, sobre marfil. Recreado como SVG inline para que se vea nítido
// en cualquier tamaño y no dependa de un archivo de imagen.
// Reglas aplicadas: una sola idea, 2 colores, trazos gruesos, se
// reconoce a 2 cm y en un solo color. El ícono launcher de Android
// (PNG) queda pendiente: requiere subir el PNG por la web de GitHub.
export default function Logo({ size = 56, withWordmark = false, className = '' }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        width={size}
        height={size * 0.92}
        viewBox="0 0 220 200"
        fill="none"
        role="img"
        aria-label="PULSO"
      >
        <defs>
          <linearGradient id="pulsoLogoGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2A7B8" />
            <stop offset="100%" stopColor="#D9B8E6" />
          </linearGradient>
        </defs>
        {/* P gruesa: tallo + panza, trazo único con puntas redondas */}
        <path
          d="M93 172 V28 H140 a40 40 0 0 1 0 80 H93"
          stroke="url(#pulsoLogoGrad)"
          strokeWidth="30"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Línea de pulso cruzando abajo del tallo */}
        <path
          d="M8 148 H46 L60 120 L78 180 L96 104 L112 148 H130 L142 128 L154 148 H204"
          stroke="url(#pulsoLogoGrad)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <p className="mt-1 text-4xl font-black tracking-wide text-night">
          PULSO<span className="text-[#9CCB93]">.</span>
        </p>
      )}
    </div>
  )
}
