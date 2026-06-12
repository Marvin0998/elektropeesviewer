// app/layout.js
// Haupt-Layout: Wird auf jeder Seite geladen

import './globals.css'

export const metadata = {
  title: '360° Viewer',
  description: 'Verwalte und betrachte deine 360°-Fotos',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <head>
        {/* Google Fonts: Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        
        {/* Pannellum: Der 360°-Viewer (CSS) */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
