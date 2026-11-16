import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Credenciales SOLO por variables de entorno. Nunca se escriben aquí.
// Copia .env.example a .env y pon ahí tus valores de tu proyecto Supabase.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null =
  supabaseConfigured && url && anonKey ? createClient(url, anonKey) : null
