import { hideAnnotationToolbar } from './annotations.ts'

const content = document.getElementById('content')!
const presentOverlay = document.getElementById('present-overlay')!
const presentSlide = document.getElementById('present-slide')!
const presentDots = document.getElementById('present-dots')!
const presentCounter = document.getElementById('present-counter')!
const presentTooltip = document.getElementById('present-tooltip')!
const presentClose = document.getElementById('present-close') as HTMLButtonElement
const presentToggle = document.getElementById('present-toggle') as HTMLButtonElement
const presentSidebar = document.getElementById('present-sidebar')!
const presentSidebarBackdrop = document.getElementById('present-sidebar-backdrop')!
const presentSidebarToggle = document.getElementById('present-sidebar-toggle') as HTMLButtonElement
const presentPrevZone = document.getElementById('present-prev-zone')!
const presentNextZone = document.getElementById('present-next-zone')!

type Slide = {
  type: 'title' | 'content'
  heading: string
  breadcrumb: string[]
  html: string
  preview: string
}

let slides: Slide[] = []
let currentSlide = 0
let active = false

export function initPresent() {
  presentToggle.addEventListener('click', enterPresent)
  presentClose.addEventListener('click', exitPresent)
  presentSidebarToggle.addEventListener('click', togglePresentSidebar)
  presentCounter.addEventListener('click', togglePresentSidebar)
  presentSidebarBackdrop.addEventListener('click', closePresentSidebar)
  const goPrev = () => goTo(currentSlide - 1)
  const goNext = () => goTo(currentSlide + 1)
  presentPrevZone.addEventListener('click', goPrev)
  presentNextZone.addEventListener('click', goNext)

  const isTyping = (target: EventTarget | null) => {
    const el = target as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  const handleKey = (e: KeyboardEvent) => {
    if (!active && e.key === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
      e.preventDefault()
      enterPresent()
      return
    }

    if (!active) return

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      exitPresent()
      return
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault()
      goTo(currentSlide + 1)
      return
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      goTo(currentSlide - 1)
    }
  }

  document.addEventListener('keydown', handleKey, true)

  return () => {
    presentToggle.removeEventListener('click', enterPresent)
    presentClose.removeEventListener('click', exitPresent)
    presentSidebarToggle.removeEventListener('click', togglePresentSidebar)
    presentCounter.removeEventListener('click', togglePresentSidebar)
    presentSidebarBackdrop.removeEventListener('click', closePresentSidebar)
    presentPrevZone.removeEventListener('click', goPrev)
    presentNextZone.removeEventListener('click', goNext)
    document.removeEventListener('keydown', handleKey, true)
  }
}

function buildSlides(): Slide[] {
  const children = Array.from(content.children) as HTMLElement[]
  if (children.length === 0) return []

  const result: Slide[] = []
  let stack: { level: number; title: string }[] = []
  let bodyElements: HTMLElement[] = []
  let currentHeading = ''
  let currentLevel = 0

  const flush = () => {
    if (currentHeading === '' && bodyElements.length === 0) return

    const html = bodyElements.map((el) => el.outerHTML).join('')

    // Extract text and check for visible content in a single pass
    let bodyText = ''
    let hasContent = false
    for (const el of bodyElements) {
      const text = el.textContent?.trim() || ''
      if (text.length > 0) hasContent = true
      if (!hasContent && el.querySelector('img, table, pre, svg')) hasContent = true
      if (bodyText.length < 80) bodyText += (bodyText ? ' ' : '') + text
    }

    const preview = bodyText.length > 80 ? bodyText.slice(0, 80) + '\u2026' : bodyText

    const breadcrumb = stack
      .filter((s) => s.level < currentLevel)
      .map((s) => s.title)

    result.push({
      type: hasContent ? 'content' : 'title',
      heading: currentHeading,
      breadcrumb,
      html,
      preview,
    })

    bodyElements = []
  }

  for (const el of children) {
    const match = el.tagName.match(/^H([1-6])$/)

    if (match) {
      flush()

      const level = Number(match[1])
      const title = el.textContent?.trim() || ''

      stack = stack.filter((s) => s.level < level)
      stack.push({ level, title })

      currentHeading = title
      currentLevel = level
    } else {
      bodyElements.push(el)
    }
  }

  flush()
  return result
}

function renderPresentSidebar() {
  presentSidebar.innerHTML = ''

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'present-sidebar-item'
    if (i === currentSlide) button.classList.add('active')

    const title = document.createElement('span')
    title.className = 'present-sidebar-title'
    title.textContent = slide.heading || 'Untitled'
    button.appendChild(title)

    if (slide.preview) {
      const preview = document.createElement('span')
      preview.className = 'present-sidebar-preview'
      preview.textContent = slide.preview
      button.appendChild(preview)
    }

    button.addEventListener('click', () => {
      goTo(i)
      closePresentSidebar()
    })

    presentSidebar.appendChild(button)
  }
}

