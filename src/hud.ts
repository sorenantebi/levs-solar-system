import { Collectible } from './items'
import { SCROLLS } from './scrolls'

/**
 * The per-planet panel, and the journal.
 *
 * The panel says which world you're on and whether its scroll is still out
 * there. The journal — E — is the list of every scroll, with the found ones
 * readable at any time. It has two views in one sheet rather than two stacked
 * overlays: the list, and a single scroll opened from it.
 */
export class Hud {
  private readonly root = document.createElement('div')
  private readonly planetName = document.createElement('div')
  private readonly chip = document.createElement('span')
  private readonly itemName = document.createElement('span')
  private readonly itemState = document.createElement('span')
  private readonly progress = document.createElement('div')
  private readonly shelf = document.createElement('div')
  private readonly toast = document.createElement('div')
  private readonly toastText = document.createElement('div')
  private readonly albumHint = document.createElement('div')

  private readonly journal = document.createElement('div')
  private readonly paper = document.createElement('div')
  private readonly count = document.createElement('span')
  private readonly list = document.createElement('div')
  private readonly readTitle = document.createElement('div')
  private readonly readBody = document.createElement('div')

  private readonly shelfButtons = new Map<string, HTMLButtonElement>()
  private readonly entries = new Map<string, HTMLButtonElement>()
  private readonly album = document.createElement('div')
  private readonly albumCard = document.createElement('div')
  private readonly albumTitle = document.createElement('div')
  private readonly albumImage = document.createElement('img')
  private readonly albumIndex = document.createElement('div')
  private readonly albumPath = document.createElement('div')
  private albumPlanet = ''
  private albumPhotoIndex = 0
  private shownState = ''
  private toastTimer = 0

  /** True while the journal is up — the game suspends input meanwhile. */
  open = false
  /** Set by main: puts every scroll back where it was. */
  onReset: (() => void) | null = null

  private readonly albums = new Map<string, { title: string; photos: string[] }>([
    ['start', { title: 'Start Album', photos: ['/photos/start-1.jpg', '/photos/start-2.jpg'] }],
    ['arrakis', { title: 'Arrakis Album', photos: ['/photos/arrakis-1.jpg', '/photos/arrakis-2.jpg'] }],
    ['freljord', { title: 'Freljord Album', photos: ['/photos/freljord-1.jpg', '/photos/freljord-2.jpg'] }],
    ['silly', { title: 'Silly Album', photos: ['/photos/silly-1.jpg', '/photos/silly-2.jpg'] }],
    ['hoenn', { title: 'Hoenn Album', photos: ['/photos/hoenn-1.jpg', '/photos/hoenn-2.jpg'] }],
    ['home', { title: 'Home Album', photos: ['/photos/home-1.jpg', '/photos/home-2.jpg'] }],
    ['lover', { title: 'Lover Album', photos: ['/photos/lover-1.jpg', '/photos/lover-2.jpg'] }],
    ['minecraft', { title: 'Minecraft Album', photos: ['/photos/minecraft-1.jpg', '/photos/minecraft-2.jpg'] }],
  ])

  constructor() {
    this.buildPanel()
    this.buildJournal()
    this.buildAlbum()
    this.toast.id = 'toast'
    this.toastText.className = 'toast-text'
    this.toast.append(this.toastText)
    this.albumHint.id = 'album-hint'
    document.body.append(this.root, this.toast, this.albumHint, this.journal, this.album)
  }

  private buildPanel(): void {
    this.root.id = 'planet-panel'
    this.planetName.className = 'planet-name'

    const row = document.createElement('div')
    row.className = 'item-row'
    this.chip.className = 'chip'
    this.itemName.className = 'item-name'
    this.itemState.className = 'item-state'
    row.append(this.chip, this.itemName, this.itemState)

    this.progress.className = 'progress'
    this.shelf.className = 'shelf'

    for (const scroll of SCROLLS) {
      const button = document.createElement('button')
      button.className = 'scroll-button'
      button.type = 'button'
      button.title = scroll.label
      button.style.setProperty('--ink', `#${scroll.colour.toString(16).padStart(6, '0')}`)
      button.disabled = true
      button.addEventListener('click', () => this.read(scroll.planet))
      this.shelf.append(button)
      this.shelfButtons.set(scroll.planet, button)
    }

    this.root.append(this.planetName, row, this.progress, this.shelf)
  }

