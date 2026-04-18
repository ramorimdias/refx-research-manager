/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.TAURI_ENV ? 'export' : undefined,
  trailingSlash: Boolean(process.env.TAURI_ENV),
  transpilePackages: ['pdfjs-dist'],
  typescript: {
    ignoreBuildErrors: false,
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
}

export default nextConfig
