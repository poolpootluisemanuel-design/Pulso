// Modal "Hay una actualización": sale al abrir la app cuando
// version.json remoto trae un versionCode mayor que el instalado.
// "Actualizar ahora" abre el enlace directo del APK nuevo (se
// instala encima, sin perder cuenta ni datos). "Después" lo cierra
// y vuelve a salir la próxima vez que se abra la app.
import type { RemoteVersion } from '../lib/appUpdate'
import { Btn, Card } from './ui'

export default function UpdatePrompt({ version, onLater }: { version: RemoteVersion; onLater: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 sm:items-center">
      <div className="w-full max-w-2xl p-4">
        <Card className="!p-5 text-center">
          <p className="text-4xl">⬆️</p>
          <h3 className="mt-2 text-xl font-black text-night">Hay una actualización</h3>
          <p className="mt-1 text-sm text-slate-600">
            Versión nueva {version.versionName}. Se instala encima, no pierdes tu cuenta ni tus datos.
          </p>
          {version.notes.length > 0 && (
            <ul className="mx-auto mt-3 max-w-sm space-y-1 text-left text-sm text-slate-700">
              {version.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 space-y-2">
            <Btn
              variant="coral"
              className="w-full"
              onClick={() => window.open(version.apkUrl, '_blank')}
            >
              Actualizar ahora
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={onLater}>
              Después
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  )
}