  private buildJournal(): void {
    this.journal.id = 'journal'
    this.paper.className = 'paper'

    const head = document.createElement('div')
    head.className = 'paper-head'
    const heading = document.createElement('span')
    heading.textContent = 'scrolls'
    this.count.className = 'paper-count'
    head.append(heading, this.count)

    this.list.className = 'paper-list'
    for (const scroll of SCROLLS) {
      const entry = document.createElement('button')
      entry.className = 'entry'
      entry.type = 'button'
      entry.disabled = true
      entry.style.setProperty('--ink', `#${scroll.colour.toString(16).padStart(6, '0')}`)

      const dot = document.createElement('span')
      dot.className = 'entry-dot'
      const where = document.createElement('span')
      where.className = 'entry-where'
      where.textContent = scroll.label
      const what = document.createElement('span')
      what.className = 'entry-what'
      what.textContent = '· not found'

      entry.append(dot, where, what)
      entry.addEventListener('click', () => this.read(scroll.planet))
      this.list.append(entry)
      this.entries.set(scroll.planet, entry)
    }

    // --- reading view, same sheet
    const reading = document.createElement('div')
    reading.className = 'paper-read'
    this.readTitle.className = 'read-title'
    this.readBody.className = 'read-body'
    const back = document.createElement('button')
    back.className = 'paper-action'
    back.type = 'button'
    back.textContent = '← back'
    back.addEventListener('click', () => this.paper.classList.remove('reading'))
    reading.append(this.readTitle, this.readBody, back)

    const foot = document.createElement('div')
    foot.className = 'paper-foot'
    const startOver = document.createElement('button')
    startOver.className = 'paper-action'
    startOver.type = 'button'
    startOver.textContent = 'start over'
    startOver.title = 'Put every scroll back where it was'
    startOver.addEventListener('click', () => {
      this.onReset?.()
      this.paper.classList.remove('reading')
    })
    const close = document.createElement('button')
    close.className = 'paper-action'
    close.type = 'button'
    close.textContent = 'close  (E)'
    close.addEventListener('click', () => this.close())
    foot.append(startOver, close)

    this.paper.append(head, this.list, reading, foot)
    this.journal.append(this.paper)
    this.paper.addEventListener('click', (e) => e.stopPropagation())
    this.journal.addEventListener('click', () => this.close())
  }

  private buildAlbum(): void {
    this.album.id = 'album-viewer'
    this.albumCard.className = 'album-card'
    this.albumTitle.className = 'album-title'
    this.albumImage.className = 'album-image'
    this.albumImage.alt = 'album photo'
    this.albumIndex.className = 'album-index'
    this.albumPath.className = 'album-path'

    const controls = document.createElement('div')
    controls.className = 'album-controls'

    const prev = document.createElement('button')
    prev.className = 'album-action'
    prev.type = 'button'
    prev.textContent = 'prev'
    prev.addEventListener('click', () => this.stepAlbum(-1))

    const next = document.createElement('button')
    next.className = 'album-action'
    next.type = 'button'
    next.textContent = 'next'
    next.addEventListener('click', () => this.stepAlbum(1))

    const close = document.createElement('button')
    close.className = 'album-action'
    close.type = 'button'
    close.textContent = 'close (Esc)'
    close.addEventListener('click', () => this.close())

    controls.append(prev, next, close)
    this.albumCard.append(this.albumTitle, this.albumImage, this.albumIndex, this.albumPath, controls)
    this.album.append(this.albumCard)
    this.albumCard.addEventListener('click', (e) => e.stopPropagation())
    this.album.addEventListener('click', () => this.close())
  }

  setAlbumHint(planetName: string | null): void {
    if (!planetName || !this.albums.has(planetName)) {
      this.albumHint.classList.remove('on')
      return
    }
    this.albumHint.textContent = `press F to open ${planetName} photo album`
    this.albumHint.classList.add('on')
  }

