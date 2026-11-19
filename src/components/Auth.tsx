import { useState } from 'react'
import { resetPassword, setNewPasswordLocal, signIn, signUp } from '../lib/store'
import { mode } from '../lib/store'
import Logo from './Logo'
import { Btn, Card, Field, inputCls } from './ui'

// Foto libre (Unsplash, verificada 200): corredora al amanecer.
const HERO_IMG = 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&q=80&auto=format&fit=crop'

const SPORT_CHIPS = ['🏃 Running', '🎾 Pádel', '💪 CrossFit', '🚴 Ciclismo', '🏄 Surf', '🏊 Natación']

export default function Auth({ onDone, onGuest, initialView }: { onDone: () => void; onGuest?: () => void; initialView?: 'login' | 'register' | 'recover' }) {
  const [view, setView] = useState<'login' | 'register' | 'recover'>(initialView ?? 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Si crear la cuenta pide confirmar el correo, el error de signUp lo
  // dice ("Revisa tu correo para confirmar la cuenta"): se muestra el
  // botón para ir a Gmail a verificar, en vez de dejar solo el texto.
  const needsConfirm = err.toLowerCase().includes('confirmar la cuenta')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      if (view === 'register') {
        await signUp(name, email, password)
        onDone()
      } else if (view === 'login') {
        await signIn(email, password)
        onDone()
      } else {
        await resetPassword(email)
        if (mode === 'local') {
          setMsg('Modo local: pon tu contraseña nueva abajo para entrar. En modo Supabase te llegaría un correo.')
          setView('recover')
        } else {
          setMsg('Te enviamos un correo con el link para poner tu contraseña nueva. Revisa tu bandeja (y spam).')
        }
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Algo salió mal.')
    } finally {
      setBusy(false)
    }
  }

  async function localRecover(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await setNewPasswordLocal(email, password)
      onDone()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Algo salió mal.')
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-night-50 pb-8">
      {/* Hero visual: foto + degradado marrón cálido → rosa.
          Sin internet la foto no carga y queda el degradado (nunca en blanco). */}
      <div className="relative overflow-hidden bg-gradient-to-b from-night via-night to-pulso-dark">
        <img src={HERO_IMG} alt="Entrenando al amanecer en Cancún" className="h-72 w-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-night/70 via-night/35 to-night" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[#FFF9F0]/95 p-1.5 shadow-lg shadow-night/30">
              <Logo size={52} />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-wide">PULSO</h1>
              <p className="font-bold text-pulso-light">Entrena con pulso</p>
            </div>
          </div>
          <p className="mt-3 text-lg font-bold leading-snug">Entrena acompañado en Cancún y la Riviera Maya</p>
          <p className="text-sm text-white/80">Strava te dice qué hiciste. PULSO te consigue con quién hacerlo mañana.</p>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {SPORT_CHIPS.map((s) => (
              <span key={s} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur">{s}</span>
            ))}
          </div>
        </div>
        {/* Línea de pulso */}
        <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden bg-white/10">
          <div className="pulse-line h-full w-1/3 bg-pulso" />
        </div>
      </div>

      {/* Tarjeta de acceso, pegada al hero, sin vacío */}
      <div className="px-4">
        <Card className="-mt-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-xl font-black text-night">
              {view === 'login' ? 'Entra a tu cuenta' : view === 'register' ? 'Crea tu cuenta' : 'Recupera tu cuenta'}
            </h2>
            <span className="rounded-full bg-pulso/10 px-2.5 py-1 text-xs font-bold text-pulso-dark">Cancún 🌊</span>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            {view === 'login'
              ? 'Tu semana, tus sesiones y tu racha te están esperando.'
              : view === 'register'
                ? 'Únete a la comunidad para entrenar acompañado.'
                : 'Te ayudamos a volver a entrar, sin crear otra cuenta.'}
          </p>
          <form onSubmit={submit} className="space-y-3">
            {view === 'register' && (
              <Field label="Tu nombre">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Luis" />
              </Field>
            )}
            <Field label="Correo">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="tu@correo.com" />
            </Field>
            {view !== 'recover' && (
              <Field label="Contraseña">
                <div className="flex gap-2">
                  <input className={inputCls} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
                  <button type="button" onClick={() => setShow(!show)} className="shrink-0 rounded-2xl bg-night-100 px-3 text-sm font-bold text-teal-dark">
                    {show ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </Field>
            )}
            {err && <p className="rounded-2xl bg-red-50 p-2.5 text-sm font-semibold text-red-700">{err}</p>}
            {msg && <p className="rounded-2xl bg-teal/10 p-2.5 text-sm font-semibold text-teal-dark">{msg}</p>}
            {needsConfirm && (
              <div className="space-y-2 rounded-2xl bg-night-50 p-3 text-center">
                <p className="text-sm font-semibold text-night">Te llegó un correo de Supabase para confirmar tu cuenta.</p>
                <a href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer"
                  className="block w-full rounded-2xl bg-pulso py-3 text-base font-black text-night">
                  📧 Ir a Gmail para verificar
                </a>
                <button type="button" className="w-full text-sm font-semibold text-teal-dark underline"
                  onClick={() => { setErr(''); setMsg(''); setView('login') }}>
                  Ya confirmé, entrar
                </button>
              </div>
            )}
            <Btn type="submit" variant="coral" disabled={busy} className="w-full py-3 text-base">
              {busy ? 'Espera…' : view === 'login' ? 'Entrar a PULSO →' : view === 'register' ? 'Crear mi cuenta' : 'Enviar recuperación'}
            </Btn>
          </form>

          {view === 'recover' && mode === 'local' && (
            <form onSubmit={localRecover} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              <Field label="Contraseña nueva (solo modo local)">
                <input className={inputCls} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
              </Field>
              <Btn type="submit" variant="teal" className="w-full">Poner contraseña nueva y entrar</Btn>
            </form>
          )}

          <div className="mt-4 space-y-1.5 text-center text-sm">
            {view === 'login' && (
              <>
                <button className="block w-full font-semibold text-teal-dark underline" onClick={() => { setView('recover'); setErr(''); setMsg('') }}>
                  ¿No entra tu contraseña? Recupera tu cuenta
                </button>
                <button className="block w-full text-slate-600 underline" onClick={() => setView('register')}>
                  ¿No tienes cuenta? Crea una
                </button>
              </>
            )}
            {view !== 'login' && (
              <button className="block w-full text-slate-600 underline" onClick={() => setView('login')}>
                Ya tengo cuenta, entrar
              </button>
            )}
          </div>

          {/* Vista previa sin cuenta: entra a ver sesiones, mapa,
              rutas, comunidad y negocios. Apuntarse, publicar,
              chatear y grabar con GPS piden crear cuenta gratis. */}
          {onGuest && (
            <button
              type="button"
              onClick={onGuest}
              className="mt-4 block w-full rounded-2xl bg-white py-3 text-base font-black text-teal-dark shadow-sm"
            >
              👀 Explorar sin cuenta
            </button>
          )}
        </Card>

        <div className="mt-4 flex items-center justify-center gap-4 text-center">
          <p className="text-xs font-bold text-night">🏃 Sesiones cada semana</p>
          <p className="text-xs font-bold text-night">🏅 Retos y rachas</p>
          <p className="text-xs font-bold text-night">🤝 Con quién entrenar</p>
        </div>
        <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
          Al crear tu cuenta aceptas que tu nombre, deportes y zona se vean para encontrar compañero. Tu correo nunca se muestra a otros.
          {mode === 'local' && ' · Modo local (demo): cuentas solo en este teléfono.'}
        </p>
      </div>
    </div>
  )
}
