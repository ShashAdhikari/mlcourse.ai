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

### File Parsing Engine

The app parses CSV and Excel files client-side to extract expense transactions. The pipeline:

```
File Upload → Type Detection → FileReader → Parser → Column Detection → Row Extraction → Auto-Categorize → Review UI → Import
```

**Supported formats:**

| Format | Detection | Reader | Parser |
|---|---|---|---|
| CSV (`.csv`, `text/csv`) | Extension or MIME | `readAsText` | `parseCSVText()` |
| TSV/TXT (`.tsv`, `.txt`) | Extension + `text/plain` MIME | `readAsText` | `parseCSVText()` (auto-detects tab delimiter) |
| Excel (`.xlsx`, `.xls`) | Extension regex | `readAsArrayBuffer` | `parseExcelFile()` via SheetJS CDN |
| PDF | Fallback | N/A | Not parsed (recorded as upload only) |

**Column Detection** (`detectColumns`): Five-pass priority system to avoid column collisions:
1. **Pass 1 - Date** (highest priority): `/date|trans.*date|post.*date|value.*date/`
2. **Pass 2 - Debit/Withdrawal**: `/debit|withdrawal|withdraw|money.*out/`
3. **Pass 3 - Credit/Deposit**: `/credit|deposit|money.*in/`
4. **Pass 4 - Balance**: `/balance|closing.*bal|running.*bal/`
5. **Pass 5 - Description**: `/desc|narration|particular|detail|memo|payee|merchant|transaction|reference/`

Each pass uses a `Set` of assigned column indices to prevent the same column being claimed by multiple roles (e.g., "Transaction Date" matching both date and description).

**Return shape**: `{ date, description, debit, credit, balance }` — replaces the old `{ date, description, amount }` shape. A generic "Amount" column (matching `/amount|sum|total|value|expense|charge|payment/`) maps to the `debit` index for backward compatibility.

**Multi-header detection**: If row 1 (index 0) fails to match any column headers, the parser retries with row 2 (index 1) as the header row. This handles bank statements with a title/metadata row above the actual headers.

**`parsedColumnInfo`**: Module-level variable set by `detectColumns` that tracks which columns (debit, credit, balance) exist in the parsed file. Used by `renderParsedTransactions` for dynamic table column rendering.

**Positional fallback**: If zero columns detected, assumes `[date=0, description=1, debit=2]` for files with 3+ columns.

**Bank statement headers supported:**
```
Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance
```

**Amount parsing** (`parseAmount`): Handles US format (`1,234.56`), European format (`1.234,56`), parenthetical negatives (`(45.00)`), and currency symbols. Uses a heuristic: if the last comma comes after the last dot, treat comma as decimal separator.

**Date parsing** (`parseDate`): Tries formats in order: MM/DD/YYYY → YYYY-MM-DD → DD-Mon-YYYY → DD/MM/YY (2-digit year with 50-year pivot for Indian bank statements) → Excel serial date → native `Date()` fallback.

**Auto-categorization** (`autoCategorize`): Passes each description through the existing `suggestCategory()` keyword-scoring engine (100+ keywords across 9 categories).

**Transaction Review UI** (`renderParsedTransactions`): Shows a table with checkboxes for selective import and dropdown category overrides. Select-all toggle, per-row checkboxes, and per-row category selects all update `pendingParsedTransactions` in-place.

**Row processing**: Debit rows (withdrawal) are marked as expenses with `selected: true`. Credit rows (deposit) are shown dimmed with `selected: false`. The select-all checkbox uses an indeterminate state when debit/credit selections are mixed.

**Dynamic table columns**: Debit, Credit, and Balance columns are rendered conditionally based on `parsedColumnInfo`. If only a generic Amount column was detected, a single "Amount" column is shown.

