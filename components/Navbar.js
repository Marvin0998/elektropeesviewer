// components/Navbar.js
// Navigationsleiste mit Elektro Pees Logo

'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar({ userEmail }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <nav className="navbar">
      {/* Logo + Name links */}
      <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <img
          src="/logo.png"
          alt="Elektro Pees"
          style={{ height: 36, width: 'auto', display: 'block' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>360° Viewer</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>by Elektro Pees</span>
        </div>
      </Link>

      {/* Rechts: User + Logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {userEmail && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{userEmail}</span>
        )}
        <button className="btn btn-outline" style={{ fontSize: 13, padding: '7px 14px' }} onClick={handleLogout}>
          Abmelden
        </button>
      </div>
    </nav>
  )
}
