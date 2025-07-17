import { hideTooltip } from './tooltip'
import { ignoredErrors } from './states'
import { checkAllTextNodes, getSyntaxErrorDecorations } from './checkAllTextNodes'

/**
 * Apply suggestion with support for append, delete, and replace operations
 * @param {Object} action - Error action data
 * @param {Object} range - Error range in document
 */
export function applySuggestion(action, range, view) {
  if (!action || !range || !view) {
    console.warn('No action, range, or view available')
    return
  }
  const { from, to } = range
  let tr
  try {
    if (action.action.startsWith('$APPEND_')) {
      tr = view.state.tr.insert(to, view.state.schema.text(action.real_replacement))
    } else if (action.action === '$DELETE') {
      tr = view.state.tr.delete(from, to)
    } else {
      tr = view.state.tr.replaceWith(from, to, view.state.schema.text(action.real_replacement))
    }
    view.dispatch(tr)
    console.log('Successfully applied suggestion:', action.action)
  } catch (error) {
    console.error('Failed to apply suggestion:', error)
  }
  hideTooltip()
}

/**
 * Ignore suggestion - add to ignored list and remove highlighting
 */
export function ignoreSuggestion(
  action,
  view,
) {
  if (!action) return
  const errorKey = `${action.absolute_token_start}-${action.absolute_token_end}-${action.original}`
  ignoredErrors.add(errorKey)
  if (view) {
    checkAllTextNodes(view.state.doc).then(ranges => {
      const deco = getSyntaxErrorDecorations(view.state.doc, ranges)
      const tr = view.state.tr.setMeta('syntax-check-update', deco)
      view.dispatch(tr)
    }).catch(console.error)
  }
  hideTooltip()
}
