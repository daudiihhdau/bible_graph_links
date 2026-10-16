const issue = (path, message) => ({ path, message })
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value, allowed, path, issues) => {
  if (!isObject(value)) return issues.push(issue(path, 'muss ein Objekt sein'))
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(issue(`${path}.${key}`, 'unbekanntes Feld'))
}

export function timeKey(date) {
  return [calendarYear(date), date.month ?? 1, date.day ?? 1]
}

export const calendarYear = date => date.era === 'BCE' ? 1 - date.year : date.year

const compareKeys = (first, second) => {
  for (let index = 0; index < 3; index++) if (first[index] !== second[index]) return first[index] - second[index]
  return 0
}

const daysInMonth = (year, month) => {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

const startKey = date => timeKey(date)
const endKey = date => [calendarYear(date), date.month ?? 12, date.day ?? daysInMonth(calendarYear(date), date.month ?? 12)]

export function compareTime(first, second) {
  if (compareKeys(endKey(first.end ?? first.start), startKey(second.start)) < 0) return 'before'
  if (compareKeys(endKey(second.end ?? second.start), startKey(first.start)) < 0) return 'after'
  return 'overlaps'
}

export const overlapsTime = (first, second) => compareTime(first, second) === 'overlaps'

export const formatYear = date => date.era === 'BCE' ? `${date.year} v. Chr.` : date.era === 'ZERO' ? 'Jahr 0 (1 v. Chr.)' : `${date.year} n. Chr.`

export function compareDates(a, b) {
  return compareKeys(timeKey(a), timeKey(b))
}

function checkDate(date, path, issues) {
  keys(date, ['year', 'era', 'month', 'day'], path, issues)
  if (!isObject(date)) return
  if (!Number.isInteger(date.year) || date.year < 0) issues.push(issue(`${path}.year`, 'muss eine nichtnegative ganze Jahreszahl sein'))
  if (!['BCE', 'CE', 'ZERO'].includes(date.era) || (date.year === 0) !== (date.era === 'ZERO')) issues.push(issue(`${path}.era`, 'Jahr 0 braucht ZERO; positive Jahre brauchen BCE oder CE'))
  if (date.month !== undefined && (!Number.isInteger(date.month) || date.month < 1 || date.month > 12)) issues.push(issue(`${path}.month`, 'muss zwischen 1 und 12 liegen'))
  if (date.day !== undefined && (date.month === undefined || !Number.isInteger(date.day) || date.day < 1 || date.day > 31)) issues.push(issue(`${path}.day`, 'braucht Monat und Tag zwischen 1 und 31'))
  if (Number.isInteger(date.year) && Number.isInteger(date.month) && Number.isInteger(date.day)) {
    if (date.day > daysInMonth(calendarYear(date), date.month)) issues.push(issue(`${path}.day`, 'Tag existiert in diesem Monat nicht'))
  }
}

export function checkTime(time, path, issues, { point = false } = {}) {
  keys(time, ['start', 'end', 'isApproximate'], path, issues)
  if (!isObject(time)) return
  checkDate(time.start, `${path}.start`, issues)
  if (time.end !== undefined) checkDate(time.end, `${path}.end`, issues)
  if (point && time.end !== undefined) issues.push(issue(`${path}.end`, 'ein Zeitpunkt darf kein Ende haben'))
  if (time.end && Number.isInteger(time.start?.year) && Number.isInteger(time.end?.year) && time.start.era && time.end.era) {
    if (compareKeys(startKey(time.start), endKey(time.end)) > 0) issues.push(issue(path, 'Ende liegt vor dem Anfang'))
  }
  if (time.isApproximate !== undefined && typeof time.isApproximate !== 'boolean') issues.push(issue(`${path}.isApproximate`, 'muss boolean sein'))
}
