import { describe, expect, it } from 'vitest';
import { loadModule } from './load';

const SETTLEMENT = `
# faction player

# entity player
faction: player

# location yard
x: 0, y: 0
starting

# damage-type fire

# damage-type cold
`;

describe('a conversion cycle is refused at load', () => {
  it('refuses two stats that convert each other, naming both', () => {
    expect(() =>
      loadModule(`${SETTLEMENT}
# stat fire-to-cold
converts: fire to cold

# stat cold-to-fire
converts: cold to fire
`),
    ).toThrow(/fire-to-cold[\s\S]*cold-to-fire|cold-to-fire[\s\S]*fire-to-cold/);
  });

  it('refuses a stat that converts a type to itself', () => {
    expect(() =>
      loadModule(`${SETTLEMENT}
# stat fire-to-fire
converts: fire to fire
`),
    ).toThrow(/fire-to-fire/);
  });

  it('takes a chain that never comes back round', () => {
    expect(() =>
      loadModule(`${SETTLEMENT}
# damage-type lightning

# stat fire-to-cold
converts: fire to cold

# stat cold-to-lightning
converts: cold to lightning
`),
    ).not.toThrow();
  });
});

describe('a cap cycle is refused at load', () => {
  it('refuses two stats that cap each other, naming both', () => {
    expect(() =>
      loadModule(`${SETTLEMENT}
# stat heat
at most: warmth

# stat warmth
at most: heat
`),
    ).toThrow(/heat[\s\S]*warmth|warmth[\s\S]*heat/);
  });

  it('refuses a stat that caps itself', () => {
    expect(() =>
      loadModule(`${SETTLEMENT}
# stat heat
at most: heat
`),
    ).toThrow(/heat/);
  });
});

describe('a stat has one role in a swing', () => {
  it('refuses a stat that both deals and resists', () => {
    expect(() =>
      loadModule(`${SETTLEMENT}
# stat ember
deals: fire
resists: cold
`),
    ).toThrow(/deals and resists/);
  });
});
