# Skill: Event Delegation Routing

**Agent:** Coder
**First Demonstrated:** 2026-02-05
**Success Rate:** 30+ tasks (every interactive element uses this pattern)

## Description

A centralized event handling pattern using a single `document.body` click listener that routes actions based on `data-action` and `data-id` attributes. Eliminates inline onclick handlers and window.* global functions.

## Prerequisites

- Single event listener on document.body
- HTML elements with `data-action` attribute for action type
- HTML elements with `data-id` attribute for entity identification
- Switch/case routing in App.setupEventDelegation()

## Execution Pattern

### Adding a New Action:

1. **Add HTML attributes:**
```html
<button data-action="delete-expense" data-id="${expense.id}">Delete</button>
```

2. **Add case to switch:**
```javascript
case 'delete-expense':
    Expenses.delete(parseInt(e.target.dataset.id));
    break;
```

### Pattern Flow:
1. User clicks element
2. `document.body` click listener fires
3. `e.target.closest('[data-action]')` finds action element
4. Switch routes to correct handler
5. Handler extracts `data-id` if needed
6. Module method executes

## Why This Pattern?

Problems with inline handlers:
- `onclick="deleteExpense(5)"` pollutes global scope
- `window.deleteExpense = ...` creates global functions
- Can't easily track all handlers
- CSP violations in strict environments

Event delegation solves:
- No global functions
- All handlers in one place
- Easy to audit all actions
- Works with dynamically added elements
- Single listener instead of many

## Example Applications

### Task 1: Expense CRUD Actions
```javascript
// HTML
<button data-action="edit-expense" data-id="${id}">Edit</button>
<button data-action="delete-expense" data-id="${id}">Delete</button>
<button data-action="cancel-edit-expense" data-id="${id}">Cancel</button>
<button data-action="save-edit-expense" data-id="${id}">Save</button>

// JS Switch cases
case 'edit-expense': Expenses.startEdit(id); break;
case 'delete-expense': Expenses.delete(id); break;
case 'cancel-edit-expense': Expenses.cancelEdit(id); break;
case 'save-edit-expense': Expenses.saveEdit(id); break;
```

### Task 2: Planned Items Actions
```javascript
// Three modules, same pattern
case 'activate-planned-expense': PlannedExpenses.activate(id); break;
case 'delete-planned-expense': PlannedExpenses.delete(id); break;
case 'activate-planned-debt': PlannedDebts.activate(id); break;
case 'delete-planned-debt': PlannedDebts.delete(id); break;
case 'activate-planned-investment': PlannedInvestments.activate(id); break;
case 'delete-planned-investment': PlannedInvestments.delete(id); break;
```

### Task 3: Tab Navigation
```javascript
case 'switch-tab':
    const tabId = e.target.dataset.tab;
    Navigation.switchTo(tabId);
    break;
```

## Action Types in Codebase

From index.html and app.js:
- `switch-tab` - Navigation
- `edit-expense`, `delete-expense`, `cancel-edit-expense`, `save-edit-expense` - Expense CRUD
- `delete-debt` - Debt management
- `delete-investment` - Investment management
- `delete-income` - Income management
- `delete-upload` - Upload history
- `activate-planned-*`, `delete-planned-*` - Planned items (3 types)
- `reset-expenses`, `reset-debts`, `reset-investments` - Data reset
- `toggle-layout` - Layout switching

## Related Rules

From agents.md Coder Agent:
- "Use event delegation. New interactive buttons must use data-action/data-id attributes and a corresponding case in App.setupEventDelegation()"
- "Never use inline onclick"

From claude.md Bug #16:
- "Event delegation requires data-action - when adding new interactive buttons, add data-action='action-name' and data-id='${id}' attributes"

---

*Documented: 2026-03-09*
*Reviewed by: Principal.md*
