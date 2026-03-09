# Skill: CSS Overflow Debugging

**Agent:** Debugger
**First Demonstrated:** 2026-02-07
**Success Rate:** 3/3 tasks

## Description

Systematically identify and fix CSS overflow issues where content exceeds container boundaries. Uses a combination of overflow properties, word-break rules, and container constraints.

## Prerequisites

- Visual symptom: content spills outside container
- Understanding of CSS box model
- Knowledge of overflow, word-break, and white-space properties

## Execution Pattern

1. **Identify symptom** - Content visually overflows container boundaries
2. **Trace container hierarchy** - Find parent elements with fixed dimensions or overflow constraints
3. **Check content type** - Is it text, numbers, or block elements?
4. **Apply appropriate fix:**
   - For text: `word-break: break-word` or `overflow-wrap: break-word`
   - For block content: `overflow: hidden` or `overflow-x: auto`
   - For nested scrolling: `overflow-y: auto` with max-height
5. **Verify tooltip/popup impact** - Ensure `overflow: hidden` doesn't clip absolutely-positioned children
6. **Test at boundaries** - Use extreme values to confirm fix

## Example Applications

### Task 1: Investment Projection Overflow
- **Symptom:** Large projection values overflowed card boundaries
- **Root cause:** No overflow constraints on .projection-card
- **Fix:**
  - `.projection-card { overflow: hidden }`
  - `#projection-details { overflow-x: auto }`
  - `.projection-value { word-break: break-word }`
- **Outcome:** PASS - Values contained within cards

### Task 2: Tooltip Clipping
- **Symptom:** Tooltips cut off by parent container's overflow: hidden
- **Root cause:** Absolutely-positioned tooltips clipped by ancestor overflow
- **Fix:** Changed `overflow: hidden` to `overflow: visible` on containers with tooltips
- **Outcome:** PASS - Tooltips fully visible

### Task 3: Expense List Card Height
- **Symptom:** Long expense lists overflow card on mobile
- **Root cause:** Fixed height without scroll
- **Fix:** `max-height: 400px; overflow-y: auto` on expense list container
- **Outcome:** PASS - Scrollable list within fixed card

## Common Bug: Bug #19, Bug #26

From claude.md:
- Bug #19: "Projection card overflow - Investment projection values can overflow card boundaries"
- Bug #26: "Tooltip overflow clipping - Parent elements with overflow: hidden clip absolutely-positioned tooltips"

---

*Documented: 2026-03-09*
*Reviewed by: Principal.md*
