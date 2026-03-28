type ActiveFileBridge = {
  getText: () => string | null
  updateText: (nextText: string) => boolean
}

let activeFileBridge: ActiveFileBridge | null = null

export function registerActiveFileBridge(bridge: ActiveFileBridge) {
  activeFileBridge = bridge
}

export function getActiveFileText(): string | null {
  return activeFileBridge?.getText() ?? null
}

export function updateActiveFileText(nextText: string): boolean {
  return activeFileBridge?.updateText(nextText) ?? false
}
