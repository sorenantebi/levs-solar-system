/**
 * The scrolls — one per planet, and the words on them.
 *
 * This is the only place the text lives. Write yours over the placeholders
 * below; nothing else needs touching. Blank lines start a new paragraph.
 */

export interface ScrollText {
  /** Must match the planet's name in planets.ts. */
  planet: string
  /** Shown as the heading of that planet's panel. */
  label: string
  /** The scroll's own title, shown when you open it. */
  title: string
  /** The words. Use a blank line between paragraphs. */
  text: string
  /** Ribbon colour on the scroll, and its dot in the shelf. */
  colour: number
}

export const SCROLLS: ScrollText[] = [
  {
    planet: 'start',
    label: 'Start',
    title: 'The First Scroll',
    colour: 0xff8f7a,
    text: "Dear Levia, I can't believe it's been 3 years already. I made this game as a small trip down memory lane and a collection of everything I love about you. Collect the scrolls on each planet in the correct order (you will have to figure out the order based on the planet names), and look at the photo albums on each planet as well. Have fun!! I love you <3",
  },
  {
    planet: 'arrakis',
    label: 'Arrakis',
    title: 'The Second Scroll',
    colour: 0xffcf6a,
    text: 'I love watching Better Call Saul and anime and better late than single with you and PROJECT HAIL MARY. I cant wait to watch Dune later this year!\n\n### This is a coupon for IMAX Dune 3 Tickets ###',
  },
  {
    planet: 'freljord',
    label: 'Freljord',
    title: 'The Third Scroll',
    colour: 0xffe066,
    text: 'I love gaming with you. I love playing minecraft and tft and BLOONS with you. I love spending my evenings with you. \n\n### Coupon for any small game that you want ###',
  },
  {
    planet: 'hoenn',
    label: 'Hoenn',
    title: 'The Fourth Scroll',
    colour: 0x8fd0ee,
    text: 'I love traveling with you and exploring fun places together. I love collecting pokemon cards with you and going to TCG places. I cant wait to open up cards later YIPEEE',
  },
  {
    planet: 'lover',
    label: 'Lover',
    title: 'The Fifth Scroll',
    colour: 0xf5aecb,
    text: 'I love you even though YOU PLAY KPOP AND TAYLOR SWIFT IN THE CAR.',
  },
  {
    planet: 'minecraft',
    label: 'Minecraft',
    title: 'The Sixth Scroll',
    colour: 0x5ce6e0,
    text: 'I love building my life with you and look forward to everything we build in the future together.',
  },
  {
    planet: 'silly',
    label: 'Silly',
    title: 'The Seventh Scroll',
    colour: 0xc79bff,
    text: 'I LOVE WHEN UR SILLY',
  },
  {
    planet: 'home',
    label: 'Home',
    title: 'The Eighth Scroll',
    colour: 0x9ad978,
    text: 'I love you very, very much. AND I LOVE EATIN WITH YOU. AND HANGING OUT WITH U \n\n### COUPON FOR TONIGHTS EVENT ###',
  },
]