**Transaction object shape**: Each parsed transaction includes `rowType` (`'debit'` or `'credit'`), raw string values (`debitRaw`, `creditRaw`, `balanceRaw`) for display, and numeric `amount` for calculations. The raw fields are stripped at import time — only `amount`, `date`, `description`, and `category` persist to `state.expenses`.

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
11. **Column detection must be multi-pass**: `detectColumns` uses separate passes for date→debit→credit→balance→description with a `Set` of assigned indices. A single-pass loop causes column collisions (e.g., "Transaction Date" matches both date regex via `date` and description regex via `transaction`).
12. **European number format detection**: `parseAmount` uses the last-comma-after-last-dot heuristic to distinguish `1,234.56` (US) from `1.234,56` (EU). This covers the two most common formats without requiring locale config.
13. **CSV escaped quotes**: RFC 4180 uses `""` inside quoted fields for literal quote characters. The CSV `splitRow` parser must check for consecutive `""` and emit a single `"` instead of toggling quote state.
14. **SheetJS CDN guard**: Always check `typeof XLSX !== 'undefined'` before calling `XLSX.read()`. CDN failures should gracefully return an empty array, not throw a ReferenceError.
15. **File type detection tightness**: Don't treat all `text/plain` MIME type files as CSV. Require `.csv`, `.tsv`, or `.txt` extension alongside the MIME check to avoid parsing random text files as tabular data.
16. **Chart.js infinite resize fix**: Chart.js canvases inside flex or grid containers cause an infinite resize loop because the canvas reports its own size to the parent, which re-layouts, which re-triggers `onResize`. Fix: wrap each `<canvas>` in a `.chart-wrapper` div with `position: relative; flex: 1 1 0; min-height: 0` and set the canvas to `position: absolute; top: 0; left: 0; width: 100% !important; height: 100% !important`. The absolute positioning takes the canvas out of the flex flow so it can't inflate its parent.
17. **European number format comma count**: `parseAmount` must count commas before applying the European heuristic. Multiple commas (e.g., `1,234,567`) are US thousands separators, not European decimals. Only a single comma after the last dot should trigger European mode.
18. **Five-pass column detection**: `detectColumns` uses separate passes for date → debit → credit → balance → description (upgraded from 3-pass). The debit pass runs before credit to ensure "Withdrawal Amt." isn't claimed by a generic amount regex. The old `amount` return field is replaced by `debit`/`credit`/`balance`.
19. **Debit/credit row classification**: Rows with a debit value are expenses (`selected: true`); rows with only a credit value are income (`selected: false`, shown dimmed). This prevents bank deposit entries from being accidentally imported as expenses.
20. **DD/MM/YY 2-digit year pivot**: Indian bank statements use DD/MM/YY dates. The parser uses a 50-year pivot: years 00-49 map to 2000-2049, years 50-99 map to 1950-1999. This avoids requiring users to pre-process date formats.
21. **Multi-header row detection**: Bank statements often have a title or account-info row above the actual column headers. `detectColumns` tries row 1 first; if no columns are found, it retries with row 2 as headers and adjusts the data start index accordingly.
22. **Module-level `parsedColumnInfo`**: Tracks which columns (debit, credit, balance) were detected in the current file. This avoids passing column metadata through every function call and allows `renderParsedTransactions` to dynamically show/hide table columns.
23. **Indeterminate select-all checkbox**: When a bank statement has both debit and credit rows, the select-all checkbox starts in the indeterminate state (mixed). Clicking it selects all, clicking again deselects all. This communicates that only expense rows are pre-selected without hiding the credit rows entirely.