function updateSidebarActive() {
  const items = presentSidebar.children
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === currentSlide)
  }
}

function togglePresentSidebar() {
  const isOpen = !presentSidebar.classList.contains('hidden')
  if (isOpen) {
    closePresentSidebar()
  } else {
    renderPresentSidebar()
    presentSidebar.classList.remove('hidden')
    presentSidebarBackdrop.classList.remove('hidden')
  }
}

function closePresentSidebar() {
  presentSidebar.classList.add('hidden')
  presentSidebarBackdrop.classList.add('hidden')
}

function enterPresent() {
  hideAnnotationToolbar()
  slides = buildSlides()
  if (slides.length === 0) return

  currentSlide = 0
  active = true
  renderDots()
  renderSlide()
  presentOverlay.hidden = false
  presentOverlay.classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}

function exitPresent() {
  hideAnnotationToolbar()
  active = false
  presentOverlay.hidden = true
  presentOverlay.classList.add('hidden')
  document.body.style.overflow = ''
  hideTooltip()
  closePresentSidebar()
}

function goTo(index: number) {
  if (index < 0 || index >= slides.length) return
  currentSlide = index
  renderSlide()
  updateActiveDot()
  updateSidebarActive()
}

function renderDots() {
  presentDots.innerHTML = ''

  for (let i = 0; i < slides.length; i++) {
    const seg = document.createElement('button')
    seg.type = 'button'
    seg.className = 'present-seg'
    seg.setAttribute('aria-label', `Go to slide ${i + 1}`)

    seg.addEventListener('click', () => goTo(i))
    seg.addEventListener('mouseenter', (e) => showTooltip(i, e.currentTarget as HTMLElement))
    seg.addEventListener('mouseleave', hideTooltip)

    presentDots.appendChild(seg)
  }

  updateActiveDot()
}

function updateActiveDot() {
  const segs = presentDots.children
  for (let i = 0; i < segs.length; i++) {
    segs[i].classList.toggle('active', i === currentSlide)
  }
}

function showTooltip(index: number, anchor: HTMLElement) {
  const slide = slides[index]
  const title = slide.heading || 'Untitled'
  const preview = slide.preview

  let html = `<div class="present-tooltip-title">${escapeHtml(title)}</div>`
  if (preview) {
    html += `<div class="present-tooltip-preview">${escapeHtml(preview)}</div>`
  }

  presentTooltip.innerHTML = html
  presentTooltip.classList.remove('hidden')

  // Position above the segment
  const dotRect = anchor.getBoundingClientRect()
  const tipWidth = presentTooltip.offsetWidth
  let left = dotRect.left + dotRect.width / 2 - tipWidth / 2
  // Clamp to viewport
  left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8))

  presentTooltip.style.left = `${left}px`
  presentTooltip.style.bottom = `${window.innerHeight - dotRect.top + 8}px`
}

function hideTooltip() {
  presentTooltip.classList.add('hidden')
}

function renderSlide() {
  const slide = slides[currentSlide]
  presentCounter.textContent = `${currentSlide + 1} / ${slides.length}`

  const breadcrumbHtml = slide.breadcrumb.length > 0
    ? `<div class="present-breadcrumb">${slide.breadcrumb.map((b, i) => `<a class="present-breadcrumb-level" style="--depth:${i}" data-breadcrumb="${escapeHtml(b)}">${i > 0 ? '<span class="present-breadcrumb-sep">›</span> ' : ''}${escapeHtml(b)}</a>`).join('')}</div>`
    : ''

  if (slide.type === 'title') {
    presentSlide.className = 'present-slide present-slide-title'
    presentSlide.innerHTML = `${breadcrumbHtml}<h1>${escapeHtml(slide.heading)}</h1>`
  } else {
    presentSlide.className = 'present-slide present-slide-content'
    const titleHtml = slide.heading ? `<h1>${escapeHtml(slide.heading)}</h1>` : ''
    presentSlide.innerHTML = `${breadcrumbHtml}${titleHtml}<div class="present-body">${slide.html}</div>`
  }

  presentSlide.querySelectorAll<HTMLElement>('.present-breadcrumb-level').forEach((el) => {
    el.addEventListener('click', () => {
      const title = el.dataset.breadcrumb
      for (let i = currentSlide - 1; i >= 0; i--) {
        if (slides[i].heading === title) { goTo(i); return }
      }
      // fallback: search forward from start
      for (let i = 0; i < currentSlide; i++) {
        if (slides[i].heading === title) { goTo(i); return }
      }
    })
  })

  presentOverlay.scrollTop = 0
}

function escapeHtml(text: string) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
