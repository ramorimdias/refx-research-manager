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

  experimental: {
    cpus: 1,
    workerThreads: true,
    webpackBuildWorker: false,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 1000,
  },
  
  // Disable server-side features for Tauri compatibility
  ...(process.env.TAURI_ENV && {
    // Static export settings
    trailingSlash: true,
    
    // Disable features that require a server
    experimental: {
      cpus: 1,
      workerThreads: true,
      webpackBuildWorker: false,
      staticGenerationMaxConcurrency: 1,
      staticGenerationMinPagesPerWorker: 1000,
    },
  }),
}

export default nextConfig
