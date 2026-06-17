# Feature Roadmap: Financial Projections Enhancement

## Executive Summary

5 features to implement comprehensive financial projection capabilities:

1. **Enhanced Yearly Projection** - Income/expense projection with net savings, auto-updates on payslip upload
2. **Planned Expenditures** - Add future expenses that dynamically update projections
3. **Debt Projection** - Principal/interest breakdown, amortization schedule, future borrowing
4. **Investment Projection** - 10-year projections, adjustable returns, future investments
5. **Month Recognition** - Parser detects months from uploads for accurate projections

---

## Dependency Analysis

```
Feature 5 (Month Recognition)
        ↓
Feature 1 (Enhanced Yearly Projection) ←──┐
        ↓                                  │
Feature 2 (Planned Expenditures) ──────────┤
        ↓                                  │
Feature 3 (Debt Projection) ───────────────┤
        ↓                                  │
Feature 4 (Investment Projection) ─────────┘
```

**Critical Path:** Feature 5 → Feature 1 → Features 2/3/4 (parallel)

---

## Feature Breakdown

### Feature 5: Month Recognition in Parser (FOUNDATION - Do First)

**Priority:** P0 (Blocker for all other features)
**Complexity:** Medium
**Agents:** Designer → Coder → Reviewer → Tester

**Current State:**
- Expenses store `date: "YYYY-MM-DD"` but no explicit month field
- `Dashboard.getMonthlyBreakdown()` extracts month via `date.substring(0, 7)`
- Parser detects date column but not month column separately
- Incomes have no date - stored as flat monthly amounts

**Required Changes:**

1. **Enhance Parser column detection** (app.js ~Lines 280-340)
   - Add Pass 6 for month column: `/\b(month|period|statement)\b/i`
   - If month column found, extract month value alongside date
   - Store as `monthKey: "YYYY-MM"` on each transaction

2. **Update transaction object shape**
   ```javascript
   {
     id, date, description, amount, category,
     monthKey: "YYYY-MM"  // NEW: explicit month from upload or derived from date
   }
   ```

3. **Update income data structure**
   ```javascript
   {
     id, source, amount, type,
     monthKey: "YYYY-MM",     // NEW: when this income applies
     isRecurring: boolean     // NEW: true = repeats monthly
   }
   ```

4. **Derive month from date if no month column**
   - In `Parser.parseRows()`, set `monthKey = date.substring(0, 7)` if no explicit month

**Acceptance Criteria:**
- [x] Parser detects month column in bank statements
- [x] Transactions have `monthKey` field populated
- [x] Incomes can be assigned to specific months
- [x] Existing expense filtering still works
- [x] Monthly analytics uses `monthKey` for grouping

---

### Feature 1: Enhanced Yearly Projection on Dashboard

**Priority:** P0
**Complexity:** Large
**Agents:** UI + UX (parallel) → Designer → Coder → Reviewer → Tester
**Dependencies:** Feature 5 (Month Recognition)

**Current State:**
- `Dashboard.renderYearlyProjection()` shows 12-month table
- Uses `avgMonthlyExpense` for future months
- No net savings calculation
- Doesn't update on payslip upload

**Required Changes:**

1. **New Dashboard section: Financial Forecast Card** (index.html)
   - Position: Top of dashboard, full-width
   - Show: Projected Annual Income, Projected Annual Expenses, Net Savings Estimate
   - Visual: Progress bar or gauge for savings rate

2. **Enhanced projection logic** (app.js Dashboard module)
   ```javascript
   Dashboard.calculateYearlyForecast() {
     // For each remaining month:
     // - Use actual data if available (from monthKey)
     // - Use average of past N months for projection
     // - Factor in recurring incomes
     // - Factor in planned expenditures (Feature 2)
   }
   ```

3. **Auto-update on payslip upload**
   - In `Upload.processFile()`, after payslip detection, call `Dashboard.update()`
   - If income added, recalculate projections immediately
   - Show toast: "Projections updated with new income data"

4. **Projection accuracy indicator**
   - Show confidence level based on data availability
   - "Based on X months of data" label
   - Warning if <3 months of data

**Acceptance Criteria:**
- [x] Dashboard shows annual income/expense/savings projection
- [x] Projection updates automatically when payslip uploaded
- [x] Monthly breakdown shows actual vs projected clearly
- [x] Net savings estimate calculated correctly
- [x] Confidence indicator based on data availability

---

### Feature 2: Planned/Future Expenditures

**Priority:** P1
**Complexity:** Medium
**Agents:** UI + UX (parallel) → Designer → Coder → Reviewer → Tester
**Dependencies:** Feature 1 (for projection integration)

