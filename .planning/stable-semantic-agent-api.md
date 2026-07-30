Yes — this is a great instinct. Textcontent-scanning is slow and brittle because every call re-walks the DOM and re-derives intent from rendered text. The fix is to give the agent a stable, semantic API that bypasses DOM querying entirely and lets you batch commands in one round trip.

Here's the pattern I'd use:

## 1. A tiny global "agent bridge" (dev-only)

```js
// src/agentBridge.js
if (typeof window !== 'undefined') {
  window.__agent = window.__agent || {
    registry: new Map(),
    register(name, fn) {
      this.registry.set(name, fn);
    },
    unregister(name) {
      this.registry.delete(name);
    },
    async run(commands) {
      const results = [];
      for (const cmd of commands) {
        try {
          const fn = this.registry.get(cmd.target);
          if (!fn) {
            results.push({ ...cmd, ok: false, error: 'not registered' });
            continue;
          }
          fn(cmd.value);
          // let React flush state + re-render before the next command
          await new Promise(r => setTimeout(r, 0));
          results.push({ ...cmd, ok: true });
        } catch (e) {
          results.push({ ...cmd, ok: false, error: String(e) });
        }
      }
      return results;
    },
  };
}
```

## 2. A hook that registers actions directly (no DOM lookup at all)

```jsx
function useAgentAction(name, handler) {
  useEffect(() => {
    window.__agent?.register(name, handler);
    return () => window.__agent?.unregister(name);
  }, [name, handler]);
}

function Toolbar() {
  const handleClickDSL = () => setView('dsl');
  useAgentAction('click-dsl', handleClickDSL);

  return <button onClick={handleClickDSL}>DSL</button>;
}
```

Now the agent doesn't search for a button by text — it calls the same function the click handler calls, directly:

```js
window.__agent.run([{ target: 'click-dsl' }])
```

And it can batch a whole sequence in one JS eval call and get all results back together:

```js
window.__agent.run([
  { target: 'click-dsl' },
  { target: 'type-query', value: 'SELECT * FROM x' },
  { target: 'click-run' },
])
```

This solves both your problems at once: no fragile selectors (registry keys are just names you choose), and no per-step round trips (one eval, one result array).

## If you don't want to touch component internals

A lighter-weight version: just make sure everything the agent needs to click has a stable `data-testid`, and swap the driver script from textContent-matching to attribute lookup:

```js
document.querySelector('[data-testid="dsl-button"]')?.click()
```

This alone is much faster and more reliable than `Array.from(...).find(textContent...)`, though it doesn't get you the batching win.

## A couple of practical notes

- **Gate it**: wrap the bridge in `if (process.env.NODE_ENV !== 'production')` or an env flag so it never ships to prod.
- **Timing**: the `setTimeout(r, 0)` between commands gives React a chance to flush state before the next command runs — important if step 2 depends on step 1's re-render. If you're on React 18 you can also wrap handler calls in `flushSync` for a more deterministic guarantee.
- **Failures**: because `run` catches errors per-step, one bad command doesn't kill the whole batch — the agent gets a results array showing exactly which step failed, which is much easier to debug than a thrown exception mid-sequence.
- **Read state too**: it's worth adding a `window.__agent.getState()` (or similar) that returns whatever's relevant — current view, form values, error messages — so the agent can verify outcomes without screenshotting or re-querying the DOM.

This turns your agent's UI verification loop from "guess a selector, click, hope it works" into "call a named action, get a structured result" — which is both faster and much less flaky.