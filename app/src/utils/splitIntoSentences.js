/**
 * Split text into sentences using simple punctuation-based rules
 * @param {string} text - Text to split
 * @returns {Array<{text: string, offset: number}>} - Array of sentences with their offsets
 */
export function splitIntoSentences(text) {
  const sentences = []
  const sentenceRegex = /[.!?]+/g
  let lastIndex = 0
  let match
  while ((match = sentenceRegex.exec(text)) !== null) {
    const endIndex = match.index + match[0].length
    const sentence = text.slice(lastIndex, endIndex).trim()
    if (sentence.length > 0) {
      sentences.push({
        text: sentence,
        offset: lastIndex
      })
    }
    lastIndex = endIndex
  }
  const remaining = text.slice(lastIndex).trim()
  if (remaining.length > 0) {
    sentences.push({
      text: remaining,
      offset: lastIndex
    })
  }
  return sentences
}