### Features
- Expense tracking with add/edit/delete, category filtering, date sorting
- **Inline expense editing** - click pencil icon to edit description, amount, category, and date in-place
- Smart category suggestions based on keyword scoring (100+ keywords mapped to 9 categories)
- Debt analysis with avalanche and snowball payoff strategy comparison
- Investment profiling with risk assessment and compound growth projections
- **File parsing engine** - CSV and Excel file parsing with smart column detection, auto-categorization, and transaction review UI with selective import
- **Upload history management** - view upload history with delete capability; file uploads tracked with transaction counts
- File upload (CSV, Excel) with drag-and-drop support on both Dashboard and Upload tabs
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
16. **Column detection collisions** - `detectColumns` must use separate passes with an `assigned` Set. A single-pass loop assigns "Transaction Date" to both `result.date` and `result.description` because `transaction` matches the description regex and `date` matches the date regex in the same iteration.
17. **European number parsing** - `parseAmount("1.234,56")` must detect that comma is the decimal separator (last comma after last dot heuristic). Without this, the regex strips commas and produces `1.23456` instead of `1234.56`.
18. **CSV escaped quotes** - `"He said ""hello"""` must parse as `He said "hello"`. The CSV `splitRow` function must check `line[i+1] === '"'` before toggling quote state, and emit a literal `"` for the `""` pair.
19. **SheetJS CDN dependency** - `parseExcelFile` must guard with `typeof XLSX === 'undefined'` check before calling `XLSX.read()`. CDN failures or ad-blockers may prevent the library from loading.
20. **Import feedback** - after `importParsedTransactions`, show a success message with the count before hiding the parsed-transactions card. Otherwise the card just disappears with no confirmation.
21. **text/plain false positive** - file type detection must require a recognized extension (`.csv`, `.tsv`, `.txt`) alongside `text/plain` MIME check. Otherwise any text file dropped on the upload zone gets parsed as CSV.
22. **Chart.js infinite resize in flex/grid** - a Chart.js canvas directly inside a flex or grid child will grow by 1-2px every frame, causing the card to expand infinitely and the page to scroll endlessly. The canvas must be wrapped in a `.chart-wrapper` div that uses `position: relative` with the canvas set to `position: absolute`. Applies to every Chart.js canvas in the app.
23. **Grid `auto-fit` causing uneven 3+1 layouts** - `repeat(auto-fit, minmax(250px, 1fr))` on the dashboard summary grid causes 3+1 card layout at common viewport widths (~1100px). Fix: use fixed `repeat(4, 1fr)` with `repeat(2, 1fr)` at tablet/mobile breakpoints.
24. **Currency change doesn't update parsed transactions** - the currency change handler must re-render the parsed transactions card if it's visible (`pendingParsedTransactions.length > 0`). Otherwise amounts display with the old currency symbol.
25. **parseAmount multi-comma misclassification** - `"1,234,567"` (US, no decimal) was misclassified as European because `lastComma > lastDot` when there's no dot. Fix: require exactly 1 comma for European detection (`commaCount === 1`).
26. **Investment chart missing `maintainAspectRatio: false`** - the investment projection chart (line type) must set `maintainAspectRatio: false` like the expense doughnut chart. Without it, the canvas ignores the `.chart-wrapper` absolute positioning constraints.
27. **Credit rows imported as expenses** - if `rowType` is not checked during import, credit/deposit rows get imported as expenses with positive amounts. The import function must filter to only `selected: true` transactions and ensure credit rows default to `selected: false`.
28. **DD/MM/YY parsed as MM/DD/YY** - 2-digit year dates like `15/06/23` must be parsed as DD/MM/YY (June 15, 2023), not MM/DD/YY. The DD/MM/YY format check must run after the MM/DD/YYYY check but before the native `Date()` fallback, which may interpret the format incorrectly.
29. **`parsedColumnInfo` stale between uploads** - the module-level `parsedColumnInfo` must be reset at the start of each file parse. If a bank statement (with debit/credit/balance) is followed by a simple CSV (amount only), the table would still render debit/credit/balance columns from the previous parse.
30. **Select-all checkbox not updating indeterminate state** - when individual row checkboxes are toggled, the select-all checkbox must recalculate whether to show checked, unchecked, or indeterminate. Failing to update the `.indeterminate` property leaves it visually stale.
31. **Amount fallback column mapped to wrong field** - a generic "Amount" header must map to `debit` (not `amount`) in the new return shape. Code that still reads `columns.amount` instead of `columns.debit` will get `undefined` and produce NaN transactions.
32. **Multi-header offset not applied to data rows** - when row 2 is detected as the header, data extraction must start from row 3 (index 2). If the header row offset isn't propagated, the header row itself gets parsed as a transaction with NaN values.

### QA Test Results (Agent-Automated)

**Upload System Tests:**

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

**File Parsing Engine Tests:**

| Scenario | Result |
|---|---|
| CSV with "Transaction Date" header (column collision) | PASS (after multi-pass fix) |
| European number format `1.234,56` | PASS (after heuristic fix) |
| Parenthetical negatives `(45.00)` | PASS (after parseAmount fix) |
| CSV with escaped quotes `""` | PASS (after splitRow fix) |
| XLSX with missing SheetJS library | PASS (after guard added) |
| Partial column detection (date only found) | WARN (returns empty - no error feedback) |
| Import success feedback | PASS (after feedback message added) |
| text/plain file without CSV extension | PASS (after detection tightened) |
| Delete upload history entry | PASS |
| Excel serial date parsing (44927) | PASS |

