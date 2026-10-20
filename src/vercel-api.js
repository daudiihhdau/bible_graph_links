import { handleKnowledgeRequest } from './graph-api.js'

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]

function allowedOrigins () {
  const configured = (process.env.BIBLEGRAPHLINKS_API_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured])
}

export function vercelApiHandler (pathname) {
  return async function handler (req, res) {
    const origin = req.headers.origin
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
    res.setHeader('Access-Control-Max-Age', '86400')
    if (origin && allowedOrigins().has(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS')
      return res.status(405).json({ error: 'Methode nicht erlaubt.' })
    }

    try {
      const url = new URL(req.url, 'https://question-os-api.invalid')
      const data = await handleKnowledgeRequest(pathname, url)
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      return res.status(200).json(data)
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500
      if (status === 500) console.error('Question-OS Graph API error:', error)
      return res.status(status).json({ error: status === 500 ? 'Die Wissensdaten konnten nicht geladen werden.' : error.message })
    }
  }
}
