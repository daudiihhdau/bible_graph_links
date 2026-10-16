// The package schemas use this dependency-free JSON Schema subset.
// Unknown validation keywords fail loudly so validation cannot silently weaken.
const supported = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'default', 'type', 'const', 'enum', 'anyOf', 'oneOf', 'if', 'then', 'else', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern'])
export const canonicalKey = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const same = (a, b) => canonicalKey(a) === canonicalKey(b)
const typeMatches = (value, type) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : typeof value === type

export function validateJsonSchema(value, schema, path = '$') {
  const issues = []
  function visit(input, rule, current) {
    for (const key of Object.keys(rule)) if (!supported.has(key)) throw new Error(`Nicht unterstütztes JSON-Schema-Schlüsselwort: ${key}`)
    if (rule.$ref) {
      if (!rule.$ref.startsWith('#/')) throw new Error(`Nicht unterstützte Schema-Referenz: ${rule.$ref}`)
      const target = rule.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], schema)
      if (!target) throw new Error(`Unbekannte Schema-Referenz: ${rule.$ref}`)
      visit(input, target, current)
      return
    }
    if (rule.anyOf || rule.oneOf) {
      const branches = rule.anyOf ?? rule.oneOf
      const matches = branches.filter(branch => {
        const before = issues.length
        visit(input, branch, current)
        const valid = issues.length === before
        issues.length = before
        return valid
      }).length
      if (rule.anyOf ? matches === 0 : matches !== 1) issues.push({ path: current, message: `passt zu keinem eindeutigen Schema-Zweig (${matches} Treffer)` })
    }
    if (rule.if) {
      const before = issues.length
      visit(input, rule.if, current)
      const matched = issues.length === before
      issues.length = before
      if (matched && rule.then) visit(input, rule.then, current)
      if (!matched && rule.else) visit(input, rule.else, current)
    }
    if (rule.type && !(Array.isArray(rule.type) ? rule.type : [rule.type]).some(type => typeMatches(input, type))) {
      issues.push({ path: current, message: `erwarteter Typ: ${rule.type}` })
      return
    }
    if (rule.const !== undefined && !same(input, rule.const)) issues.push({ path: current, message: `muss ${JSON.stringify(rule.const)} sein` })
    if (rule.enum && !rule.enum.some(candidate => same(input, candidate))) issues.push({ path: current, message: 'unzulässiger Wert' })
    if (typeof input === 'string') {
      if (rule.minLength !== undefined && [...input].length < rule.minLength) issues.push({ path: current, message: 'Text zu kurz' })
      if (rule.maxLength !== undefined && [...input].length > rule.maxLength) issues.push({ path: current, message: 'Text zu lang' })
      if (rule.pattern && !new RegExp(rule.pattern).test(input)) issues.push({ path: current, message: 'Text entspricht nicht dem Muster' })
    }
    if (typeof input === 'number') {
      if (rule.minimum !== undefined && input < rule.minimum) issues.push({ path: current, message: 'Zahl zu klein' })
      if (rule.maximum !== undefined && input > rule.maximum) issues.push({ path: current, message: 'Zahl zu groß' })
    }
    if (Array.isArray(input)) {
      if (rule.minItems !== undefined && input.length < rule.minItems) issues.push({ path: current, message: 'Liste zu kurz' })
      if (rule.maxItems !== undefined && input.length > rule.maxItems) issues.push({ path: current, message: 'Liste zu lang' })
      if (rule.uniqueItems) {
        const seen = new Set()
        for (let index = 0; index < input.length; index++) {
          const key = canonicalKey(input[index])
          if (seen.has(key)) issues.push({ path: `${current}[${index}]`, message: 'doppelter Listeneintrag' })
          else seen.add(key)
        }
      }
      if (rule.items) input.forEach((item, index) => visit(item, rule.items, `${current}[${index}]`))
    } else if (input !== null && typeof input === 'object') {
      for (const required of rule.required ?? []) if (!(required in input)) issues.push({ path: `${current}.${required}`, message: 'Pflichtfeld fehlt' })
      for (const [key, child] of Object.entries(input)) {
        const childRule = rule.properties?.[key]
        if (childRule) visit(child, childRule, `${current}.${key}`)
        else if (rule.additionalProperties === false) issues.push({ path: `${current}.${key}`, message: 'unbekanntes Feld' })
        else if (rule.additionalProperties && typeof rule.additionalProperties === 'object') visit(child, rule.additionalProperties, `${current}.${key}`)
      }
    }
  }
  visit(value, schema, path)
  return issues
}
