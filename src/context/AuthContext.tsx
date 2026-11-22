import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StaffUser } from '../types'
import { mapProfile } from '../lib/mappers'
import { supabase, supabaseConfigured } from '../lib/supabase'

interface AuthContextValue {
  user: StaffUser | null
  loading: boolean
  configured: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  isAdmin: boolean
  isStaff: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadProfile(userId: string): Promise<StaffUser | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return mapProfile(data as Record<string, unknown>)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const session = data.session
      if (!session?.user) {
        setUser(null)
        setLoading(false)
        return
      }
      const profile = await loadProfile(session.user.id)
      if (!mounted) return
      if (!profile || profile.status !== 'active') {
        await supabase.auth.signOut()
        setUser(null)
      } else {
        setUser(profile)
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null)
        return
      }
      const profile = await loadProfile(session.user.id)
      if (!profile || profile.status !== 'active') {
        setUser(null)
        return
      }
      setUser(profile)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured: supabaseConfigured,
      isAdmin: user?.role === 'admin',
      isStaff: user?.role === 'staff',
      login: async (email, password) => {
        if (!supabaseConfigured) {
          return { ok: false, error: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' }
        }
        if (!email || !password) return { ok: false, error: 'Email and password are required.' }
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error || !data.user) return { ok: false, error: 'Invalid email or password' }
        const profile = await loadProfile(data.user.id)
        if (!profile || profile.status !== 'active') {
          await supabase.auth.signOut()
          return { ok: false, error: 'Invalid email or password' }
        }
        setUser(profile)
        return { ok: true }
      },
      logout: async () => {
        if (supabaseConfigured) await supabase.auth.signOut()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
