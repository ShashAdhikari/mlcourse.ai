# Skill: Five-Pass Column Detection

**Agent:** Coder
**First Demonstrated:** 2026-02-05
**Success Rate:** 5/5 tasks (tested across multiple bank statement formats)

## Description

A systematic approach to detecting column types in bank statement files (CSV/Excel) using prioritized regex passes with an assigned-index tracking set to prevent column collisions.

## Prerequisites

- Input: 2D array of header row cells
- Output: Object mapping column types to indices
- Understanding of bank statement terminology variations

## Execution Pattern

1. **Initialize tracking** - Create `assigned` Set and result object
2. **Pass 1 - Date** - Match `/\bdate\b/` excluding "value date"
3. **Pass 2 - Debit/Withdrawal** - Match `/\b(debit|withdrawal|withdraw|expense|spent|paid|payment)\b/`
4. **Pass 3 - Credit/Deposit** - Match `/\b(credit|deposit|income|received|refund)\b/`
5. **Pass 4 - Balance** - Match `/\b(balance|closing|running|total)\b/`
6. **Pass 5 - Description** - Match `/\b(desc|narr|particular|detail|memo|note|reference|remark|transaction)\b/`
7. **Fallback - Amount** - If no debit/credit found, match generic amount column to debit
8. **Positional fallback** - If zero columns detected and 3+ cells, assume [date=0, description=1, debit=2]

## Why Prioritized Passes?

Single-pass detection fails when:
- "Withdrawal Amount" matches both withdrawal and amount patterns
- "Credit Balance" matches both credit and balance patterns
- Order of regex evaluation causes wrong column assignment

Five-pass with `assigned` Set ensures:
- Higher-priority columns (date, debit) claimed first
- Lower-priority columns can't steal already-assigned indices
- Deterministic behavior regardless of column order in file

## Example Applications

### Task 1: Standard Bank Statement
- **Input:** `["Date", "Description", "Debit", "Credit", "Balance"]`
- **Result:** `{ date: 0, description: 1, debit: 2, credit: 3, balance: 4 }`
- **Outcome:** PASS

### Task 2: Withdrawal Amount Header
- **Input:** `["Txn Date", "Particulars", "Withdrawal Amt.", "Deposit Amt.", "Running Bal."]`
- **Result:** `{ date: 0, description: 1, debit: 2, credit: 3, balance: 4 }`
- **Outcome:** PASS - Debit pass runs before credit, "Withdrawal Amt." correctly identified

### Task 3: Minimal Headers
- **Input:** `["Date", "Description", "Amount"]`
- **Result:** `{ date: 0, description: 1, debit: 2 }` (amount maps to debit as fallback)
- **Outcome:** PASS

### Task 4: No Headers (Positional Fallback)
- **Input:** `["01/15/2024", "Coffee Shop", "5.50"]`
- **Result:** `{ date: 0, description: 1, debit: 2 }` (positional assumption)
- **Outcome:** PASS

### Task 5: Excel with Merged Cells
- **Input:** Headers on row 5 after metadata
- **Result:** Header scanning (first 10 rows with weighted scoring) finds correct row
- **Outcome:** PASS

## Code Evidence

```javascript
// From Parser.detectColumns
const assigned = new Set();
// Pass 1: date
// Pass 2: debit (weighted 2x in scoring)
// Pass 3: credit (weighted 2x in scoring)
// Pass 4: balance
// Pass 5: description
```

## Related Bugs

- Bug #8: "Column detection collisions - Parser.detectColumns uses separate passes with assigned Set"
- Bug #14: "Five-pass column detection - Debit pass runs before credit to ensure 'Withdrawal Amt.' isn't claimed by generic amount regex"

---

*Documented: 2026-03-09*
*Reviewed by: Principal.md*
