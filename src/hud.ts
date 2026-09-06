import { Collectible } from './items'

/**
 * The per-planet panel. It always shows the world you are standing on and the
 * one keepsake that belongs to it, so the display is a property of where you
 * are rather than a global inventory list.
 */
export class Hud {
  private readonly root = document.createElement('div')
  private readonly planetName = document.createElement('div')
  private readonly chip = document.createElement('span')
  private readonly itemName = document.createElement('span')
  private readonly itemState = document.createElement('span')
  private readonly progress = document.createElement('div')
  private readonly toast = document.createElement('div')

  private shownPlanet = ''
  private shownState = ''
  private toastTimer = 0

  constructor() {
    this.root.id = 'planet-panel'
    this.planetName.className = 'planet-name'

    const row = document.createElement('div')
    row.className = 'item-row'
    this.chip.className = 'chip'
    this.itemName.className = 'item-name'
    this.itemState.className = 'item-state'
    row.append(this.chip, this.itemName, this.itemState)

    this.progress.className = 'progress'
    this.root.append(this.planetName, row, this.progress)

    this.toast.id = 'toast'
    document.body.append(this.root, this.toast)
  }

  /** Called every frame; only touches the DOM when something actually changed. */
  update(planetName: string, items: Collectible[], dt: number): void {
    const item = items.find((i) => i.planet.name === planetName)
    const state = `${planetName}:${item?.collected}`
    if (state !== this.shownState) {
      this.shownState = state
      this.shownPlanet = planetName

      this.planetName.textContent = item ? item.label : planetName
      if (item) {
        this.chip.style.background = `#${item.colour.toString(16).padStart(6, '0')}`
        this.chip.classList.toggle('found', item.collected)
        this.itemName.textContent = item.name
        this.itemState.textContent = item.collected ? 'found' : 'somewhere here'
        this.itemState.classList.toggle('found', item.collected)
      }

      const found = items.filter((i) => i.collected).length
      this.progress.textContent = `${found} of ${items.length} keepsakes`
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toast.classList.remove('show')
    }
  }

  announce(item: Collectible): void {
    this.toast.textContent = `found ${item.name}`
    this.toast.style.color = `#${item.colour.toString(16).padStart(6, '0')}`
    this.toast.classList.add('show')
    this.toastTimer = 2.6
    // Force the panel to refresh on the next update.
    this.shownState = ''
    void this.shownPlanet
  }
}
