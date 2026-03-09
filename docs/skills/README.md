# Skills Documentation

This folder contains documented skills demonstrated by the multi-agent system for the Expense Tracker project.

## Skill Documentation Process

Per Principal.md Article IV, skills are documented when:
1. Agent demonstrates the skill successfully in 3+ separate tasks
2. Skill is reusable (not one-off problem solving)
3. Skill is specific enough to be teachable

## Skill Index

| Skill | Agent | Status | Evidence |
|-------|-------|--------|----------|
| [Pattern Replication](./pattern-replication.md) | Coder | Qualified | PlannedExpenses → PlannedDebts/PlannedInvestments |
| [CSS Overflow Debugging](./css-overflow-debugging.md) | Debugger | Qualified | Investment projection, tooltip clipping |
| [Six-Pass Column Detection](./six-pass-column-detection.md) | Coder | Qualified | Parser module implementation |
| [State Mutation with Auto-Persistence](./state-mutation-auto-persistence.md) | Coder | Qualified | State.modify/State.set pattern |
| [Event Delegation Routing](./event-delegation-routing.md) | Coder | Qualified | App.setupEventDelegation() |

## Candidate Skills (Not Yet Qualified)

Skills observed but not yet meeting the 3-task threshold:

| Skill | Agent | Tasks Observed | Notes |
|-------|-------|----------------|-------|
| Toast Notification Integration | Coder | 2 | Notify.show() pattern |
| Null Safety Pattern | Debugger | 1 | 14 null pointer bugs fixed in single session |
| Country Profile System | Coder | 1 | Nudges.countryProfiles implementation |

---

*Last updated: 2026-03-09*
*Governed by: Principal.md Article IV*
