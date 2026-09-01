import type { ModuleSource } from '../content/universe';

export const FIXTURE_DSL = `
# location keep
x: 0, y: 0
starting
entities:
  warden

# location yard
x: 1, y: 0
adjacent:
  keep

# entity warden
title: Warden with a Sword
poke:
  say: Nothing here.

# entity raider
title: Raider with a Sword

# item sword
title: Sword

# item shield
title: Shield

# dialogue warden-chat
owner = warden

node greeting:
  always
  Halt! Who goes there?
  -> Move along.

# stat might
base: 1
`;

export const FIXTURE_SOURCES: ModuleSource[] = [{ name: 'fixture', text: FIXTURE_DSL }];