  openAlbum(planetName: string): boolean {
    const entry = this.albums.get(planetName)
    if (!entry) return false

    this.journal.classList.remove('on')
    this.albumPlanet = planetName
    this.albumPhotoIndex = 0
    this.albumTitle.textContent = entry.title
    this.album.classList.add('on')
    this.open = true
    this.renderAlbumPhoto()
    if (document.pointerLockElement) document.exitPointerLock()
    return true
  }

  private renderAlbumPhoto(): void {
    const entry = this.albums.get(this.albumPlanet)
    if (!entry || entry.photos.length === 0) return
    const total = entry.photos.length
    this.albumPhotoIndex = (this.albumPhotoIndex + total) % total
    const src = entry.photos[this.albumPhotoIndex]
    this.albumImage.src = src
    this.albumIndex.textContent = `${this.albumPhotoIndex + 1} / ${total}`
    this.albumPath.textContent = src
  }

  private stepAlbum(step: number): void {
    const entry = this.albums.get(this.albumPlanet)
    if (!entry || entry.photos.length < 2) return
    this.albumPhotoIndex += step
    this.renderAlbumPhoto()
  }

  /** Open the journal on the list. */
  show(): void {
    this.album.classList.remove('on')
    this.paper.classList.remove('reading')
    this.journal.classList.add('on')
    this.open = true
    // Release the mouse, or the cursor stays captured and nothing is clickable.
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /** Open the journal straight onto one scroll. Ignored if not yet found. */
  read(planet: string): void {
    const entry = this.entries.get(planet)
    if (!entry || entry.disabled) return
    const scroll = SCROLLS.find((s) => s.planet === planet)
    if (!scroll) return

    this.readTitle.textContent = scroll.title
    this.readBody.replaceChildren(
      ...scroll.text.split(/\n\s*\n/).map((para) => {
        const p = document.createElement('p')
        p.textContent = para.trim()
        return p
      }),
    )
    this.paper.classList.add('reading')
    this.journal.classList.add('on')
    this.open = true
    if (document.pointerLockElement) document.exitPointerLock()
  }

  close(): void {
    this.journal.classList.remove('on')
    this.album.classList.remove('on')
    this.albumHint.classList.remove('on')
    this.open = false
  }

  /** E: open the journal, or shut it again. */
  toggle(): void {
    if (this.album.classList.contains('on')) return
    if (this.open) this.close()
    else this.show()
  }

  /** Called every frame; only touches the DOM when something changed. */
  update(planetName: string, items: Collectible[], dt: number): void {
    const item = items.find((i) => i.planet.name === planetName)
    const found = items.filter((i) => i.collected).length
    const state = `${planetName}:${item?.collected}:${found}`

    if (state !== this.shownState) {
      this.shownState = state

      if (item) {
        this.planetName.textContent = item.scroll.label
        this.chip.style.background = `#${item.scroll.colour.toString(16).padStart(6, '0')}`
        this.chip.classList.toggle('found', item.collected)
        this.itemName.textContent = 'a scroll'
        this.itemState.textContent = item.collected ? 'found' : 'somewhere here'
        this.itemState.classList.toggle('found', item.collected)
      } else {
        this.planetName.textContent = planetName
      }

      this.progress.textContent = `${found} of ${items.length} scrolls`
      this.count.textContent = `${found} / ${items.length}`

      for (const i of items) {
        const shelfButton = this.shelfButtons.get(i.planet.name)
        if (shelfButton) shelfButton.disabled = !i.collected

        const entry = this.entries.get(i.planet.name)
        if (entry) {
          entry.disabled = !i.collected
          entry.classList.toggle('found', i.collected)
          const what = entry.querySelector('.entry-what')
          if (what) what.textContent = i.collected ? `· ${i.scroll.title}` : '· not found'
        }
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toast.classList.remove('show')
    }
  }

  announce(item: Collectible): void {
    this.toastText.textContent = `found ${item.scroll.title} — press E to read`
    this.toast.style.color = '#111'
    this.toast.classList.add('show')
    this.toastTimer = 3.2
    this.shownState = ''
  }

  say(text: string, colour = '#111', seconds = 1.8): void {
    this.toastText.textContent = text
    this.toast.style.color = colour
    this.toast.classList.add('show')
    this.toastTimer = Math.max(0.4, seconds)
  }

  /** Forces the next update to rewrite the DOM. */
  invalidate(): void {
    this.shownState = ''
  }
}
