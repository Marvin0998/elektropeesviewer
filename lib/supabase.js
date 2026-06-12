// lib/supabase.js
// Diese Datei stellt die Verbindung zu Supabase her.
// Du musst hier nichts ändern!

import { createBrowserClient } from '@supabase/ssr'

// Erstellt einen Supabase-Client für den Browser
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
