import { useState } from 'react'
import type { AuthUser, Profile } from '../lib/types'
import { DAYS, LEVELS, SPORTS, ZONES } from '../lib/types'
import { changePassword, saveProfile, signOut } from '../lib/store'
import { detectZone } from '../lib/utils'
import { isNative } from '../lib/native'
import { Btn, Card, Field, inputCls, selectCls } from './ui'

export default function ProfileTab({ user, profile, onRefresh, onSignOut, onShowTutorial, onShowPermissions }: { user: AuthUser; profile: Profile; onRefresh: () => void; onSignOut: () => void; onShowTutorial?: () => void; onShowPermissions?: () => void }) {
  const [name, setName] = useState(profile.name)
  const [zone, setZone] = useState(profile.zone)
  const [bio, setBio] = useState(profile.bio)
  const [beginner, setBeginner] = useState(profile.beginner)
  const [sports, setSports] = useState(profile.sports)
  const [availability, setAvailability] = useState<string[]>(profile.availability)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [zoneMsg, setZoneMsg] = useState('')
  const [zoneBusy, setZoneBusy] = useState(false)

  // "Detectar mi zona": toma tu GPS y pone la zona que corresponde
  // (Isla Mujeres, Cancún centro, Zona Hotelera…). Si no cae en
  // ninguna conocida, te deja elegir de la lista.
  function detectMyZone() {
    setZoneMsg('')
    if (!('geolocation' in navigator)) {
      setZoneMsg('Este teléfono o navegador no tiene GPS disponible.')
      return
    }
    setZoneBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const z = detectZone(pos.coords.latitude, pos.coords.longitude)
        if (z) {
          setZone(z)
          setZoneMsg(`📍 Estás en ${z}. Toca "Guardar perfil" para que quede guardada.`)
        } else {
          setZoneMsg('No pude ubicar tu zona con el GPS, elige una de la lista.')
        }
        setZoneBusy(false)
      },
      () => {
        setZoneMsg('No se pudo tomar tu ubicación. Revisa el permiso de ubicación para este sitio.')
        setZoneBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')

  function toggleSport(sport: string) {
    setSports((prev) =>
      prev.some((s) => s.sport === sport)
        ? prev.filter((s) => s.sport !== sport)
        : [...prev, { sport, level: 'principiante' as const }]
    )
  }
  function setLevel(sport: string, level: string) {
    setSports((prev) => prev.map((s) => (s.sport === sport ? { ...s, level: level as 'principiante' | 'intermedio' | 'avanzado' } : s)))
  }
  function toggleDay(d: string) {
    setAvailability((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await saveProfile({ ...profile, name: name.trim(), zone, bio: bio.trim(), beginner, sports, availability })
      setMsg('Perfil guardado.')
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar.') }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await changePassword(currentPw, newPw)
      setMsg('Contraseña cambiada.')
      setCurrentPw(''); setNewPw(''); setShowPw(false)
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo cambiar la contraseña.') }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Mi perfil</h2>
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-coral text-2xl font-black text-night">{profile.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <p className="text-lg font-bold">{profile.name}</p>
            <p className="text-sm text-slate-600">{user.email}</p>
            <p className="text-sm text-slate-500">{profile.zone}</p>
          </div>
        </div>
      </Card>

      <Card>
        <form onSubmit={save} className="space-y-3">
          <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Zona">
            <select className={selectCls} value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
          </Field>
          <div>
            <Btn type="button" variant="teal" className="w-full" onClick={detectMyZone} disabled={zoneBusy}>
              {zoneBusy ? 'Detectando tu zona…' : '📍 Detectar mi zona con GPS'}
            </Btn>
            {zoneMsg && <p className="mt-1 text-xs font-semibold text-teal-dark">{zoneMsg}</p>}
          </div>
          <Field label="Bio"><input className={inputCls} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Cuéntanos cómo entrenas…" /></Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={beginner} onChange={(e) => setBeginner(e.target.checked)} />
            🌱 Soy principiante (modo sin comparación)
          </label>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Mis deportes y nivel</p>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <button key={s} type="button" onClick={() => toggleSport(s)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${sports.some((x) => x.sport === s) ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}>
                  {s}
                </button>
              ))}
            </div>
            {sports.map((s) => (
              <div key={s.sport} className="mt-2 flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-sm font-semibold">{s.sport}</span>
                <select className={`${selectCls} min-w-0 flex-1`} value={s.level} onChange={(e) => setLevel(s.sport, e.target.value)}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Disponibilidad</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${availability.includes(d) ? 'bg-coral text-night' : 'bg-sage-100 text-teal-dark'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
          <Btn type="submit" variant="coral" className="w-full">Guardar perfil</Btn>
        </form>
      </Card>

      <Card>
        <button className="font-semibold text-teal-dark underline" onClick={() => setShowPw(!showPw)}>
          Cambiar mi contraseña
        </button>
        {showPw && (
          <form onSubmit={changePw} className="mt-3 space-y-2">
            <Field label="Contraseña actual"><input className={inputCls} type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required /></Field>
            <Field label="Contraseña nueva"><input className={inputCls} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required /></Field>
            <Btn type="submit" variant="teal">Cambiar contraseña</Btn>
          </form>
        )}
      </Card>

      <Card>
        <p className="mb-2 font-black text-night">Ayuda</p>
        <div className="space-y-2">
          <Btn variant="teal" className="w-full" onClick={() => onShowTutorial?.()}>📖 Ver tutorial</Btn>
          {isNative() && (
            <Btn variant="ghost" className="w-full" onClick={() => onShowPermissions?.()}>🔐 Dar todos los permisos</Btn>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          El tutorial y los permisos solo salen solos la primera vez; desde aquí los puedes volver a abrir cuando quieras.
        </p>
      </Card>

      <Btn variant="ghost" className="w-full" onClick={async () => { await signOut(); onSignOut() }}>Cerrar sesión</Btn>
    </div>
  )
}
