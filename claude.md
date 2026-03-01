# CLAUDE.md - Project Learnings

## Project: Expense Tracker & Financial Analysis Tool

### Overview
A vanilla HTML/CSS/JavaScript single-page application for personal financial management. No build tools or frameworks - runs directly in the browser from `index.html`.

Two synchronized copies exist:
- `/expense-tracker/` - original location
- `/myClawdproject/` - cloned copy (keep both in sync)

### Architecture
- **Single-page app** with 5 tab-based sections: Dashboard, Expenses, Debt Analysis, Investments, Upload
- **IIFE module pattern** - entire app.js wrapped in `(function () { 'use strict'; ... })();` with 20 named module objects: Utils, Currency, State, Notify, CategoryEngine, Anonymizer, Parser, Budget, Expenses, PlannedExpenses, Debts, PlannedDebts, Investments, PlannedInvestments, Income, Upload, Dashboard, TagSuggestions, LayoutToggle, Nudges, App
- **State management** via centralized `State` module with `State.data`, `State.modify(key, fn)` (mutate + auto-persist), and `State.set(key, value)` (replace + auto-persist). All data persisted to `localStorage`
- **Event delegation** - single `document.body` click listener routes `data-action`/`data-id` attributes through a switch/case in `App.setupEventDelegation()`. No `window.*` globals or inline `onclick` handlers
- **Planned items system** - Three parallel modules (`PlannedExpenses`, `PlannedDebts`, `PlannedInvestments`) for future/potential items. Each supports add, activate (convert to real item), and delete. State stored in `State.data.plannedExpenses`, `plannedDebts`, `plannedInvestments`
- **Toast notification system** - `Notify.show(message, type, duration)` provides user feedback for all CRUD operations via `#toast-container` with `aria-live="polite"`
- **CSS design system** - `:root` custom properties for spacing scale (--space-1 through --space-12), typography scale (--font-size-xs through --font-size-2xl), category colors (10 categories with bg/fg pairs), elevation (--shadow, --shadow-lg), layout tokens
- **ARIA accessibility** - `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, `aria-controls`, `aria-labelledby`, skip-link, `.sr-only`, `:focus-visible`, `aria-hidden` on decorative emojis
- **Chart.js** loaded from CDN for doughnut and line chart visualizations
- **No backend** - all processing happens client-side including file parsing and PII anonymization

### Upload System Architecture

Three upload zones, all handled through `Upload.setupZone()` and `Upload.setupDashboard()`:

| Zone | Setup Function | Type | Anonymization | Multi-file |
|---|---|---|---|---|
| **Dashboard** (`#dashboard-upload-zone`) | `Upload.setupDashboard()` | `'expense'` | Yes for CSV (`Anonymizer.anonymize()`) | No (first file only) |
| **Expense** (`#expense-upload-zone`) | `Upload.setupZone()` | `'expense'` | Yes for CSV | Yes (`Array.from(files).forEach`) |
| **Payslip** (`#payslip-upload-zone`) | `Upload.setupZone()` | `'payslip'` | No | Yes |

- CSV files are read via `FileReader.readAsText`, anonymized with `Anonymizer.anonymize()`, then parsed with `Parser.parseCSV()`
- Excel files are read via `FileReader.readAsArrayBuffer`, then parsed with `Parser.parseExcel()` (SheetJS)
- PDF/image files trigger sample data insertion via `Upload.addSampleExpenses()`/`Upload.addSampleIncome()`
- All zones share `State.data.uploads` array and the `Upload.processFile()` pipeline

### Anonymization Pipeline (regex execution order)

The `Anonymizer.anonymize()` function applies regex replacements sequentially via `Anonymizer.patterns[]`. **Order is critical** - broader patterns consume tokens needed by narrower patterns:

1. **Names** - `\b[A-Z][a-z]+\s[A-Z][a-z]+\b` - capitalized two-word names
2. **SSN** - `\b\d{3}-\d{2}-\d{4}\b` - requires hyphens (e.g., `123-45-6789`)
3. **Card** - `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b` - 16 digits, optional separators
4. **Email** - standard `user@domain.tld`
5. **Account** - `\b\d{9,18}\b` - 9-18 consecutive digits
6. **Phone (parenthetical)** - `\(\d{3}\)\s?\d{3}-\d{4}`
7. **Phone (dashed)** - `\b\d{3}-\d{3}-\d{4}\b`

