// app/page.js
// Startseite: Weiterleitung je nach Login-Status

'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    
    // Prüfen ob Benutzer eingeloggt ist
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Eingeloggt → zum Dashboard
        router.push('/dashboard')
      } else {
        // Nicht eingeloggt → zur Login-Seite
        router.push('/auth')
      }
    })
  }, [router])

  // Kurze Ladeanzeige während Weiterleitung
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  )
}
