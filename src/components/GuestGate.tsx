// Hoja que sale cuando un invitado toca algo que necesita cuenta:
// apuntarse, crear sesión, publicar, chatear o grabar con GPS.
// "Crear cuenta" sale del modo invitado y abre el registro;
// "Después" solo cierra la hoja y sigue explorando.
import { Btn } from './ui'

export default function GuestGate({ onCreateAccount, onClose }: { onCreateAccount: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-t-3xl bg-[#FFF9F0] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-black text-night">Crea tu cuenta gratis para hacer esto</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Apuntarte a sesiones, crear sesiones, publicar, chatear y grabar entrenamientos con GPS necesitan
          cuenta. Ver las sesiones, el mapa, las rutas, la comunidad y los negocios ya lo puedes hacer sin cuenta.
        </p>
        <div className="mt-4 space-y-2">
          <Btn variant="coral" className="w-full py-3 text-base" onClick={onCreateAccount}>
            Crear mi cuenta gratis
          </Btn>
          <button type="button" className="w-full py-2 text-sm font-bold text-slate-500 underline" onClick={onClose}>
            Después
          </button>
        </div>
      </div>
    </div>
  )
}