### File Parsing Engine

The `Parser` module parses CSV and Excel files client-side. Both `parseCSV()` and `parseExcel()` feed into the shared `Parser.parseRows()` method:

```
File Upload → Upload.processFile() → FileReader → Parser.parseCSV()/parseExcel() → Parser.parseRows() → Parser.render() → Parser.import()
```

**Supported formats:**

| Format | Detection | Reader | Parser Method |
|---|---|---|---|
| CSV (`.csv`) | Extension | `readAsText` | `Parser.parseCSV()` → auto-detects delimiter (`,`, `\t`, `;`, `\|`) |
| Excel (`.xlsx`, `.xls`) | Extension | `readAsArrayBuffer` | `Parser.parseExcel()` via SheetJS CDN |
| PDF/Image | Fallback | N/A | Not parsed (sample data added) |

**Shared `Parser.parseRows(rows)`**: Unified row processing eliminates CSV/Excel code duplication. Handles header scanning, column detection, row classification, and transaction building.

**Column Detection** (`Parser.detectColumns`): Five-pass priority system with `assigned` Set:
1. **Pass 1 - Date**: `/\bdate\b/` (excludes "value date")
2. **Pass 2 - Debit/Withdrawal**: `/\b(debit|withdrawal|withdraw|expense|spent|paid|payment)\b/`
3. **Pass 3 - Credit/Deposit**: `/\b(credit|deposit|income|received|refund)\b/`
4. **Pass 4 - Balance**: `/\b(balance|closing|running|total)\b/`
5. **Pass 5 - Description**: `/\b(desc|narr|particular|detail|memo|note|reference|remark|transaction)\b/`

**Amount fallback**: If no debit or credit column found, a generic "amount" column (`/amount|sum|value|cost|price|total/`) maps to `debit`.

**Header row scanning**: Scans first 10 rows (not just first 2) with weighted scoring — debit/credit columns score 2x. Best-scoring row becomes the header, next row starts data.

**`Parser.columnInfo`**: Module-level variable tracking which columns (debit, credit, balance) exist. Used by `Parser.render()` for dynamic table columns. Reset to `null` on discard/import.

**Positional fallback**: If zero columns detected and rows have 3+ cells, assumes `[date=0, description=1, debit=2]`.

**Amount parsing** (`Parser.parseAmount`): Strips currency symbols and commas, returns `Math.abs(num)`. Sign determined by column (debit vs credit), not value.

**Date parsing** (`Parser.parseDate`): Tries formats in order: YYYY-MM-DD → MM/DD/YYYY → DD/MM/YY (2-digit year, 50-year pivot: 00-50→2000s, 51-99→1900s) → Excel serial date → native `Date()` fallback.

**Auto-categorization**: `CategoryEngine.autoDetect(description)` uses keyword-scoring engine (100+ keywords across 9 categories + "other").

**Transaction Review UI** (`Parser.render()`): Table with checkboxes for selective import and dropdown category overrides. Select-all with indeterminate state for mixed debit/credit selections.

**Row classification**: Debit rows → `selected: true`, Credit rows → `selected: false` (shown dimmed with `.credit-row` class). Only `selected: true` rows imported by `Parser.import()`.

**Transaction object shape**: `{ id, date, description, amount, category, selected, rowType, debitRaw, creditRaw, balanceRaw }`. Raw fields stripped at import — only `id`, `description`, `amount`, `category`, `date` persist to `State.data.expenses`.