**Required Changes:**

1. **New data structure** (app.js State module)
   ```javascript
   State.data.plannedExpenses = [
     {
       id: string,
       description: string,
       amount: number,
       category: string,
       plannedDate: "YYYY-MM-DD",  // When expense is expected
       isRecurring: boolean,       // Repeats monthly?
       recurringEndDate: string,   // Optional: when recurring stops
       status: "planned|completed|cancelled"
     }
   ]
   ```

2. **New UI section in Expenses tab**
   - Collapsible "Planned Expenses" card below expense list
   - Form: Description, Amount, Category, Date, Recurring toggle
   - List with status badges, edit/delete actions
   - "Mark as Completed" action (moves to regular expenses)

3. **Projection integration**
   - `Dashboard.calculateYearlyForecast()` includes planned expenses
   - Show planned expenses in yearly projection table (different styling)
   - Recalculate projections when planned expenses change

4. **Recurring expense expansion**
   - If `isRecurring: true`, generate entries for future months
   - Stop at `recurringEndDate` or 12 months ahead

**Acceptance Criteria:**
- [x] Can add planned expenses with future dates
- [x] Planned expenses appear in projections
- [x] Recurring expenses expand into multiple months
- [x] Can mark planned expense as completed
- [x] Projections update dynamically when planned expenses change

---

### Feature 3: Debt Projection with Amortization

**Priority:** P1
**Complexity:** Large
**Agents:** UI + UX (parallel) → Designer → Coder → Reviewer → Tester
**Dependencies:** Feature 1 (for projection integration)

**Current State:**
- `Debts.calculateTimeline()` calculates months to payoff
- Shows total interest but not per-month breakdown
- No amortization schedule
- No future borrowing capability

**Required Changes:**

1. **Enhanced debt data structure**
   ```javascript
   State.data.debts = [
     {
       id, name, balance, rate, minimum, type,
       startDate: "YYYY-MM-DD",     // NEW: when debt started
       status: "active|planned"      // NEW: planned = future borrowing
     }
   ]
   ```

2. **Amortization schedule calculation**
   ```javascript
   Debts.generateAmortization(debtId) {
     // Returns array of monthly entries:
     return [
       {
         month: 1,
         payment: 500,
         principal: 350,
         interest: 150,
         remainingBalance: 9650
       },
       // ... for each month until paid off
     ]
   }
   ```

3. **New UI: Debt Projection Card**
   - 12-month projection table showing:
     - Month | Payment | Principal | Interest | Remaining Balance
   - Toggle between individual debt view and aggregate view
   - Chart: Principal vs Interest over time (stacked area)

4. **Future/Planned Borrowing**
   - Form to add planned debt with future start date
   - "Potential Loan Calculator" - input amount, rate, term
   - Shows impact on monthly cash flow and total interest
   - Planned debts shown differently (dashed border)

5. **Projection integration**
   - Monthly debt payments factored into expense projections
   - Show "Debt-Free Date" estimate
   - Warning if debt payments exceed income

**Acceptance Criteria:**
- [x] Each debt shows principal/interest breakdown per month
- [x] 12-month amortization schedule displayed
- [x] Can add planned/future debts
- [x] Planned debts affect projections before start date
- [x] Aggregate view shows total debt trajectory
- [x] Debt-free date calculated and displayed

---

### Feature 4: Enhanced Investment Projections

**Priority:** P1
**Complexity:** Large
**Agents:** UI + UX (parallel) → Designer → Coder → Reviewer → Tester
**Dependencies:** Feature 1 (for projection integration)

**Current State:**
- `Investments.generateProjection()` projects based on risk tolerance
- Uses fixed rates: conservative 6%, moderate 8%, aggressive 10%
- Timeline from user profile (investmentProfile.timeline)
- No adjustable rate slider
- No planned/future investments

**Required Changes:**

1. **Enhanced investment data structure**
   ```javascript
   State.data.investments = [
     {
       id, name, value, type,
       expectedReturn: number,     // NEW: custom rate override
       startDate: "YYYY-MM-DD",    // NEW: when purchased/planned
       status: "active|planned"    // NEW: planned = future investment
     }
   ]

   State.data.plannedContributions = [
     {
       id: string,
       amount: number,
       frequency: "monthly|quarterly|annually|once",
       startDate: "YYYY-MM-DD",
       endDate: "YYYY-MM-DD"       // Optional
     }
   ]
   ```

