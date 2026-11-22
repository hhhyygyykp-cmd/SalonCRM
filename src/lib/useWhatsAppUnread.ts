import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase, supabaseConfigured } from './supabase'
import { resetDocumentTitle, setUnreadDocumentTitle } from './whatsappNotify'

export function useWhatsAppUnread(enabled: boolean) {
  const [unread, setUnread] = useState(0)
  const { user } = useAuth()
  const salonId = user?.salonId

  useEffect(() => {
    if (!enabled || !supabaseConfigured || !salonId) {
      setUnread(0)
      resetDocumentTitle()
      return
    }

    const load = async () => {
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('unread_count')
        .eq('salon_id', salonId)
        .gt('unread_count', 0)
      const total = (data ?? []).reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0)
      setUnread(total)
      setUnreadDocumentTitle(total)
    }

    void load()
    const channel = supabase
      .channel('whatsapp-unread-nav')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
      resetDocumentTitle()
    }
  }, [enabled, salonId])

  return unread
}
