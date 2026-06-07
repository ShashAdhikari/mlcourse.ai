(function () {
    'use strict';

    // ==================== UTILITIES ====================

    const Utils = {
        safeParse(key, fallback) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : fallback;
            } catch { return fallback; }
        },

        generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        },

        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        capitalizeFirst(str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        },

        formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        },

        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
    };

    // ==================== CURRENCY ====================

    const Currency = {
        symbols: {
            USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', AUD: 'A$',
            CAD: 'C$', CHF: 'CHF ', CNY: '\u00A5', INR: '\u20B9', NZD: 'NZ$',
            SGD: 'S$', HKD: 'HK$', KRW: '\u20A9', BRL: 'R$', ZAR: 'R ',
            MXN: 'MX$', SEK: 'kr ', NOK: 'kr ', NPR: '\u20A8'
        },

        investmentTypes: {
            INR: [
                { value: 'provident-fund', label: 'Provident Fund (PF/EPF)' },
                { value: 'nps', label: 'National Pension Scheme (NPS)' },
                { value: 'ppf', label: 'Public Provident Fund (PPF)' },
                { value: 'nsc', label: 'National Savings Certificate (NSC)' },
                { value: 'mutual-funds', label: 'Mutual Funds' },
                { value: 'equity', label: 'Equity/Stocks' },
                { value: 'bonds', label: 'Bonds' },
                { value: 'fd', label: 'Fixed Deposit (FD)' },
                { value: 'rd', label: 'Recurring Deposit (RD)' },
                { value: 'gold', label: 'Gold/SGBs' },
                { value: 'real-estate', label: 'Real Estate' },
                { value: 'other', label: 'Other' }
            ],
            NPR: [
                { value: 'provident-fund', label: 'Provident Fund' },
                { value: 'citizen-investment', label: 'Citizen Investment Trust' },
                { value: 'mutual-funds', label: 'Mutual Funds' },
                { value: 'equity', label: 'Equity/Shares' },
                { value: 'bonds', label: 'Bonds/Debentures' },
                { value: 'fd', label: 'Fixed Deposit' },
                { value: 'gold', label: 'Gold' },
                { value: 'real-estate', label: 'Real Estate' },
                { value: 'other', label: 'Other' }
            ],
            default: [
                { value: '401k', label: '401(k)' },
                { value: 'ira', label: 'IRA' },
                { value: 'roth-ira', label: 'Roth IRA' },
                { value: 'stocks', label: 'Stocks' },
                { value: 'etfs', label: 'ETFs' },
                { value: 'bonds', label: 'Bonds' },
                { value: 'mutual-funds', label: 'Mutual Funds' },
                { value: 'index-funds', label: 'Index Funds' },
                { value: 'real-estate', label: 'Real Estate/REITs' },
                { value: 'crypto', label: 'Cryptocurrency' },
                { value: 'savings', label: 'High-Yield Savings' },
                { value: 'other', label: 'Other' }
            ]
        },

        selected: localStorage.getItem('selectedCurrency') || 'USD',

        format(amount, preserveSign = false) {
            const sym = Currency.symbols[Currency.selected] || '$';
            if (preserveSign && amount < 0) {
                return '-' + sym + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            return sym + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        getInvestmentTypes() {
            return Currency.investmentTypes[Currency.selected] || Currency.investmentTypes.default;
        },

        updateInvestmentTypeSelects() {
            const types = Currency.getInvestmentTypes();
            const selects = document.querySelectorAll('#investment-type, #planned-investment-type');
            selects.forEach(select => {
                if (!select) return;
                const currentValue = select.value;
                select.innerHTML = types.map(t =>
                    `<option value="${t.value}">${t.label}</option>`
                ).join('');
                // Try to preserve selected value if it exists in new list
                const exists = types.some(t => t.value === currentValue);
                if (exists) select.value = currentValue;
            });
        },

        setupSelector() {
            const select = document.getElementById('currency-select');
            const mobileSelect = document.getElementById('currency-select-mobile');

            // Helper to update all views
            const updateViews = () => {
                Currency.updateInvestmentTypeSelects();
                Expenses.render();
                Debts.render();
                Investments.render();
                Income.render();
                Dashboard.update();
                Debts.updatePayoffPlan();
                if (State.data.investmentProfile) {
                    Investments.generateRecommendations();
                    Investments.generateProjection();
                }
                if (Parser.pending.length > 0) {
                    Parser.render(Parser.pending);
                }
            };

            // Setup main (desktop) selector
            if (select) {
                select.value = Currency.selected;
                select.addEventListener('change', () => {
                    Currency.selected = select.value;
                    localStorage.setItem('selectedCurrency', select.value);
                    // Sync mobile selector
                    if (mobileSelect) mobileSelect.value = select.value;
                    updateViews();
                });
            }

            // Setup mobile selector
            if (mobileSelect) {
                mobileSelect.value = Currency.selected;
                mobileSelect.addEventListener('change', () => {
                    Currency.selected = mobileSelect.value;
                    localStorage.setItem('selectedCurrency', mobileSelect.value);
                    // Sync desktop selector
                    if (select) select.value = mobileSelect.value;
                    updateViews();
                });
            }

            // Initialize investment types on load
            Currency.updateInvestmentTypeSelects();
        }
    };

    // ==================== STATE ====================

    const State = {
        data: {
            expenses: Utils.safeParse('expenses', []),
            debts: Utils.safeParse('debts', []),
            investments: Utils.safeParse('investments', []),
            incomes: Utils.safeParse('incomes', []),
            uploads: Utils.safeParse('uploads', []),
            investmentProfile: Utils.safeParse('investmentProfile', null),
            plannedExpenses: Utils.safeParse('plannedExpenses', []),
            plannedDebts: Utils.safeParse('plannedDebts', []),
            plannedInvestments: Utils.safeParse('plannedInvestments', []),
            budgets: Utils.safeParse('budgets', {})
        },

        save(key) {
            localStorage.setItem(key, JSON.stringify(State.data[key]));
        },

        modify(key, fn) {
            fn(State.data[key]);
            State.save(key);
        },

        set(key, value) {
            State.data[key] = value;
            State.save(key);
        }
    };

    // ==================== NOTIFY (TOAST) ====================

    const Notify = {
        show(message, type, duration) {
            type = type || 'info';
            duration = duration || 3000;
            const container = document.getElementById('toast-container');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('visible'));
            setTimeout(() => {
                toast.classList.remove('visible');
                toast.addEventListener('transitionend', () => toast.remove());
                // Fallback removal if transitionend doesn't fire
                setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
            }, duration);
        }
    };

    // ==================== CATEGORY ENGINE ====================

    const CategoryEngine = {
        keywords: {
            housing: ['rent', 'mortgage', 'lease', 'apartment', 'condo', 'property', 'hoa', 'home', 'house', 'landlord', 'tenant', 'real estate', 'down payment'],
            transportation: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'bus', 'train', 'subway', 'metro', 'car', 'auto', 'parking', 'toll', 'oil change', 'tire', 'vehicle', 'mechanic', 'flight', 'airline'],
            food: ['grocery', 'groceries', 'restaurant', 'dining', 'coffee', 'lunch', 'dinner', 'breakfast', 'takeout', 'delivery', 'doordash', 'grubhub', 'ubereats', 'pizza', 'food', 'meal', 'snack', 'cafe', 'bar', 'drink'],
            utilities: ['electric', 'electricity', 'water', 'gas bill', 'internet', 'wifi', 'phone', 'mobile', 'cable', 'trash', 'sewage', 'heating', 'cooling', 'power'],
            healthcare: ['doctor', 'hospital', 'pharmacy', 'medicine', 'prescription', 'dental', 'dentist', 'vision', 'therapy', 'clinic', 'health', 'medical', 'lab', 'insurance premium', 'copay'],
            entertainment: ['movie', 'netflix', 'spotify', 'hulu', 'disney', 'concert', 'theater', 'game', 'gaming', 'subscription', 'streaming', 'music', 'book', 'hobby', 'sport', 'gym', 'fitness'],
            shopping: ['amazon', 'walmart', 'target', 'clothing', 'clothes', 'shoes', 'electronics', 'furniture', 'appliance', 'gift', 'online', 'store', 'mall', 'purchase'],
            education: ['tuition', 'textbook', 'course', 'class', 'school', 'college', 'university', 'student', 'loan', 'training', 'certification', 'exam', 'udemy', 'coursera'],
            personal: ['haircut', 'salon', 'spa', 'skincare', 'makeup', 'laundry', 'dry clean', 'grooming', 'barber', 'nail', 'massage', 'cosmetics']
        },

        labels: {
            housing: 'Housing', transportation: 'Transportation', food: 'Food & Groceries',
            utilities: 'Utilities', healthcare: 'Healthcare', entertainment: 'Entertainment',
            shopping: 'Shopping', education: 'Education', personal: 'Personal Care', other: 'Other'
        },

        colors: {
            housing: '#dbeafe;color:#1e40af', transportation: '#fef3c7;color:#92400e',
            food: '#d1fae5;color:#065f46', utilities: '#e0e7ff;color:#3730a3',
            healthcare: '#fce7f3;color:#9d174d', entertainment: '#fae8ff;color:#86198f',
            shopping: '#fed7aa;color:#c2410c', education: '#ccfbf1;color:#0f766e',
            personal: '#f5d0fe;color:#a21caf', other: '#e2e8f0;color:#475569'
        },

        suggest(description) {
            const lower = description.toLowerCase().trim();
            if (lower.length < 2) return [];
            const matches = [];
            for (const [category, keywords] of Object.entries(CategoryEngine.keywords)) {
                for (const keyword of keywords) {
                    if (keyword.includes(lower) || lower.includes(keyword)) {
                        const score = keyword === lower ? 100 : keyword.startsWith(lower) ? 80 : 60;
                        matches.push({ category, keyword, score });
                    }
                }
            }
            const best = {};
            for (const m of matches) {
                if (!best[m.category] || m.score > best[m.category].score) {
                    best[m.category] = m;
                }
            }
            return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 5);
        },

        autoDetect(description) {
            const suggestions = CategoryEngine.suggest(description);
            return suggestions.length > 0 ? suggestions[0].category : 'other';
        },

        optionsHtml(selected) {
            return Object.entries(CategoryEngine.labels).map(([value, label]) =>
                `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
            ).join('');
        }
    };

    // ==================== ANONYMIZER ====================

    const Anonymizer = {
        patterns: [
            { regex: /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, replacement: '[REDACTED NAME]' },
            { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED SSN]' },
            { regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED CARD]' },
            { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[REDACTED EMAIL]' },
            { regex: /\b\d{9,18}\b/g, replacement: '[REDACTED ACCOUNT]' },
            { regex: /\(\d{3}\)\s?\d{3}-\d{4}/g, replacement: '[REDACTED PHONE]' },
            { regex: /\b\d{3}-\d{3}-\d{4}\b/g, replacement: '[REDACTED PHONE]' }
        ],

        anonymize(text) {
            let result = text;
            Anonymizer.patterns.forEach(p => { result = result.replace(p.regex, p.replacement); });
            return result;
        },

        renderPreview(text, container) {
            let html = Utils.escapeHtml(text);
            html = html.replace(/\[REDACTED[^\]]*\]/g, '<span class="redacted">$&</span>');
            container.innerHTML = '<div class="anonymized-preview">' + html + '</div>';
        }
    };

    // ==================== PARSER ====================

    const Parser = {
        pending: [],
        columnInfo: null,

        parseDate(value) {
            if (!value) return null;
            const str = String(value).trim();
            if (!str) return null;

            // Already YYYY-MM-DD
            let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (m) return str;

            // MM/DD/YYYY or MM-DD-YYYY
            m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;

            // DD/MM/YY (2-digit year, 50-year pivot)
            m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
            if (m) {
                const year = parseInt(m[3]) + (parseInt(m[3]) > 50 ? 1900 : 2000);
                return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            }

            // Excel serial date number
            if (/^\d{5}$/.test(str)) {
                const serial = parseInt(str);
                const epoch = new Date(1899, 11, 30);
                const date = new Date(epoch.getTime() + serial * 86400000);
                return date.toISOString().split('T')[0];
            }

            // Natural language date
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
            return null;
        },

        parseAmount(value) {
            if (value === null || value === undefined || String(value).trim() === '') return null;
            if (typeof value === 'number') return value;
            const cleaned = String(value).replace(/[^0-9.\-,]/g, '').replace(/,/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : Math.abs(num);
        },

        parseMonth(value) {
            // Parse month column value to YYYY-MM format
            if (!value) return null;
            const str = String(value).trim();
            if (!str) return null;

            // Already YYYY-MM format
            let m = str.match(/^(\d{4})-(\d{2})$/);
            if (m) return str;

            // Month Year format: "January 2024", "Jan 2024", "01/2024"
            m = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
            if (m) {
                const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                                 jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
                const monthNum = months[m[1].toLowerCase().substring(0, 3)];
                if (monthNum) return `${m[2]}-${monthNum}`;
            }

            // MM/YYYY or MM-YYYY format
            m = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
            if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;

            // Try to extract from a full date if provided
            m = str.match(/^(\d{4})-(\d{2})-\d{2}$/);
            if (m) return `${m[1]}-${m[2]}`;

            return null;
        },

        detectColumns(headers) {
            const lower = headers.map(h => String(h).toLowerCase().trim());
            const result = { date: -1, description: -1, debit: -1, credit: -1, balance: -1, month: -1 };
            const assigned = new Set();

            // Pass 1: Date
            for (let i = 0; i < lower.length; i++) {
                if (/\bdate\b/.test(lower[i]) && !/\bvalue\b/.test(lower[i])) {
                    result.date = i; assigned.add(i); break;
                }
            }
            if (result.date === -1) {
                for (let i = 0; i < lower.length; i++) {
                    if (/\bdate\b/.test(lower[i]) && !assigned.has(i)) {
                        result.date = i; assigned.add(i); break;
                    }
                }
            }

            // Pass 2: Debit / Withdrawal
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(debit|withdrawal|withdraw|expense|spent|paid|payment)\b/.test(lower[i])) {
                    result.debit = i; assigned.add(i); break;
                }
            }

            // Pass 3: Credit / Deposit
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(credit|deposit|income|received|refund)\b/.test(lower[i])) {
                    result.credit = i; assigned.add(i); break;
                }
            }

            // Pass 4: Balance
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(balance|closing|running|total)\b/.test(lower[i])) {
                    result.balance = i; assigned.add(i); break;
                }
            }

            // Pass 5: Description / Narration
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(desc|narr|particular|detail|memo|note|reference|remark|transaction)\b/.test(lower[i])) {
                    result.description = i; assigned.add(i); break;
                }
            }

            // Pass 6: Month / Period / Statement
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(month|period|statement\s*month|billing\s*period)\b/.test(lower[i])) {
                    result.month = i; assigned.add(i); break;
                }
            }

            // Fallback: generic "amount" → debit
            if (result.debit === -1 && result.credit === -1) {
                for (let i = 0; i < lower.length; i++) {
                    if (assigned.has(i)) continue;
                    if (/\b(amount|sum|value|cost|price|total)\b/.test(lower[i]) && !/\bdate\b/.test(lower[i])) {
                        result.debit = i; assigned.add(i); break;
                    }
                }
            }

            return result;
        },

        parseRows(rows) {
            if (rows.length < 2) return [];

            // Scan first 10 rows for best header row
            let cols = { date: -1, description: -1, debit: -1, credit: -1, balance: -1, month: -1 };
            let dataStartIdx = 1;
            let bestScore = 0;
            const scanLimit = Math.min(rows.length - 1, 10);

            for (let r = 0; r < scanLimit; r++) {
                const testHeaders = rows[r].map(h => String(h));
                const testCols = Parser.detectColumns(testHeaders);
                let score = 0;
                if (testCols.date >= 0) score++;
                if (testCols.description >= 0) score++;
                if (testCols.debit >= 0) score += 2;
                if (testCols.credit >= 0) score += 2;
                if (testCols.balance >= 0) score++;
                if (score > bestScore) {
                    bestScore = score;
                    cols = testCols;
                    dataStartIdx = r + 1;
                }
            }

            // Positional fallback
            if (cols.date === -1 && cols.description === -1 && cols.debit === -1 && cols.credit === -1) {
                if (rows[0].length >= 3) {
                    cols.date = 0; cols.description = 1; cols.debit = 2;
                    dataStartIdx = 1;
                } else { return []; }
            }

            Parser.columnInfo = {
                hasDebit: cols.debit >= 0,
                hasCredit: cols.credit >= 0,
                hasBalance: cols.balance >= 0,
                hasMonth: cols.month >= 0
            };

            const transactions = [];
            for (let i = dataStartIdx; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 2) continue;

                const date = cols.date >= 0 ? Parser.parseDate(row[cols.date]) : null;
                const desc = cols.description >= 0 ? String(row[cols.description] || '').trim() : '';
                const debitRaw = cols.debit >= 0 ? Parser.parseAmount(row[cols.debit]) : null;
                const creditRaw = cols.credit >= 0 ? Parser.parseAmount(row[cols.credit]) : null;
                const balanceRaw = cols.balance >= 0 ? Parser.parseAmount(row[cols.balance]) : null;
                const monthRaw = cols.month >= 0 ? Parser.parseMonth(row[cols.month]) : null;
                const monthKey = monthRaw || (date ? date.substring(0, 7) : null);

                let rowType, amount;
                if (debitRaw !== null && debitRaw > 0) {
                    rowType = 'debit'; amount = debitRaw;
                } else if (creditRaw !== null && creditRaw > 0) {
                    rowType = 'credit'; amount = creditRaw;
                } else { continue; }

                if (!desc && !amount) continue;

                transactions.push({
                    id: Utils.generateId(),
                    date: date || new Date().toISOString().split('T')[0],
                    description: desc || 'Unnamed Transaction',
                    amount,
                    category: CategoryEngine.autoDetect(desc),
                    selected: rowType === 'debit',
                    rowType,
                    debitRaw,
                    creditRaw,
                    balanceRaw,
                    monthKey
                });
            }
            return transactions;
        },

        parseCSV(text) {
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return [];

            // Detect delimiter
            const firstLine = lines[0];
            let delimiter = ',';
            if (firstLine.includes('\t') && (firstLine.split('\t').length > firstLine.split(',').length)) {
                delimiter = '\t';
            } else if (firstLine.includes(';') && !firstLine.includes(',')) {
                delimiter = ';';
            } else if (firstLine.includes('|') && (firstLine.split('|').length > firstLine.split(',').length)) {
                delimiter = '|';
            }

            const splitRow = (line) => {
                if (delimiter !== ',') return line.split(delimiter).map(c => c.trim());
                const cells = [];
                let current = '';
                let inQuotes = false;
                for (const char of line) {
                    if (char === '"') { inQuotes = !inQuotes; }
                    else if (char === ',' && !inQuotes) { cells.push(current.trim()); current = ''; }
                    else { current += char; }
                }
                cells.push(current.trim());
                return cells;
            };

            const rows = lines.map(splitRow);
            return Parser.parseRows(rows);
        },

        parseExcel(arrayBuffer) {
            try {
                if (typeof XLSX === 'undefined') return [];
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                return Parser.parseRows(rows);
            } catch { return []; }
        },

        render(transactions) {
            Parser.pending = transactions;
            const card = document.getElementById('parsed-transactions-card');
            const tableContainer = document.getElementById('parsed-transactions-table');
            const countEl = document.getElementById('parsed-count');
            if (!card || !tableContainer) return;

            if (transactions.length === 0) {
                card.style.display = 'none';
                return;
            }
            card.style.display = '';

            const info = Parser.columnInfo || {};
            const hasDebit = info.hasDebit;
            const hasCredit = info.hasCredit;
            const hasBalance = info.hasBalance;

            // Build header
            let headerHtml = '<th><input type="checkbox" id="select-all-parsed" checked></th><th>Date</th><th>Description</th>';
            if (hasDebit) headerHtml += '<th>Debit</th>';
            if (hasCredit) headerHtml += '<th>Credit</th>';
            if (!hasDebit && !hasCredit) headerHtml += '<th>Amount</th>';
            if (hasBalance) headerHtml += '<th>Balance</th>';
            headerHtml += '<th>Category</th>';

            // Build rows
            let rowsHtml = '';
            transactions.forEach((t, idx) => {
                const rowClass = t.rowType === 'credit' ? ' class="credit-row"' : '';
                rowsHtml += `<tr${rowClass}>`;
                rowsHtml += `<td><input type="checkbox" data-parsed-idx="${idx}" ${t.selected ? 'checked' : ''}></td>`;
                rowsHtml += `<td>${Utils.escapeHtml(t.date)}</td>`;
                rowsHtml += `<td>${Utils.escapeHtml(t.description)}</td>`;

                if (hasDebit) {
                    rowsHtml += `<td class="expense">${t.debitRaw != null && t.debitRaw > 0 ? Currency.format(t.debitRaw) : ''}</td>`;
                }
                if (hasCredit) {
                    rowsHtml += `<td class="income">${t.creditRaw != null && t.creditRaw > 0 ? Currency.format(t.creditRaw) : ''}</td>`;
                }
                if (!hasDebit && !hasCredit) {
                    rowsHtml += `<td class="expense">${Currency.format(t.amount)}</td>`;
                }
                if (hasBalance) {
                    rowsHtml += `<td class="balance-col">${t.balanceRaw != null ? Currency.format(t.balanceRaw) : ''}</td>`;
                }

                rowsHtml += `<td><select class="parsed-category" data-parsed-cat-idx="${idx}">${CategoryEngine.optionsHtml(t.category)}</select></td>`;
                rowsHtml += '</tr>';
            });

            tableContainer.innerHTML = `
                <div class="parsed-table-wrapper">
                    <table class="analytics-table parsed-table">
                        <thead><tr>${headerHtml}</tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>`;

            // Select-all checkbox
            const selectAll = document.getElementById('select-all-parsed');
            if (selectAll) {
                selectAll.addEventListener('change', () => {
                    transactions.forEach(t => { t.selected = selectAll.checked; });
                    tableContainer.querySelectorAll('input[data-parsed-idx]').forEach(cb => {
                        cb.checked = selectAll.checked;
                    });
                    Parser.updateCount();
                });
            }

            // Row checkboxes
            tableContainer.querySelectorAll('input[data-parsed-idx]').forEach(cb => {
                cb.addEventListener('change', () => {
                    const idx = parseInt(cb.dataset.parsedIdx);
                    transactions[idx].selected = cb.checked;
                    // Update select-all indeterminate state
                    const checked = transactions.filter(t => t.selected).length;
                    if (selectAll) {
                        selectAll.checked = checked === transactions.length;
                        selectAll.indeterminate = checked > 0 && checked < transactions.length;
                    }
                    Parser.updateCount();
                });
            });

            // Category selects
            tableContainer.querySelectorAll('select[data-parsed-cat-idx]').forEach(sel => {
                sel.addEventListener('change', () => {
                    const idx = parseInt(sel.dataset.parsedCatIdx);
                    transactions[idx].category = sel.value;
                });
            });

            // Initial indeterminate state
            const checkedCount = transactions.filter(t => t.selected).length;
            if (selectAll) {
                selectAll.checked = checkedCount === transactions.length;
                selectAll.indeterminate = checkedCount > 0 && checkedCount < transactions.length;
            }

            Parser.updateCount();
        },

        updateCount() {
            const countEl = document.getElementById('parsed-count');
            if (!countEl) return;
            const selected = Parser.pending.filter(t => t.selected).length;
            countEl.textContent = `${selected} of ${Parser.pending.length} selected for import`;
        },

        import() {
            const toImport = Parser.pending.filter(t => t.selected);
            if (toImport.length === 0) {
                Notify.show('No transactions selected for import', 'warning');
                return;
            }

            toImport.forEach(t => {
                State.data.expenses.push({
                    id: Utils.generateId(),
                    description: t.description,
                    amount: t.amount,
                    category: t.category,
                    date: t.date,
                    monthKey: t.monthKey || (t.date ? t.date.substring(0, 7) : null)
                });
            });
            State.save('expenses');

            Parser.pending = [];
            Parser.columnInfo = null;
            const parsedCard = document.getElementById('parsed-transactions-card');
            if (parsedCard) parsedCard.style.display = 'none';

            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show(toImport.length + ' transactions imported', 'success');
        },

        discard() {
            Parser.pending = [];
            Parser.columnInfo = null;
            const parsedCard = document.getElementById('parsed-transactions-card');
            if (parsedCard) parsedCard.style.display = 'none';
            Notify.show('Parsed transactions discarded', 'info');
        }
    };

    // ==================== INVESTMENT PARSER ====================

    const InvestmentParser = {
        pending: [],

        investmentTypes: {
            '401k': '401(k)',
            'ira': 'IRA',
            'roth': 'Roth IRA',
            'roth-ira': 'Roth IRA',
            'brokerage': 'Brokerage',
            'etf': 'ETF',
            'stock': 'Stocks',
            'stocks': 'Stocks',
            'bond': 'Bonds',
            'bonds': 'Bonds',
            'mutual': 'Mutual Fund',
            'fund': 'Mutual Fund',
            'crypto': 'Crypto',
            'savings': 'Savings',
            'other': 'Other'
        },

        detectColumns(headers) {
            const lower = headers.map(h => String(h).toLowerCase().trim());
            const result = { name: -1, symbol: -1, shares: -1, price: -1, value: -1, type: -1, gain: -1 };
            const assigned = new Set();

            // Pass 1: Symbol/Ticker
            for (let i = 0; i < lower.length; i++) {
                if (/\b(ticker|symbol)\b/.test(lower[i])) {
                    result.symbol = i; assigned.add(i); break;
                }
            }

            // Pass 2: Name/Description
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(name|description|security|holding|investment)\b/.test(lower[i])) {
                    result.name = i; assigned.add(i); break;
                }
            }

            // Pass 3: Shares/Quantity
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(shares|units|quantity|qty)\b/.test(lower[i])) {
                    result.shares = i; assigned.add(i); break;
                }
            }

            // Pass 4: Price
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(price|cost|basis)\b/.test(lower[i]) && !/\b(total|value|gain)\b/.test(lower[i])) {
                    result.price = i; assigned.add(i); break;
                }
            }

            // Pass 5: Value/Amount
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(value|amount|total|market)\b/.test(lower[i])) {
                    result.value = i; assigned.add(i); break;
                }
            }

            // Pass 6: Type/Category
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(type|category|asset|class)\b/.test(lower[i])) {
                    result.type = i; assigned.add(i); break;
                }
            }

            // Pass 7: Gain/Return
            for (let i = 0; i < lower.length; i++) {
                if (assigned.has(i)) continue;
                if (/\b(gain|loss|return|change|profit)\b/.test(lower[i])) {
                    result.gain = i; assigned.add(i); break;
                }
            }

            return result;
        },

        autoDetectType(text) {
            if (!text) return 'other';
            const lower = String(text).toLowerCase();

            for (const [keyword, type] of Object.entries(InvestmentParser.investmentTypes)) {
                if (lower.includes(keyword)) {
                    return keyword === '401k' ? '401k' :
                           keyword.includes('roth') ? 'roth-ira' :
                           keyword === 'stocks' || keyword === 'stock' ? 'stocks' :
                           keyword === 'bonds' || keyword === 'bond' ? 'bonds' :
                           keyword === 'mutual' || keyword === 'fund' ? 'mutual-fund' :
                           keyword;
                }
            }

            // Check for common ETF tickers
            if (/^(SPY|VOO|VTI|QQQ|IWM|VT|BND|VNQ)\b/i.test(text)) return 'etf';
            // Check for crypto
            if (/^(BTC|ETH|DOGE|ADA|SOL|XRP)\b/i.test(text)) return 'crypto';

            return 'stocks'; // Default to stocks for unrecognized
        },

        parseRows(rows) {
            if (rows.length < 2) return [];

            // Find best header row (first 5 rows)
            let bestHeaderIdx = 0;
            let bestScore = 0;
            for (let i = 0; i < Math.min(5, rows.length); i++) {
                const headers = rows[i];
                const cols = InvestmentParser.detectColumns(headers);
                let score = 0;
                if (cols.name !== -1 || cols.symbol !== -1) score += 2;
                if (cols.value !== -1) score += 2;
                if (cols.shares !== -1) score += 1;
                if (cols.type !== -1) score += 1;
                if (score > bestScore) {
                    bestScore = score;
                    bestHeaderIdx = i;
                }
            }

            const headers = rows[bestHeaderIdx];
            const cols = InvestmentParser.detectColumns(headers);
            const investments = [];

            // Parse data rows
            for (let i = bestHeaderIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                // Get name from symbol or name column
                let name = '';
                if (cols.symbol !== -1 && row[cols.symbol]) {
                    name = String(row[cols.symbol]).trim();
                }
                if (cols.name !== -1 && row[cols.name]) {
                    const nameVal = String(row[cols.name]).trim();
                    name = name ? `${name} - ${nameVal}` : nameVal;
                }
                if (!name && row[0]) {
                    name = String(row[0]).trim(); // Fallback to first column
                }

                // Get value
                let value = 0;
                if (cols.value !== -1) {
                    value = Parser.parseAmount(row[cols.value]) || 0;
                } else if (cols.shares !== -1 && cols.price !== -1) {
                    const shares = Parser.parseAmount(row[cols.shares]) || 0;
                    const price = Parser.parseAmount(row[cols.price]) || 0;
                    value = shares * price;
                }

                // Skip rows without meaningful data
                if (!name || value <= 0) continue;

                // Get type
                let type = 'stocks';
                if (cols.type !== -1 && row[cols.type]) {
                    type = InvestmentParser.autoDetectType(row[cols.type]);
                } else {
                    type = InvestmentParser.autoDetectType(name);
                }

                investments.push({
                    id: Utils.generateId(),
                    name: name,
                    value: value,
                    type: type,
                    shares: cols.shares !== -1 ? Parser.parseAmount(row[cols.shares]) : null,
                    price: cols.price !== -1 ? Parser.parseAmount(row[cols.price]) : null,
                    gain: cols.gain !== -1 ? Parser.parseAmount(row[cols.gain]) : null,
                    selected: true
                });
            }

            return investments;
        },

        typeOptionsHtml(selectedType) {
            const types = [
                { value: '401k', label: '401(k)' },
                { value: 'ira', label: 'IRA' },
                { value: 'roth-ira', label: 'Roth IRA' },
                { value: 'brokerage', label: 'Brokerage' },
                { value: 'etf', label: 'ETF' },
                { value: 'stocks', label: 'Stocks' },
                { value: 'bonds', label: 'Bonds' },
                { value: 'mutual-fund', label: 'Mutual Fund' },
                { value: 'crypto', label: 'Crypto' },
                { value: 'savings', label: 'Savings' },
                { value: 'other', label: 'Other' }
            ];
            return types.map(t =>
                `<option value="${t.value}"${t.value === selectedType ? ' selected' : ''}>${t.label}</option>`
            ).join('');
        },

        render(investments) {
            InvestmentParser.pending = investments;
            const card = document.getElementById('parsed-investments-card');
            const tableContainer = document.getElementById('parsed-investments-table');
            const countEl = document.getElementById('parsed-investments-count');
            if (!card || !tableContainer) return;

            if (investments.length === 0) {
                card.style.display = 'none';
                return;
            }
            card.style.display = '';

            // Build header
            const headerHtml = '<th><input type="checkbox" id="select-all-investments" checked></th>' +
                '<th>Name/Symbol</th><th>Value</th><th>Shares</th><th>Type</th>';

            // Build rows
            let rowsHtml = '';
            investments.forEach((inv, idx) => {
                rowsHtml += '<tr>';
                rowsHtml += `<td><input type="checkbox" data-inv-idx="${idx}" ${inv.selected ? 'checked' : ''}></td>`;
                rowsHtml += `<td>${Utils.escapeHtml(inv.name)}</td>`;
                rowsHtml += `<td class="value-col">${Currency.format(inv.value)}</td>`;
                rowsHtml += `<td>${inv.shares ? inv.shares.toFixed(2) : '-'}</td>`;
                rowsHtml += `<td><select class="parsed-inv-type" data-inv-type-idx="${idx}">${InvestmentParser.typeOptionsHtml(inv.type)}</select></td>`;
                rowsHtml += '</tr>';
            });

            tableContainer.innerHTML = `
                <div class="parsed-table-wrapper">
                    <table class="analytics-table parsed-table">
                        <thead><tr>${headerHtml}</tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>`;

            // Select-all checkbox
            const selectAll = document.getElementById('select-all-investments');
            if (selectAll) {
                selectAll.addEventListener('change', () => {
                    investments.forEach(inv => { inv.selected = selectAll.checked; });
                    tableContainer.querySelectorAll('input[data-inv-idx]').forEach(cb => {
                        cb.checked = selectAll.checked;
                    });
                    InvestmentParser.updateCount();
                });
            }

            // Row checkboxes
            tableContainer.querySelectorAll('input[data-inv-idx]').forEach(cb => {
                cb.addEventListener('change', () => {
                    const idx = parseInt(cb.dataset.invIdx);
                    investments[idx].selected = cb.checked;
                    const checked = investments.filter(inv => inv.selected).length;
                    if (selectAll) {
                        selectAll.checked = checked === investments.length;
                        selectAll.indeterminate = checked > 0 && checked < investments.length;
                    }
                    InvestmentParser.updateCount();
                });
            });

            // Type selects
            tableContainer.querySelectorAll('select[data-inv-type-idx]').forEach(sel => {
                sel.addEventListener('change', () => {
                    const idx = parseInt(sel.dataset.invTypeIdx);
                    investments[idx].type = sel.value;
                });
            });

            InvestmentParser.updateCount();
        },

        updateCount() {
            const countEl = document.getElementById('parsed-investments-count');
            if (!countEl) return;
            const selected = InvestmentParser.pending.filter(inv => inv.selected).length;
            countEl.textContent = `${selected} of ${InvestmentParser.pending.length} selected for import`;
        },

        import() {
            const toImport = InvestmentParser.pending.filter(inv => inv.selected);
            if (toImport.length === 0) {
                Notify.show('No investments selected for import', 'warning');
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            toImport.forEach(inv => {
                State.data.investments.push({
                    id: Utils.generateId(),
                    name: inv.name,
                    value: inv.value,
                    type: inv.type,
                    expectedReturn: null,
                    startDate: today,
                    status: 'active'
                });
            });
            State.save('investments');

            InvestmentParser.pending = [];
            const parsedCard = document.getElementById('parsed-investments-card');
            if (parsedCard) parsedCard.style.display = 'none';

            Investments.render();
            Dashboard.update();
            Notify.show(toImport.length + ' investments imported', 'success');
        },

        discard() {
            InvestmentParser.pending = [];
            const parsedCard = document.getElementById('parsed-investments-card');
            if (parsedCard) parsedCard.style.display = 'none';
            Notify.show('Parsed investments discarded', 'info');
        }
    };

    // ==================== BUDGET ====================

    const Budget = {
        categories: ['housing', 'transportation', 'food', 'utilities', 'healthcare',
                     'entertainment', 'shopping', 'education', 'personal', 'other'],

        init() {
            Budget.loadBudgets();
            Budget.setupForm();
            Budget.renderComparison();
        },

        loadBudgets() {
            // Load saved budgets into form inputs
            const budgets = State.data.budgets || {};
            Budget.categories.forEach(cat => {
                const input = document.getElementById(`budget-${cat}`);
                if (input && budgets[cat]) {
                    input.value = budgets[cat];
                }
            });
        },

        setupForm() {
            const form = document.getElementById('budget-form');
            if (!form) return;

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                Budget.saveBudgets();
            });
        },

        saveBudgets() {
            const budgets = {};
            Budget.categories.forEach(cat => {
                const input = document.getElementById(`budget-${cat}`);
                if (input && input.value) {
                    budgets[cat] = parseFloat(input.value) || 0;
                }
            });

            State.set('budgets', budgets);
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('Budgets saved successfully', 'success');
        },

        getMonthlyExpenses() {
            // Get expenses for the current month
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            return State.data.expenses.filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
            });
        },

        renderComparison() {
            const container = document.getElementById('budget-summary');
            if (!container) return;

            const budgets = State.data.budgets || {};
            const hasBudgets = Object.values(budgets).some(v => v > 0);

            if (!hasBudgets) {
                container.innerHTML = '<p class="empty-state">Set budgets above to see your spending comparison.</p>';
                return;
            }

            // Calculate actual spending by category for current month
            const monthlyExpenses = Budget.getMonthlyExpenses();
            const actualByCategory = {};
            monthlyExpenses.forEach(exp => {
                actualByCategory[exp.category] = (actualByCategory[exp.category] || 0) + exp.amount;
            });

            let html = '';
            let totalBudget = 0;
            let totalActual = 0;

            Budget.categories.forEach(cat => {
                const budget = budgets[cat] || 0;
                if (budget <= 0) return; // Skip categories without budget

                const actual = actualByCategory[cat] || 0;
                totalBudget += budget;
                totalActual += actual;

                const percentage = Math.min((actual / budget) * 100, 100);
                const remaining = budget - actual;
                const isOver = actual > budget;
                const isWarning = percentage >= 80 && percentage < 100;

                let statusClass = 'under';
                let statusText = `${Currency.format(remaining)} remaining`;
                if (isOver) {
                    statusClass = 'over';
                    statusText = `${Currency.format(Math.abs(remaining))} over budget`;
                } else if (isWarning) {
                    statusClass = 'warning';
                    statusText = `${Currency.format(remaining)} remaining (${percentage.toFixed(0)}% used)`;
                }

                const progressClass = isOver ? 'over' : (isWarning ? 'warning' : '');

                html += `
                    <div class="budget-item">
                        <div class="budget-item-header">
                            <span class="budget-item-category">${CategoryEngine.labels[cat] || cat}</span>
                            <span class="budget-item-amounts">
                                <span class="actual ${statusClass}">${Currency.format(actual)}</span>
                                / ${Currency.format(budget)}
                            </span>
                        </div>
                        <div class="budget-progress">
                            <div class="budget-progress-fill ${progressClass}" style="width: ${percentage}%"></div>
                        </div>
                        <div class="budget-item-status ${statusClass}">${statusText}</div>
                    </div>
                `;
            });

            // Add total summary
            const totalRemaining = totalBudget - totalActual;
            const totalOver = totalActual > totalBudget;
            const totalClass = totalOver ? 'over' : 'under';

            html += `
                <div class="budget-total">
                    <span class="budget-total-label">Total Budget</span>
                    <span class="budget-total-value ${totalClass}">
                        ${Currency.format(totalActual)} / ${Currency.format(totalBudget)}
                        ${totalOver ? '(Over by ' + Currency.format(Math.abs(totalRemaining)) + ')' : '(' + Currency.format(totalRemaining) + ' remaining)'}
                    </span>
                </div>
            `;

            container.innerHTML = html;
        }
    };

    // ==================== EXPENSES ====================

    const Expenses = {
        render(filter) {
            filter = filter || document.getElementById('filter-category').value || 'all';
            const container = document.getElementById('expense-list');
            if (!container) return;

            let expenses = [...State.data.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
            if (filter !== 'all') {
                expenses = expenses.filter(e => e.category === filter);
            }

            if (expenses.length === 0) {
                container.innerHTML = '<p class="empty-state">No expenses recorded yet. Add your first expense above.</p>';
                Nudges.renderExpenseInsights(); // Still render insights (shows empty state)
                return;
            }

            container.innerHTML = expenses.map(exp => `
                <div class="expense-item" id="expense-${exp.id}">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(exp.description)}</h4>
                        <p>${Utils.formatDate(exp.date)}</p>
                        <span class="category-tag ${exp.category}">${CategoryEngine.labels[exp.category] || exp.category}</span>
                    </div>
                    <span class="item-amount expense">${Currency.format(exp.amount)}</span>
                    <button class="edit-btn" data-action="edit-expense" data-id="${exp.id}" aria-label="Edit expense" title="Edit">&#9998;</button>
                    <button class="delete-btn" data-action="delete-expense" data-id="${exp.id}" aria-label="Delete expense" title="Delete">&#128465;</button>
                </div>
            `).join('');

            // Render section-specific expense insights
            Nudges.renderExpenseInsights();
        },

        add(e) {
            e.preventDefault();
            const description = document.getElementById('expense-description').value.trim();
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const category = document.getElementById('expense-category').value;
            const date = document.getElementById('expense-date').value;

            if (!description || !amount || !category || !date) return;

            State.modify('expenses', arr => arr.push({
                id: Utils.generateId(),
                description, amount, category, date
            }));

            e.target.reset();
            document.getElementById('expense-date').valueAsDate = new Date();
            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('Expense added', 'success');
        },

        delete(id) {
            State.set('expenses', State.data.expenses.filter(e => e.id !== id));
            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('Expense deleted', 'info');
        },

        edit(id) {
            const exp = State.data.expenses.find(e => e.id === id);
            if (!exp) return;
            const el = document.getElementById('expense-' + id);
            if (!el) return;

            el.className = 'expense-item editing';
            el.innerHTML = `
                <div class="edit-form">
                    <div class="edit-row">
                        <div class="edit-field">
                            <label>Description</label>
                            <input type="text" class="edit-input" id="edit-desc-${id}" value="${Utils.escapeHtml(exp.description)}">
                        </div>
                        <div class="edit-field">
                            <label>Amount</label>
                            <input type="number" class="edit-input" id="edit-amount-${id}" step="0.01" value="${exp.amount}">
                        </div>
                    </div>
                    <div class="edit-row">
                        <div class="edit-field">
                            <label>Category</label>
                            <select class="edit-input" id="edit-cat-${id}">
                                ${CategoryEngine.optionsHtml(exp.category)}
                            </select>
                        </div>
                        <div class="edit-field">
                            <label>Date</label>
                            <input type="date" class="edit-input" id="edit-date-${id}" value="${exp.date}">
                        </div>
                    </div>
                    <div class="edit-actions">
                        <button class="btn btn-primary btn-sm" data-action="save-expense-edit" data-id="${id}">Save</button>
                        <button class="btn btn-secondary btn-sm" data-action="cancel-expense-edit">Cancel</button>
                    </div>
                </div>`;
        },

        saveEdit(id) {
            const desc = document.getElementById('edit-desc-' + id);
            const amount = document.getElementById('edit-amount-' + id);
            const cat = document.getElementById('edit-cat-' + id);
            const date = document.getElementById('edit-date-' + id);
            if (!desc || !amount || !cat || !date) return;

            const exp = State.data.expenses.find(e => e.id === id);
            if (!exp) return;

            exp.description = desc.value.trim();
            exp.amount = parseFloat(amount.value);
            exp.category = cat.value;
            exp.date = date.value;
            State.save('expenses');

            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('Expense updated', 'success');
        },

        cancelEdit() {
            Expenses.render();
        },

        reset() {
            if (!confirm('Are you sure you want to delete all expenses? This cannot be undone.')) return;
            State.set('expenses', []);
            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('All expenses have been reset', 'info');
        }
    };

    // ==================== PLANNED EXPENSES ====================

    const PlannedExpenses = {
        render() {
            const container = document.getElementById('planned-expenses-list');
            if (!container) return;

            if (State.data.plannedExpenses.length === 0) {
                container.innerHTML = '<p class="empty-state">No planned expenses. Add future expenses to see them in your projections.</p>';
                return;
            }

            const sorted = [...State.data.plannedExpenses].sort((a, b) =>
                new Date(a.plannedDate) - new Date(b.plannedDate)
            );

            container.innerHTML = sorted.map(exp => {
                const dateStr = new Date(exp.plannedDate).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
                const statusClass = exp.status === 'completed' ? 'completed' :
                                   exp.status === 'cancelled' ? 'cancelled' : '';
                const recurringBadge = exp.isRecurring ?
                    '<span class="badge recurring-badge">Recurring</span>' : '';

                return `
                <div class="planned-expense-item ${statusClass}">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(exp.description)} ${recurringBadge}</h4>
                        <p>${dateStr} · ${Utils.capitalizeFirst(exp.category)}</p>
                    </div>
                    <span class="item-amount expense">${Currency.format(exp.amount)}</span>
                    <div class="item-actions">
                        ${exp.status === 'planned' ? `
                            <button class="action-btn complete-btn" data-action="complete-planned" data-id="${exp.id}" title="Mark Complete">✓</button>
                            <button class="action-btn cancel-btn" data-action="cancel-planned" data-id="${exp.id}" title="Cancel">✕</button>
                        ` : ''}
                        <button class="delete-btn" data-action="delete-planned" data-id="${exp.id}" aria-label="Delete" title="Delete">🗑️</button>
                    </div>
                </div>`;
            }).join('');
        },

        add(e) {
            e.preventDefault();
            const form = e.target;
            const description = form.querySelector('#planned-description').value.trim();
            const amount = parseFloat(form.querySelector('#planned-amount').value);
            const category = form.querySelector('#planned-category').value;
            const plannedDate = form.querySelector('#planned-date').value;
            const isRecurring = form.querySelector('#planned-recurring').checked;
            const recurringEndDate = form.querySelector('#planned-end-date')?.value || null;

            if (!description || !amount || !plannedDate) {
                Notify.show('Please fill in all required fields', 'warning');
                return;
            }

            const monthKey = plannedDate.substring(0, 7);

            State.modify('plannedExpenses', arr => arr.push({
                id: Utils.generateId(),
                description,
                amount,
                category: category || 'other',
                plannedDate,
                monthKey,
                isRecurring,
                recurringEndDate: isRecurring ? recurringEndDate : null,
                status: 'planned'
            }));

            form.reset();
            PlannedExpenses.render();
            Dashboard.update();
            Notify.show('Planned expense added', 'success');
        },

        complete(id) {
            const planned = State.data.plannedExpenses.find(p => p.id === id);
            if (!planned) return;

            // Move to actual expenses
            State.modify('expenses', arr => arr.push({
                id: Utils.generateId(),
                description: planned.description,
                amount: planned.amount,
                category: planned.category,
                date: planned.plannedDate,
                monthKey: planned.monthKey
            }));

            // Update status
            const idx = State.data.plannedExpenses.findIndex(p => p.id === id);
            if (idx !== -1) {
                State.data.plannedExpenses[idx].status = 'completed';
                State.save('plannedExpenses');
            }

            PlannedExpenses.render();
            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('Expense marked as completed and added to expenses', 'success');
        },

        cancel(id) {
            const idx = State.data.plannedExpenses.findIndex(p => p.id === id);
            if (idx !== -1) {
                State.data.plannedExpenses[idx].status = 'cancelled';
                State.save('plannedExpenses');
            }
            PlannedExpenses.render();
            Dashboard.update();
            Notify.show('Planned expense cancelled', 'info');
        },

        delete(id) {
            State.set('plannedExpenses', State.data.plannedExpenses.filter(p => p.id !== id));
            PlannedExpenses.render();
            Dashboard.update();
            Notify.show('Planned expense deleted', 'info');
        },

        getProjectedExpenses(monthKey) {
            // Get planned expenses for a specific month (including recurring)
            let total = 0;
            const targetDate = new Date(monthKey + '-01');

            State.data.plannedExpenses.forEach(exp => {
                if (exp.status !== 'planned') return;

                const expDate = new Date(exp.plannedDate);
                const expMonthKey = exp.monthKey;

                if (exp.isRecurring) {
                    // Check if this recurring expense applies to the target month
                    const startMonth = new Date(exp.plannedDate);
                    const endMonth = exp.recurringEndDate ? new Date(exp.recurringEndDate) : null;

                    if (targetDate >= startMonth && (!endMonth || targetDate <= endMonth)) {
                        total += exp.amount;
                    }
                } else {
                    // One-time expense - only count if it matches the month
                    if (expMonthKey === monthKey) {
                        total += exp.amount;
                    }
                }
            });

            return total;
        }
    };

    // ==================== DEBTS ====================

    const Debts = {
        render() {
            const container = document.getElementById('debt-list');
            if (!container) return;

            if (State.data.debts.length === 0) {
                container.innerHTML = '<p class="empty-state">No debts recorded. Add your debts to get a personalized payoff plan.</p>';
                Debts.updatePayoffPlan();
                Nudges.renderDebtInsights(); // Still render insights (shows empty state)
                return;
            }

            container.innerHTML = State.data.debts.map(debt => {
                const statusBadge = debt.status === 'planned' ?
                    '<span class="badge planned-badge">Planned</span>' : '';
                return `
                <div class="debt-item ${debt.status === 'planned' ? 'planned' : ''}">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(debt.name)} ${statusBadge}</h4>
                        <p>${Utils.capitalizeFirst(debt.type.replace('-', ' '))} &bull; ${debt.rate}% APR</p>
                        <p>Min payment: ${Currency.format(debt.minimum)}/mo</p>
                    </div>
                    <span class="item-amount debt">${Currency.format(debt.balance)}</span>
                    <button class="delete-btn" data-action="delete-debt" data-id="${debt.id}" aria-label="Delete debt" title="Delete">&#128465;</button>
                </div>`;
            }).join('');

            Debts.updatePayoffPlan();
            Debts.renderDebtProjection();

            // Render section-specific debt insights
            Nudges.renderDebtInsights();
        },

        add(e) {
            e.preventDefault();
            const name = document.getElementById('debt-name').value.trim();
            const balance = parseFloat(document.getElementById('debt-balance').value);
            const rate = parseFloat(document.getElementById('debt-rate').value);
            const minimum = parseFloat(document.getElementById('debt-minimum').value);
            const type = document.getElementById('debt-type').value;

            if (!name || !balance || !rate || !minimum || !type) return;

            State.modify('debts', arr => arr.push({
                id: Utils.generateId(),
                name, balance, rate, minimum, type,
                startDate: new Date().toISOString().split('T')[0],
                status: 'active'
            }));

            e.target.reset();
            Debts.render();
            Dashboard.update();
            Notify.show('Debt added', 'success');
        },

        delete(id) {
            State.set('debts', State.data.debts.filter(d => d.id !== id));
            Debts.render();
            Dashboard.update();
            Notify.show('Debt deleted', 'info');
        },

        reset() {
            if (!confirm('Are you sure you want to delete all debts? This cannot be undone.')) return;
            State.set('debts', []);
            State.set('plannedDebts', []);
            Debts.render();
            PlannedDebts.render();
            Dashboard.update();
            Notify.show('All debts have been reset', 'info');
        },

        updatePayoffPlan() {
            const activeTab = document.querySelector('.strategy-tab.active');
            const strategy = activeTab ? activeTab.dataset.strategy : 'avalanche';
            const infoEl = document.querySelector('.strategy-info');
            const planEl = document.getElementById('payoff-plan');

            if (infoEl) {
                if (strategy === 'avalanche') {
                    infoEl.innerHTML = '<h4>Avalanche Method</h4><p>Pay off debts with the highest interest rate first. This saves the most money on interest over time.</p>';
                } else {
                    infoEl.innerHTML = '<h4>Snowball Method</h4><p>Pay off debts with the smallest balance first. This builds momentum and motivation with quick wins.</p>';
                }
            }

            if (!planEl) return;

            if (State.data.debts.length === 0) {
                planEl.innerHTML = '<p class="empty-state">Add debts to see your recommended payoff order.</p>';
                return;
            }

            const sorted = [...State.data.debts].sort((a, b) =>
                strategy === 'avalanche' ? b.rate - a.rate : a.balance - b.balance
            );

            planEl.innerHTML = sorted.map((debt, i) => `
                <div class="payoff-item">
                    <div class="payoff-order">${i + 1}</div>
                    <div class="payoff-details">
                        <h4>${Utils.escapeHtml(debt.name)}</h4>
                        <p>Balance: ${Currency.format(debt.balance)} &bull; Rate: ${debt.rate}% &bull; Min: ${Currency.format(debt.minimum)}/mo</p>
                    </div>
                </div>
            `).join('');
        },

        calculateTimeline(extraPayment) {
            const summaryEl = document.getElementById('payoff-summary');
            if (!summaryEl || State.data.debts.length === 0) return;

            let totalInterest = 0;
            let maxMonths = 0;

            State.data.debts.forEach(debt => {
                let balance = debt.balance;
                const monthlyRate = debt.rate / 100 / 12;
                let months = 0;
                const payment = debt.minimum + (extraPayment / State.data.debts.length);

                while (balance > 0 && months < 600) {
                    const interest = balance * monthlyRate;
                    totalInterest += interest;
                    balance = balance + interest - payment;
                    months++;
                    if (payment <= interest) { months = -1; break; }
                }
                if (months > maxMonths) maxMonths = months;
            });

            if (maxMonths === -1) {
                summaryEl.innerHTML = '<h4>Payment too low</h4><p>Your payments don\'t cover the interest. Increase your monthly payment amount.</p>';
                return;
            }

            const years = Math.floor(maxMonths / 12);
            const remainingMonths = maxMonths % 12;
            const totalPaid = State.data.debts.reduce((s, d) => s + d.balance, 0) + totalInterest;

            summaryEl.innerHTML = `
                <h4>Payoff Timeline</h4>
                <p><strong>Time to debt free:</strong> ${years > 0 ? years + ' years ' : ''}${remainingMonths} months</p>
                <p><strong>Total interest paid:</strong> ${Currency.format(totalInterest)}</p>
                <p><strong>Total amount paid:</strong> ${Currency.format(totalPaid)}</p>
                ${extraPayment > 0 ? `<p><strong>Extra payment:</strong> ${Currency.format(extraPayment)}/month saves you time and interest!</p>` : ''}
            `;
        },

        generateAmortization(debtId, months = 12) {
            const debt = State.data.debts.find(d => d.id === debtId);
            if (!debt) return [];

            const schedule = [];
            let balance = debt.balance;
            const monthlyRate = debt.rate / 100 / 12;
            const payment = debt.minimum;

            for (let month = 1; month <= months && balance > 0; month++) {
                const interest = balance * monthlyRate;
                const principal = Math.min(payment - interest, balance);
                balance = Math.max(0, balance - principal);

                schedule.push({
                    month,
                    payment: principal + interest,
                    principal,
                    interest,
                    remainingBalance: balance
                });

                if (payment <= interest) break; // Payment doesn't cover interest
            }

            return schedule;
        },

        getAggregateAmortization(months = 12) {
            // Aggregate all debts into a single schedule
            const aggregate = [];

            for (let month = 1; month <= months; month++) {
                let totalPayment = 0;
                let totalPrincipal = 0;
                let totalInterest = 0;
                let totalRemaining = 0;

                State.data.debts.forEach(debt => {
                    const schedule = Debts.generateAmortization(debt.id, month);
                    if (schedule.length >= month) {
                        const entry = schedule[month - 1];
                        totalPayment += entry.payment;
                        totalPrincipal += entry.principal;
                        totalInterest += entry.interest;
                        totalRemaining += entry.remainingBalance;
                    }
                });

                aggregate.push({
                    month,
                    payment: totalPayment,
                    principal: totalPrincipal,
                    interest: totalInterest,
                    remainingBalance: totalRemaining
                });
            }

            return aggregate;
        },

        calculateDebtFreeDate() {
            if (State.data.debts.length === 0) return null;

            let maxMonths = 0;

            State.data.debts.forEach(debt => {
                let balance = debt.balance;
                const monthlyRate = debt.rate / 100 / 12;
                let months = 0;
                const payment = debt.minimum;

                while (balance > 0 && months < 600) {
                    const interest = balance * monthlyRate;
                    if (payment <= interest) return null; // Can never pay off
                    balance = balance + interest - payment;
                    months++;
                }
                if (months > maxMonths) maxMonths = months;
            });

            if (maxMonths === 0 || maxMonths >= 600) return null;

            const debtFreeDate = new Date();
            debtFreeDate.setMonth(debtFreeDate.getMonth() + maxMonths);
            return debtFreeDate;
        },

        renderDebtProjection() {
            const container = document.getElementById('debt-projection');
            if (!container) return;

            if (State.data.debts.length === 0) {
                container.innerHTML = '<p class="empty-state">Add debts to see your 12-month amortization projection.</p>';
                return;
            }

            const aggregate = Debts.getAggregateAmortization(12);
            const debtFreeDate = Debts.calculateDebtFreeDate();
            const totalDebt = State.data.debts.reduce((s, d) => s + d.balance, 0);

            let debtFreeDateStr = 'More than 50 years';
            if (debtFreeDate) {
                debtFreeDateStr = debtFreeDate.toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long'
                });
            }

            const now = new Date();

            const tableRows = aggregate.map((entry, idx) => {
                const monthDate = new Date(now.getFullYear(), now.getMonth() + idx, 1);
                const monthLabel = monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

                return `<tr>
                    <td>${monthLabel}</td>
                    <td>${Currency.format(entry.payment)}</td>
                    <td class="principal">${Currency.format(entry.principal)}</td>
                    <td class="interest">${Currency.format(entry.interest)}</td>
                    <td>${Currency.format(entry.remainingBalance)}</td>
                </tr>`;
            }).join('');

            const totalPrincipal12m = aggregate.reduce((s, e) => s + e.principal, 0);
            const totalInterest12m = aggregate.reduce((s, e) => s + e.interest, 0);

            container.innerHTML = `
                <div class="debt-projection-summary">
                    <div class="projection-stat">
                        <span class="projection-label">Total Debt</span>
                        <span class="projection-value">${Currency.format(totalDebt)}</span>
                    </div>
                    <div class="projection-stat">
                        <span class="projection-label">Debt-Free Date</span>
                        <span class="projection-value">${debtFreeDateStr}</span>
                    </div>
                    <div class="projection-stat">
                        <span class="projection-label">12-Month Principal</span>
                        <span class="projection-value principal">${Currency.format(totalPrincipal12m)}</span>
                    </div>
                    <div class="projection-stat">
                        <span class="projection-label">12-Month Interest</span>
                        <span class="projection-value interest">${Currency.format(totalInterest12m)}</span>
                    </div>
                </div>
                <div class="amortization-table-wrapper">
                    <table class="amortization-table">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Payment</th>
                                <th>Principal</th>
                                <th>Interest</th>
                                <th>Remaining</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            `;
        }
    };

    // ==================== PLANNED DEBTS ====================

    const PlannedDebts = {
        render() {
            const container = document.getElementById('planned-debts-list');
            if (!container) return;

            if (State.data.plannedDebts.length === 0) {
                container.innerHTML = '<p class="empty-state">No planned debts. Add future debts to see how they\'ll affect your projections.</p>';
                return;
            }

            const sorted = [...State.data.plannedDebts].sort((a, b) =>
                new Date(a.startDate) - new Date(b.startDate)
            );

            container.innerHTML = sorted.map(debt => {
                const startDateStr = new Date(debt.startDate).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
                const isActive = new Date(debt.startDate) <= new Date();

                return `
                <div class="planned-debt-item ${isActive ? 'ready-to-activate' : ''}">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(debt.name)}</h4>
                        <p>${Utils.capitalizeFirst(debt.type.replace('-', ' '))} &bull; ${debt.rate}% APR</p>
                        <p>Starts: ${startDateStr} &bull; Payment: ${Currency.format(debt.minimum)}/mo</p>
                    </div>
                    <span class="item-amount debt">${Currency.format(debt.balance)}</span>
                    <div class="item-actions">
                        ${isActive ? `<button class="action-btn complete-btn" data-action="activate-planned-debt" data-id="${debt.id}" title="Activate Now">&#x2713;</button>` : ''}
                        <button class="delete-btn" data-action="delete-planned-debt" data-id="${debt.id}" aria-label="Delete" title="Delete">&#128465;</button>
                    </div>
                </div>`;
            }).join('');
        },

        add(e) {
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('#planned-debt-name').value.trim();
            const balance = parseFloat(form.querySelector('#planned-debt-balance').value);
            const rate = parseFloat(form.querySelector('#planned-debt-rate').value);
            const minimum = parseFloat(form.querySelector('#planned-debt-minimum').value);
            const startDate = form.querySelector('#planned-debt-start').value;
            const type = form.querySelector('#planned-debt-type').value;

            if (!name || !balance || !rate || !minimum || !startDate || !type) {
                Notify.show('Please fill in all required fields', 'warning');
                return;
            }

            State.modify('plannedDebts', arr => arr.push({
                id: Utils.generateId(),
                name, balance, rate, minimum, type, startDate
            }));

            form.reset();
            PlannedDebts.render();
            Dashboard.update();
            Notify.show('Planned debt added', 'success');
        },

        activate(id) {
            const planned = State.data.plannedDebts.find(d => d.id === id);
            if (!planned) return;

            // Move to active debts
            State.modify('debts', arr => arr.push({
                id: Utils.generateId(),
                name: planned.name,
                balance: planned.balance,
                rate: planned.rate,
                minimum: planned.minimum,
                type: planned.type,
                startDate: new Date().toISOString().split('T')[0],
                status: 'active'
            }));

            // Remove from planned
            State.set('plannedDebts', State.data.plannedDebts.filter(d => d.id !== id));

            PlannedDebts.render();
            Debts.render();
            Dashboard.update();
            Notify.show('Debt activated and moved to your debts', 'success');
        },

        delete(id) {
            State.set('plannedDebts', State.data.plannedDebts.filter(d => d.id !== id));
            PlannedDebts.render();
            Dashboard.update();
            Notify.show('Planned debt deleted', 'info');
        },

        getTotalPlanned() {
            return State.data.plannedDebts.reduce((s, d) => s + d.balance, 0);
        }
    };

    // ==================== INVESTMENTS ====================

    const Investments = {
        chart: null,

        render() {
            const container = document.getElementById('investment-list');
            const totalEl = document.getElementById('total-investments');
            if (!container) return;

            if (State.data.investments.length === 0) {
                container.innerHTML = '<p class="empty-state">No investments recorded yet.</p>';
                if (totalEl) totalEl.textContent = Currency.format(0);
                Nudges.renderInvestmentInsights(); // Still render insights (may show if income exists)
                return;
            }

            const total = State.data.investments.reduce((s, inv) => s + inv.value, 0);
            if (totalEl) totalEl.textContent = Currency.format(total);

            container.innerHTML = State.data.investments.map(inv => `
                <div class="investment-item">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(inv.name)}</h4>
                        <p>${Utils.capitalizeFirst(inv.type.replace('-', ' '))}</p>
                    </div>
                    <span class="item-amount investment">${Currency.format(inv.value)}</span>
                    <button class="delete-btn" data-action="delete-investment" data-id="${inv.id}" aria-label="Delete investment" title="Delete">&#128465;</button>
                </div>
            `).join('');

            // Render section-specific investment insights
            Nudges.renderInvestmentInsights();
        },

        customRate: null, // User-adjustable rate override
        scenario: 'expected', // pessimistic, expected, optimistic

        add(e) {
            e.preventDefault();
            const name = document.getElementById('investment-name').value.trim();
            const value = parseFloat(document.getElementById('investment-value').value);
            const type = document.getElementById('investment-type').value;

            if (!name || !value || !type) return;

            State.modify('investments', arr => arr.push({
                id: Utils.generateId(),
                name, value, type,
                expectedReturn: null, // Use default based on risk tolerance
                startDate: new Date().toISOString().split('T')[0],
                status: 'active'
            }));

            e.target.reset();
            Investments.render();
            Dashboard.update();
            Investments.generateProjection();
            Notify.show('Investment added', 'success');
        },

        delete(id) {
            State.set('investments', State.data.investments.filter(i => i.id !== id));
            Investments.render();
            Dashboard.update();
            Notify.show('Investment deleted', 'info');
        },

        reset() {
            if (!confirm('Are you sure you want to delete all investments? This cannot be undone.')) return;
            State.set('investments', []);
            State.set('plannedInvestments', []);
            State.set('investmentProfile', null);
            Investments.render();
            PlannedInvestments.render();
            Investments.customRate = null;
            Investments.scenario = 'expected';
            // Clear recommendations and projection
            const recsEl = document.getElementById('investment-recommendations');
            const projEl = document.getElementById('projection-details');
            const ctrlEl = document.getElementById('projection-controls');
            if (recsEl) recsEl.innerHTML = '';
            if (projEl) projEl.innerHTML = '';
            if (ctrlEl) ctrlEl.innerHTML = '';
            if (Investments.chart) {
                Investments.chart.destroy();
                Investments.chart = null;
            }
            // Reset form
            const profileForm = document.getElementById('investment-profile-form');
            if (profileForm) profileForm.reset();
            Dashboard.update();
            Notify.show('All investments have been reset', 'info');
        },

        generateRecommendations() {
            const container = document.getElementById('investment-recommendations');
            if (!container || !State.data.investmentProfile) return;

            const { goal, timeline, riskTolerance, monthlyAmount } = State.data.investmentProfile;
            let allocation = {};

            if (riskTolerance === 'conservative') {
                allocation = { stocks: 30, bonds: 50, cash: 20 };
            } else if (riskTolerance === 'moderate') {
                allocation = { stocks: 60, bonds: 30, cash: 10 };
            } else {
                allocation = { stocks: 80, bonds: 15, cash: 5 };
            }

            const goalRecommendations = Investments.getGoalRecommendations(goal, allocation, timeline);

            container.innerHTML = `
                <div class="recommendation">
                    <h4>Asset Allocation</h4>
                    <p>Based on your ${riskTolerance} risk tolerance and ${timeline}-year horizon:</p>
                    <div class="allocation-bar">
                        <div class="allocation-segment stocks" style="width:${allocation.stocks}%">${allocation.stocks}%</div>
                        <div class="allocation-segment bonds" style="width:${allocation.bonds}%">${allocation.bonds}%</div>
                        <div class="allocation-segment cash" style="width:${allocation.cash}%">${allocation.cash}%</div>
                    </div>
                    <div class="allocation-legend">
                        <div class="legend-item"><span class="legend-color" style="background:var(--primary-color)"></span>Stocks ${allocation.stocks}%</div>
                        <div class="legend-item"><span class="legend-color" style="background:var(--success-color)"></span>Bonds ${allocation.bonds}%</div>
                        <div class="legend-item"><span class="legend-color" style="background:var(--warning-color)"></span>Cash ${allocation.cash}%</div>
                    </div>
                </div>
                <div class="recommendation">
                    <h4>${goalRecommendations.title}</h4>
                    <p>${goalRecommendations.description}</p>
                    <ul>${goalRecommendations.tips.map(t => '<li>' + t + '</li>').join('')}</ul>
                </div>
            `;
        },

        getGoalRecommendations(goal, allocation, timeline) {
            const recommendations = {
                retirement: {
                    title: 'Retirement Planning',
                    description: 'Focus on long-term growth with tax-advantaged accounts.',
                    tips: ['Max out 401(k) employer match', 'Consider Roth IRA for tax-free growth', 'Diversify across index funds', 'Rebalance portfolio annually']
                },
                emergency: {
                    title: 'Emergency Fund',
                    description: 'Build a safety net of 3-6 months of expenses.',
                    tips: ['Use high-yield savings account', 'Keep funds easily accessible', 'Aim for 3-6 months expenses', 'Don\'t invest emergency fund in stocks']
                },
                home: {
                    title: 'Home Purchase',
                    description: 'Save for a down payment with low-risk investments.',
                    tips: ['Target 20% down payment', 'Consider CDs or short-term bonds', 'Factor in closing costs (2-5%)', 'Look into first-time buyer programs']
                },
                education: {
                    title: 'Education Fund',
                    description: 'Save for education with tax-advantaged 529 plans.',
                    tips: ['Open a 529 plan for tax benefits', 'Start early for compound growth', 'Consider age-based portfolios', 'Research scholarship opportunities']
                },
                wealth: {
                    title: 'Wealth Building',
                    description: 'Grow your net worth through diversified investments.',
                    tips: ['Invest consistently regardless of market conditions', 'Diversify across asset classes', 'Keep fees low with index funds', 'Reinvest dividends for compound growth']
                },
                other: {
                    title: 'General Investing',
                    description: 'Build a diversified portfolio aligned with your goals.',
                    tips: ['Define clear financial goals', 'Match investment horizon to risk', 'Keep an emergency fund separate', 'Review and rebalance quarterly']
                }
            };
            return recommendations[goal] || recommendations.other;
        },

        calculateProjection(annualRate, years, monthlyAmount, currentPortfolio) {
            const monthlyRate = annualRate / 12;
            const data = [currentPortfolio];
            let balance = currentPortfolio;

            for (let y = 1; y <= years; y++) {
                for (let m = 0; m < 12; m++) {
                    balance = balance * (1 + monthlyRate) + monthlyAmount;
                }
                data.push(Math.round(balance));
            }

            return data;
        },

        getScenarioRates(baseRate) {
            return {
                pessimistic: Math.max(0, baseRate - 0.04),
                expected: baseRate,
                optimistic: baseRate + 0.04
            };
        },

        generateProjection() {
            const detailsEl = document.getElementById('projection-details');
            const controlsEl = document.getElementById('projection-controls');
            const currentPortfolio = State.data.investments.reduce((s, inv) => s + inv.value, 0);

            // Default values if no profile set
            let riskTolerance = 'moderate';
            let monthlyAmount = 0;

            if (State.data.investmentProfile) {
                riskTolerance = State.data.investmentProfile.riskTolerance;
                monthlyAmount = parseFloat(State.data.investmentProfile.monthlyAmount) || 0;
            }

            // Base rates by risk tolerance
            const baseRates = { conservative: 0.06, moderate: 0.08, aggressive: 0.10 };
            const defaultRate = baseRates[riskTolerance] || 0.08;

            // Use custom rate if set, otherwise use default
            const annualRate = Investments.customRate !== null ? Investments.customRate : defaultRate;

            // Always project 10 years
            const years = 10;

            // Generate labels
            const labels = ['Now'];
            for (let y = 1; y <= years; y++) {
                labels.push('Year ' + y);
            }

            // Get scenario rates
            const scenarioRates = Investments.getScenarioRates(annualRate);

            // Calculate projections for all scenarios
            const pessimisticData = Investments.calculateProjection(scenarioRates.pessimistic, years, monthlyAmount, currentPortfolio);
            const expectedData = Investments.calculateProjection(scenarioRates.expected, years, monthlyAmount, currentPortfolio);
            const optimisticData = Investments.calculateProjection(scenarioRates.optimistic, years, monthlyAmount, currentPortfolio);

            // Choose which data to show based on scenario
            let primaryData;
            if (Investments.scenario === 'pessimistic') primaryData = pessimisticData;
            else if (Investments.scenario === 'optimistic') primaryData = optimisticData;
            else primaryData = expectedData;

            const finalBalance = primaryData[years];
            const totalContributed = currentPortfolio + (monthlyAmount * 12 * years);
            const totalGrowth = finalBalance - totalContributed;

            // Render controls (rate slider + scenario toggle)
            if (controlsEl) {
                const sliderValue = (annualRate * 100).toFixed(1);
                controlsEl.innerHTML = `
                    <div class="projection-controls-row">
                        <div class="rate-slider-group">
                            <label for="rate-slider">Adjust Rate of Return: <strong>${sliderValue}%</strong></label>
                            <input type="range" id="rate-slider" min="0" max="15" step="0.5" value="${sliderValue}">
                            <span class="rate-range">0% - 15%</span>
                        </div>
                        <div class="scenario-toggle">
                            <label>Scenario:</label>
                            <div class="scenario-buttons">
                                <button class="scenario-btn ${Investments.scenario === 'pessimistic' ? 'active' : ''}" data-scenario="pessimistic">Pessimistic (${(scenarioRates.pessimistic * 100).toFixed(0)}%)</button>
                                <button class="scenario-btn ${Investments.scenario === 'expected' ? 'active' : ''}" data-scenario="expected">Expected (${(scenarioRates.expected * 100).toFixed(0)}%)</button>
                                <button class="scenario-btn ${Investments.scenario === 'optimistic' ? 'active' : ''}" data-scenario="optimistic">Optimistic (${(scenarioRates.optimistic * 100).toFixed(0)}%)</button>
                            </div>
                        </div>
                    </div>
                `;

                // Wire up slider
                const slider = document.getElementById('rate-slider');
                if (slider) {
                    slider.addEventListener('input', (e) => {
                        Investments.customRate = parseFloat(e.target.value) / 100;
                        Investments.generateProjection();
                    });
                }

                // Wire up scenario buttons
                controlsEl.querySelectorAll('.scenario-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        Investments.scenario = btn.dataset.scenario;
                        Investments.generateProjection();
                    });
                });
            }

            // Render chart with all three scenarios
            const ctx = document.getElementById('investment-chart');
            if (ctx) {
                if (Investments.chart) Investments.chart.destroy();
                Investments.chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Optimistic',
                                data: optimisticData,
                                borderColor: 'rgba(16, 185, 129, 0.4)',
                                backgroundColor: 'transparent',
                                borderDash: [5, 5],
                                pointRadius: 0,
                                tension: 0.3
                            },
                            {
                                label: 'Expected',
                                data: expectedData,
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                fill: true,
                                tension: 0.3
                            },
                            {
                                label: 'Pessimistic',
                                data: pessimisticData,
                                borderColor: 'rgba(239, 68, 68, 0.4)',
                                backgroundColor: 'transparent',
                                borderDash: [5, 5],
                                pointRadius: 0,
                                tension: 0.3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: { usePointStyle: true }
                            }
                        },
                        scales: {
                            y: {
                                ticks: { callback: v => Currency.format(v) }
                            }
                        }
                    }
                });
            }

            if (detailsEl) {
                const rangeMin = Currency.format(pessimisticData[years]);
                const rangeMax = Currency.format(optimisticData[years]);

                detailsEl.innerHTML = `
                    <div class="projection-summary-grid">
                        <div class="projection-stat">
                            <span class="projection-label">Current Portfolio</span>
                            <span class="projection-value">${Currency.format(currentPortfolio)}</span>
                        </div>
                        <div class="projection-stat">
                            <span class="projection-label">10-Year Projection</span>
                            <span class="projection-value">${Currency.format(finalBalance)}</span>
                        </div>
                        <div class="projection-stat">
                            <span class="projection-label">Total Contributions</span>
                            <span class="projection-value">${Currency.format(totalContributed)}</span>
                        </div>
                        <div class="projection-stat">
                            <span class="projection-label">Projected Growth</span>
                            <span class="projection-value positive">${Currency.format(totalGrowth)}</span>
                        </div>
                    </div>
                    <div class="projection-range">
                        <span>Your portfolio could be between <strong>${rangeMin}</strong> and <strong>${rangeMax}</strong> in 10 years.</span>
                    </div>
                `;
            }
        }
    };

    // ==================== PLANNED INVESTMENTS ====================

    const PlannedInvestments = {
        render() {
            const container = document.getElementById('planned-investments-list');
            if (!container) return;

            if (State.data.plannedInvestments.length === 0) {
                container.innerHTML = '<p class="empty-state">No planned investments. Add future contributions to see them in projections.</p>';
                return;
            }

            const sorted = [...State.data.plannedInvestments].sort((a, b) =>
                new Date(a.targetDate) - new Date(b.targetDate)
            );

            container.innerHTML = sorted.map(inv => {
                const dateStr = new Date(inv.targetDate).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
                const isReady = new Date(inv.targetDate) <= new Date();
                const recurringBadge = inv.isRecurring ?
                    '<span class="badge recurring-badge">Recurring</span>' : '';

                return `
                <div class="planned-investment-item ${isReady ? 'ready-to-activate' : ''}">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(inv.name)} ${recurringBadge}</h4>
                        <p>${Utils.capitalizeFirst(inv.type.replace('-', ' '))} &bull; Target: ${dateStr}</p>
                    </div>
                    <span class="item-amount investment">${Currency.format(inv.amount)}</span>
                    <div class="item-actions">
                        ${isReady ? `<button class="action-btn complete-btn" data-action="activate-planned-investment" data-id="${inv.id}" title="Add to Portfolio">&#x2713;</button>` : ''}
                        <button class="delete-btn" data-action="delete-planned-investment" data-id="${inv.id}" aria-label="Delete" title="Delete">&#128465;</button>
                    </div>
                </div>`;
            }).join('');
        },

        add(e) {
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('#planned-investment-name').value.trim();
            const amount = parseFloat(form.querySelector('#planned-investment-amount').value);
            const type = form.querySelector('#planned-investment-type').value;
            const targetDate = form.querySelector('#planned-investment-date').value;
            const isRecurring = form.querySelector('#planned-investment-recurring').checked;

            if (!name || !amount || !type || !targetDate) {
                Notify.show('Please fill in all required fields', 'warning');
                return;
            }

            State.modify('plannedInvestments', arr => arr.push({
                id: Utils.generateId(),
                name, amount, type, targetDate, isRecurring
            }));

            form.reset();
            PlannedInvestments.render();
            Investments.generateProjection();
            Dashboard.update();
            Notify.show('Planned investment added', 'success');
        },

        activate(id) {
            const planned = State.data.plannedInvestments.find(i => i.id === id);
            if (!planned) return;

            // Add to investments
            State.modify('investments', arr => arr.push({
                id: Utils.generateId(),
                name: planned.name,
                value: planned.amount,
                type: planned.type,
                expectedReturn: null,
                startDate: new Date().toISOString().split('T')[0],
                status: 'active'
            }));

            // Remove from planned
            State.set('plannedInvestments', State.data.plannedInvestments.filter(i => i.id !== id));

            PlannedInvestments.render();
            Investments.render();
            Investments.generateProjection();
            Dashboard.update();
            Notify.show('Investment activated and added to portfolio', 'success');
        },

        delete(id) {
            State.set('plannedInvestments', State.data.plannedInvestments.filter(i => i.id !== id));
            PlannedInvestments.render();
            Investments.generateProjection();
            Dashboard.update();
            Notify.show('Planned investment deleted', 'info');
        },

        getTotalPlanned() {
            return State.data.plannedInvestments.reduce((s, i) => s + i.amount, 0);
        },

        getRecurringTotal() {
            return State.data.plannedInvestments
                .filter(i => i.isRecurring)
                .reduce((s, i) => s + i.amount, 0);
        }
    };

    // ==================== INCOME ====================

    const Income = {
        render() {
            const container = document.getElementById('income-list');
            if (!container) return;

            if (State.data.incomes.length === 0) {
                container.innerHTML = '<p class="empty-state">No income sources recorded.</p>';
                return;
            }

            container.innerHTML = State.data.incomes.map(inc => {
                const isOneTime = inc.isRecurring === false;
                const badge = isOneTime ? '<span class="badge one-time-badge">One-time</span>' : '<span class="badge recurring-badge">Recurring</span>';
                const amountLabel = isOneTime ? '' : '/mo';
                const startMonth = inc.startMonth || inc.monthKey;
                const monthInfo = startMonth ? ` • ${isOneTime ? '' : 'From '}${startMonth}` : '';

                return `
                <div class="income-item ${isOneTime ? 'one-time' : ''}">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(inc.source)} ${badge}</h4>
                        <p>${Utils.capitalizeFirst(inc.type.replace('-', ' '))}${monthInfo}</p>
                    </div>
                    <span class="item-amount income">${Currency.format(inc.amount)}${amountLabel}</span>
                    <button class="delete-btn" data-action="delete-income" data-id="${inc.id}" aria-label="Delete income" title="Delete">&#128465;</button>
                </div>`;
            }).join('');
        },

        add(e) {
            e.preventDefault();
            const source = document.getElementById('income-source').value.trim();
            const amount = parseFloat(document.getElementById('income-amount').value);
            const type = document.getElementById('income-type').value;
            const isOneTime = document.getElementById('income-one-time').checked;
            const startMonthInput = document.getElementById('income-start-month');

            if (!source || !amount || !type) return;

            // Get start month (required for both recurring and one-time)
            const startMonth = startMonthInput && startMonthInput.value
                ? startMonthInput.value
                : new Date().toISOString().substring(0, 7);

            State.modify('incomes', arr => arr.push({
                id: Utils.generateId(),
                source, amount, type,
                startMonth,
                monthKey: startMonth, // Keep for backward compatibility
                isRecurring: !isOneTime
            }));

            e.target.reset();
            // Reset start month to current month
            if (startMonthInput) {
                startMonthInput.value = new Date().toISOString().substring(0, 7);
            }
            Income.render();
            Dashboard.update();

            const msg = isOneTime ? 'One-time income added' : 'Recurring income added';
            Notify.show(msg, 'success');
        },

        setupOneTimeToggle() {
            // Set default start month to current month on page load
            const startMonthInput = document.getElementById('income-start-month');
            if (startMonthInput && !startMonthInput.value) {
                startMonthInput.value = new Date().toISOString().substring(0, 7);
            }
        },

        delete(id) {
            State.set('incomes', State.data.incomes.filter(i => i.id !== id));
            Income.render();
            Dashboard.update();
            Notify.show('Income deleted', 'info');
        }
    };

    // ==================== UPLOAD ====================

    const Upload = {
        sampleExpensesAdded: localStorage.getItem('sampleExpensesAdded') === 'true',
        sampleIncomeAdded: localStorage.getItem('sampleIncomeAdded') === 'true',
        sampleInvestmentsAdded: localStorage.getItem('sampleInvestmentsAdded') === 'true',

        setupZone(zoneId, inputId, previewId, type) {
            const zone = document.getElementById(zoneId);
            const input = document.getElementById(inputId);
            if (!zone || !input) return;

            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                Upload.handleFiles(e.dataTransfer.files, type, document.getElementById(previewId));
            });
            input.addEventListener('change', () => {
                Upload.handleFiles(input.files, type, document.getElementById(previewId));
                input.value = '';
            });
            zone.addEventListener('click', (e) => {
                if (!e.target.closest('.upload-btn') && e.target.tagName !== 'INPUT') {
                    input.click();
                }
            });
        },

        handleFiles(files, type, previewContainer) {
            if (!files || files.length === 0) return;
            Array.from(files).forEach(file => Upload.processFile(file, type, previewContainer));
        },

        processFile(file, type, previewContainer) {
            const upload = {
                id: Utils.generateId(),
                name: file.name,
                size: file.size,
                type,
                date: new Date().toISOString().split('T')[0],
                status: 'processing'
            };

            State.modify('uploads', arr => arr.push(upload));
            Upload.renderHistory();

            if (previewContainer) {
                previewContainer.innerHTML = `
                    <div class="upload-preview-item">
                        <span class="file-icon">&#128196;</span>
                        <div class="file-info">
                            <div class="file-name">${Utils.escapeHtml(file.name)}</div>
                            <div class="file-size">${Utils.formatFileSize(file.size)}</div>
                        </div>
                        <span class="file-status processing">Processing...</span>
                    </div>`;
            }

            const ext = file.name.split('.').pop().toLowerCase();

            // Route investment files to InvestmentParser
            if (type === 'investment') {
                if (ext === 'csv') {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const rows = Parser.parseCSV(e.target.result);
                        const investments = InvestmentParser.parseRows(rows.map(t => [t.date, t.description, t.amount, t.category]));
                        // Re-parse directly from CSV
                        const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
                        const delimiter = [',', '\t', ';', '|'].find(d => lines[0].includes(d)) || ',';
                        const csvRows = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^["']|["']$/g, '')));
                        const parsedInvestments = InvestmentParser.parseRows(csvRows);
                        Upload.finishInvestmentProcessing(upload, file, parsedInvestments, previewContainer);
                    };
                    reader.readAsText(file);
                } else if (ext === 'xlsx' || ext === 'xls') {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        if (typeof XLSX === 'undefined') {
                            Notify.show('Excel support not available', 'error');
                            return;
                        }
                        const workbook = XLSX.read(e.target.result, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                        const investments = InvestmentParser.parseRows(rows);
                        Upload.finishInvestmentProcessing(upload, file, investments, previewContainer);
                    };
                    reader.readAsArrayBuffer(file);
                } else {
                    // Add sample investments for unsupported formats
                    Upload.addSampleInvestments();
                    upload.status = 'success';
                    State.save('uploads');
                    Upload.renderHistory();
                    if (previewContainer) {
                        const statusEl = previewContainer.querySelector('.file-status');
                        if (statusEl) {
                            statusEl.className = 'file-status success';
                            statusEl.textContent = 'Sample data added';
                        }
                    }
                    Notify.show('Sample investment data added', 'success');
                }
                return;
            }

            if (ext === 'csv') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const anonymized = Anonymizer.anonymize(e.target.result);
                    const transactions = Parser.parseCSV(anonymized);
                    Upload.finishProcessing(upload, file, transactions, previewContainer);
                };
                reader.readAsText(file);
            } else if (ext === 'xlsx' || ext === 'xls') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const transactions = Parser.parseExcel(e.target.result);
                    Upload.finishProcessing(upload, file, transactions, previewContainer);
                };
                reader.readAsArrayBuffer(file);
            } else {
                // PDF/Image - add sample data as fallback
                if (type === 'expense' && !Upload.sampleExpensesAdded) {
                    Upload.addSampleExpenses();
                } else if (type === 'payslip' && !Upload.sampleIncomeAdded) {
                    Upload.addSampleIncome();
                }
                upload.status = 'success';
                State.save('uploads');
                Upload.renderHistory();

                if (previewContainer) {
                    const statusEl = previewContainer.querySelector('.file-status');
                    if (statusEl) {
                        statusEl.className = 'file-status success';
                        statusEl.textContent = 'Processed';
                    }
                }
                Notify.show('File processed successfully', 'success');
            }
        },

        finishProcessing(upload, file, transactions, previewContainer) {
            upload.status = 'success';
            upload.transactionCount = transactions.length;
            State.save('uploads');
            Upload.renderHistory();

            if (previewContainer) {
                const statusEl = previewContainer.querySelector('.file-status');
                if (statusEl) {
                    statusEl.className = 'file-status success';
                    statusEl.textContent = transactions.length + ' transactions found';
                }
            }

            if (transactions.length > 0) {
                Parser.render(transactions);
                // Switch to upload tab to show parsed transactions
                const uploadTab = document.querySelector('[href="#upload"]');
                if (uploadTab && !document.getElementById('upload').classList.contains('active')) {
                    uploadTab.click();
                }
                Notify.show(transactions.length + ' transactions parsed from ' + file.name, 'success');
            } else {
                Notify.show('No transactions found in ' + file.name, 'warning');
            }
        },

        renderHistory() {
            const container = document.getElementById('upload-history');
            if (!container) return;

            if (State.data.uploads.length === 0) {
                container.innerHTML = '<p class="empty-state">No documents uploaded yet.</p>';
                return;
            }

            container.innerHTML = [...State.data.uploads].reverse().map(u => `
                <div class="history-item">
                    <span class="file-icon">&#128196;</span>
                    <div class="file-info">
                        <div class="file-name">${Utils.escapeHtml(u.name)}</div>
                        <div class="file-date">${Utils.formatDate(u.date)} &bull; ${Utils.formatFileSize(u.size)}${u.transactionCount ? ' &bull; ' + u.transactionCount + ' transactions' : ''}</div>
                    </div>
                    <button class="delete-btn" data-action="delete-upload" data-id="${u.id}" aria-label="Delete upload" title="Delete">&#128465;</button>
                </div>
            `).join('');
        },

        deleteUpload(id) {
            const upload = State.data.uploads.find(u => u.id === id);
            State.set('uploads', State.data.uploads.filter(u => u.id !== id));
            Upload.renderHistory();

            // If all expense uploads are deleted, offer to reset expenses
            const remainingExpenseUploads = State.data.uploads.filter(u => u.type === 'expense');
            if (upload && upload.type === 'expense' && remainingExpenseUploads.length === 0) {
                if (State.data.expenses.length > 0) {
                    if (confirm('All bank statement uploads have been removed. Would you like to reset all expenses as well?')) {
                        State.set('expenses', []);
                        Upload.sampleExpensesAdded = false;
                        localStorage.removeItem('sampleExpensesAdded');
                        Parser.pending = [];
                        Parser.columnInfo = null;
                        const parsedCard = document.getElementById('parsed-transactions-card');
                        if (parsedCard) parsedCard.style.display = 'none';
                        Expenses.render();
                        Dashboard.update();
                        Notify.show('Expenses have been reset', 'info');
                    }
                }
            }
        },

        setupDashboard() {
            const zone = document.getElementById('dashboard-upload-zone');
            const input = document.getElementById('dashboard-file-input');
            const preview = document.getElementById('dashboard-upload-preview');
            const results = document.getElementById('dashboard-upload-results');
            if (!zone || !input) return;

            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) Upload.processFile(file, 'expense', preview);
            });
            input.addEventListener('change', () => {
                if (input.files[0]) Upload.processFile(input.files[0], 'expense', preview);
                input.value = '';
            });
            zone.addEventListener('click', (e) => {
                if (!e.target.closest('.upload-btn') && e.target.tagName !== 'INPUT') {
                    input.click();
                }
            });
        },

        addSampleExpenses() {
            const samples = [
                { description: 'Monthly Rent', amount: 1500, category: 'housing', date: new Date().toISOString().split('T')[0] },
                { description: 'Grocery Shopping', amount: 250, category: 'food', date: new Date().toISOString().split('T')[0] },
                { description: 'Gas Station', amount: 55, category: 'transportation', date: new Date().toISOString().split('T')[0] },
                { description: 'Netflix Subscription', amount: 15.99, category: 'entertainment', date: new Date().toISOString().split('T')[0] },
                { description: 'Electric Bill', amount: 120, category: 'utilities', date: new Date().toISOString().split('T')[0] }
            ];

            samples.forEach(s => {
                State.data.expenses.push({ id: Utils.generateId(), ...s });
            });
            State.save('expenses');
            Upload.sampleExpensesAdded = true;
            localStorage.setItem('sampleExpensesAdded', 'true');
            Expenses.render();
            Dashboard.update();
        },

        addSampleIncome() {
            const currentMonth = new Date().toISOString().substring(0, 7);
            State.data.incomes.push({
                id: Utils.generateId(),
                source: 'Primary Job (from payslip)',
                amount: 5000,
                type: 'salary',
                monthKey: currentMonth,
                isRecurring: true
            });
            State.save('incomes');
            Upload.sampleIncomeAdded = true;
            localStorage.setItem('sampleIncomeAdded', 'true');
            Income.render();
            Dashboard.update();
            Notify.show('Projections updated with new income data', 'success');
        },

        finishInvestmentProcessing(upload, file, investments, previewContainer) {
            upload.status = 'success';
            upload.transactionCount = investments.length;
            State.save('uploads');
            Upload.renderHistory();

            if (previewContainer) {
                const statusEl = previewContainer.querySelector('.file-status');
                if (statusEl) {
                    statusEl.className = 'file-status success';
                    statusEl.textContent = investments.length + ' holdings found';
                }
            }

            if (investments.length > 0) {
                InvestmentParser.render(investments);
                const uploadTab = document.querySelector('[href="#upload"]');
                if (uploadTab && !document.getElementById('upload').classList.contains('active')) {
                    uploadTab.click();
                }
                Notify.show(investments.length + ' investment holdings parsed from ' + file.name, 'success');
            } else {
                Notify.show('No investment holdings found in ' + file.name, 'warning');
            }
        },

        addSampleInvestments() {
            if (Upload.sampleInvestmentsAdded) return;

            const samples = [
                { name: 'S&P 500 Index Fund (VOO)', value: 15000, type: 'etf' },
                { name: 'Total Bond Market (BND)', value: 5000, type: 'bonds' },
                { name: 'International Stocks (VXUS)', value: 3000, type: 'etf' },
                { name: 'Tech Growth ETF (QQQ)', value: 4500, type: 'etf' },
                { name: 'Real Estate Investment (VNQ)', value: 2500, type: 'real-estate' }
            ];

            const today = new Date().toISOString().split('T')[0];
            samples.forEach(s => {
                State.data.investments.push({
                    id: Utils.generateId(),
                    name: s.name,
                    value: s.value,
                    type: s.type,
                    expectedReturn: null,
                    startDate: today,
                    status: 'active'
                });
            });
            State.save('investments');
            Upload.sampleInvestmentsAdded = true;
            localStorage.setItem('sampleInvestmentsAdded', 'true');
            Investments.render();
            Dashboard.update();
        }
    };

    // ==================== DASHBOARD ====================

    const Dashboard = {
        expenseChart: null,

        update() {
            const totalIncome = State.data.incomes.reduce((s, i) => s + i.amount, 0);
            const totalExpenses = State.data.expenses.reduce((s, e) => s + e.amount, 0);
            const totalDebt = State.data.debts.reduce((s, d) => s + d.balance, 0);
            const totalInvestments = State.data.investments.reduce((s, i) => s + i.value, 0);
            const netSavings = totalIncome - totalExpenses;

            // Update dashboard summary cards
            const incomeEl = document.getElementById('total-income');
            const expensesEl = document.getElementById('total-expenses');
            const debtEl = document.getElementById('total-debt');
            const netSavingsEl = document.getElementById('net-savings');

            if (incomeEl) incomeEl.textContent = Currency.format(totalIncome);
            if (expensesEl) expensesEl.textContent = Currency.format(totalExpenses);
            if (debtEl) debtEl.textContent = Currency.format(totalDebt);
            if (netSavingsEl) {
                netSavingsEl.textContent = Currency.format(netSavings, true);
                netSavingsEl.classList.remove('positive', 'negative');
                netSavingsEl.classList.add(netSavings >= 0 ? 'positive' : 'negative');
            }

            Dashboard.updateHealthScore(totalIncome, totalExpenses, totalDebt, netSavings);
            Dashboard.updateFinancialRatios(totalIncome, totalExpenses, totalDebt, totalInvestments);
            Dashboard.updateExpenseChart();
            Dashboard.updateInvestmentChart();
            Dashboard.updateCashflowChart();
            Dashboard.renderFinancialForecast();
            Dashboard.renderMonthlyAnalytics();
            Dashboard.renderYearlyProjection();
            Dashboard.renderPlannedSummary();
            Dashboard.renderStatsTicker();
            Nudges.renderTicker();
        },

        safeRate(value, divisor) {
            if (!divisor || divisor === 0 || !isFinite(value / divisor)) {
                return 0;
            }
            return value / divisor;
        },

        renderStatsTicker() {
            const expensePerDayEl = document.getElementById('expense-per-day');
            const expensePerHourEl = document.getElementById('expense-per-hour');
            const incomePerDayEl = document.getElementById('income-per-day');
            const incomePerHourEl = document.getElementById('income-per-hour');

            if (!expensePerDayEl) return;

            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const daysSoFar = now.getDate();

            const currentMonthExpenses = State.data.expenses
                .filter(exp => {
                    const expMonthKey = exp.monthKey || (exp.date ? exp.date.substring(0, 7) : null);
                    return expMonthKey === currentMonthKey;
                })
                .reduce((sum, exp) => sum + exp.amount, 0);

            const currentMonthIncome = Dashboard.getMonthlyIncome(currentMonthKey);

            const expensePerDay = Dashboard.safeRate(currentMonthExpenses, daysSoFar);
            const expensePerHour = Dashboard.safeRate(expensePerDay, 24);
            const incomePerDay = Dashboard.safeRate(currentMonthIncome, daysInMonth);
            const incomePerHour = Dashboard.safeRate(incomePerDay, 24);

            expensePerDayEl.textContent = Currency.format(expensePerDay);
            expensePerHourEl.textContent = Currency.format(expensePerHour);
            incomePerDayEl.textContent = Currency.format(incomePerDay);
            incomePerHourEl.textContent = Currency.format(incomePerHour);
        },

        updateHealthScore(income, expenses, debt, savings) {
            const circle = document.getElementById('health-score');
            const message = document.getElementById('health-message');
            if (!circle || !message) return;

            let score = 50;
            if (income > 0) {
                const ratio = expenses / income;
                if (ratio < 0.5) score += 20;
                else if (ratio < 0.7) score += 10;
                else if (ratio > 0.9) score -= 10;

                if (savings > 0) score += 15;
                else score -= 15;
            }
            if (debt === 0) score += 15;
            else if (debt > income * 12) score -= 15;
            else if (debt > income * 6) score -= 5;

            score = Math.max(0, Math.min(100, score));
            const angle = (score / 100) * 360;
            const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

            circle.style.background = `conic-gradient(${color} ${angle}deg, #e2e8f0 ${angle}deg)`;
            circle.querySelector('.score-value').textContent = score;

            let msg = '';
            if (score >= 80) msg = 'Excellent financial health! Keep up the great work.';
            else if (score >= 60) msg = 'Good financial health. A few improvements could boost your score.';
            else if (score >= 40) msg = 'Fair financial health. Consider reducing expenses or paying down debt.';
            else msg = 'Needs attention. Focus on reducing debt and building an emergency fund.';
            message.textContent = msg;
        },

        updateFinancialRatios(income, expenses, debt, investments) {
            // Helper to update a ratio display
            const updateRatio = (id, value, thresholds) => {
                const valueEl = document.getElementById(`${id}-ratio`);
                const barEl = document.getElementById(`${id}-bar`);
                const statusEl = document.getElementById(`${id}-status`);
                if (!valueEl || !barEl || !statusEl) return;

                if (value === null || value === Infinity || isNaN(value)) {
                    valueEl.textContent = '--%';
                    barEl.style.width = '0%';
                    barEl.className = 'ratio-fill';
                    statusEl.textContent = 'Add data to calculate';
                    statusEl.className = 'ratio-status';
                    return;
                }

                const percentage = Math.min(value * 100, 200); // Cap at 200% for display
                valueEl.textContent = `${(value * 100).toFixed(1)}%`;
                barEl.style.width = `${Math.min(percentage / 2, 100)}%`; // Scale bar to 100%

                // Determine status based on thresholds
                let status, statusClass;
                if (value <= thresholds.excellent) {
                    status = 'Excellent';
                    statusClass = 'excellent';
                } else if (value <= thresholds.good) {
                    status = 'Good';
                    statusClass = 'good';
                } else if (value <= thresholds.warning) {
                    status = 'Needs improvement';
                    statusClass = 'warning';
                } else {
                    status = 'High risk';
                    statusClass = 'danger';
                }

                barEl.className = `ratio-fill ${statusClass}`;
                statusEl.textContent = status;
                statusEl.className = `ratio-status ${statusClass}`;
            };

            // 1. Expense to Income Ratio
            // Thresholds: <50% excellent, <70% good, <90% warning, >90% danger
            const expenseIncomeRatio = income > 0 ? expenses / income : null;
            updateRatio('expense-income', expenseIncomeRatio, {
                excellent: 0.50,
                good: 0.70,
                warning: 0.90
            });

            // 2. Debt to Investment Ratio
            // Thresholds: <50% excellent, <100% good, <150% warning, >150% danger
            const debtInvestmentRatio = investments > 0 ? debt / investments : (debt > 0 ? Infinity : null);
            updateRatio('debt-investment', debtInvestmentRatio, {
                excellent: 0.50,
                good: 1.00,
                warning: 1.50
            });

            // 3. Debt to Annual Income Ratio
            // Thresholds: <20% excellent, <36% good, <50% warning, >50% danger
            const annualIncome = income * 12;
            const debtIncomeRatio = annualIncome > 0 ? debt / annualIncome : null;
            updateRatio('debt-income', debtIncomeRatio, {
                excellent: 0.20,
                good: 0.36,
                warning: 0.50
            });
        },

        updateExpenseChart() {
            const ctx = document.getElementById('expense-chart');
            if (!ctx) return;

            const categoryTotals = {};
            State.data.expenses.forEach(exp => {
                categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
            });

            const categories = Object.keys(categoryTotals);
            const labels = categories.map(c => CategoryEngine.labels[c] || c);
            const data = Object.values(categoryTotals);

            // Enhanced color palette with gradients
            const colorMap = {
                housing: '#3b82f6',
                transportation: '#f59e0b',
                food: '#10b981',
                utilities: '#6366f1',
                healthcare: '#ec4899',
                entertainment: '#8b5cf6',
                shopping: '#f97316',
                education: '#14b8a6',
                personal: '#e879f9',
                other: '#64748b'
            };

            const colors = categories.map(c => colorMap[c] || '#64748b');
            const hoverColors = colors.map(c => c + 'dd'); // Slightly transparent on hover

            if (Dashboard.expenseChart) Dashboard.expenseChart.destroy();

            if (data.length === 0) {
                Dashboard.expenseChart = null;
                return;
            }

            Dashboard.expenseChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors,
                        hoverBackgroundColor: hoverColors,
                        borderWidth: 3,
                        borderColor: '#ffffff',
                        hoverBorderColor: '#ffffff',
                        hoverBorderWidth: 4,
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                padding: 16,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                font: { size: 12, weight: '500' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(30, 41, 59, 0.95)',
                            titleFont: { size: 14, weight: '600' },
                            bodyFont: { size: 13 },
                            padding: 12,
                            cornerRadius: 8,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return ` ${Currency.format(context.raw)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateRotate: true,
                        animateScale: true
                    }
                }
            });
        },

        investmentChart: null,

        updateInvestmentChart() {
            const ctx = document.getElementById('investment-chart');
            const emptyState = document.getElementById('investment-chart-empty');
            if (!ctx) return;

            const investments = State.data.investments;
            if (investments.length === 0) {
                if (Dashboard.investmentChart) {
                    Dashboard.investmentChart.destroy();
                    Dashboard.investmentChart = null;
                }
                if (emptyState) emptyState.style.display = 'block';
                ctx.style.display = 'none';
                return;
            }

            if (emptyState) emptyState.style.display = 'none';
            ctx.style.display = 'block';

            // Group by type
            const byType = {};
            investments.forEach(inv => {
                const type = inv.type || 'other';
                byType[type] = (byType[type] || 0) + inv.value;
            });

            const typeLabels = {
                '401k': '401(k)', 'ira': 'IRA', 'roth-ira': 'Roth IRA',
                'stocks': 'Stocks', 'etf': 'ETFs', 'etfs': 'ETFs',
                'bonds': 'Bonds', 'mutual-fund': 'Mutual Funds', 'mutual-funds': 'Mutual Funds',
                'real-estate': 'Real Estate', 'crypto': 'Crypto',
                'savings': 'Savings', 'fd': 'Fixed Deposit', 'ppf': 'PPF',
                'nps': 'NPS', 'gold': 'Gold', 'other': 'Other'
            };

            const colorMap = {
                '401k': '#3b82f6', 'ira': '#6366f1', 'roth-ira': '#8b5cf6',
                'stocks': '#10b981', 'etf': '#14b8a6', 'etfs': '#14b8a6',
                'bonds': '#f59e0b', 'mutual-fund': '#f97316', 'mutual-funds': '#f97316',
                'real-estate': '#ec4899', 'crypto': '#a855f7',
                'savings': '#64748b', 'fd': '#0ea5e9', 'ppf': '#22d3ee',
                'nps': '#84cc16', 'gold': '#eab308', 'other': '#94a3b8'
            };

            const types = Object.keys(byType);
            const labels = types.map(t => typeLabels[t] || t);
            const data = Object.values(byType);
            const colors = types.map(t => colorMap[t] || '#64748b');

            if (Dashboard.investmentChart) Dashboard.investmentChart.destroy();

            Dashboard.investmentChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors,
                        borderWidth: 3,
                        borderColor: '#ffffff',
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '55%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                padding: 12,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                font: { size: 11, weight: '500' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(30, 41, 59, 0.95)',
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = ((context.raw / total) * 100).toFixed(1);
                                    return ` ${Currency.format(context.raw)} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        },

        cashflowChart: null,

        updateCashflowChart() {
            const ctx = document.getElementById('cashflow-chart');
            const emptyState = document.getElementById('cashflow-chart-empty');
            if (!ctx) return;

            const expenses = State.data.expenses;
            const incomes = State.data.incomes;

            if (expenses.length === 0 && incomes.length === 0) {
                if (Dashboard.cashflowChart) {
                    Dashboard.cashflowChart.destroy();
                    Dashboard.cashflowChart = null;
                }
                if (emptyState) emptyState.style.display = 'block';
                ctx.style.display = 'none';
                return;
            }

            if (emptyState) emptyState.style.display = 'none';
            ctx.style.display = 'block';

            // Get last 6 months
            const now = new Date();
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }

            // Calculate expenses per month
            const expenseByMonth = {};
            expenses.forEach(exp => {
                const key = exp.monthKey || (exp.date ? exp.date.substring(0, 7) : null);
                if (key) expenseByMonth[key] = (expenseByMonth[key] || 0) + exp.amount;
            });

            // Calculate income per month
            const incomeByMonth = {};
            months.forEach(monthKey => {
                incomeByMonth[monthKey] = Dashboard.getMonthlyIncome(monthKey);
            });

            const expenseData = months.map(m => expenseByMonth[m] || 0);
            const incomeData = months.map(m => incomeByMonth[m] || 0);
            const savingsData = months.map((m, i) => incomeData[i] - expenseData[i]);

            const monthLabels = months.map(m => {
                const [year, month] = m.split('-');
                const date = new Date(year, parseInt(month) - 1, 1);
                return date.toLocaleDateString('en-US', { month: 'short' });
            });

            if (Dashboard.cashflowChart) Dashboard.cashflowChart.destroy();

            Dashboard.cashflowChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: monthLabels,
                    datasets: [
                        {
                            label: 'Income',
                            data: incomeData,
                            backgroundColor: 'rgba(16, 185, 129, 0.8)',
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 4,
                            order: 2
                        },
                        {
                            label: 'Expenses',
                            data: expenseData,
                            backgroundColor: 'rgba(239, 68, 68, 0.8)',
                            borderColor: '#ef4444',
                            borderWidth: 1,
                            borderRadius: 4,
                            order: 2
                        },
                        {
                            label: 'Net Savings',
                            data: savingsData,
                            type: 'line',
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            borderWidth: 3,
                            pointBackgroundColor: '#3b82f6',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            fill: true,
                            tension: 0.3,
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                padding: 16,
                                usePointStyle: true,
                                font: { size: 12, weight: '500' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(30, 41, 59, 0.95)',
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.dataset.label}: ${Currency.format(context.raw, true)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(148, 163, 184, 0.1)' },
                            ticks: {
                                callback: function(value) {
                                    return Currency.format(value);
                                }
                            }
                        }
                    }
                }
            });
        },

        getMonthlyBreakdown() {
            const monthlyExpenses = {};
            State.data.expenses.forEach(exp => {
                // Prefer explicit monthKey, fall back to deriving from date
                const key = exp.monthKey || (exp.date ? exp.date.substring(0, 7) : null);
                if (key) {
                    monthlyExpenses[key] = (monthlyExpenses[key] || 0) + exp.amount;
                }
            });
            return monthlyExpenses;
        },

        getMonthlyIncome(targetMonth) {
            // Calculate income for a specific month considering recurring status and start month
            let total = 0;
            State.data.incomes.forEach(inc => {
                const startMonth = inc.startMonth || inc.monthKey;
                if (inc.isRecurring === true || inc.isRecurring === undefined) {
                    // Recurring income applies from start month onwards
                    if (!startMonth || targetMonth >= startMonth) {
                        total += inc.amount;
                    }
                } else if (startMonth === targetMonth) {
                    // One-time income only applies to its specific month
                    total += inc.amount;
                }
            });
            return total;
        },

        parseMonthKey(monthKey) {
            const [year, month] = monthKey.split('-').map(Number);
            return new Date(year, month - 1, 1);
        },

        calculateYearlyForecast() {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth(); // 0-indexed
            const monthsElapsed = currentMonth + 1;
            const monthsRemaining = 12 - monthsElapsed;

            // Get monthly expense breakdown
            const monthlyBreakdown = Dashboard.getMonthlyBreakdown();
            const allMonths = Object.keys(monthlyBreakdown).sort();
            const monthCount = allMonths.length || 1;

            // Calculate actual expenses for current year so far
            const currentYearMonths = allMonths.filter(m => m.startsWith(String(currentYear)));
            const actualExpensesYTD = currentYearMonths.reduce((sum, m) => sum + monthlyBreakdown[m], 0);

            // Calculate average monthly expense from available data
            const totalExpenses = State.data.expenses.reduce((s, e) => s + e.amount, 0);
            const avgMonthlyExpense = totalExpenses / monthCount;

            // Calculate planned expenses for remaining months of the year
            let plannedExpensesTotal = 0;
            for (let m = currentMonth; m < 12; m++) {
                const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
                plannedExpensesTotal += PlannedExpenses.getProjectedExpenses(monthKey);
            }

            // Project remaining expenses (average + planned)
            const projectedRemainingExpenses = (avgMonthlyExpense * monthsRemaining) + plannedExpensesTotal;
            const projectedAnnualExpenses = actualExpensesYTD + projectedRemainingExpenses;

            // Calculate annual income considering start months
            // For each month of the year, sum up income that applies to that month
            let projectedAnnualIncome = 0;
            let monthlyRecurringIncome = 0; // Current month's recurring income for display
            const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

            for (let m = 0; m < 12; m++) {
                const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
                projectedAnnualIncome += Dashboard.getMonthlyIncome(monthKey);
            }

            // Get current month's recurring income for monthly metrics
            State.data.incomes.forEach(inc => {
                if (inc.isRecurring !== false) {
                    const startMonth = inc.startMonth || inc.monthKey;
                    if (!startMonth || currentMonthKey >= startMonth) {
                        monthlyRecurringIncome += inc.amount;
                    }
                }
            });

            // Net savings
            const projectedNetSavings = projectedAnnualIncome - projectedAnnualExpenses;

            // Savings rate (as percentage of income)
            const savingsRate = projectedAnnualIncome > 0
                ? (projectedNetSavings / projectedAnnualIncome) * 100
                : 0;

            // Confidence level based on data availability
            let confidenceLevel = 'high';
            let confidenceMessage = `Based on ${monthCount} months of expense data`;
            if (monthCount < 3) {
                confidenceLevel = 'low';
                confidenceMessage = `Limited data: only ${monthCount} month(s) of expenses. Add more data for accurate projections.`;
            } else if (monthCount < 6) {
                confidenceLevel = 'medium';
                confidenceMessage = `Based on ${monthCount} months of data. More history improves accuracy.`;
            }

            return {
                projectedAnnualIncome,
                projectedAnnualExpenses,
                projectedNetSavings,
                savingsRate,
                monthlyRecurringIncome,
                avgMonthlyExpense,
                monthsOfData: monthCount,
                confidenceLevel,
                confidenceMessage,
                actualExpensesYTD,
                projectedRemainingExpenses
            };
        },

        renderFinancialForecast() {
            const container = document.getElementById('financial-forecast');
            if (!container) return;

            const hasData = State.data.expenses.length > 0 || State.data.incomes.length > 0;
            if (!hasData) {
                container.innerHTML = '<p class="empty-state">Add expenses and income to see your annual forecast.</p>';
                return;
            }

            const forecast = Dashboard.calculateYearlyForecast();
            const savingsClass = forecast.projectedNetSavings >= 0 ? 'positive' : 'negative';
            const savingsBarWidth = Math.min(Math.max(forecast.savingsRate, 0), 100);
            const barClass = forecast.savingsRate < 0 ? 'negative' : '';
            const confidenceClass = forecast.confidenceLevel === 'low' ? 'low-confidence' : '';
            const confidenceIcon = forecast.confidenceLevel === 'low' ? '⚠️' : 'ℹ️';

            container.innerHTML = `
                <div class="forecast-grid">
                    <div class="forecast-stat income-stat">
                        <span class="forecast-label">Projected Annual Income</span>
                        <span class="forecast-value">${Currency.format(forecast.projectedAnnualIncome)}</span>
                    </div>
                    <div class="forecast-stat expense-stat">
                        <span class="forecast-label">Projected Annual Expenses</span>
                        <span class="forecast-value">${Currency.format(forecast.projectedAnnualExpenses)}</span>
                    </div>
                    <div class="forecast-stat savings-stat">
                        <span class="forecast-label">Projected Net Savings</span>
                        <span class="forecast-value ${savingsClass}">${Currency.format(forecast.projectedNetSavings)}</span>
                    </div>
                    <div class="forecast-stat rate-stat">
                        <span class="forecast-label">Savings Rate</span>
                        <span class="forecast-value ${savingsClass}">${forecast.savingsRate.toFixed(1)}%</span>
                    </div>
                </div>
                <div class="forecast-savings-bar">
                    <div class="savings-bar-label">
                        <span>Savings Progress</span>
                        <span>${forecast.savingsRate >= 0 ? forecast.savingsRate.toFixed(1) : 0}% of income</span>
                    </div>
                    <div class="savings-bar-track">
                        <div class="savings-bar-fill ${barClass}" style="width: ${savingsBarWidth}%"></div>
                    </div>
                </div>
                <div class="forecast-confidence ${confidenceClass}">
                    <span class="confidence-icon">${confidenceIcon}</span>
                    <span>${forecast.confidenceMessage}</span>
                </div>
            `;
        },

        renderMonthlyAnalytics() {
            const container = document.getElementById('monthly-analytics');
            if (!container) return;

            // Get current month's recurring income (respecting start months)
            const currentMonthKey = new Date().toISOString().substring(0, 7);
            const monthlyRecurringIncome = Dashboard.getMonthlyIncome(currentMonthKey);
            const totalExpenses = State.data.expenses.reduce((s, e) => s + e.amount, 0);

            if (State.data.expenses.length === 0 && State.data.incomes.length === 0) {
                container.innerHTML = '<p class="empty-state">Add expenses and income to see your monthly comparison.</p>';
                return;
            }

            const monthlyBreakdown = Dashboard.getMonthlyBreakdown();
            const months = Object.keys(monthlyBreakdown);
            const monthCount = months.length || 1;
            const avgMonthlyExpense = totalExpenses / monthCount;
            const diff = monthlyRecurringIncome - avgMonthlyExpense;
            const diffClass = diff >= 0 ? 'positive' : 'negative';
            const diffLabel = diff >= 0 ? 'surplus' : 'deficit';

            const sortedMonths = [...months].sort().reverse();

            let monthRows = '';
            if (sortedMonths.length > 0) {
                monthRows = sortedMonths.map(m => {
                    const mExp = monthlyBreakdown[m];
                    const mIncome = Dashboard.getMonthlyIncome(m);
                    const mDiff = mIncome - mExp;
                    const mClass = mDiff >= 0 ? 'positive' : 'negative';
                    const monthLabel = Dashboard.parseMonthKey(m).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                    return `<tr><td>${monthLabel}</td><td>${Currency.format(mExp)}</td><td>${Currency.format(mIncome)}</td><td class="${mClass}">${Currency.format(mDiff)}</td></tr>`;
                }).join('');
            } else {
                monthRows = '<tr><td colspan="4" class="empty-state">No expense data yet</td></tr>';
            }

            const ratio = monthlyRecurringIncome > 0 ? avgMonthlyExpense / monthlyRecurringIncome : 0;
            const ratioPercent = Math.min(100, ratio * 100).toFixed(1);
            const ratioClass = ratio > 0.9 ? 'danger' : ratio > 0.7 ? 'warning' : 'good';

            container.innerHTML = `
                <div class="analytics-summary">
                    <div class="analytics-stat"><span class="analytics-label">Avg Monthly Expense</span><span class="analytics-value expense">${Currency.format(avgMonthlyExpense)}</span></div>
                    <div class="analytics-stat"><span class="analytics-label">Monthly Income</span><span class="analytics-value income">${Currency.format(monthlyRecurringIncome)}</span></div>
                    <div class="analytics-stat"><span class="analytics-label">Monthly ${Utils.capitalizeFirst(diffLabel)}</span><span class="analytics-value ${diffClass}">${Currency.format(Math.abs(diff))}</span></div>
                    <div class="analytics-stat"><span class="analytics-label">Months Tracked</span><span class="analytics-value">${months.length}</span></div>
                </div>
                ${monthlyRecurringIncome > 0 ? `
                <div class="analytics-bar-container">
                    <div class="analytics-bar-label">Expense-to-Income Ratio</div>
                    <div class="analytics-bar-track"><div class="analytics-bar-fill ${ratioClass}" style="width:${ratioPercent}%">${ratioPercent}%</div></div>
                </div>` : ''}
                <div class="analytics-table-wrapper">
                    <table class="analytics-table">
                        <thead><tr><th>Month</th><th>Expenses</th><th>Income</th><th>Net</th></tr></thead>
                        <tbody>${monthRows}</tbody>
                    </table>
                </div>`;
        },

        renderYearlyProjection() {
            const container = document.getElementById('yearly-projection');
            if (!container) return;

            const totalIncome = State.data.incomes.reduce((s, i) => s + i.amount, 0);
            const totalExpenses = State.data.expenses.reduce((s, e) => s + e.amount, 0);

            if (State.data.expenses.length === 0 && State.data.incomes.length === 0) {
                container.innerHTML = '<p class="empty-state">Add expenses and income to see your annual projection.</p>';
                return;
            }

            const monthlyBreakdown = Dashboard.getMonthlyBreakdown();
            const months = Object.keys(monthlyBreakdown);
            const monthCount = months.length || 1;
            const avgMonthlyExpense = totalExpenses / monthCount;

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            const monthsElapsed = currentMonth + 1;
            const monthsRemaining = 12 - monthsElapsed;

            const yearExpensesSoFar = months
                .filter(m => m.startsWith(String(currentYear)))
                .reduce((sum, m) => sum + monthlyBreakdown[m], 0);

            const projectedYearExpenses = yearExpensesSoFar + (avgMonthlyExpense * monthsRemaining);
            const projectedYearIncome = totalIncome * 12;
            const projectedYearNet = projectedYearIncome - projectedYearExpenses;
            const netClass = projectedYearNet >= 0 ? 'positive' : 'negative';
            const netLabel = projectedYearNet >= 0 ? 'Projected Net Savings' : 'Projected Net Deficit';

            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            let projRows = '';
            let runningExpense = 0;
            let runningIncome = 0;

            for (let m = 0; m < 12; m++) {
                const key = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
                const isActual = monthlyBreakdown[key] !== undefined;
                const mExpense = isActual ? monthlyBreakdown[key] : avgMonthlyExpense;
                const mIncome = totalIncome;
                runningExpense += mExpense;
                runningIncome += mIncome;
                const mNet = mIncome - mExpense;
                const mClass = mNet >= 0 ? 'positive' : 'negative';
                const typeLabel = isActual ? 'Actual' : 'Projected';
                const typeCls = isActual ? 'actual' : 'projected';

                projRows += `<tr class="${typeCls}"><td>${monthNames[m]} ${currentYear}</td><td>${Currency.format(mExpense)}</td><td>${Currency.format(mIncome)}</td><td class="${mClass}">${Currency.format(mNet)}</td><td><span class="projection-badge ${typeCls}">${typeLabel}</span></td></tr>`;
            }

            container.innerHTML = `
                <div class="projection-summary">
                    <div class="projection-stat"><span class="projection-label">Projected Annual Expenses</span><span class="projection-value expense">${Currency.format(projectedYearExpenses)}</span></div>
                    <div class="projection-stat"><span class="projection-label">Projected Annual Income</span><span class="projection-value income">${Currency.format(projectedYearIncome)}</span></div>
                    <div class="projection-stat"><span class="projection-label">${netLabel}</span><span class="projection-value ${netClass}">${Currency.format(projectedYearNet)}</span></div>
                    <div class="projection-stat"><span class="projection-label">Based on</span><span class="projection-value">${monthsElapsed} actual + ${monthsRemaining} projected mo.</span></div>
                </div>
                <div class="analytics-table-wrapper">
                    <table class="analytics-table projection-table">
                        <thead><tr><th>Month</th><th>Expenses</th><th>Income</th><th>Net</th><th>Type</th></tr></thead>
                        <tbody>${projRows}</tbody>
                        <tfoot><tr><td><strong>Total</strong></td><td><strong>${Currency.format(runningExpense)}</strong></td><td><strong>${Currency.format(runningIncome)}</strong></td><td class="${netClass}"><strong>${Currency.format(runningIncome - runningExpense)}</strong></td><td></td></tr></tfoot>
                    </table>
                </div>`;
        },

        renderPlannedSummary() {
            const container = document.getElementById('planned-items-summary');
            if (!container) return;

            const plannedExpensesCount = State.data.plannedExpenses.filter(e => e.status === 'planned').length;
            const plannedDebtsCount = State.data.plannedDebts.length;
            const plannedInvestmentsCount = State.data.plannedInvestments.length;

            const totalPlannedExpenses = State.data.plannedExpenses
                .filter(e => e.status === 'planned')
                .reduce((s, e) => s + e.amount, 0);
            const totalPlannedDebts = PlannedDebts.getTotalPlanned();
            const totalPlannedInvestments = PlannedInvestments.getTotalPlanned();

            if (plannedExpensesCount === 0 && plannedDebtsCount === 0 && plannedInvestmentsCount === 0) {
                container.innerHTML = '<p class="empty-state">Add planned expenses, debts, or investments to see a summary here.</p>';
                return;
            }

            container.innerHTML = `
                <div class="planned-summary-grid">
                    <div class="planned-summary-stat expenses">
                        <span class="planned-summary-icon">📋</span>
                        <div class="planned-summary-content">
                            <span class="planned-summary-label">Planned Expenses</span>
                            <span class="planned-summary-value">${plannedExpensesCount} items</span>
                            <span class="planned-summary-amount expense">${Currency.format(totalPlannedExpenses)}</span>
                        </div>
                    </div>
                    <div class="planned-summary-stat debts">
                        <span class="planned-summary-icon">💳</span>
                        <div class="planned-summary-content">
                            <span class="planned-summary-label">Planned Debts</span>
                            <span class="planned-summary-value">${plannedDebtsCount} items</span>
                            <span class="planned-summary-amount debt">${Currency.format(totalPlannedDebts)}</span>
                        </div>
                    </div>
                    <div class="planned-summary-stat investments">
                        <span class="planned-summary-icon">📈</span>
                        <div class="planned-summary-content">
                            <span class="planned-summary-label">Planned Investments</span>
                            <span class="planned-summary-value">${plannedInvestmentsCount} items</span>
                            <span class="planned-summary-amount investment">${Currency.format(totalPlannedInvestments)}</span>
                        </div>
                    </div>
                </div>
                <p class="planned-summary-note">These planned items are factored into your financial projections.</p>
            `;
        }
    };

    // ==================== DASHBOARD ACTIONS ====================

    const DashboardActions = {
        currentTab: 'expense',

        init() {
            DashboardActions.setupDefaults();
            DashboardActions.setupForms();
        },

        setupDefaults() {
            const expenseDate = document.getElementById('dash-expense-date');
            const incomeMonth = document.getElementById('dash-income-month');

            if (expenseDate) expenseDate.valueAsDate = new Date();
            if (incomeMonth) incomeMonth.value = new Date().toISOString().substring(0, 7);
        },

        switchTab(tabName) {
            DashboardActions.currentTab = tabName;

            document.querySelectorAll('.quick-add-tab').forEach(tab => {
                const isActive = tab.dataset.dashboardAction === tabName;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            document.querySelectorAll('.quick-add-panel').forEach(panel => {
                panel.classList.add('hidden');
            });
            const activePanel = document.getElementById(`quick-add-${tabName}`);
            if (activePanel) activePanel.classList.remove('hidden');
        },

        setupForms() {
            const expenseForm = document.getElementById('dashboard-expense-form');
            if (expenseForm) {
                expenseForm.addEventListener('submit', (e) => DashboardActions.addExpense(e));
            }

            const incomeForm = document.getElementById('dashboard-income-form');
            if (incomeForm) {
                incomeForm.addEventListener('submit', (e) => DashboardActions.addIncome(e));
            }
        },

        addExpense(e) {
            e.preventDefault();
            const desc = document.getElementById('dash-expense-desc').value.trim();
            const amount = parseFloat(document.getElementById('dash-expense-amount').value);
            const category = document.getElementById('dash-expense-category').value;
            const date = document.getElementById('dash-expense-date').value;

            if (!desc || !amount || !category || !date) return;

            State.modify('expenses', arr => arr.push({
                id: Utils.generateId(),
                description: desc,
                amount,
                category,
                date
            }));

            e.target.reset();
            DashboardActions.setupDefaults();
            Expenses.render();
            Budget.renderComparison();
            Dashboard.update();
            Notify.show('Expense added', 'success');
        },

        addIncome(e) {
            e.preventDefault();
            const source = document.getElementById('dash-income-source').value.trim();
            const amount = parseFloat(document.getElementById('dash-income-amount').value);
            const type = document.getElementById('dash-income-type').value;
            const startMonth = document.getElementById('dash-income-month').value;

            if (!source || !amount || !type || !startMonth) return;

            State.modify('incomes', arr => arr.push({
                id: Utils.generateId(),
                source,
                amount,
                type,
                startMonth,
                monthKey: startMonth,
                isRecurring: true
            }));

            e.target.reset();
            DashboardActions.setupDefaults();
            Income.render();
            Dashboard.update();
            Notify.show('Income added', 'success');
        }
    };

    // ==================== TAG SUGGESTIONS ====================

    const TagSuggestions = {
        highlightedIndex: -1,

        setup() {
            const input = document.getElementById('expense-description');
            const container = document.getElementById('tag-suggestions');
            const categorySelect = document.getElementById('expense-category');
            if (!input || !container || !categorySelect) return;

            input.addEventListener('input', () => {
                const value = input.value;
                const suggestions = CategoryEngine.suggest(value);
                TagSuggestions.highlightedIndex = -1;

                if (suggestions.length === 0 || value.length < 2) {
                    container.classList.remove('visible');
                    container.innerHTML = '';
                    return;
                }

                container.innerHTML = suggestions.map((s, i) => `
                    <div class="tag-suggestion-item" data-category="${s.category}" data-index="${i}">
                        <span class="suggestion-category" style="background:${CategoryEngine.colors[s.category]}">${CategoryEngine.labels[s.category]}</span>
                        <span class="suggestion-text">${Utils.escapeHtml(Utils.capitalizeFirst(s.keyword))}</span>
                        <span class="suggestion-hint">Tab to apply</span>
                    </div>
                `).join('');
                container.classList.add('visible');

                container.querySelectorAll('.tag-suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        categorySelect.value = item.dataset.category;
                        container.classList.remove('visible');
                    });
                });
            });

            input.addEventListener('keydown', (e) => {
                const items = container.querySelectorAll('.tag-suggestion-item');
                if (!items.length || !container.classList.contains('visible')) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    TagSuggestions.highlightedIndex = Math.min(TagSuggestions.highlightedIndex + 1, items.length - 1);
                    items.forEach((item, i) => item.classList.toggle('highlighted', i === TagSuggestions.highlightedIndex));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    TagSuggestions.highlightedIndex = Math.max(TagSuggestions.highlightedIndex - 1, 0);
                    items.forEach((item, i) => item.classList.toggle('highlighted', i === TagSuggestions.highlightedIndex));
                } else if (e.key === 'Tab' || e.key === 'Enter') {
                    const idx = TagSuggestions.highlightedIndex >= 0 ? TagSuggestions.highlightedIndex : 0;
                    if (items[idx]) {
                        e.preventDefault();
                        categorySelect.value = items[idx].dataset.category;
                        container.classList.remove('visible');
                    }
                } else if (e.key === 'Escape') {
                    container.classList.remove('visible');
                }
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.description-group')) {
                    container.classList.remove('visible');
                }
            });
        }
    };

    // ==================== NUDGES (SMART SUGGESTIONS) ====================

    const Nudges = {
        // Country-specific financial profiles
        countryProfiles: {
            USD: {
                name: 'United States',
                emergencyMonths: 6,
                investmentSuggestions: ['401(k) employer match', 'Roth IRA', 'Index funds', 'I-Bonds'],
                debtStrategy: 'avalanche',
                taxAdvantaged: ['Maximize 401(k) employer match', 'Consider HSA contributions', 'Roth IRA for tax-free growth'],
                savingsRate: { excellent: 0.20, good: 0.15, minimum: 0.10 },
                expenseRatio: { excellent: 0.50, good: 0.70, warning: 0.90 }
            },
            EUR: {
                name: 'European Union',
                emergencyMonths: 6,
                investmentSuggestions: ['ETFs', 'Government bonds', 'Index funds', 'Real estate funds'],
                debtStrategy: 'avalanche',
                taxAdvantaged: ['Pension contributions', 'Tax-advantaged savings accounts'],
                savingsRate: { excellent: 0.20, good: 0.15, minimum: 0.10 },
                expenseRatio: { excellent: 0.50, good: 0.70, warning: 0.90 }
            },
            GBP: {
                name: 'United Kingdom',
                emergencyMonths: 6,
                investmentSuggestions: ['ISA (Individual Savings Account)', 'SIPP pension', 'Index funds', 'Premium Bonds'],
                debtStrategy: 'avalanche',
                taxAdvantaged: ['Maximize ISA allowance', 'Pension contributions for tax relief', 'Lifetime ISA for first home'],
                savingsRate: { excellent: 0.20, good: 0.15, minimum: 0.10 },
                expenseRatio: { excellent: 0.50, good: 0.70, warning: 0.90 }
            },
            INR: {
                name: 'India',
                emergencyMonths: 6,
                investmentSuggestions: ['PPF (Public Provident Fund)', 'ELSS mutual funds', 'NPS (National Pension)', 'SIP in index funds'],
                debtStrategy: 'snowball',
                taxAdvantaged: ['Section 80C investments (PPF, ELSS)', 'NPS additional deduction under 80CCD', 'Home loan interest under 24(b)'],
                savingsRate: { excellent: 0.25, good: 0.20, minimum: 0.15 },
                expenseRatio: { excellent: 0.50, good: 0.65, warning: 0.80 }
            },
            NPR: {
                name: 'Nepal',
                emergencyMonths: 4,
                investmentSuggestions: ['Fixed Deposits', 'Citizen Investment Trust', 'NEPSE stocks', 'Mutual funds'],
                debtStrategy: 'snowball',
                taxAdvantaged: ['Citizen Investment Trust', 'Life insurance premiums', 'Provident Fund contributions'],
                savingsRate: { excellent: 0.20, good: 0.15, minimum: 0.10 },
                expenseRatio: { excellent: 0.55, good: 0.70, warning: 0.85 }
            },
            default: {
                name: 'General',
                emergencyMonths: 6,
                investmentSuggestions: ['Index funds', 'Bonds', 'High-yield savings', 'Diversified ETFs'],
                debtStrategy: 'avalanche',
                taxAdvantaged: ['Check local tax-advantaged accounts', 'Retirement savings options'],
                savingsRate: { excellent: 0.20, good: 0.15, minimum: 0.10 },
                expenseRatio: { excellent: 0.50, good: 0.70, warning: 0.90 }
            }
        },

        // Behavioral Finance Wisdom Library
        // Sources: Psychology of Money, Same as Ever (Housel), Just Keep Buying (Maggiulli),
        // Gigerenzer (risk literacy), Taleb (antifragility)
        wisdomLibrary: {
            // Psychology of Money - Morgan Housel
            psychology: [
                { quote: 'Wealth is what you don\'t see. It\'s the cars not purchased, the diamonds not bought.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['expense', 'savings'] },
                { quote: 'Spending money to show people how much money you have is the fastest way to have less money.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['expense'] },
                { quote: 'The highest form of wealth is the ability to wake up every morning and say, "I can do whatever I want today."', author: 'Morgan Housel', source: 'Psychology of Money', context: ['score', 'investment'] },
                { quote: 'Getting money requires risk-taking, optimism, and putting yourself out there. Keeping money requires humility and fear.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['score'] },
                { quote: 'Reasonable is more realistic and you have a better chance of sticking with it in the long run.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['investment', 'expense'] },
                { quote: 'Room for error lets you endure a range of outcomes, and endurance lets compounding work.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['emergency', 'investment'] },
                { quote: 'The most powerful force in finance is compound interest. The most important ingredient is time.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['investment'] },
                { quote: 'Your success as an investor will be determined by how you respond to punctuated moments of terror.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['investment'] },
                { quote: 'Independence, at any income level, is driven by your savings rate. And your savings rate is driven by your ability to keep your lifestyle expectations low.', author: 'Morgan Housel', source: 'Psychology of Money', context: ['expense', 'savings'] }
            ],
            // Same as Ever - Morgan Housel
            uncertainty: [
                { quote: 'Risk is what\'s left over when you think you\'ve thought of everything.', author: 'Morgan Housel', source: 'Same as Ever', context: ['emergency', 'debt'] },
                { quote: 'The biggest risk is always what no one sees coming.', author: 'Morgan Housel', source: 'Same as Ever', context: ['emergency'] },
                { quote: 'Calm plants the seeds of crazy. Stability breeds complacency.', author: 'Morgan Housel', source: 'Same as Ever', context: ['score'] },
                { quote: 'Expectations grow faster than income. Happiness is reality minus expectations.', author: 'Morgan Housel', source: 'Same as Ever', context: ['expense'] },
                { quote: 'The most important financial skill is getting the goalpost to stop moving.', author: 'Morgan Housel', source: 'Same as Ever', context: ['expense', 'score'] },
                { quote: 'Good news comes from compounding, which always takes time. Bad news comes from losses that can happen in the blink of an eye.', author: 'Morgan Housel', source: 'Same as Ever', context: ['investment', 'emergency'] }
            ],
            // Just Keep Buying - Nick Maggiulli
            investing: [
                { quote: 'Save what you can, not what financial gurus tell you to save.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['savings', 'expense'] },
                { quote: 'The best time to invest was yesterday. The second best time is today.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['investment'] },
                { quote: 'Focus on increasing your income rather than cutting your spending when you\'re young.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['income', 'expense'] },
                { quote: 'Time in the market beats timing the market.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['investment'] },
                { quote: 'Automate your finances. Remove the human element from savings and investing.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['investment', 'savings'] },
                { quote: 'Don\'t try to buy the dip. Just keep buying.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['investment'] },
                { quote: 'Small amounts invested consistently beat large amounts invested sporadically.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['investment'] },
                { quote: 'The purpose of saving is to give yourself options and flexibility.', author: 'Nick Maggiulli', source: 'Just Keep Buying', context: ['savings', 'emergency'] }
            ],
            // Gerd Gigerenzer - Risk Literacy & Heuristics
            heuristics: [
                { quote: 'Simple rules often outperform complex calculations in uncertain environments.', author: 'Gerd Gigerenzer', source: 'Risk Savvy', context: ['investment', 'decision'] },
                { quote: 'The 1/N rule: Divide your resources equally. It\'s simple, transparent, and often optimal.', author: 'Gerd Gigerenzer', source: 'Risk Savvy', context: ['investment'] },
                { quote: 'Don\'t confuse uncertainty with calculated risk. They require different strategies.', author: 'Gerd Gigerenzer', source: 'Risk Savvy', context: ['emergency', 'investment'] },
                { quote: 'Less is more. Complex strategies can fail in complex environments.', author: 'Gerd Gigerenzer', source: 'Simple Heuristics', context: ['investment', 'expense'] },
                { quote: 'Transparency matters more than precision. Understand your rules.', author: 'Gerd Gigerenzer', source: 'Risk Savvy', context: ['investment', 'decision'] },
                { quote: 'Gut feelings based on experience are not irrational—they\'re evolved intelligence.', author: 'Gerd Gigerenzer', source: 'Gut Feelings', context: ['decision'] }
            ],
            // Nassim Taleb - Antifragility
            antifragile: [
                { quote: 'Debt makes you fragile. Each payment removes an option from your future self.', author: 'Nassim Taleb', source: 'Antifragile', context: ['debt'] },
                { quote: 'The barbell strategy: extreme safety on one end, small calculated risks on the other.', author: 'Nassim Taleb', source: 'Antifragile', context: ['investment', 'emergency'] },
                { quote: 'Via negativa: Subtract first. Removing the wrong things matters more than adding the right things.', author: 'Nassim Taleb', source: 'Antifragile', context: ['debt', 'expense'] },
                { quote: 'Black swans are unpredictable. Prepare for the unknown, not the known risks.', author: 'Nassim Taleb', source: 'Black Swan', context: ['emergency'] },
                { quote: 'Optionality: Having options is more valuable than knowing which option is best.', author: 'Nassim Taleb', source: 'Antifragile', context: ['savings', 'investment'] },
                { quote: 'Never put yourself in a position where one mistake can end the game.', author: 'Nassim Taleb', source: 'Skin in the Game', context: ['debt', 'emergency'] },
                { quote: 'Redundancy is not inefficiency—it\'s insurance against unpredictable events.', author: 'Nassim Taleb', source: 'Antifragile', context: ['emergency', 'savings'] },
                { quote: 'The fragile breaks under stress. The antifragile gets stronger from it.', author: 'Nassim Taleb', source: 'Antifragile', context: ['debt', 'score'] }
            ]
        },

        // Get contextually appropriate wisdom
        getWisdomForContext(context, situation = 'general') {
            const allWisdom = [
                ...Nudges.wisdomLibrary.psychology,
                ...Nudges.wisdomLibrary.uncertainty,
                ...Nudges.wisdomLibrary.investing,
                ...Nudges.wisdomLibrary.heuristics,
                ...Nudges.wisdomLibrary.antifragile
            ];

            // Filter by context
            const relevant = allWisdom.filter(w => w.context.includes(context));

            if (relevant.length === 0) return null;

            // Select based on situation hash for consistency
            const hash = situation.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            return relevant[hash % relevant.length];
        },

        currentScore: 0,

        getProfile() {
            return Nudges.countryProfiles[Currency.selected] || Nudges.countryProfiles.default;
        },

        analyze() {
            const totalIncome = State.data.incomes.reduce((s, i) => s + i.amount, 0);
            const totalExpenses = State.data.expenses.reduce((s, e) => s + e.amount, 0);
            const totalDebt = State.data.debts.reduce((s, d) => s + d.balance, 0);
            const totalInvestments = State.data.investments.reduce((s, i) => s + i.value, 0);
            const netSavings = totalIncome - totalExpenses;
            const profile = Nudges.getProfile();

            return {
                income: totalIncome,
                expenses: totalExpenses,
                debt: totalDebt,
                investments: totalInvestments,
                savings: netSavings,
                expenseRatio: totalIncome > 0 ? totalExpenses / totalIncome : 0,
                savingsRate: totalIncome > 0 ? netSavings / totalIncome : 0,
                debtToIncome: totalIncome > 0 ? totalDebt / (totalIncome * 12) : 0,
                debtToInvestment: totalInvestments > 0 ? totalDebt / totalInvestments : (totalDebt > 0 ? Infinity : 0),
                profile: profile
            };
        },

        calculateScore(data) {
            let score = 50;

            // Expense ratio impact (up to +20 or -10)
            if (data.income > 0) {
                if (data.expenseRatio < data.profile.expenseRatio.excellent) score += 20;
                else if (data.expenseRatio < data.profile.expenseRatio.good) score += 10;
                else if (data.expenseRatio > data.profile.expenseRatio.warning) score -= 10;
            }

            // Savings impact (+15 or -15)
            if (data.savings > 0) score += 15;
            else if (data.savings < 0) score -= 15;

            // Debt impact (+15 to -15)
            if (data.debt === 0) score += 15;
            else if (data.debtToIncome > 0.5) score -= 15;
            else if (data.debtToIncome > 0.36) score -= 5;

            return Math.max(0, Math.min(100, score));
        },

        generateNudges() {
            const data = Nudges.analyze();
            const nudges = [];
            const profile = data.profile;
            Nudges.currentScore = Nudges.calculateScore(data);

            // Skip if no financial data
            if (data.income === 0 && data.expenses === 0 && data.debt === 0 && data.investments === 0) {
                return [];
            }

            // 1. Score improvement nudges
            if (Nudges.currentScore < 100) {
                nudges.push(...Nudges.getScoreNudges(data, profile));
            }

            // 2. Expense control nudges
            nudges.push(...Nudges.getExpenseNudges(data, profile));

            // 3. Debt reduction nudges
            if (data.debt > 0) {
                nudges.push(...Nudges.getDebtNudges(data, profile));
            }

            // 4. Investment growth nudges
            nudges.push(...Nudges.getInvestmentNudges(data, profile));

            // 5. Emergency fund nudges
            nudges.push(...Nudges.getEmergencyFundNudges(data, profile));

            // 6. Portfolio diversification nudges
            nudges.push(...Nudges.getPortfolioDiversificationNudges(data, profile));

            // 7. Expense trend nudges
            nudges.push(...Nudges.getExpenseTrendNudges(data, profile));

            // 8. Cash flow analysis nudges
            nudges.push(...Nudges.getCashFlowNudges(data, profile));

            // 9. Milestone celebration nudges
            nudges.push(...Nudges.getMilestoneNudges(data, profile));

            // Sort by priority and return top 8 (increased for richer insights)
            return nudges.sort((a, b) => b.priority - a.priority).slice(0, 8);
        },

        getScoreNudges(data, profile) {
            const nudges = [];
            const gap = 100 - Nudges.currentScore;

            if (gap > 30) {
                // Large gap: Focus on fundamentals (Psychology of Money - reasonable over rational)
                nudges.push({
                    icon: '🎯',
                    category: 'score',
                    title: 'Focus on fundamentals first',
                    description: `Your score is ${Nudges.currentScore}. Building wealth requires consistent, reasonable decisions—not perfect ones. Focus on basics: spend less than you earn.`,
                    impact: `Could improve score by +15-20 points`,
                    wisdom: Nudges.getWisdomForContext('score', 'fundamentals'),
                    priority: 90
                });
            } else if (gap > 15) {
                // Medium gap: Good progress (Same as Ever - expectations)
                nudges.push({
                    icon: '📈',
                    category: 'score',
                    title: 'Good progress - stay the course',
                    description: `Score: ${Nudges.currentScore}. You're building momentum. The key now is consistency—small adjustments compound over time.`,
                    impact: `Target score: ${Math.min(100, Nudges.currentScore + 15)}`,
                    wisdom: Nudges.getWisdomForContext('score', 'progress'),
                    priority: 70
                });
            } else if (gap > 0) {
                // Small gap: Almost perfect (Psychology of Money - getting vs staying wealthy)
                nudges.push({
                    icon: '🌟',
                    category: 'score',
                    title: 'Staying wealthy requires humility',
                    description: `Score: ${Nudges.currentScore}. Getting here took optimism. Staying here requires caution. Don't let success breed complacency.`,
                    impact: `${gap} points from perfect—maintain your margin of safety`,
                    wisdom: Nudges.getWisdomForContext('score', 'staying'),
                    priority: 50
                });
            }

            return nudges;
        },

        getExpenseNudges(data, profile) {
            const nudges = [];

            if (data.expenseRatio > profile.expenseRatio.warning) {
                // High spending: Wealth is invisible (Psychology of Money)
                const targetRatio = profile.expenseRatio.good;
                const reduction = data.expenses - (data.income * targetRatio);
                nudges.push({
                    icon: '💸',
                    category: 'expense',
                    title: 'Wealth is what you don\'t spend',
                    description: `Spending ${(data.expenseRatio * 100).toFixed(0)}% of income. True wealth isn't visible—it's the freedom that comes from keeping more. Target: under ${(targetRatio * 100).toFixed(0)}%.`,
                    impact: `Saving ${Currency.format(reduction)} monthly builds invisible wealth`,
                    wisdom: Nudges.getWisdomForContext('expense', 'high-spending'),
                    priority: 95
                });
            } else if (data.expenseRatio > profile.expenseRatio.good) {
                // Moderate spending: Via negativa (Taleb) - subtract to improve
                const savings = data.income * (data.expenseRatio - profile.expenseRatio.excellent);
                nudges.push({
                    icon: '💡',
                    category: 'expense',
                    title: 'Via negativa: Subtract to improve',
                    description: `At ${(data.expenseRatio * 100).toFixed(0)}% you're doing well. But removing unnecessary spending often matters more than adding income.`,
                    impact: `Potential freedom fund: ${Currency.format(savings)}/month`,
                    wisdom: Nudges.getWisdomForContext('expense', 'moderate'),
                    priority: 60
                });
            }

            // Category-specific: Expectations grow faster than income (Same as Ever)
            if (data.expenses > 0) {
                const categoryTotals = {};
                State.data.expenses.forEach(exp => {
                    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
                });

                const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
                if (topCategory && topCategory[1] > data.expenses * 0.4) {
                    const categoryLabel = CategoryEngine.labels[topCategory[0]] || topCategory[0];
                    const percentage = ((topCategory[1] / data.expenses) * 100).toFixed(0);
                    nudges.push({
                        icon: '🔍',
                        category: 'expense',
                        title: `Check: Is ${categoryLabel} essential?`,
                        description: `${percentage}% of spending. Expectations often grow faster than income—ensure this category still serves your goals.`,
                        impact: 'Align spending with what actually brings satisfaction',
                        wisdom: Nudges.getWisdomForContext('expense', 'category'),
                        priority: 55
                    });
                }
            }

            return nudges;
        },

        getDebtNudges(data, profile) {
            const nudges = [];
            const debts = State.data.debts;

            if (debts.length === 0) return nudges;

            // High-interest debt: Debt creates fragility (Taleb - Antifragile)
            const highInterestDebts = debts.filter(d => d.rate > 15);
            if (highInterestDebts.length > 0) {
                const highestRate = Math.max(...highInterestDebts.map(d => d.rate));
                nudges.push({
                    icon: '🔥',
                    category: 'debt',
                    title: 'Debt creates fragility',
                    description: `${highestRate.toFixed(1)}% interest is compounding against you. Each payment you owe removes an option from your future. ${profile.debtStrategy === 'avalanche' ? 'Attack highest rate first.' : 'Start small for momentum.'}`,
                    impact: 'Regain optionality—freedom to make choices',
                    wisdom: Nudges.getWisdomForContext('debt', 'high-interest'),
                    priority: 100
                });
            }

            // Debt-to-income: Never put yourself where one mistake ends the game (Taleb)
            if (data.debtToIncome > 0.36) {
                nudges.push({
                    icon: '⚠️',
                    category: 'debt',
                    title: 'High leverage = high fragility',
                    description: `Debt at ${(data.debtToIncome * 100).toFixed(0)}% of annual income. High leverage means any setback—job loss, illness—could be devastating. Build a buffer.`,
                    impact: 'Reduce to under 36% for resilience',
                    wisdom: Nudges.getWisdomForContext('debt', 'high-dti'),
                    priority: 85
                });
            }

            // Debt vs investments: Via negativa - subtract before adding (Taleb)
            if (data.debtToInvestment > 1) {
                nudges.push({
                    icon: '⚖️',
                    category: 'debt',
                    title: 'Via negativa: Reduce before you add',
                    description: 'Debt exceeds investments. In uncertain times, removing liabilities is often wiser than adding assets. Subtract first.',
                    impact: 'Net worth improves more from debt reduction',
                    wisdom: Nudges.getWisdomForContext('debt', 'debt-vs-invest'),
                    priority: 75
                });
            }

            return nudges;
        },

        getInvestmentNudges(data, profile) {
            const nudges = [];
            const suggestions = profile.investmentSuggestions || [];

            // No investments yet: Just start (Just Keep Buying)
            if (data.investments === 0 && data.savings > 0) {
                const suggestionText = suggestions.length > 0 ? ` Consider: ${suggestions.slice(0, 2).join(', ')}.` : '';
                nudges.push({
                    icon: '🌱',
                    category: 'investment',
                    title: 'The best time to start is now',
                    description: `${Currency.format(data.savings)} monthly savings waiting. Don't wait for the "perfect" moment—time in the market beats timing the market.${suggestionText}`,
                    impact: 'Small consistent amounts beat sporadic large ones',
                    wisdom: Nudges.getWisdomForContext('investment', 'start'),
                    priority: 80
                });
            } else if (data.investments > 0 && data.savings > data.investments * 0.05) {
                // Has investments: Just keep buying (Maggiulli)
                const suggestionText = suggestions.length > 0 ? ` Consider: ${suggestions[0]}.` : '';
                nudges.push({
                    icon: '📊',
                    category: 'investment',
                    title: 'Just keep buying',
                    description: `${Currency.format(data.savings)} surplus available. Automate your contributions—remove the human element.${suggestionText}`,
                    impact: 'Consistency beats complexity',
                    wisdom: Nudges.getWisdomForContext('investment', 'increase'),
                    priority: 65
                });
            }

            // Tax-advantaged: 1/N heuristic for simplicity (Gigerenzer)
            const taxAdvantaged = profile.taxAdvantaged || [];
            if (taxAdvantaged.length > 0 && data.income > 0) {
                nudges.push({
                    icon: '🏦',
                    category: 'investment',
                    title: `Simple rules work: ${profile.name} options`,
                    description: `${taxAdvantaged[0]}. Simple, transparent strategies often outperform complex ones.`,
                    impact: 'Tax efficiency + compound growth',
                    wisdom: Nudges.getWisdomForContext('investment', 'tax'),
                    priority: 70
                });
            }

            return nudges;
        },

        getEmergencyFundNudges(data, profile) {
            const nudges = [];
            const monthlyExpenses = data.expenses;
            const targetFund = monthlyExpenses * profile.emergencyMonths;

            // Check if user has enough savings/investments for emergency
            const liquidAssets = data.investments * 0.3; // Assume 30% is liquid
            const emergencyGap = targetFund - liquidAssets;

            // Black swan preparation (Taleb) + Room for error (Housel)
            if (emergencyGap > 0 && data.expenses > 0) {
                nudges.push({
                    icon: '🛡️',
                    category: 'emergency',
                    title: 'Prepare for the unseen',
                    description: `Target: ${Currency.format(targetFund)} (${profile.emergencyMonths} months). The biggest risks are the ones you haven't imagined yet. Room for error lets you survive long enough for compounding to work.`,
                    impact: `Gap: ${Currency.format(emergencyGap)} — redundancy is insurance`,
                    wisdom: Nudges.getWisdomForContext('emergency', 'blackswan'),
                    priority: 85
                });
            } else if (data.expenses > 0 && emergencyGap <= 0) {
                // Has emergency fund: Barbell strategy suggestion (Taleb)
                nudges.push({
                    icon: '🏔️',
                    category: 'emergency',
                    title: 'Barbell strategy: Safety secured',
                    description: `Emergency fund covered. Consider the barbell: keep ${profile.emergencyMonths} months extremely safe, then take small calculated risks with the rest.`,
                    impact: 'Extreme safety + small asymmetric bets',
                    wisdom: Nudges.getWisdomForContext('emergency', 'barbell'),
                    priority: 40
                });
            }

            return nudges;
        },

        getPortfolioDiversificationNudges(data, profile) {
            const nudges = [];
            const investments = State.data.investments;
            if (investments.length === 0) return nudges;

            // Analyze portfolio composition by type
            const byType = {};
            let totalValue = 0;
            investments.forEach(inv => {
                const type = inv.type || 'other';
                byType[type] = (byType[type] || 0) + inv.value;
                totalValue += inv.value;
            });

            if (totalValue === 0) return nudges;

            // Check for concentration risk (>50% in one type)
            const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
            const topType = entries[0];
            const topPct = (topType[1] / totalValue) * 100;

            if (topPct > 60) {
                nudges.push({
                    icon: '⚠️',
                    category: 'investment',
                    title: `High concentration in ${topType[0]}`,
                    description: `${topPct.toFixed(0)}% of your portfolio is in ${topType[0]}. Diversification reduces risk without necessarily reducing returns.`,
                    impact: 'Consider the 1/N rule: divide resources equally across asset classes',
                    wisdom: Nudges.getWisdomForContext('investment', 'diversification'),
                    priority: 78
                });
            } else if (entries.length >= 3) {
                nudges.push({
                    icon: '✅',
                    category: 'investment',
                    title: 'Good diversification',
                    description: `Portfolio spread across ${entries.length} asset types. The largest (${topType[0]}) is ${topPct.toFixed(0)}% — reasonable concentration.`,
                    impact: 'Maintain this balance as you add investments',
                    priority: 35
                });
            }

            // Check for missing asset classes
            const hasStocks = byType['stocks'] || byType['etf'] || byType['mutual-fund'];
            const hasBonds = byType['bonds'];
            const hasRealEstate = byType['real-estate'];

            if (totalValue > 5000 && !hasBonds && hasStocks) {
                nudges.push({
                    icon: '📊',
                    category: 'investment',
                    title: 'Consider bonds for stability',
                    description: `All-equity portfolio. Adding bonds reduces volatility and provides income. Even 10-20% can smooth out rough patches.`,
                    impact: 'Barbell: stocks for growth, bonds for stability',
                    wisdom: Nudges.getWisdomForContext('investment', 'bonds'),
                    priority: 55
                });
            }

            return nudges;
        },

        getExpenseTrendNudges(data, profile) {
            const nudges = [];
            const expenses = State.data.expenses;
            if (expenses.length < 5) return nudges;

            // Group expenses by month
            const byMonth = {};
            expenses.forEach(exp => {
                const monthKey = exp.date ? exp.date.substring(0, 7) : null;
                if (!monthKey) return;
                byMonth[monthKey] = (byMonth[monthKey] || 0) + exp.amount;
            });

            const months = Object.keys(byMonth).sort().reverse();
            if (months.length < 2) return nudges;

            const currentMonth = months[0];
            const lastMonth = months[1];
            const currentSpend = byMonth[currentMonth];
            const lastSpend = byMonth[lastMonth];

            if (lastSpend > 0) {
                const changeRate = ((currentSpend - lastSpend) / lastSpend) * 100;

                if (changeRate > 25) {
                    nudges.push({
                        icon: '📈',
                        category: 'expense',
                        title: 'Spending up significantly',
                        description: `${changeRate.toFixed(0)}% increase from last month. Was this intentional? Expectations often grow faster than income.`,
                        impact: `${Currency.format(currentSpend)} this month vs ${Currency.format(lastSpend)} last month`,
                        wisdom: Nudges.getWisdomForContext('expense', 'increase'),
                        priority: 72
                    });
                } else if (changeRate < -15) {
                    nudges.push({
                        icon: '🎉',
                        category: 'expense',
                        title: 'Spending decreased',
                        description: `${Math.abs(changeRate).toFixed(0)}% reduction from last month. The highest form of wealth is the ability to control your spending.`,
                        impact: `Saved ${Currency.format(lastSpend - currentSpend)} compared to last month`,
                        priority: 45
                    });
                }
            }

            // Detect potential recurring subscriptions
            const categoryTotals = {};
            expenses.forEach(exp => {
                categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
            });

            const entertainment = categoryTotals['entertainment'] || 0;
            if (entertainment > data.income * 0.1 && data.income > 0) {
                nudges.push({
                    icon: '🎬',
                    category: 'expense',
                    title: 'Entertainment spending review',
                    description: `${((entertainment / data.income) * 100).toFixed(0)}% of income on entertainment. Check for forgotten subscriptions or auto-renewals.`,
                    impact: 'Small recurring charges add up over time',
                    priority: 50
                });
            }

            return nudges;
        },

        getCashFlowNudges(data, profile) {
            const nudges = [];

            // Negative cash flow warning
            if (data.savings < 0 && data.income > 0) {
                const deficit = Math.abs(data.savings);
                const monthsToZero = data.investments > 0 ? Math.floor(data.investments / deficit) : 0;

                nudges.push({
                    icon: '🚨',
                    category: 'expense',
                    title: 'Cash flow is negative',
                    description: `Spending ${Currency.format(deficit)} more than earning each month. This isn't sustainable—every month drains your reserves.`,
                    impact: monthsToZero > 0 ? `At this rate, savings depleted in ~${monthsToZero} months` : 'Cut expenses or increase income urgently',
                    wisdom: Nudges.getWisdomForContext('expense', 'deficit'),
                    priority: 98
                });
            }

            // Strong positive cash flow
            if (data.savingsRate > 0.30 && data.income > 0) {
                nudges.push({
                    icon: '💪',
                    category: 'savings',
                    title: 'Excellent savings rate',
                    description: `Saving ${(data.savingsRate * 100).toFixed(0)}% of income. This level of discipline accelerates financial independence dramatically.`,
                    impact: 'You are building options and flexibility',
                    wisdom: Nudges.getWisdomForContext('savings', 'excellent'),
                    priority: 30
                });
            }

            // Suggest automation if not investing much
            if (data.savings > 0 && data.investments < data.savings * 2 && data.income > 0) {
                nudges.push({
                    icon: '🔄',
                    category: 'investment',
                    title: 'Automate your surplus',
                    description: `${Currency.format(data.savings)}/month available. Set up automatic transfers to investments—remove the human element from the decision.`,
                    impact: 'Automation beats willpower',
                    wisdom: Nudges.getWisdomForContext('investment', 'automate'),
                    priority: 62
                });
            }

            return nudges;
        },

        getMilestoneNudges(data, profile) {
            const nudges = [];

            // Debt-free milestone
            if (data.debt === 0 && State.data.debts.length === 0 && data.investments > 0) {
                nudges.push({
                    icon: '🏆',
                    category: 'debt',
                    title: 'Debt-free achievement',
                    description: 'You have no debt! This puts you in an excellent position—every dollar you earn is truly yours to keep or invest.',
                    impact: 'Maximum financial flexibility achieved',
                    priority: 25
                });
            }

            // Investment milestones
            const investmentMilestones = [1000, 5000, 10000, 25000, 50000, 100000];
            for (const milestone of investmentMilestones) {
                if (data.investments >= milestone && data.investments < milestone * 1.2) {
                    nudges.push({
                        icon: '🎯',
                        category: 'investment',
                        title: `Milestone: ${Currency.format(milestone)} invested`,
                        description: `You've crossed ${Currency.format(milestone)} in investments. The most powerful force in finance is compound interest—and you've given it fuel.`,
                        impact: 'Keep buying. Time is your ally now.',
                        priority: 28
                    });
                    break;
                }
            }

            // Emergency fund complete
            const monthlyExpenses = data.expenses;
            const targetFund = monthlyExpenses * profile.emergencyMonths;
            const liquidAssets = data.investments * 0.3;

            if (liquidAssets >= targetFund && targetFund > 0) {
                nudges.push({
                    icon: '✨',
                    category: 'emergency',
                    title: 'Emergency fund secured',
                    description: `You have ${profile.emergencyMonths}+ months of expenses covered. You can now take more calculated risks with the rest.`,
                    impact: 'Safety achieved—consider growth investments',
                    priority: 32
                });
            }

            return nudges;
        },

        render() {
            const container = document.getElementById('nudges-list');
            if (!container) return;

            const nudges = Nudges.generateNudges();

            if (nudges.length === 0) {
                container.innerHTML = '<p class="empty-state">Add your financial data to receive personalized insights from behavioral finance research.</p>';
                return;
            }

            const profile = Nudges.getProfile();
            container.innerHTML = `
                <div class="nudges-header">
                    <span class="nudges-score">Score: ${Nudges.currentScore}/100</span>
                    <span class="nudges-country">${Utils.escapeHtml(profile.name)}</span>
                </div>
                <div class="nudges-items">
                    ${nudges.map(nudge => `
                        <div class="nudge-item nudge-${Utils.escapeHtml(nudge.category)}">
                            <span class="nudge-icon">${Utils.escapeHtml(nudge.icon)}</span>
                            <div class="nudge-content">
                                <div class="nudge-title">${Utils.escapeHtml(nudge.title)}</div>
                                <div class="nudge-description">${Utils.escapeHtml(nudge.description)}</div>
                                <div class="nudge-impact">${Utils.escapeHtml(nudge.impact)}</div>
                                ${nudge.wisdom ? `
                                    <div class="nudge-wisdom">
                                        <span class="wisdom-quote">"${Utils.escapeHtml(nudge.wisdom.quote)}"</span>
                                        <span class="wisdom-source">— ${Utils.escapeHtml(nudge.wisdom.author)}, ${Utils.escapeHtml(nudge.wisdom.source)}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        },

        // Helper function to render a single nudge item (reusable)
        renderNudgeItem(nudge) {
            return `
                <div class="nudge-item nudge-${Utils.escapeHtml(nudge.category)}">
                    <span class="nudge-icon">${Utils.escapeHtml(nudge.icon)}</span>
                    <div class="nudge-content">
                        <div class="nudge-title">${Utils.escapeHtml(nudge.title)}</div>
                        <div class="nudge-description">${Utils.escapeHtml(nudge.description)}</div>
                        <div class="nudge-impact">${Utils.escapeHtml(nudge.impact)}</div>
                        ${nudge.wisdom ? `
                            <div class="nudge-wisdom">
                                <span class="wisdom-quote">"${Utils.escapeHtml(nudge.wisdom.quote)}"</span>
                                <span class="wisdom-source">— ${Utils.escapeHtml(nudge.wisdom.author)}, ${Utils.escapeHtml(nudge.wisdom.source)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        },

        // Global ticker renderer for Smart Nudges
        renderTicker() {
            const container = document.getElementById('nudges-ticker');
            if (!container) return;

            let nudges = Nudges.generateNudges();

            // Onboarding fallback when no financial data
            if (nudges.length === 0) {
                nudges = [
                    { category: 'score', icon: '📊', title: 'Track Your Finances', impact: 'Add expenses and income to get started' },
                    { category: 'expense', icon: '💸', title: 'Log Expenses', impact: 'Understanding spending is the first step' },
                    { category: 'investment', icon: '📈', title: 'Plan Investments', impact: 'Time in the market beats timing the market' },
                    { category: 'debt', icon: '📉', title: 'Manage Debt', impact: 'High-interest debt costs you money daily' },
                    { category: 'emergency', icon: '🛡️', title: 'Build Emergency Fund', impact: 'Financial cushion reduces stress' }
                ];
            }

            // Limit to top nudges and build compact ticker items
            const tickerNudges = nudges.slice(0, 8);

            const tickerItems = tickerNudges.map(nudge => `
                <div class="ticker-item ticker-${Utils.escapeHtml(nudge.category)}">
                    <span class="ticker-icon">${Utils.escapeHtml(nudge.icon)}</span>
                    <span class="ticker-title">${Utils.escapeHtml(nudge.title)}</span>
                    <span class="ticker-impact">${Utils.escapeHtml(nudge.impact)}</span>
                </div>
            `).join('');

            // Duplicate for seamless loop
            container.innerHTML = `
                <div class="nudges-ticker-track">
                    ${tickerItems}
                    ${tickerItems}
                </div>
            `;
        },

        // Section-specific render for Expenses section
        renderExpenseInsights() {
            const container = document.getElementById('expense-insights');
            if (!container) return;

            const data = Nudges.analyze();
            const profile = Nudges.getProfile();

            // Get expense-specific nudges
            const nudges = Nudges.getExpenseNudges(data, profile);

            if (nudges.length === 0 || data.expenses === 0) {
                container.innerHTML = '<p class="empty-state">Add expenses to see personalized spending insights.</p>';
                return;
            }

            container.innerHTML = `
                <div class="insights-items">
                    ${nudges.slice(0, 3).map(nudge => Nudges.renderNudgeItem(nudge)).join('')}
                </div>
            `;
        },

        // Section-specific render for Debt section
        renderDebtInsights() {
            const container = document.getElementById('debt-insights');
            if (!container) return;

            const data = Nudges.analyze();
            const profile = Nudges.getProfile();

            // Get debt-specific nudges
            const nudges = Nudges.getDebtNudges(data, profile);

            if (nudges.length === 0 || data.debt === 0) {
                container.innerHTML = '<p class="empty-state">Add debts to see personalized reduction strategies.</p>';
                return;
            }

            container.innerHTML = `
                <div class="insights-items">
                    ${nudges.slice(0, 3).map(nudge => Nudges.renderNudgeItem(nudge)).join('')}
                </div>
            `;
        },

        // Section-specific render for Investments section
        renderInvestmentInsights() {
            const container = document.getElementById('investment-insights');
            if (!container) return;

            const data = Nudges.analyze();
            const profile = Nudges.getProfile();

            // Get investment-specific nudges
            const nudges = Nudges.getInvestmentNudges(data, profile);

            if (nudges.length === 0) {
                container.innerHTML = '<p class="empty-state">Add investments to see personalized growth insights.</p>';
                return;
            }

            container.innerHTML = `
                <div class="insights-items">
                    ${nudges.slice(0, 3).map(nudge => Nudges.renderNudgeItem(nudge)).join('')}
                </div>
            `;
        }
    };

    // ==================== APP (ORCHESTRATOR) ====================

    const App = {
        init() {
            // Clean up deprecated layout preference
            localStorage.removeItem('layoutPreference');

            App.setupNavigation();
            App.setupEventDelegation();
            App.setupForms();
            Currency.setupSelector();
            DashboardActions.init();
            TagSuggestions.setup();
            Income.setupOneTimeToggle();
            Upload.setupDashboard();
            Upload.setupZone('expense-upload-zone', 'expense-file-input', 'expense-upload-preview', 'expense');
            Upload.setupZone('payslip-upload-zone', 'payslip-file-input', 'payslip-upload-preview', 'payslip');
            Upload.setupZone('investment-upload-zone', 'investment-file-input', 'investment-upload-preview', 'investment');
            Upload.setupZone('dashboard-investment-zone', 'dashboard-investment-input', 'dashboard-investment-preview', 'investment');

            // Import/discard buttons for transactions
            const importBtn = document.getElementById('import-all-btn');
            const discardBtn = document.getElementById('discard-parsed-btn');
            if (importBtn) importBtn.addEventListener('click', () => Parser.import());
            if (discardBtn) discardBtn.addEventListener('click', () => Parser.discard());

            // Import/discard buttons for investments
            const importInvBtn = document.getElementById('import-investments-btn');
            const discardInvBtn = document.getElementById('discard-investments-btn');
            if (importInvBtn) importInvBtn.addEventListener('click', () => InvestmentParser.import());
            if (discardInvBtn) discardInvBtn.addEventListener('click', () => InvestmentParser.discard());

            // Initialize budget module
            Budget.init();

            // Initial renders
            Expenses.render();
            PlannedExpenses.render();
            Debts.render();
            PlannedDebts.render();
            Investments.render();
            PlannedInvestments.render();
            Income.render();
            Upload.renderHistory();
            Dashboard.update();

            // Restore investment profile
            if (State.data.investmentProfile) {
                const p = State.data.investmentProfile;
                const goalEl = document.getElementById('investment-goal');
                const timelineEl = document.getElementById('investment-timeline');
                const riskEl = document.getElementById('risk-tolerance');
                const monthlyEl = document.getElementById('monthly-investment');
                if (goalEl) goalEl.value = p.goal;
                if (timelineEl) timelineEl.value = p.timeline;
                if (riskEl) riskEl.value = p.riskTolerance;
                if (monthlyEl) monthlyEl.value = p.monthlyAmount;
                Investments.generateRecommendations();
                Investments.generateProjection();
            }

            // Set default date
            const dateInput = document.getElementById('expense-date');
            if (dateInput) dateInput.valueAsDate = new Date();

            // Set disclaimer year
            const yearSpan = document.getElementById('disclaimer-year');
            if (yearSpan) yearSpan.textContent = new Date().getFullYear();
        },

        setupNavigation() {
            document.querySelectorAll('.nav-links a').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('href').substring(1);

                    // Update tab states
                    document.querySelectorAll('.nav-links a').forEach(l => {
                        l.classList.remove('active');
                        l.setAttribute('aria-selected', 'false');
                    });
                    link.classList.add('active');
                    link.setAttribute('aria-selected', 'true');

                    // Update panel visibility
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                    const targetSection = document.getElementById(targetId);
                    if (targetSection) targetSection.classList.add('active');
                });
            });
        },

        setupEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;

                const action = target.dataset.action;
                const id = target.dataset.id;

                switch (action) {
                    case 'delete-expense': Expenses.delete(id); break;
                    case 'edit-expense': Expenses.edit(id); break;
                    case 'save-expense-edit': Expenses.saveEdit(id); break;
                    case 'cancel-expense-edit': Expenses.cancelEdit(); break;
                    case 'delete-debt': Debts.delete(id); break;
                    case 'delete-investment': Investments.delete(id); break;
                    case 'delete-income': Income.delete(id); break;
                    case 'delete-upload': Upload.deleteUpload(id); break;
                    case 'complete-planned': PlannedExpenses.complete(id); break;
                    case 'cancel-planned': PlannedExpenses.cancel(id); break;
                    case 'delete-planned': PlannedExpenses.delete(id); break;
                    case 'activate-planned-debt': PlannedDebts.activate(id); break;
                    case 'delete-planned-debt': PlannedDebts.delete(id); break;
                    case 'activate-planned-investment': PlannedInvestments.activate(id); break;
                    case 'delete-planned-investment': PlannedInvestments.delete(id); break;
                    case 'reset-expenses': Expenses.reset(); break;
                    case 'reset-debts': Debts.reset(); break;
                    case 'reset-investments': Investments.reset(); break;
                    case 'switch-dashboard-action': DashboardActions.switchTab(target.dataset.dashboardAction); break;
                }
            });
        },

        setupForms() {
            // Expense form
            const expenseForm = document.getElementById('expense-form');
            if (expenseForm) expenseForm.addEventListener('submit', (e) => Expenses.add(e));

            // Debt form
            const debtForm = document.getElementById('debt-form');
            if (debtForm) debtForm.addEventListener('submit', (e) => Debts.add(e));

            // Planned debt form
            const plannedDebtForm = document.getElementById('planned-debt-form');
            if (plannedDebtForm) {
                plannedDebtForm.addEventListener('submit', (e) => PlannedDebts.add(e));
                const startInput = document.getElementById('planned-debt-start');
                if (startInput) {
                    const nextMonth = new Date();
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    startInput.valueAsDate = nextMonth;
                }
            }

            // Investment form
            const investmentForm = document.getElementById('add-investment-form');
            if (investmentForm) investmentForm.addEventListener('submit', (e) => Investments.add(e));

            // Planned investment form
            const plannedInvestmentForm = document.getElementById('planned-investment-form');
            if (plannedInvestmentForm) {
                plannedInvestmentForm.addEventListener('submit', (e) => PlannedInvestments.add(e));
                const targetInput = document.getElementById('planned-investment-date');
                if (targetInput) {
                    const nextMonth = new Date();
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    targetInput.valueAsDate = nextMonth;
                }
            }

            // Income form
            const incomeForm = document.getElementById('income-form');
            if (incomeForm) incomeForm.addEventListener('submit', (e) => Income.add(e));

            // Planned expense form
            const plannedForm = document.getElementById('planned-expense-form');
            if (plannedForm) {
                plannedForm.addEventListener('submit', (e) => PlannedExpenses.add(e));

                const recurringCheckbox = document.getElementById('planned-recurring');
                const endDateGroup = document.getElementById('recurring-end-group');
                if (recurringCheckbox && endDateGroup) {
                    recurringCheckbox.addEventListener('change', () => {
                        endDateGroup.style.display = recurringCheckbox.checked ? 'block' : 'none';
                    });
                }

                const plannedDateInput = document.getElementById('planned-date');
                if (plannedDateInput) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    plannedDateInput.valueAsDate = tomorrow;
                }
            }

            // Expense filter
            const filterCategory = document.getElementById('filter-category');
            if (filterCategory) filterCategory.addEventListener('change', (e) => Expenses.render(e.target.value));

            // Calculate payoff
            const calcPayoff = document.getElementById('calculate-payoff');
            if (calcPayoff) {
                calcPayoff.addEventListener('click', () => {
                    const extra = parseFloat(document.getElementById('extra-payment-amount').value) || 0;
                    Debts.calculateTimeline(extra);
                });
            }

            // Strategy tabs
            document.querySelectorAll('.strategy-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.strategy-tab').forEach(t => {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    Debts.updatePayoffPlan();
                });
            });

            // Investment profile
            const profileForm = document.getElementById('investment-profile-form');
            if (profileForm) {
                profileForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const goalEl = document.getElementById('investment-goal');
                    const timelineEl = document.getElementById('investment-timeline');
                    const riskEl = document.getElementById('risk-tolerance');
                    const monthlyEl = document.getElementById('monthly-investment');

                    State.set('investmentProfile', {
                        goal: goalEl ? goalEl.value : '',
                        timeline: timelineEl ? timelineEl.value : '',
                        riskTolerance: riskEl ? riskEl.value : '',
                        monthlyAmount: monthlyEl ? (parseFloat(monthlyEl.value) || 0) : 0
                    });
                    Investments.generateRecommendations();
                    Investments.generateProjection();
                    Notify.show('Investment profile updated', 'success');
                });
            }
        }
    };

    // ==================== BOOT ====================

    document.addEventListener('DOMContentLoaded', App.init);
})();
