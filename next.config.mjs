/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static export for Tauri desktop build
  output: process.env.TAURI_ENV ? 'export' : undefined,
  
  typescript: {
    ignoreBuildErrors: true,
  },
  
  images: {
    unoptimized: true,
  },
  
  // Disable server-side features for Tauri compatibility
  ...(process.env.TAURI_ENV && {
    // Static export settings
    trailingSlash: true,
    
    // Disable features that require a server
    experimental: {
      // Allow static generation
    },
  }),
}

export default nextConfig
