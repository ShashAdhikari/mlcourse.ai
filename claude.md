# CLAUDE.md - Project Learnings

## Project: Expense Tracker & Financial Analysis Tool

### Overview
A vanilla HTML/CSS/JavaScript single-page application for personal financial management. No build tools or frameworks - runs directly in the browser from `index.html`.

Two synchronized copies exist:
- `/expense-tracker/` - original location
- `/myClawdproject/` - cloned copy (keep both in sync)

### Architecture
- **Single-page app** with 5 tab-based sections: Dashboard, Expenses, Debt Analysis, Investments, Upload
- **State management** via a global `state` object persisted to `localStorage`
- **Chart.js** loaded from CDN for doughnut and line chart visualizations
- **No backend** - all processing happens client-side including file parsing and PII anonymization

### Upload System Architecture

Three independent upload zones exist, each with different capabilities:

| Zone | Function | Type Detection | Anonymization | Multi-file |
|---|---|---|---|---|
| **Dashboard** (`#dashboard-upload-zone`) | `setupDashboardUpload()` | Auto from filename regex | Yes - FileReader + `anonymizeText()` | No (first file only, warns user) |
| **Expense** (`#expense-upload-zone`) | `setupUploadZone()` | Hardcoded `'expense'` | No | Yes (`Array.from(files).forEach`) |
| **Payslip** (`#payslip-upload-zone`) | `setupUploadZone()` | Hardcoded `'payslip'` | No | Yes |

- Dashboard zone is the only one that reads file content (via `FileReader` for CSV/text files). Binary files get a simulated anonymization notice.
- Payslip detection regex: `/payslip|salary|wage|pay\s*stub/i` tested against `file.name`
- All zones share `state.uploads` array and the `addSampleExpenses`/`addSampleIncome` functions

### Anonymization Pipeline (regex execution order)

The `anonymizeText()` function applies regex replacements sequentially. **Order is critical** - broader patterns consume tokens needed by narrower patterns:

1. **SSN** - `\d{3}[-\s]\d{2}[-\s]\d{4}` - requires separators (e.g., `123-45-6789`)
2. **Card** - `\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}` - 16 digits, optional separators
3. **Routing** - `\d{9}` - exactly 9 consecutive digits (runs BEFORE account)
4. **Account** - `\d{8}|\d{10,17}` - 8 or 10-17 digits (skips 9 to avoid consuming routing numbers)
5. **Email** - standard `user@domain.tld`
6. **Phone** - various US formats with optional country code
7. **Names** - only after labeled prefixes (`Name:`, `Account Holder:`, etc.)
8. **Addresses** - street number + name + recognized suffix (`St`, `Ave`, `Blvd`, etc.)

### Key Technical Decisions
1. **XSS prevention**: All user input rendered via `innerHTML` must go through `escapeHtml()`. This includes file content from FileReader - `renderAnonymizedPreview` must escape text BEFORE inserting `[REDACTED]` highlight spans.
2. **localStorage safety**: Always use `safeParse()` wrapper around `JSON.parse()` to handle corrupted data gracefully.
3. **State immutability**: When filtering/sorting arrays from `state`, always spread first (`[...state.expenses]`) to avoid mutating the source.
4. **CSS grid responsive fix**: Use `minmax(min(400px, 100%), 1fr)` instead of `minmax(400px, 1fr)` to prevent overflow on narrow screens.
5. **Currency formatting**: Uses `Intl.NumberFormat` with 19 supported currencies and browser locale auto-detection via `navigator.language`.
6. **UTC-safe date parsing**: Never use `new Date('YYYY-MM-DD')` for display - it parses as UTC midnight, which shifts to the wrong day in negative UTC offsets. Use `new Date(year, month - 1, day)` instead. See `parseMonthKey()`.
7. **Sticky table headers**: Use `position: sticky` on `<th>` elements, not `<thead>`. The `<thead>` approach fails in Chrome and Safari.
8. **Persisted flags**: Any boolean flag that controls one-time behavior (like sample data insertion) must be stored in `localStorage`, not in-memory variables. In-memory flags reset on every page reload.
9. **Anonymization regex ordering**: SSN must require separators (`[-\s]` not `[-\s]?`) to avoid matching 9-digit routing numbers. Routing must run before Account. Account must skip 9-digit numbers (`\d{8}|\d{10,17}` not `\d{8,17}`).
10. **HTML escaping in anonymized previews**: `renderAnonymizedPreview` must call `escapeHtml()` on text BEFORE replacing `[...REDACTED]` markers with `<span>` tags. Otherwise malicious file content or filenames inject HTML.

