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

### Key Technical Decisions
1. **XSS prevention**: All user input rendered via `innerHTML` must go through `escapeHtml()`. This was a bug found during code review - never skip this.
2. **localStorage safety**: Always use `safeParse()` wrapper around `JSON.parse()` to handle corrupted data gracefully.
3. **State immutability**: When filtering/sorting arrays from `state`, always spread first (`[...state.expenses]`) to avoid mutating the source.
4. **CSS grid responsive fix**: Use `minmax(min(400px, 100%), 1fr)` instead of `minmax(400px, 1fr)` to prevent overflow on narrow screens.
5. **Currency formatting**: Uses `Intl.NumberFormat` with 19 supported currencies and browser locale auto-detection via `navigator.language`.

### Features
- Expense tracking with add/edit/delete, category filtering, date sorting
- Smart category suggestions based on keyword scoring (100+ keywords mapped to 9 categories)
- Debt analysis with avalanche and snowball payoff strategy comparison
- Investment profiling with risk assessment and compound growth projections
- File upload (CSV) with drag-and-drop support on both Dashboard and Upload tabs
- PII anonymization engine (SSN, credit cards, bank accounts, emails, phones, names, addresses)
- Multi-currency support with auto-detection from browser locale

### Common Bugs to Watch For
1. **Allocation percentages must sum to 100%** - derive the last category as `100 - sum(others)`
2. **Unpayable debt detection** - if minimum payment < monthly interest, warn the user; don't let the calculator loop forever
3. **Duplicate sample data** - use boolean flags to prevent re-adding sample data on every upload
4. **Double file dialog** - guard click handlers on upload zones with `e.target.tagName !== 'INPUT'`
5. **`substr()` is deprecated** - use `substring()` instead

### File Structure
```
app.js    (~1360 lines) - All application logic, state management, rendering
index.html (~450 lines) - HTML structure, Chart.js CDN, tab layout
styles.css (~1030 lines) - CSS variables, responsive grid, animations
```

### Development Notes
- Branch: `claude/expense-tracker-financial-analysis-EyKk5`
- Both `/expense-tracker/` and `/myClawdproject/` should be kept identical
- The app uses no package manager or build step - edit files directly and open `index.html` in a browser
- When adding new user-facing text that includes user input, always sanitize with `escapeHtml()`
- When adding new currency-formatted values, use `formatCurrency(amount)` instead of hardcoded `$` signs
