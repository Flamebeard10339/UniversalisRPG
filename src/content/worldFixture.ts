// The furniture a test world needs before it can say anything of its own: somewhere to stand, two
// stats with a passive apiece, and one item that does nothing. A test declares what it is about
// after this. It is not under `content/`, so no shipped entry point can reach it.
export const FIXTURE_WORLD = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# stat attack
base: 4

# passive hale
+10 max-health

# passive keen
+4 attack

# item rope

`;
