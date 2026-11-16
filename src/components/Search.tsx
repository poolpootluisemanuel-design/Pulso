import { useMemo, useState } from 'react'
import type { Profile } from '../lib/types'
import { LEVELS, SPORTS, ZONES } from '../lib/types'
import { Card, Empty, Tag } from './ui'

export default function Search({ profiles, meId }: { profiles: Profile[]; meId: string }) {
  const [sport, setSport] = useState('')
  const [level, setLevel] = useState('')
  const [zone, setZone] = useState('')
  const [day, setDay] = useState('')

  const results = useMemo(() => {
    return profiles.filter((p) => {
      if (p.id === meId) return false
      if (sport && !p.sports.some((s) => s.sport === sport)) return false
      if (level && !p.sports.some((s) => s.level === level)) return false
      if (zone && p.zone !== zone) return false
      if (day && !p.availability.includes(day)) return false
      return true
    })
  }, [profiles, meId, sport, level, zone, day])

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Buscar compañero</h2>
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <select className="rounded-xl border border-slate-300 px-3 py-2" value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">Deporte</option>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="rounded-xl border border-slate-300 px-3 py-2" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Nivel</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="rounded-xl border border-slate-300 px-3 py-2" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Zona</option>
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
          <select className="rounded-xl border border-slate-300 px-3 py-2" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Día</option>
            {['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        {(sport || level || zone || day) && (
          <button className="mt-2 text-sm text-slate-500 underline" onClick={() => { setSport(''); setLevel(''); setZone(''); setDay('') }}>
            Limpiar filtros
          </button>
        )}
      </Card>

      {results.length === 0 ? <Empty text="Nadie coincide con esos filtros todavía. Prueba quitar un filtro o invita a alguien a crear su cuenta." /> : (
        <div className="space-y-2">
          {results.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-night text-xl font-black text-white">
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{p.name}{p.beginner ? ' · 🌱 Principiante' : ''}</p>
                  <p className="truncate text-sm text-slate-600">{p.zone}{p.bio ? ` · ${p.bio}` : ''}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.sports.map((s) => <Tag key={s.sport}>{s.sport} · {s.level}</Tag>)}
                  </div>
                  {p.availability.length > 0 && <p className="mt-1 text-xs text-slate-500">Disponible: {p.availability.join(', ')}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
