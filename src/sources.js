const issue = (path, message) => ({ path, message })
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonempty = value => typeof value === 'string' && Boolean(value.trim())

export function checkSourceReference(source, path, issues) {
  if (!isObject(source)) return
  const requireField = field => {
    if (!nonempty(source[field])) issues.push(issue(`${path}.${field}`, `für ${source.sourceType} erforderlich`))
  }
  if (source.sourceType === 'bible') {
    requireField('bibleBookCode')
    requireField('locationInSource')
  } else if (source.bibleBookCode !== undefined) {
    issues.push(issue(`${path}.bibleBookCode`, 'Bibelbuchkennung nur für Bibelstellen zulässig'))
  }
  if (source.sourceType === 'internal') requireField('locationInSource')
  if (['wikipedia', 'web', 'deep-link'].includes(source.sourceType)) requireField('link')
  if (source.sourceType === 'wikipedia') requireField('languageCode')
  if (source.link === undefined) return
  if (!nonempty(source.link)) return issues.push(issue(`${path}.link`, 'ungültige URI'))
  let url
  try { url = new URL(source.link) } catch { return issues.push(issue(`${path}.link`, 'ungültige absolute URI')) }
  const protocol = url.protocol.toLowerCase()
  if (['javascript:', 'data:', 'file:', 'about:'].includes(protocol)) issues.push(issue(`${path}.link`, 'unsicheres URI-Schema'))
  if (source.sourceType !== 'deep-link' && protocol !== 'https:') issues.push(issue(`${path}.link`, 'Quellenlinks müssen HTTPS verwenden'))
  if (source.sourceType === 'deep-link' && protocol !== 'https:' && (!source.link.includes('://') || ['http:', 'ftp:', 'ws:', 'wss:'].includes(protocol) || !url.hostname)) issues.push(issue(`${path}.link`, 'Deep Link braucht HTTPS oder ein App-Schema mit Ziel'))
  if (source.sourceType === 'wikipedia') {
    if (url.hostname !== `${source.languageCode}.wikipedia.org` || !url.pathname.startsWith('/wiki/') || url.pathname === '/wiki/') issues.push(issue(`${path}.link`, 'muss auf einen Artikel der angegebenen Wikipedia-Sprache zeigen'))
    if (source.locationInSource !== undefined && !url.hash) issues.push(issue(`${path}.link`, 'Abschnittsverweis braucht einen URL-Anker'))
  }
}
