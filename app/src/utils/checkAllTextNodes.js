import { Decoration, DecorationSet } from 'prosemirror-view'
import { splitIntoSentences } from './splitIntoSentences'
import { fetchSentenceSyntaxCheck } from './fetchSentenceSyntaxCheck'

/**
 * Fetch syntax check for individual text node with sentence-based caching
 * @param {string} nodeText - Text content of the node
 * @param {number} nodePos - Position of the node in the document
 * @returns {Promise<Array>} - Error ranges with absolute positions
 */
async function fetchTextNodeSyntaxCheck(nodeText, nodePos) {
  const sentences = splitIntoSentences(nodeText)
  const allRanges = []
  const checkPromises = []
  for (const sentence of sentences) {
    const promise = fetchSentenceSyntaxCheck(sentence.text, nodePos + sentence.offset)
      .then(ranges => {
        allRanges.push(...ranges)
      })
      .catch(error => {
        console.error(`Failed to check sentence "${sentence.text}":`, error)
      })
    checkPromises.push(promise)
  }
  await Promise.all(checkPromises)
  return allRanges
}

/**
 * Generate syntax error decorations with proper position mapping
 * @param {Node} doc - ProseMirror document
 * @param {Array} ranges - Error ranges with absolute positions
 * @returns {DecorationSet}
 */
export function getSyntaxErrorDecorations(doc, ranges) {
  const decorations = []
  
  // Create decorations directly from absolute positions
  for (const range of ranges) {
    const { from, to, action } = range
    
    // Validate positions are within document bounds
    if (from >= 0 && to <= doc.content.size && from < to) {
      try {
        decorations.push(
          Decoration.inline(from, to, {
            class: 'syntax-error-highlight',
          }, {
            // Store in spec for internal access
            errorAction: action,
            errorRange: { from, to }
          })
        )
        console.log(`Created decoration: ${from}-${to} for "${action.original}"`)
      } catch (error) {
        console.error(`Failed to create decoration for range ${from}-${to}:`, error)
      }
    } else {
      console.warn(`Invalid range: ${from}-${to}, doc size: ${doc.content.size}`)
    }
  }
  
  return DecorationSet.create(doc, decorations)
}

/**
 * Check syntax for all text nodes in the document
 * @param {Node} doc - ProseMirror document
 * @returns {Promise<Array>} - All error ranges across all text nodes
 */
export async function checkAllTextNodes(doc) {
  const allRanges = []
  const checkPromises = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text && node.text.trim()) {
      const promise = fetchTextNodeSyntaxCheck(node.text, pos)
        .then(ranges => {
          allRanges.push(...ranges)
        })
        .catch(error => {
          console.error(`Failed to check text node at position ${pos}:`, error)
        })
      checkPromises.push(promise)
    }
  })
  await Promise.all(checkPromises)
  return allRanges
}
