# Task List

This file documents active tasks for the UniversalisRPG project. All agents have access to this file and should reference it when starting work.

**How to use this file:**
- Each task is marked with a ## heading
- Check the Recommended Branch section to see what branch this task should be worked on
- Read through the goal, current behavior, required behavior, and acceptance criteria before starting
- Update this file with progress or mark tasks as completed

---

## 1. Integrate travel time and restrictions into auto-generated adjacent travel actions

**branch:** `feature/travel-time-restrictions`

**Status:** pending

### Goal

Make auto-generated travel actions from DSL `adjacent:` blocks conform to the travel system's restrictions, costs, and time calculations rather than being instant relocates.

### Current Behavior

Auto-generated "Leave" actions (compiled in `src/game/contentDsl/compiler.ts:370-382`) are simple instant relocations:
- ID: `adjacent-{sourceLocationId}-to-{targetLocationId}`
- Single `relocate` result with no time/cost
- Title: "Leave", Description: "Leave."
- No interaction type, no rewards, no travel time

### Required Behavior

#### Travel Time Calculation

- Use `computeTravelSeconds()` logic: `distance / (movementSpeed / 60)`
- Distance = grid distance between x/y positions * `distanceBetweenAdjacentTiles` manifest setting
- Movement speed = character stat lookup on `movement-speed` (defaults to 60)
- Travel time should be encoded in the action (via interaction type duration or explicit travel duration field)

#### Travel Restrictions

- Respect location discovery (fog of war) — only available if target already discovered
- Respect `visibleWhen` conditions on the action (already supported in compiler, line 380)
- Actions must satisfy `isPureTravelAction()` check (no rewards, only relocate+chat results, no interaction/experience)

#### UX/Feedback Guarantees

- Action localization should indicate travel time to player (e.g., "Leave [~2 min travel]")
- Localization key pattern: `action.{actionId}.travelTimeSeconds` or similar for UI to format duration
- Consider floating text or UI affordance during travel (may require separate work)

### Technical Context

**Movement Speed:** Stat ID `movement-speed`, defaults to 60. Looked up via `getCharacterStatValue()` considering items, stat modifiers, etc.

**Distance Calculation:**
```
gridDistance = sqrt((toX - fromX)² + (toY - fromY)²)
travelSeconds = (gridDistance * distanceBetweenAdjacentTiles) / (movementSpeed / 60)
```

**Manifest Settings:** `distanceBetweenAdjacentTiles` (physics scale), `travelPathMaxSeconds`/`travelPathMaxNodes` (pathfinding limits)

**Location Data:** Positions defined as `x`, `y`, `z` in DSL location header; accessible via `LocationNode.position`

**Pathfinding:** `findTravelPath()` uses Dijkstra with travel time as edge weight, respects fog-of-war (discovered locations), caps searches at manifest limits

**Files involved:**
- `src/game/contentDsl/compiler.ts` (lines 370-382)
- `src/game/travel.ts`
- `src/game/actionLocalization.ts`
- `src/game/types.ts`

### Acceptance Criteria

1. Auto-generated travel actions encode travel time (duration field or via action metadata)
2. Action localization includes estimated travel time in description
3. Travel time is calculated based on character movement speed and grid distance
4. Actions are unavailable if target location not yet discovered (fog of war)
5. Actions remain pure travel (pass `isPureTravelAction()` check)
6. Existing `adjacent:` DSL declarations continue to work without changes
7. All headless playtests pass (travel system integration doesn't break validation)
8. Manual testing confirms travel time is accurate and displayed to player
