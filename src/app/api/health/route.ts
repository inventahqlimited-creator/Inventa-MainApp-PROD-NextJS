import { NextResponse } from 'next/server'

/**
 * Health check endpoint — used by Fly.io to verify the app is running.
 * Must return 200 for the machine to be considered healthy.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.1',
  })
}
