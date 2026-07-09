# Inline Conditional Text Migration

## Summary
Moved conditional text evaluation from compile-time (2^n variant expansion) to runtime, eliminating exponential duplication and associated locale key validation warnings.

## Problem
Previously, DSL actions with inline conditionals in `say:` tags (e.g., `say: text with {flag: conditional}`) were expanded into 2^n action variants at compile time:
- A single `examine:` line with 3 fragments referencing 2 distinct flags generated 4 separate action variants (examine, examine-2, examine-3, examine-4)
- Each variant had its own locale keys (chat.entity.drawer.examine, chat.entity.drawer.examine-2, etc.)
- Missing localization warnings for generated variants that might never be visible

## Solution
Introduced runtime conditional text evaluation via new `conditional-chat` ActionResult kind:

### Changes Made

#### 1. Type System (src/game/types.ts)
- Added `ConditionalTextFragment` type: either `{kind: 'literal', text}` or `{kind: 'conditional', condition, text}`
- Added `ConditionalText` type: array of ConditionalTextFragment
- Added new ActionResult kind: `{kind: 'conditional-chat', fragments: ConditionalText, delaySeconds?}`

#### 2. Compiler (src/game/contentDsl/compiler.ts)
- Removed 2^n variant expansion via `allAssignments()` function
- Actions now compile to single variant instead of multiple variants
- Added `toConditionalText()` to convert DslText (DSL AST) to ConditionalText (runtime format)
- Modified `tagToActionResult()` to:
  - Detect if `say:` tag has conditionals via `hasConditionals()`
  - Create `conditional-chat` ActionResult if conditionals exist
  - Create regular `chat` ActionResult (with locale key) for plain text

#### 3. Runtime Evaluation (src/game/conditionalText.ts - NEW)
- Added `renderConditionalText()` function to evaluate conditional text fragments at runtime
- Uses existing `evaluateCondition()` to check each fragment's condition against game state

#### 4. Action Result Processing (src/game/timers.ts)
- Updated `applyActionResult()` to handle `conditional-chat` kind
- Evaluates conditional text at moment of action completion
- Renders to direct text (not locale key) in chat message

#### 5. Validation (src/game/validators.ts)
- Added `validateConditionalTextFragmentShape()` to validate fragment structure
- Added `validateConditionalTextShape()` to validate fragment arrays
- Updated `validateActionResultShape()` to validate `conditional-chat` ActionResult

#### 6. Tests (src/game/contentDsl/compiler.test.ts)
- Updated test: "evaluates inline conditionals in say: tags at runtime via conditional-chat ActionResult"
- Now verifies single action variant with conditional-chat result instead of 4 variants
- Added `renderConditionalTextTest()` helper to evaluate conditional text in tests

## Results
✅ All 374 tests pass
✅ Single action variant per DSL action (instead of 2^n)
✅ No duplicate locale key generation
✅ No more "Missing localization" warnings for generated variants
✅ Conditional text evaluated at runtime using live game state
✅ Backward compatible: plain `say:` tags still generate locale keys

## Example
**Before:**
```
examine:
  {coins-taken & lockpick-taken: A drawer full of random junk.}
  {!coins-taken: You see some coins on the bottom.}
  {!lockpick-taken: You see a set of worn lockpicks at the bottom.}
  {!coins-taken & !lockpick-taken: coins and a worn set of lockpicks tucked in the back}
```
Generated: 4 actions (examine, examine-2, examine-3, examine-4) with separate locale keys

**After:**
```
Same DSL, generates: 1 action with conditional-chat result
Runtime evaluation renders appropriate text based on current flag state
```
