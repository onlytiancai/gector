import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'

let currentTippyInstance = null

/**
 * Create tooltip content DOM element for tippy.js
 * @param {Object} action - Error action data
 * @returns {HTMLElement} - DOM element for tooltip content
 */
export function createTooltipContent(action) {
  const container = document.createElement('div')
  container.className = 'tooltip-content'
  
  // Create action info section
  const actionInfo = document.createElement('div')
  actionInfo.className = 'action-info'
  
  const isAppend = action.action.startsWith('$APPEND_')
  const isDelete = action.action === '$DELETE'
  
  if (isAppend) {
    actionInfo.classList.add('append')
    const displayText = getDisplayTextForAction(action)
    actionInfo.innerHTML = `
      <div class="action-type">📝 添加建议</div>
      <div class="suggestion-info">
        <strong>在 "${displayText}" 后添加:</strong> "${action.real_replacement}"
      </div>
    `
  } else if (isDelete) {
    actionInfo.classList.add('delete')
    actionInfo.innerHTML = `
      <div class="action-type">🗑️ 删除建议</div>
      <div class="suggestion-info">
        <strong>建议删除:</strong> "${action.original}"
      </div>
      <div class="reason-info">该词可能是多余的</div>
    `
  } else {
    actionInfo.classList.add('replace')
    actionInfo.innerHTML = `
      <div class="action-type">✏️ 替换建议</div>
      <div class="error-info">
        <strong>原文:</strong> "${action.original}"
      </div>
      <div class="suggestion-info">
        <strong>建议改为:</strong> "${action.real_replacement}"
      </div>
    `
  }
  
  container.appendChild(actionInfo)
  
  // Create confidence info if available
  if (action.confidence) {
    const confidenceInfo = document.createElement('div')
    confidenceInfo.className = 'confidence-info'
    
    const confidencePercent = Math.round(action.confidence * 100)
    const confidenceClass = getConfidenceClass(action.confidence)
    
    confidenceInfo.innerHTML = `
      <span class="confidence-label">置信度:</span>
      <div class="confidence-bar">
        <div class="confidence-fill ${confidenceClass}" style="width: ${confidencePercent}%"></div>
      </div>
      <span class="confidence-value">${confidencePercent}%</span>
    `
    
    container.appendChild(confidenceInfo)
  }
  
  // Create action buttons
  const actionsDiv = document.createElement('div')
  actionsDiv.className = 'tooltip-actions'
  
  const applyBtn = document.createElement('button')
  applyBtn.className = 'btn-apply'
  applyBtn.textContent = getApplyButtonTextForAction(action)
  applyBtn.setAttribute('data-action', 'apply')
  
  const ignoreBtn = document.createElement('button')
  ignoreBtn.className = 'btn-ignore'
  ignoreBtn.textContent = '忽略'
  ignoreBtn.setAttribute('data-action', 'ignore')
  
  actionsDiv.appendChild(applyBtn)
  actionsDiv.appendChild(ignoreBtn)
  container.appendChild(actionsDiv)
  
  return container
}

/**
 * Create a virtual reference element for better positioning
 * @param {EditorView} view - ProseMirror editor view
 * @param {number} from - Start position
 * @param {number} to - End position
 * @returns {Object} - Virtual reference object for tippy
 */
export function createVirtualReference(view, from, to) {
  return {
    getBoundingClientRect() {
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)
      
      return {
        left: start.left,
        top: start.top,
        right: end.right,
        bottom: end.bottom,
        width: end.right - start.left,
        height: end.bottom - start.top,
        x: start.left,
        y: start.top
      }
    }
  }
}

/**
 * Show tooltip using tippy.js with proper positioning using ProseMirror coordinates
 * @param {Object} action - Error action data
 * @param {Object} range - Error range in document
 * @param {HTMLElement} targetElement - Element to attach tooltip to (fallback)
 * @param {EditorView} view - ProseMirror editor view
 * @param {Function} onApply - Callback for apply action
 * @param {Function} onIgnore - Callback for ignore action
 */
export function showTooltip(action, range, targetElement, view, onApply, onIgnore) {
  console.log('Show tooltip for action:', action, 'at range:', range)
  
  // Hide existing tooltip
  hideTooltip()
  
  if (!view) {
    console.warn('No editor view available')
    return
  }
  
  // Create virtual reference using ProseMirror coordinates
  const virtualRef = createVirtualReference(view, range.from, range.to)
  const testRect = virtualRef.getBoundingClientRect()
  console.log('Virtual reference rect:', testRect)
  
  // Validate coordinates
  if (testRect.width === 0 && testRect.height === 0) {
    console.warn('Invalid coordinates, falling back to target element')
    if (!targetElement) return
    
    const rect = targetElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      console.warn('Target element also has no dimensions')
      return
    }
  }
  
  // Create DOM content for tooltip
  const tooltipContent = createTooltipContent(action)
  
  // Create tippy instance with virtual reference
  currentTippyInstance = tippy(document.body, {
    content: tooltipContent,
    allowHTML: true,
    interactive: true,
    trigger: 'manual',
    placement: 'top-start',
    theme: 'syntax-correction',
    arrow: true,
    offset: [0, 8],
    appendTo: document.body,
    getReferenceClientRect: () => virtualRef.getBoundingClientRect(),
    hideOnClick: false,
    onShow(instance) {
      const rect = instance.reference.getBoundingClientRect()
      console.log('Tippy tooltip shown with reference rect:', rect)
    },
    onHide() {
      console.log('Tippy tooltip hidden')
    },
    onClickOutside() {
      hideTooltip()
    }
  })
  
  // Add event listeners to tooltip buttons using event delegation
  tooltipContent.addEventListener('click', (e) => {
    const button = e.target.closest('button')
    if (!button) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const actionType = button.getAttribute('data-action')
    if (actionType === 'apply' && onApply) {
      onApply(action, range, view)
    } else if (actionType === 'ignore' && onIgnore) {
      onIgnore(action, view)
    }
  })
  
  // Show the tooltip
  currentTippyInstance.show()
}

/**
 * Hide tooltip and cleanup
 */
export function hideTooltip() {
  if (currentTippyInstance) {
    currentTippyInstance.destroy()
    currentTippyInstance = null
  }
}

/**
 * Get display text for the action context
 * @param {Object} action - Error action data
 * @returns {string} - Text to display in tooltip
 */
function getDisplayTextForAction(action) {
  if (!action.action.startsWith('$APPEND_')) {
    return action.original || ''
  }
  
  // For append operations, return a generic context
  return '此处'
}

/**
 * Get appropriate button text based on action type
 * @param {Object} action - Error action data
 * @returns {string} - Button text
 */
function getApplyButtonTextForAction(action) {
  if (!action) return '应用修改'
  
  if (action.action.startsWith('$APPEND_')) {
    return '添加'
  } else if (action.action === '$DELETE') {
    return '删除'
  } else {
    return '替换'
  }
}

/**
 * Get CSS class for confidence level
 * @param {number} confidence - Confidence value (0-1)
 * @returns {string} - CSS class name
 */
function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'confidence-high'
  if (confidence >= 0.6) return 'confidence-medium'
  return 'confidence-low'
}
