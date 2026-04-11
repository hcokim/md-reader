const MAX_HISTORY = 100

type HistoryStack = {
  undo: string[]
  redo: string[]
}

const stacks = new Map<string, HistoryStack>()

function getStack(fileId: string): HistoryStack {
  let stack = stacks.get(fileId)
  if (!stack) {
    stack = { undo: [], redo: [] }
    stacks.set(fileId, stack)
  }
  return stack
}

export function pushUndoState(fileId: string, previousText: string): void {
  const stack = getStack(fileId)
  stack.undo.push(previousText)
  if (stack.undo.length > MAX_HISTORY) {
    stack.undo.shift()
  }
  stack.redo.length = 0
}

export function undo(fileId: string, currentText: string): string | null {
  const stack = getStack(fileId)
  const previousText = stack.undo.pop()
  if (previousText === undefined) return null

  stack.redo.push(currentText)
  return previousText
}

export function redo(fileId: string, currentText: string): string | null {
  const stack = getStack(fileId)
  const nextText = stack.redo.pop()
  if (nextText === undefined) return null

  stack.undo.push(currentText)
  return nextText
}

export function clearHistory(fileId: string): void {
  stacks.delete(fileId)
}
