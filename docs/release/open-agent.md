## The dev server's port is written three times and defaulted a fourth

`.claude/launch.json:8-9` pins 5173 twice, `package.json`'s `dev:android` waits on
`http://localhost:5173`, and `capacitor.config.ts:11` points the emulator at
`http://10.0.2.2:5173` — none of which chose the number. `npm run dev` names no port at all,
so what all three are copies of is Vite's own default, and moving off it breaks the two that
are not `launch.json`, silently and only under `dev:android`.

`run-web.cmd`'s 5174 is not one of these: it is a second, deliberate fact and now says so
where a reader will find it.

*Closes when:* one file states the port the dev server listens on and the other two are read
from it — `vite.config.ts`'s `server.port` is the candidate, since it is what would stop the
number being a default nobody wrote — or the three are each annotated as copies of Vite's
default and of nothing in this repository.
