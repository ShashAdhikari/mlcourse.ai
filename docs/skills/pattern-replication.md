# Skill: Pattern Replication

**Agent:** Coder
**First Demonstrated:** 2026-02-07
**Success Rate:** 3/3 tasks

## Description

Identify an existing, well-tested module pattern and replicate it for new modules with minimal deviation. This ensures consistency, reduces bugs, and accelerates development.

## Prerequisites

- Existing module with clear structure (render, add, delete, activate methods)
- New module requires similar functionality
- State management follows established patterns

## Execution Pattern

1. **Identify source pattern** - Find a working module with similar requirements (e.g., PlannedExpenses)
2. **Map functionality** - List all methods and their purposes
3. **Copy structure** - Replicate the module skeleton with new names
4. **Adapt fields** - Change field names to match new domain (expenses → debts, investments)
5. **Wire events** - Add new data-action handlers to App.setupEventDelegation()
6. **Test cycle** - Verify add/render/activate/delete cycle works

## Example Applications

### Task 1: PlannedDebts Module
- **Source:** PlannedExpenses module
- **Adapted:** Fields for debt-specific data (balance, interestRate, minimumPayment, type, plannedStart)
- **Actions:** add-planned-debt, activate-planned-debt, delete-planned-debt
- **Outcome:** PASS - Full CRUD cycle working, persisted to localStorage

### Task 2: PlannedInvestments Module
- **Source:** PlannedExpenses module
- **Adapted:** Fields for investment data (amount, type, expectedReturn, contribution, plannedStart)
- **Actions:** add-planned-investment, activate-planned-investment, delete-planned-investment
- **Outcome:** PASS - Full CRUD cycle working, persisted to localStorage

### Task 3: Dashboard Planned Summary
- **Source:** Individual planned item rendering patterns
- **Adapted:** Aggregation view combining all three planned types
- **Outcome:** PASS - Summary card shows counts and totals for all planned items

## Code Evidence

```javascript
// Pattern from PlannedExpenses replicated to PlannedDebts
const PlannedDebts = {
    render() { ... },
    add(e) { ... },
    activate(id) { ... },
    delete(id) { ... },
    getTotalPlanned() { ... }
};
```

---

*Documented: 2026-03-09*
*Reviewed by: Principal.md*
