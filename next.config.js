/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Erlaube Bilder von Supabase Storage
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
