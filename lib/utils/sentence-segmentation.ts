export function splitIntoSentenceLikeSegments(input: string) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const segments: string[] = []
  let segmentStart = 0

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index]
    const next = normalized[index + 1]
    const isSentencePunctuation = current === '.' || current === '!' || current === '?'
    const nextIsSentencePunctuation = next === '.' || next === '!' || next === '?'
    if (!isSentencePunctuation || nextIsSentencePunctuation) {
      continue
    }

    if (!next || next === ' ') {
      const segment = normalized.slice(segmentStart, index + 1).trim()
      if (segment) {
        segments.push(segment)
      }
      segmentStart = next === ' ' ? index + 2 : index + 1
    }
  }

  const trailingSegment = normalized.slice(segmentStart).trim()
  if (trailingSegment) {
    segments.push(trailingSegment)
  }

  return segments.length > 0 ? segments : [normalized]
}
