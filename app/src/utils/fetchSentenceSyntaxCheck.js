import { ignoredErrors } from './states'
const grammarCheckApiCache = new Map()

/**
 * Call the grammar check API for a sentence, with response caching.
 * @param {string} sentenceText
 * @returns {Promise<Object>} API response
 */
async function callGrammarCheckApi(sentenceText) {
  const cacheKey = sentenceText.trim()
  if (grammarCheckApiCache.has(cacheKey)) {
    return grammarCheckApiCache.get(cacheKey)
  }
  try {
    const resp = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: sentenceText })
    })
    const data = await resp.json()
    grammarCheckApiCache.set(cacheKey, data)
    return data
  } catch (error) {
    console.error('Grammar check API failed:', error)
    throw error
  }
}

/**
 * 解析 API 返回的 actions，生成 ranges
 * @param {Array} actions - API返回的actions
 * @param {number} sentenceAbsolutePos - 句子在文档中的绝对位置
 * @returns {Array}
 */
function parseApiActionsToRanges(actions, sentenceAbsolutePos) {
  const ranges = []
  for (const action of actions) {
    if (action.token_end !== undefined && action.token_start !== undefined) {
      const absoluteStart = sentenceAbsolutePos + action.token_start
      const absoluteEnd = sentenceAbsolutePos + action.token_end
      const errorKey = `${absoluteStart}-${absoluteEnd}-${action.original}`
      if (ignoredErrors.has(errorKey)) {
        console.warn(`Ignoring already ignored error: ${errorKey}`)
        continue
      }
      ranges.push({ 
        from: absoluteStart, 
        to: absoluteEnd,
        action: {
          ...action,
          absolute_token_start: absoluteStart,
          absolute_token_end: absoluteEnd
        }
      })
    }
  }
  return ranges
}

/**
 * Fetch syntax check for individual sentence with caching
 * @param {string} sentenceText - Text content of the sentence
 * @param {number} sentenceAbsolutePos - Absolute position of the sentence in the document
 * @returns {Promise<Array>} - Error ranges with absolute positions
 */
export async function fetchSentenceSyntaxCheck(sentenceText, sentenceAbsolutePos) {
  try {
    const data = await callGrammarCheckApi(sentenceText)
    const ranges = parseApiActionsToRanges(data.actions, sentenceAbsolutePos)
    return ranges
  } catch (error) {
    console.error('Sentence syntax check failed:', error)
    return []
  }
}