### Key Technical Decisions
1. **XSS prevention**: All user input rendered via `innerHTML` must go through `Utils.escapeHtml()`. This includes file content from FileReader — `Anonymizer.renderPreview` escapes text BEFORE inserting `[REDACTED]` highlight spans.
2. **localStorage safety**: Always use `Utils.safeParse()` wrapper around `JSON.parse()` to handle corrupted data gracefully.
3. **State immutability**: When filtering/sorting arrays from `State.data`, always spread first (`[...State.data.expenses]`) to avoid mutating the source.
4. **CSS grid responsive fix**: Use `minmax(min(400px, 100%), 1fr)` instead of `minmax(400px, 1fr)` to prevent overflow on narrow screens.
5. **Currency formatting**: Uses `Currency.format()` with `toLocaleString('en-US')` and 19 supported currency symbols in `Currency.symbols`.
6. **UTC-safe date parsing**: Never use `new Date('YYYY-MM-DD')` for display — it parses as UTC midnight, which shifts to the wrong day in negative UTC offsets. Use `new Date(year, month - 1, day)` instead. See `Dashboard.parseMonthKey()`.
7. **Sticky table headers**: Use `position: sticky` on `<th>` elements, not `<thead>`. The `<thead>` approach fails in Chrome and Safari.
8. **Persisted flags**: Any boolean flag that controls one-time behavior (like sample data insertion) must be stored in `localStorage`, not in-memory variables. In-memory flags reset on every page reload.
9. **Anonymization regex ordering**: Patterns in `Anonymizer.patterns[]` must be ordered carefully. Broader patterns consume tokens needed by narrower patterns.
10. **HTML escaping in anonymized previews**: `Anonymizer.renderPreview` must call `Utils.escapeHtml()` on text BEFORE replacing `[...REDACTED]` markers with `<span>` tags.
11. **Column detection must be multi-pass**: `Parser.detectColumns` uses separate passes for date→debit→credit→balance→description with a `Set` of assigned indices.
12. **SheetJS CDN guard**: Always check `typeof XLSX !== 'undefined'` before calling `XLSX.read()`. CDN failures should gracefully return an empty array.
13. **Chart.js infinite resize fix**: Wrap each `<canvas>` in a `.chart-wrapper` div with `position: relative` and set the canvas to `position: absolute`. Takes canvas out of flex flow.
14. **Five-pass column detection**: `Parser.detectColumns` uses separate passes for date → debit → credit → balance → description with `assigned` Set. Debit pass runs before credit to ensure "Withdrawal Amt." isn't claimed by a generic amount regex.
15. **Debit/credit row classification**: Rows with a debit value are expenses (`selected: true`); credit rows are income (`selected: false`, shown dimmed).
16. **DD/MM/YY 2-digit year pivot**: `Parser.parseDate` uses 50-year pivot: years 00-50 → 2000-2050, years 51-99 → 1951-1999.
17. **Multi-header row scanning**: `Parser.parseRows` scans first 10 rows with weighted scoring (debit/credit weighted 2x) to find the best header row. Handles bank statements with metadata rows above headers.
18. **`Parser.columnInfo`**: Module-level variable tracking detected columns. Reset on `Parser.import()` and `Parser.discard()`.
19. **Indeterminate select-all checkbox**: When bank statement has both debit and credit rows, select-all starts indeterminate. Communicates partial pre-selection.
20. **IIFE module pattern**: Entire app.js wrapped in `(function () { 'use strict'; ... })();` to eliminate global scope pollution. All 15 modules are `const` objects inside the closure.
21. **Event delegation over inline handlers**: Single `document.body` click listener with `e.target.closest('[data-action]')` replaces all `onclick` attributes and `window.*` global functions. New actions only need a `data-action` attribute in HTML and a case in the switch.
22. **Centralized state persistence**: `State.modify(key, fn)` and `State.set(key, value)` automatically call `State.save(key)` which persists to localStorage. No manual `localStorage.setItem` calls scattered through the code.
23. **Shared parser pipeline**: `Parser.parseRows(rows)` is the single entry point for row processing, called by both `Parser.parseCSV()` and `Parser.parseExcel()`. Eliminates duplicated column detection and row classification logic.
24. **Toast notification system**: `Notify.show(message, type, duration)` provides user feedback for all CRUD operations. Uses `#toast-container` with `aria-live="polite"` for screen reader announcements. Fallback `setTimeout` ensures cleanup if `transitionend` doesn't fire.
25. **CSS design system tokens**: All colors, spacing, typography, and elevation defined as CSS custom properties in `:root`. Components reference tokens (`var(--space-4)`, `var(--primary-color)`) instead of hardcoded values.
26. **Planned items module pattern**: `PlannedDebts` and `PlannedInvestments` follow the same pattern as `PlannedExpenses`: `render()`, `add(e)`, `activate(id)`, `delete(id)`, `getTotalPlanned()`. Each stores items in `State.data.planned*` arrays.
27. **Dashboard planned summary**: `Dashboard.renderPlannedSummary()` aggregates all three planned item types into a single overview card with counts, totals, and visual indicators.
28. **Monthly recurring income calculation**: `Dashboard.getMonthlyIncome(monthKey)` returns recurring income (incomes with `isRecurring !== false`) plus one-time income matching the specific month.

