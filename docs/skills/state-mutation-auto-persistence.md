# Skill: State Mutation with Auto-Persistence

**Agent:** Coder
**First Demonstrated:** 2026-02-05
**Success Rate:** 20+ tasks (every state-changing operation uses this pattern)

## Description

A centralized state management pattern where all mutations go through `State.modify()` or `State.set()`, which automatically persist changes to localStorage. Eliminates scattered `localStorage.setItem` calls and ensures consistency.

## Prerequisites

- Centralized `State` module with `data` object
- localStorage available in browser
- All modules agree to use State methods exclusively

## Execution Pattern

### For Mutations (modifying existing data):
```javascript
State.modify('expenses', expenses => {
    expenses.push(newExpense);
    return expenses;
});
```

### For Replacements (setting new value):
```javascript
State.set('expenses', []);
```

### Pattern Implementation:
1. **Call modify/set** - Pass key and mutation function or new value
2. **Module mutates** - State.modify passes current value to callback
3. **Auto-save** - After mutation, State automatically calls `State.save(key)`
4. **localStorage sync** - `State.save()` serializes and writes to localStorage

## Why This Pattern?

Problems with direct localStorage access:
- Forgetting to save after mutation
- Inconsistent serialization
- Race conditions between read/write
- No central place to add logging/validation

State module solves:
- Single source of truth (`State.data`)
- Automatic persistence on every change
- Consistent JSON serialization
- Easy to add middleware (logging, validation)

## Example Applications

### Task 1: Add Expense
```javascript
Expenses.add(e) {
    State.modify('expenses', expenses => {
        expenses.push({ id, description, amount, category, date });
        return expenses;
    });
    Notify.show('Expense added', 'success');
}
```

### Task 2: Delete Debt
```javascript
Debts.delete(id) {
    State.modify('debts', debts => debts.filter(d => d.id !== id));
    Notify.show('Debt deleted', 'success');
}
```

### Task 3: Activate Planned Investment
```javascript
PlannedInvestments.activate(id) {
    const planned = State.data.plannedInvestments.find(p => p.id === id);
    // Add to real investments
    State.modify('investments', investments => {
        investments.push({ ...planned, id: Date.now() });
        return investments;
    });
    // Remove from planned
    State.modify('plannedInvestments', p => p.filter(i => i.id !== id));
}
```

### Task 4: Reset All Expenses
```javascript
Expenses.reset() {
    if (!confirm('Reset all expenses?')) return;
    State.set('expenses', []);
    Notify.show('Expenses reset', 'success');
}
```

## Related Rules

From agents.md Coder Agent:
- "Always use `State.modify(key, fn)` for mutations or `State.set(key, value)` for replacements"
- "Never call `localStorage.setItem` directly for state data"

From claude.md Bug #17:
- "State mutations must use State.modify() or State.set() - never mutate State.data directly without calling State.save()"

---

*Documented: 2026-03-09*
*Reviewed by: Principal.md*