**Bank Statement Parser Tests:**

| Scenario | Result |
|---|---|
| Indian bank CSV with Withdrawal/Deposit/Balance columns | PASS (5-pass detection) |
| DD/MM/YY date format (e.g., `15/06/23`) | PASS (50-year pivot) |
| Header row on row 2 (title row above headers) | PASS (multi-header retry) |
| Debit rows pre-selected, credit rows dimmed | PASS |
| Select-all checkbox indeterminate with mixed rows | PASS |
| Dynamic Debit/Credit/Balance column rendering | PASS |
| Generic "Amount" column backward compatibility | PASS (maps to debit) |
| Credit row hover opacity change (55% → 85%) | PASS |
| Import only selected (debit) transactions | PASS |
| `parsedColumnInfo` reset between file uploads | PASS |
| Raw fields (`debitRaw`, `creditRaw`, `balanceRaw`) stripped at import | PASS |

**Dashboard & Layout Tests:**

| Scenario | Result |
|---|---|
| Chart.js canvas finds element inside `.chart-wrapper` | PASS |
| Health score circle (150x150px) fits in chart-card | PASS |
| Dashboard grid at 769-850px viewport | PASS (after tablet breakpoint added) |
| Analytics card with 24 months of data scrolls | PASS |
| Quick upload card retains margin outside grid | PASS |
| Imported transactions appear in analytics immediately | PASS |
| Parsed transactions card persists across tab switches | PASS |
| Delete upload leaves imported expenses (no warning) | WARN (by design - no foreign key) |
| Empty expenses with populated incomes shows analytics | PASS |
| Currency change updates parsed transactions amounts | PASS (after re-render fix) |

### File Structure
```
app.js    (~2200 lines) - All application logic, state management, file parsing, rendering
index.html (~482 lines) - HTML structure, Chart.js + SheetJS CDNs, tab layout
styles.css (~1388 lines) - CSS variables, responsive grid, chart wrappers, parsed table styles, bank statement row styles
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
- When adding new column-detection regex patterns to `detectColumns`, verify they don't match headers that belong to other column roles. Use the five-pass priority system (date → debit → credit → balance → description) and `assigned` Set.
- When parsing amounts from CSV/Excel, never assume US number format. Use the last-comma-after-last-dot heuristic to auto-detect European format.
- When parsing CSV quoted fields, always handle RFC 4180 escaped quotes (`""` → single `"`). Test with descriptions containing commas and literal quotes.
- SheetJS is loaded from CDN. Any code calling `XLSX.*` must be wrapped in a `typeof XLSX !== 'undefined'` guard. Do not assume the library is always available.
- When adding a Chart.js canvas, always wrap it in a `.chart-wrapper` div. Never place a `<canvas>` directly inside a flex or grid child. Both `.chart-card` and `.projection-card` expect this wrapper structure.
- Dashboard uses `repeat(4, 1fr)` → `repeat(2, 1fr)` at ≤1024px → `repeat(2, 1fr)` at ≤768px. Avoid `auto-fit` for the summary grid to prevent uneven layouts.
- When working with the parsed transaction object, always use `columns.debit` (not `columns.amount`). The old `amount` field no longer exists in the `detectColumns` return shape.
- Credit rows in bank statements use `.credit-row` CSS class with 55% opacity (85% on hover). The `.income` class applies green color to credit/deposit amount cells. The `.balance-col` class applies muted styling to balance column values.
- The `parsedColumnInfo` module-level variable must be reset to `null` at the start of every `parseCSVText()` and `parseExcelFile()` call. Stale column info from a previous upload causes incorrect table rendering.
- When adding new date format support to `parseDate`, insert it in the correct position in the try-order. DD/MM/YY must come after MM/DD/YYYY to avoid ambiguous dates being parsed with the wrong format.
- Bank statement files may have metadata/title rows before the actual column headers. Always test with files where the header is not on row 1.