### Features
- Expense tracking with add/edit/delete, category filtering, date sorting
- **Inline expense editing** - click pencil icon to edit description, amount, category, and date in-place
- Smart category suggestions based on keyword scoring (100+ keywords mapped to 9 categories + "other")
- Debt analysis with avalanche and snowball payoff strategy comparison
- Investment profiling with risk assessment and compound growth projections (Chart.js line chart)
- **File parsing engine** - CSV and Excel file parsing with shared `Parser.parseRows()`, smart 5-pass column detection, auto-categorization, and transaction review UI with selective import
- **Upload history management** - view upload history with delete capability; file uploads tracked with transaction counts
- File upload (CSV, Excel) with drag-and-drop support on Dashboard and Upload tabs
- PII anonymization engine (names, SSN, credit cards, emails, accounts, phones)
- Multi-currency support with 19 currencies via `Currency.symbols`
- **Monthly analytics** - average monthly expense vs income comparison with expense-to-income ratio bar and per-month breakdown table
- **Yearly projection** - 12-month table mixing actual data with projected months based on average spending, with annual totals
- **Toast notifications** - `Notify.show()` provides feedback for all CRUD operations (add, edit, delete, import, discard)
- **Financial health score** - conic-gradient circle scoring 0-100 based on income/expense ratio, savings, and debt levels
- **Planned/future debts** - Add potential debts to Debt Analysis page with name, balance, interest rate, type, and planned start date. Activate to convert to real debt or delete
- **Planned/future investments** - Add potential investments to Investments page with name, amount, type, expected return, recurring contribution, and planned start date. Activate to convert to real investment or delete
- **Planned items dashboard summary** - Overview card on Dashboard showing counts and totals for all planned expenses, debts, and investments with visual icons and color coding
- **Enhanced monthly analytics** - Uses per-month income calculation via `Dashboard.getMonthlyIncome(monthKey)` for accurate income vs expense comparison in table rows
- **Reset buttons** - Each section (Expenses, Debts, Investments) has a "Reset All" button to clear data. Auto-reset offered when all bank statement uploads are deleted.
- **Dynamic currency symbols** - Currency symbols update everywhere based on selector; no hardcoded $ signs in labels
- **Currency-specific investment types** - Investment type dropdown shows region-appropriate options (INR: PF, NPS, PPF; NPR: CIT; USD: 401k, IRA, Roth IRA)
- **Hover tooltips** - Data cards and form labels show explanatory tooltips on hover for better UX
- **Enhanced expense pie chart** - Doughnut chart with category-matched colors, hover effects, percentage tooltips, and smooth animations
- **One-time income payments** - Income form supports one-time payments (bonuses, tax refunds) with month selection. One-time income shown with badge and excluded from recurring projections.
- **Income start month** - All income entries (recurring and one-time) require a start month. Projections only count recurring income from its start month onwards for accurate forecasting.
- **UI/UX redesign** - Traditional Reliability + Modern Usability hybrid design with Deep Navy Blue (#1a365d), Forest Green (#2f5233), muted Gold/Teal accents. Serif headers (Merriweather), sans-serif body (Inter). 8px rounded corners, subtle shadows, off-white "paper feel" background.
- **Responsive layout toggle** - Toggle between Web (left sidebar) and Mobile (bottom nav) layouts. Preference saved to localStorage. Desktop sidebar shows currency selector and layout toggle.
- **Financial health ratios** - Dashboard shows three key ratios with visual progress bars: Expense-to-Income (<70% healthy), Debt-to-Investment (<100% healthy), Debt-to-Annual-Income (<36% healthy). Color-coded status and hover tooltips.
- **Budget tracking** - Set monthly spending limits by category on Expenses page. Budget vs Actual comparison shows progress bars, remaining/over amounts, and total summary. Auto-updates when expenses change.
- **Smart Nudges** - AI-powered financial suggestions based on health score and financial data. Country-specific profiles (USD, EUR, GBP, INR, NPR) with localized investment suggestions, tax-advantaged options, and debt strategies. Five nudge categories: score improvement, expense control, debt reduction, investment growth, emergency fund. Prioritized by impact and auto-updates with Dashboard.

### Common Bugs to Watch For
1. **Allocation percentages must sum to 100%** - derive the last category as `100 - sum(others)`
2. **Unpayable debt detection** - if minimum payment < monthly interest, warn the user; don't let the calculator loop forever (`months < 600` guard in `Debts.calculateTimeline`)
3. **Duplicate sample data** - persist boolean flags to `localStorage` (`sampleExpensesAdded`, `sampleIncomeAdded`) to prevent re-adding after reload
4. **Double file dialog** - guard click handlers on upload zones with `e.target.tagName !== 'INPUT'`
5. **Preserve filter state after edit** - `Expenses.render(filter)` reads the current filter from the DOM if not passed. Edit/cancel operations call `Expenses.render()` without a filter arg, which correctly falls back to the dropdown value.
6. **Empty state guards** - analytics and projection panels check `State.data.expenses.length === 0 && State.data.incomes.length === 0` before rendering content.
7. **XSS via file content** - `Anonymizer.renderPreview` calls `Utils.escapeHtml()` BEFORE replacing `[REDACTED]` markers with `<span>` tags.
8. **Column detection collisions** - `Parser.detectColumns` uses separate passes with `assigned` Set. Never use a single-pass loop.
9. **SheetJS CDN dependency** - `Parser.parseExcel` guards with `typeof XLSX === 'undefined'` before calling `XLSX.read()`.
10. **Currency change must re-render parsed transactions** - `Currency.setupSelector` calls `Parser.render(Parser.pending)` if pending transactions exist.
11. **Credit rows imported as expenses** - `Parser.import()` filters to only `t.selected === true`. Credit rows default to `selected: false`.
12. **DD/MM/YY date order** - `Parser.parseDate` tries YYYY-MM-DD → MM/DD/YYYY → DD/MM/YY → Excel serial → `Date()` fallback. DD/MM/YY must come after MM/DD/YYYY.
13. **`Parser.columnInfo` stale between uploads** - reset to `null` in `Parser.import()` and `Parser.discard()`.
14. **Select-all indeterminate** - row checkbox `change` handler recalculates checked count and updates `selectAll.checked` and `selectAll.indeterminate`.
15. **Toast element cleanup** - `Notify.show()` uses both `transitionend` listener AND a 500ms fallback `setTimeout` to ensure toast elements are removed from DOM.
16. **Event delegation requires `data-action`** - when adding new interactive buttons, add `data-action="action-name"` and `data-id="${id}"` attributes, then add the case to `App.setupEventDelegation()`.
17. **State mutations must use `State.modify()` or `State.set()`** - never mutate `State.data` directly without calling `State.save()`. The modify/set methods ensure automatic localStorage persistence.
18. **Monthly income calculation** - For per-month income in analytics, use `Dashboard.getMonthlyIncome(monthKey)` which aggregates recurring income plus one-time income for that specific month. Don't use `totalIncome` for monthly comparisons.
19. **Projection card overflow** - Investment projection values can overflow card boundaries. Apply `overflow: hidden` to `.projection-card`, `overflow-x: auto` to `#projection-details`, and `word-break: break-word` to large values.
20. **Planned items activate pattern** - When activating a planned item, copy relevant fields to the real item, then delete from planned array. Use `State.modify()` for both operations to ensure persistence.
21. **Net savings sign preservation** - Use `Currency.format(amount, true)` to show negative amounts correctly. Dashboard updates net savings class to 'positive'/'negative' for color styling.
22. **Reset confirmation required** - All reset functions must call `confirm()` before clearing data to prevent accidental data loss.
23. **Auto-reset on upload delete** - When last expense upload is deleted, prompt user to reset expenses. Clears `Parser.pending`, hides parsed transactions card.
24. **Currency investment types** - Call `Currency.updateInvestmentTypeSelects()` on currency change and page load to populate correct investment types.
25. **One-time income toggle** - `Income.setupOneTimeToggle()` sets default start month on page load. Must be called in `App.init()`.
26. **Tooltip overflow clipping** - Parent elements with `overflow: hidden` clip absolutely-positioned tooltips. Use `overflow: visible` on containers that hold tooltip elements (e.g., `.summary-card`, `.ratio-item`).
27. **Null checks in setupForms()** - ALL form element selectors must check for null before calling `addEventListener`. Missing elements should gracefully skip setup, not crash the app.
28. **Dashboard.update() null safety** - Dashboard summary card elements (`total-income`, `total-expenses`, `total-debt`, `net-savings`) must be null-checked before setting textContent.
29. **Parser card null checks** - `Parser.import()` and `Parser.discard()` must null-check `parsed-transactions-card` before setting display style.
30. **Investment profile form safety** - Form submit handler must null-check all input elements before accessing `.value` property.
31. **Income start month required** - All income entries must have `startMonth` property. `Dashboard.getMonthlyIncome()` only counts recurring income if `targetMonth >= startMonth`.
32. **Layout toggle persistence** - `LayoutToggle` module saves preference to `localStorage`. On init, applies saved layout and updates toggle UI state.
33. **Budget module integration** - `Budget.renderComparison()` must be called after expense add/edit/delete/reset and after `Parser.import()`. Must also call `Dashboard.update()` after saving budgets.
34. **Nudges country profile fallback** - `Nudges.getProfile()` must return `countryProfiles.default` when currency not in profiles. Never assume currency exists.
35. **Nudges render requires container** - `Nudges.render()` must null-check `#nudges-list` before rendering. Called from `Dashboard.update()`.
36. **Nudges priority sorting** - Higher priority nudges appear first. Score improvement nudges have lower priority than critical debt warnings.

### QA Test Results (Agent-Automated)

**Rewrite Verification Tests (IIFE Architecture):**

| Scenario | Result |
|---|---|
| All `getElementById()` calls match HTML IDs (60+ elements) | PASS |
| All `querySelector()` calls match HTML selectors | PASS |
| All `data-action` values in JS match `setupEventDelegation()` switch cases | PASS |
| All interactive HTML elements wired to JS event handlers | PASS |
| `State.modify()` / `State.set()` auto-persist to localStorage | PASS |
| `Notify.show()` creates and removes toast elements | PASS |
| Toast fallback cleanup removes orphaned elements | PASS (after fix) |
| Event delegation routes all 8 action types correctly | PASS |
| IIFE wrapper prevents global scope pollution | PASS |
| CSS design system tokens referenced consistently | PASS |
| ARIA roles on nav tabs match panel `aria-labelledby` | PASS |

**Upload System Tests:**

| Scenario | Result |
|---|---|
| CSV drag-drop on dashboard | PASS |
| PDF/image triggers sample data | PASS |
| Duplicate upload after reload | PASS |
| Upload via Upload section | PASS |
| PII anonymization via `Anonymizer.anonymize()` | PASS |
| Click zone double-trigger guard | PASS |

**File Parsing Engine Tests:**

| Scenario | Result |
|---|---|
| Shared `Parser.parseRows()` from CSV path | PASS |
| Shared `Parser.parseRows()` from Excel path | PASS |
| 5-pass column detection with `assigned` Set | PASS |
| Header row scanning (first 10 rows, weighted scoring) | PASS |
| DD/MM/YY date parsing (50-year pivot) | PASS |
| Excel serial date parsing | PASS |
| Delimiter auto-detection (CSV, TSV, semicolon, pipe) | PASS |
| XLSX with missing SheetJS library | PASS (guard check) |
| Generic "Amount" column maps to debit | PASS |
| Import only `selected: true` transactions | PASS |
| `Parser.columnInfo` reset on import/discard | PASS |
| Select-all indeterminate state for mixed debit/credit | PASS |

**Dashboard & Layout Tests:**

| Scenario | Result |
|---|---|
| Health score circle renders correctly | PASS |
| Expense doughnut chart (Chart.js) | PASS |
| Investment projection line chart | PASS |
| Monthly analytics table rendering | PASS |
| Yearly projection with actual + projected rows | PASS |
| Empty state placeholders for all panels | PASS |
| Currency change re-renders all sections | PASS |

**Planned Items & Bug Fixes Tests:**

| Scenario | Result |
|---|---|
| Monthly income vs expense uses per-month income | PASS (after fix) |
| Investment projection values contained within card | PASS (after fix) |
| PlannedDebts add/render/activate/delete cycle | PASS |
| PlannedInvestments add/render/activate/delete cycle | PASS |
| PlannedDebts activate converts to real debt | PASS |
| PlannedInvestments activate converts to real investment | PASS |
| Dashboard planned summary shows all three item types | PASS |
| Planned items persisted to localStorage | PASS |
| Event delegation routes planned item actions | PASS |

**Feature & Bug Fix Tests (Session 2):**

| Scenario | Result |
|---|---|
| Reset button on Expenses page clears data | PASS |
| Reset button on Debts page clears debts + planned debts | PASS |
| Reset button on Investments page clears all + profile | PASS |
| Auto-reset prompt when all uploads deleted | PASS |
| Currency symbols update on selector change | PASS |
| Investment types change for INR currency | PASS |
| Investment types change for NPR currency | PASS |
| Tooltip hover on dashboard cards | PASS |
| Tooltip hover on form labels | PASS |
| Expense pie chart shows category colors | PASS |
| Expense pie chart shows percentages in tooltip | PASS |
| One-time income checkbox shows month picker | PASS |
| One-time income displays with badge | PASS |
| One-time income excluded from recurring projections | PASS |
| Expense list card increased height | PASS |
| Net savings shows negative when expenses > income | PASS (after fix) |
| Net savings styled red when negative | PASS |

**UI/UX Redesign & Layout Toggle Tests:**

| Scenario | Result |
|---|---|
| Sidebar navigation displays on desktop | PASS |
| Bottom navigation displays on mobile | PASS |
| Layout toggle switches between web/mobile | PASS |
| Layout preference persisted to localStorage | PASS |
| Mobile header shows logo and currency selector | PASS |
| Currency selectors synced between desktop/mobile | PASS |
| Serif fonts (Merriweather) applied to headers | PASS |
| Sans-serif fonts (Inter) applied to body text | PASS |
| 8px border-radius applied to cards | PASS |
| Off-white background (#faf9f6) applied | PASS |

**Financial Ratios Tests:**

| Scenario | Result |
|---|---|
| Expense-to-Income ratio calculates correctly | PASS |
| Debt-to-Investment ratio calculates correctly | PASS |
| Debt-to-Annual-Income ratio calculates correctly | PASS |
| Ratios show "Add data to calculate" when empty | PASS |
| Progress bars color-coded by status | PASS |
| Tooltips explain healthy thresholds | PASS |

**Budget Tracking Tests:**

| Scenario | Result |
|---|---|
| Budget form saves values to localStorage | PASS |
| Budget inputs load saved values on page load | PASS |
| Budget vs Actual comparison renders correctly | PASS |
| Over-budget categories show red styling | PASS |
| Warning (80%+) categories show yellow styling | PASS |
| Under-budget categories show green styling | PASS |
| Total budget summary shows remaining/over | PASS |
| Budget comparison updates on expense add | PASS |
| Budget comparison updates on expense delete | PASS |

**Income Start Month Tests:**

| Scenario | Result |
|---|---|
| Start month field required for all income | PASS |
| Start month defaults to current month | PASS |
| Recurring income only counted from start month | PASS |
| One-time income only counted in specific month | PASS |
| Income list shows start month info | PASS |
| Projections respect start month boundaries | PASS |

**Null Safety Tests (Bug Fixes):**

| Scenario | Result |
|---|---|
| setupForms() handles missing form elements | PASS |
| Dashboard.update() handles missing summary elements | PASS |
| Parser.import() handles missing card element | PASS |
| Parser.discard() handles missing card element | PASS |
| Investment profile restore handles missing elements | PASS |
| Investments.reset() handles missing form | PASS |
| Navigation handles missing target section | PASS |
| All 14 null pointer bugs fixed | PASS |

**Smart Nudges Tests:**

| Scenario | Result |
|---|---|
| Nudges card renders on dashboard | PASS |
| Nudges show empty state when no data | PASS |
| Country profile selected based on currency | PASS |
| Nudges update on currency change | PASS |
| Score improvement nudges prioritized correctly | PASS |
| Expense control nudges show reduction amount | PASS |
| Debt nudges identify high-interest debt | PASS |
| Investment nudges suggest country-specific options | PASS |
| Emergency fund nudges calculate target amount | PASS |
| Top 5 nudges displayed (sorted by priority) | PASS |
| USD profile shows 401(k), Roth IRA suggestions | PASS |
| INR profile shows PPF, ELSS, NPS suggestions | PASS |
| NPR profile shows CIT, FD suggestions | PASS |
| Default profile used for unsupported currencies | PASS |

### File Structure
```
app.js    (~3600 lines) - IIFE with 20 modules: Utils, Currency, State, Notify, CategoryEngine,
                          Anonymizer, Parser, Budget, Expenses, PlannedExpenses, Debts,
                          PlannedDebts, Investments, PlannedInvestments, Income, Upload,
                          Dashboard, TagSuggestions, LayoutToggle, Nudges, App
index.html (~840 lines) - Semantic HTML with ARIA accessibility, Chart.js + SheetJS CDNs,
                          mobile header, sidebar navigation, layout toggle, nudges card
styles.css (~3550 lines) - CSS design system with custom properties, 29+ organized sections,
                           layout toggle, force-mobile overrides, financial ratios, budget styles, nudges
```

### Development Notes
- Branch: `claude/expense-tracker-financial-analysis-EyKk5`
- Both `/expense-tracker/` and `/myClawdproject/` should be kept identical
- **Agent system defined in `agents.md`** - 9 agents (UI, UX, Project Manager, Designer, Coder, Reviewer, Debugger, Tester, Super) with orchestration protocol. UI + UX agents run in parallel upstream of Designer. PM coordinates task breakdown and documentation.
- The app uses no package manager or build step - edit files directly and open `index.html` in a browser
- **Module pattern**: All code lives inside the IIFE. To add a new feature, create a new `const ModuleName = { ... }` object inside the closure. Never add `window.*` globals.
- **Adding new actions**: Add `data-action="action-name"` and `data-id="${id}"` to the button HTML, then add a `case 'action-name':` to the switch in `App.setupEventDelegation()`.
- **State changes**: Always use `State.modify(key, fn)` for mutations or `State.set(key, value)` for replacements. Never call `localStorage.setItem` directly for state data.
- **User feedback**: Call `Notify.show(message, type)` after every user action. Types: `'success'`, `'error'`, `'warning'`, `'info'`.
- **Sanitization**: Always use `Utils.escapeHtml()` before inserting user input into `innerHTML`.
- **Currency**: Always use `Currency.format(amount)` instead of hardcoded `$` signs.
- **CSS tokens**: Use `var(--space-N)` for spacing, `var(--font-size-*)` for typography, `var(--primary-color)` etc. for colors. Never hardcode these values.
- **Adding forms**: Wire form `submit` events in `App.setupForms()`. Call `e.preventDefault()`, read inputs, use `State.modify()`, reset form, render, notify.
- **Column detection**: Use the five-pass priority system in `Parser.detectColumns` with the `assigned` Set.
- **SheetJS guard**: Any code calling `XLSX.*` must check `typeof XLSX !== 'undefined'` first.
- **Chart.js canvases**: Wrap in `.chart-wrapper` div. Set `maintainAspectRatio: false` in options.
- **Date parsing**: Insert new formats in the correct order in `Parser.parseDate`. DD/MM/YY must come after MM/DD/YYYY.
- **Budget module**: `Budget.init()` loads saved budgets, sets up form, renders comparison. Called from `App.init()`.
- **Layout toggle**: `LayoutToggle.init()` loads saved preference, applies layout, sets up toggle handlers. Called from `App.init()`.
- **Force-mobile CSS**: The `.force-mobile` class on `.app-container` overrides desktop styles to show mobile layout. Applied via `LayoutToggle.applyLayout()`.
- **Financial ratios**: `Dashboard.updateFinancialRatios()` calculates and renders three ratios with thresholds: expense-income (<70%), debt-investment (<100%), debt-annual-income (<36%).
- **Nudges module**: `Nudges.render()` called from `Dashboard.update()`. Country profiles in `Nudges.countryProfiles` with `default` fallback. Nudge categories: score, expense, debt, investment, emergency. Priority-sorted, limited to top 5.
