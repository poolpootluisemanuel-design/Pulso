// Modal "Hay una actualización": sale al abrir la app cuando
// version.json remoto trae un versionCode mayor que el instalado.
// "Actualizar ahora" abre el enlace directo del APK nuevo con
// openExternalUrl (en la app nativa window.open se ignora en
// silencio). OJO: cada build lleva una llave debug nueva, así que
// el APK NO se instala encima: hay que desinstalar la versión
// anterior primero y luego instalar esta. "Después" lo cierra
// y vuelve a salir la próxima vez que se abra la app.
import type { RemoteVersion } from '../lib/appUpdate'
import { openExternalUrl } from '../lib/openExternal'
import { Btn, Card } from './ui'

export default function UpdatePrompt({ version, onLater }: { version: RemoteVersion; onLater: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 sm:items-center">
      <div className="w-full max-w-2xl p-4">
        <Card className="!p-5 text-center">
          <p className="text-4xl">⬆️</p>
          <h3 className="mt-2 text-xl font-black text-night">Hay una actualización</h3>
          <p className="mt-1 text-sm text-slate-600">
            Versión nueva {version.versionName}. Si ya tienes PULSO, desinstala la versión anterior primero y luego instala esta.
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
              onClick={() => void openExternalUrl(version.apkUrl)}
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