2. **10-Year Projection View**
   - Extend current chart from user-defined timeline to always show 10 years
   - Year-by-year table with: Year | Contributions | Growth | Total Value
   - Option to toggle between monthly and yearly view

3. **Adjustable Rate of Return**
   - Slider component: 0% to 15% with 0.5% steps
   - Default based on risk tolerance, but user can override
   - Real-time chart update as slider moves
   - Show scenarios: pessimistic (-2%), expected, optimistic (+2%)

4. **Future/Planned Investments**
   - Form to add planned investment with future date
   - "What-if" calculator: input lump sum or recurring contribution
   - Shows projected impact on portfolio over 10 years
   - Planned investments shown with different styling

5. **Projection scenarios**
   - Toggle between: Conservative (4%) | Expected (risk-based) | Optimistic (12%)
   - Overlay lines on chart for comparison
   - Table shows range: "Your portfolio could be between X and Y"

**Acceptance Criteria:**
- [x] 10-year projection chart displayed
- [x] Rate of return adjustable via slider
- [x] Chart updates in real-time as rate changes
- [x] Can add planned/future investments
- [x] Planned contributions affect projections
- [x] Multiple scenarios shown (pessimistic/expected/optimistic)

---

## Implementation Phases

### Phase 1: Foundation (Feature 5)
**Estimated Tasks:** 4
**Agents:** Designer → Coder → Reviewer → Tester

| Task | Priority | Status | Agents |
|------|----------|--------|--------|
| Add month column detection to Parser | P0 | ✅ Done | Coder |
| Add monthKey to transaction objects | P0 | ✅ Done | Coder |
| Update income data structure with monthKey | P0 | ✅ Done | Coder |
| Update Dashboard grouping to use monthKey | P0 | ✅ Done | Coder |

### Phase 2: Core Projections (Feature 1)
**Estimated Tasks:** 6
**Agents:** UI + UX → Designer → Coder → Reviewer → Tester

| Task | Priority | Status | Agents |
|------|----------|--------|--------|
| Design Financial Forecast Card (UI/UX) | P0 | ✅ Done | UI + UX |
| Implement forecast calculation logic | P0 | ✅ Done | Coder |
| Build forecast card HTML/CSS | P0 | ✅ Done | Coder |
| Wire payslip upload to projection update | P0 | ✅ Done | Coder |
| Add confidence indicator | P1 | ✅ Done | Coder |
| QA and accessibility review | P0 | ✅ Done | Tester |

### Phase 3: Planned Items (Features 2, 3, 4 - Parallel)
**Estimated Tasks:** 15+
**Status:** ✅ Complete

---

## Technical Notes

### State Changes
New keys to add to `State.data`:
```javascript
plannedExpenses: [],      // Feature 2
plannedContributions: [], // Feature 4
```

Existing keys to modify:
```javascript
expenses: [...],    // Add monthKey field
incomes: [...],     // Add monthKey, isRecurring fields
debts: [...],       // Add startDate, status fields
investments: [...], // Add expectedReturn, startDate, status fields
```

### New UI Components Needed
1. **Forecast Card** - Dashboard header with income/expense/savings
2. **Planned Expenses List** - Collapsible section in Expenses tab
3. **Amortization Table** - Per-debt breakdown in Debt tab
4. **Rate Slider** - Interactive slider in Investments tab
5. **Scenario Toggle** - Radio buttons for projection scenarios

### CSS Design System Extensions
```css
/* New tokens for projections */
--projection-actual: var(--text-color);
--projection-estimated: var(--text-muted);
--projection-planned: var(--primary-color);
--projection-warning: var(--warning-color);
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex projection calculations | High | Unit test each calculation function |
| Performance with many planned items | Medium | Limit projection horizon to 12 months for expenses |
| UI clutter with new sections | Medium | Use collapsible cards, progressive disclosure |
| Data migration for new fields | Low | Default values for new fields on existing data |
| Chart.js performance with 10-year data | Low | Aggregate to yearly for long projections |

---

## Next Steps

1. **User Decision Needed:** Start with Feature 5 (Foundation) or skip to Feature 1 if month detection not critical initially?

2. **UI/UX Drafts Needed:** Before implementing Features 1-4, UI and UX agents should provide 2-3 design options for:
   - Financial Forecast Card layout
   - Planned Expenditures form/list
   - Amortization schedule display
   - Rate of return slider design

3. **Implementation Order:**
   - Option A: Sequential (5 → 1 → 2 → 3 → 4)
   - Option B: Foundation then parallel (5 → 1, then 2/3/4 in parallel)

Ready to proceed with implementation. Which feature should we start with?
