import { useState } from 'react'
import { resetPassword, setNewPasswordLocal, signIn, signUp } from '../lib/store'
import { mode } from '../lib/store'
import { Btn, Card, Field, inputCls } from './ui'

export default function Auth({ onDone }: { onDone: () => void }) {
  const [view, setView] = useState<'login' | 'register' | 'recover'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

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
    <div className="mx-auto max-w-md px-4 pb-10 pt-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-pulso text-3xl font-black text-white">P</div>
        <h1 className="text-4xl font-black text-night">PULSO</h1>
        <p className="font-bold text-pulso">Entrena con pulso</p>
        <p className="text-slate-600">Entrena acompañado en Cancún y la Riviera Maya</p>
        <p className="mt-1 text-xs text-slate-500">Strava te dice qué hiciste. PULSO te consigue con quién hacerlo mañana.</p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-bold">
          {view === 'login' ? 'Entra a tu cuenta' : view === 'register' ? 'Crea tu cuenta' : 'Recupera tu cuenta'}
        </h2>
        {mode === 'local' && (
          <p className="mb-3 rounded-xl bg-amber-50 p-2 text-xs text-amber-800">
            Modo local de demostración: aún no hay Supabase conectado. Las cuentas se guardan solo en este teléfono.
          </p>
        )}
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
                <button type="button" onClick={() => setShow(!show)} className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-teal-dark">
                  {show ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </Field>
          )}
          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
          <Btn type="submit" variant="coral" disabled={busy} className="w-full">
            {busy ? 'Espera…' : view === 'login' ? 'Entrar' : view === 'register' ? 'Crear mi cuenta' : 'Enviar recuperación'}
          </Btn>
        </form>

        {view === 'recover' && mode === 'local' && (
          <form onSubmit={localRecover} className="mt-3 space-y-3 border-t pt-3">
            <Field label="Contraseña nueva (solo modo local)">
              <input className={inputCls} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
            </Field>
            <Btn type="submit" variant="teal" className="w-full">Poner contraseña nueva y entrar</Btn>
          </form>
        )}

        <div className="mt-4 space-y-1 text-center text-sm">
          {view === 'login' && (
            <>
              <button className="block w-full text-teal-dark underline" onClick={() => { setView('recover'); setErr(''); setMsg('') }}>
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
      </Card>
      <p className="mt-4 text-center text-xs text-slate-500">
        Al crear tu cuenta aceptas que tu nombre, deportes y zona se vean para encontrar compañero. Tu correo nunca se muestra a otros.
      </p>
    </div>
  )
}
