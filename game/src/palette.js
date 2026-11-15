// The look plan, in one place. Emberline is a decommissioned emberworks at dusk:
// warm sodium light against cold slate, one amber accent. The same names are the CSS
// custom properties in index.html. Team colours live here too, so the HUD, the bots
// and the map never disagree about which side is which.
export const PALETTE = {
  canvas: '#191512',
  surface: '#23201c',
  hairline: '#35302a',
  ink: '#ece5d8',
  muted: '#9a938a',
  accent: '#f08a1d',
  ember: '#f08a1d',
  slate: '#5d7ea6',
  floor: '#3b332b',
  wall: '#52483c',
  crate: '#4a3d2c',
  steel: '#3d454c',
  danger: '#d8442e',
  good: '#7fb069',
};

export const TEAM = {
  ember: { name: 'EMBER', color: 0xf08a1d, css: '#f08a1d', dark: 0x8a4d0d },
  slate: { name: 'SLATE', color: 0x5d7ea6, css: '#7ba7d4', dark: 0x2c4258 },
};

export function shade(name) {
  return PALETTE[name];
}
