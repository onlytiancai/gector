/**
 * 分析并打印文档变化中的文本节点修改信息
 * @param {Transaction} tr - ProseMirror事务
 * @param {Node} oldDoc - 修改前的文档
 * @param {Node} newDoc - 修改后的文档
 */
export function analyzeTextNodeChanges(tr, oldDoc, newDoc) {
  if (!tr.docChanged) return

  console.group('📝 Text Node Changes Detected')
  
  tr.steps.forEach((step, stepIndex) => {
    console.log(`\n--- Step ${stepIndex + 1} ---`)
    console.log('Step type:', step.constructor.name)
    console.log('Step JSON:', step.toJSON())
    
    if (step.from !== undefined && step.to !== undefined) {
      const from = step.from
      const to = step.to
      console.log(`Position range: ${from} → ${to}`)
      const nodesBetween = []

      oldDoc.descendants((node, pos, parent) => {
        if (pos + node.nodeSize > from && pos < to) {
          nodesBetween.push({ node, pos, parent })
        }
      })

      console.log('Nodes between from and to:', nodesBetween.map(info => ({
        type: info.node.type.name,
        pos: info.pos,
        text: info.node.isText ? info.node.text : null,
        nodeSize: info.node.nodeSize
      })))
      
      if (from <= oldDoc.content.size && to <= oldDoc.content.size) {
        const oldSlice = oldDoc.slice(from, to)
        console.log('Old content:', {
          size: oldSlice.size,
          content: oldSlice.content.toString(),
          textContent: oldSlice.content.textBetween(0, oldSlice.content.size)
        })
        oldSlice.content.forEach((node, offset) => {
          console.log(`  Old node at offset ${offset}:`, {
            type: node.type.name,
            isText: node.isText,
            content: node.isText ? `"${node.text}"` : node.content.toString(),
            size: node.nodeSize
          })
        })
      }
      if (step.slice) {
        const newSlice = step.slice
        console.log('New content:', {
          size: newSlice.size,
          content: newSlice.content.toString(),
          textContent: newSlice.content.textBetween(0, newSlice.content.size)
        })
        newSlice.content.forEach((node, offset) => {
          console.log(`  New node at offset ${offset}:`, {
            type: node.type.name,
            isText: node.isText,
            content: node.isText ? `"${node.text}"` : node.content.toString(),
            size: node.nodeSize
          })
        })
      }
    }
  })
  
  console.log('\n--- Document Text Nodes Comparison ---')
  const oldTextNodes = extractTextNodes(oldDoc)
  const newTextNodes = extractTextNodes(newDoc)
  console.log('Old text nodes:', oldTextNodes)
  console.log('New text nodes:', newTextNodes)
  const changes = findTextNodeChanges(oldTextNodes, newTextNodes)
  if (changes.length > 0) {
    console.log('Detected text node changes:', changes)
  }
  console.groupEnd()
}

/**
 * 提取文档中所有文本节点的信息
 * @param {Node} doc - ProseMirror文档
 * @returns {Array} 文本节点信息数组
 */
export function extractTextNodes(doc) {
  const textNodes = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      textNodes.push({
        position: pos,
        text: node.text,
        length: node.text.length,
        type: node.type.name
      })
    }
  })
  return textNodes
}

/**
 * 比较两组文本节点，找出变化
 * @param {Array} oldNodes - 修改前的文本节点
 * @param {Array} newNodes - 修改后的文本节点
 * @returns {Array} 变化信息数组
 */
export function findTextNodeChanges(oldNodes, newNodes) {
  const changes = []
  if (oldNodes.length !== newNodes.length) {
    changes.push({
      type: 'count_change',
      oldCount: oldNodes.length,
      newCount: newNodes.length
    })
  }
  const maxLength = Math.max(oldNodes.length, newNodes.length)
  for (let i = 0; i < maxLength; i++) {
    const oldNode = oldNodes[i]
    const newNode = newNodes[i]
    if (!oldNode && newNode) {
      changes.push({
        type: 'added',
        index: i,
        node: newNode
      })
    } else if (oldNode && !newNode) {
      changes.push({
        type: 'removed',
        index: i,
        node: oldNode
      })
    } else if (oldNode && newNode && oldNode.text !== newNode.text) {
      changes.push({
        type: 'modified',
        index: i,
        oldNode: oldNode,
        newNode: newNode,
        oldText: oldNode.text,
        newText: newNode.text
      })
    }
  }
  return changes
}
