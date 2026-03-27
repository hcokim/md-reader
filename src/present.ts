const content = document.getElementById('content')!
const presentOverlay = document.getElementById('present-overlay')!
const presentSlide = document.getElementById('present-slide')!
const presentDots = document.getElementById('present-dots')!
const presentCounter = document.getElementById('present-counter')!
const presentTooltip = document.getElementById('present-tooltip')!
const presentToggle = document.getElementById('present-toggle') as HTMLButtonElement

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

  const handleKey = (e: KeyboardEvent) => {
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
    document.removeEventListener('keydown', handleKey, true)
  }
}

function buildSlides(): Slide[] {
  const children = Array.from(content.children) as HTMLElement[]
  if (children.length === 0) return []

  const result: Slide[] = []
  let stack: { level: number; title: string }[] = []
  let currentFragments: string[] = []
  let currentHeading = ''
  let currentLevel = 0

  const flush = () => {
    if (currentHeading === '' && currentFragments.length === 0) return

    const html = currentFragments.join('')
    const hasContent = hasVisibleContent(html)

    const breadcrumb = stack
      .filter((s) => s.level < currentLevel)
      .map((s) => s.title)

    const preview = buildPreview(html)

    result.push({
      type: hasContent ? 'content' : 'title',
      heading: currentHeading,
      breadcrumb,
      html,
      preview,
    })

    currentFragments = []
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
      currentFragments.push(el.outerHTML)
    }
  }

  flush()
  return result
}

function buildPreview(html: string): string {
  if (!html.trim()) return ''
  const temp = document.createElement('div')
  temp.innerHTML = html
  const text = temp.textContent?.trim() || ''
  if (text.length <= 80) return text
  return text.slice(0, 80) + '\u2026'
}

function hasVisibleContent(html: string): boolean {
  if (!html.trim()) return false
  const temp = document.createElement('div')
  temp.innerHTML = html
  const text = temp.textContent?.trim() || ''
  if (text.length > 0) return true
  return temp.querySelector('img, table, pre, svg') !== null
}

function enterPresent() {
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
  active = false
  presentOverlay.hidden = true
  presentOverlay.classList.add('hidden')
  document.body.style.overflow = ''
  hideTooltip()
}

function goTo(index: number) {
  if (index < 0 || index >= slides.length) return
  currentSlide = index
  renderSlide()
  updateActiveDot()
}

function renderDots() {
  presentDots.innerHTML = ''

  for (let i = 0; i < slides.length; i++) {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.className = 'present-dot'
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`)

    dot.addEventListener('click', () => goTo(i))
    dot.addEventListener('mouseenter', (e) => showTooltip(i, e.currentTarget as HTMLElement))
    dot.addEventListener('mouseleave', hideTooltip)

    presentDots.appendChild(dot)
  }

  updateActiveDot()
}

function updateActiveDot() {
  const dots = presentDots.children
  for (let i = 0; i < dots.length; i++) {
    dots[i].classList.toggle('active', i === currentSlide)
  }

  // Scroll the active dot into view within the dot track
  const activeDot = dots[currentSlide] as HTMLElement | undefined
  if (activeDot) {
    activeDot.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
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

  // Position above the dot
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
    ? `<div class="present-breadcrumb">${slide.breadcrumb.map(escapeHtml).join(' <span class="present-breadcrumb-sep">/</span> ')}</div>`
    : ''

  if (slide.type === 'title') {
    presentSlide.className = 'present-slide present-slide-title'
    presentSlide.innerHTML = `${breadcrumbHtml}<h1>${escapeHtml(slide.heading)}</h1>`
  } else {
    presentSlide.className = 'present-slide present-slide-content'
    const titleHtml = slide.heading ? `<h1>${escapeHtml(slide.heading)}</h1>` : ''
    presentSlide.innerHTML = `${breadcrumbHtml}${titleHtml}<div class="present-body">${slide.html}</div>`
  }

  presentSlide.scrollTop = 0
}

function escapeHtml(text: string) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