### Features
- Expense tracking with add/edit/delete, category filtering, date sorting
- **Inline expense editing** - click pencil icon to edit description, amount, category, and date in-place
- Smart category suggestions based on keyword scoring (100+ keywords mapped to 9 categories)
- Debt analysis with avalanche and snowball payoff strategy comparison
- Investment profiling with risk assessment and compound growth projections
- File upload (CSV) with drag-and-drop support on both Dashboard and Upload tabs
- PII anonymization engine (SSN, credit cards, routing numbers, bank accounts, emails, phones, names, addresses)
- Multi-currency support with auto-detection from browser locale
- **Monthly analytics** - average monthly expense vs income comparison with expense-to-income ratio bar and per-month breakdown table
- **Yearly projection** - 12-month table mixing actual data with projected months based on average spending, with annual totals

### Common Bugs to Watch For
1. **Allocation percentages must sum to 100%** - derive the last category as `100 - sum(others)`
2. **Unpayable debt detection** - if minimum payment < monthly interest, warn the user; don't let the calculator loop forever
3. **Duplicate sample data** - persist boolean flags to `localStorage` to prevent re-adding sample data after page reload
4. **Double file dialog** - guard click handlers on upload zones with `e.target.tagName !== 'INPUT'`
5. **`substr()` is deprecated** - use `substring()` instead
6. **Preserve filter state after edit** - when `saveExpenseEdit`/`cancelExpenseEdit` re-render the list, pass the current filter dropdown value via `getCurrentFilter()`. Otherwise the filter resets to "all" while the dropdown stays on the old value.
7. **Dashboard labels must match data scope** - if a card shows all-time totals, don't label it "This month". The label "All time" is accurate for total expenses.
8. **Dynamic color for deficit** - Net Savings card must turn red (`var(--danger-color)`) when savings are negative. Don't rely on a static CSS class.
9. **Ratio bar consistency** - cap both the bar width AND the text percentage at 100%. If only the width is capped, the bar shows "150%" at full width.
10. **Signed values for surplus/deficit** - use `formatCurrency(value)` directly, not `formatCurrency(Math.abs(value))`. The label already says "Surplus" or "Deficit"; dropping the sign makes the number inconsistent with table rows that show signed values.
11. **Empty state guards** - analytics and projection panels should check `state.expenses.length === 0 && state.incomes.length === 0` and show the placeholder message instead of rendering full content with $0.00 everywhere.
12. **XSS via file content** - `renderAnonymizedPreview` must HTML-escape anonymized text before injecting as innerHTML. `anonymizeText()` is a PII scrubber, not an HTML sanitizer. Malicious CSV content like `<img src=x onerror=alert(1)>` passes through anonymization unchanged.
13. **XSS via binary file simulated content** - the binary-file fallback path must use `safeName` (HTML-escaped), not raw `file.name`, when building `simulatedContent`.
14. **Regex ordering for PII** - SSN regex must require separators to avoid false-positiving on 9-digit routing numbers. Routing regex must run BEFORE account regex. Account regex must exclude 9-digit numbers.
15. **Multi-file drop feedback** - dashboard zone only processes the first file. Must show a warning note when additional files are silently dropped.

### QA Test Results (Agent-Automated)

| Scenario | Result |
|---|---|
| CSV drag-drop on dashboard | PASS |
| PDF browse (payslip detection) | PASS (after XSS fix) |
| Duplicate upload after reload | PASS |
| Upload via Upload section | PASS |
| Malicious filename XSS | PASS (after escapeHtml fix) |
| Multi-file drag-drop | PASS (after warning added) |
| PII anonymization accuracy | PASS (after regex reorder) |
| Click zone double-trigger | PASS |

### File Structure
```
app.js    (~1680 lines) - All application logic, state management, rendering
index.html (~467 lines) - HTML structure, Chart.js CDN, tab layout
styles.css (~1258 lines) - CSS variables, responsive grid, animations
```

### Development Notes
- Branch: `claude/expense-tracker-financial-analysis-EyKk5`
- Both `/expense-tracker/` and `/myClawdproject/` should be kept identical
- The app uses no package manager or build step - edit files directly and open `index.html` in a browser
- When adding new user-facing text that includes user input, always sanitize with `escapeHtml()`
- When adding new currency-formatted values, use `formatCurrency(amount)` instead of hardcoded `$` signs
- When re-rendering after an edit operation, always read the current filter/sort state from the DOM and pass it to the render function
- When displaying positive/negative financial values, use dynamic CSS classes (`positive`/`negative`) and inline `style.color` where static CSS classes won't cover both states
- When building text that flows into innerHTML (even indirectly through helper functions), trace the full data path to confirm HTML escaping happens before the final `.innerHTML =` assignment
- When adding PII regex patterns to `anonymizeText`, always check whether existing patterns consume the same digit sequences first. Test with the exact input from QA Scenario 7.
