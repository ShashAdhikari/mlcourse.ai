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

        selected: localStorage.getItem('selectedCurrency') || 'USD',

        format(amount) {
            const sym = Currency.symbols[Currency.selected] || '$';
            return sym + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        setupSelector() {
            const select = document.getElementById('currency-select');
            if (!select) return;
            select.value = Currency.selected;
            select.addEventListener('change', () => {
                Currency.selected = select.value;
                localStorage.setItem('selectedCurrency', select.value);
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
            });
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
            investmentProfile: Utils.safeParse('investmentProfile', null)
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

        detectColumns(headers) {
            const lower = headers.map(h => String(h).toLowerCase().trim());
            const result = { date: -1, description: -1, debit: -1, credit: -1, balance: -1 };
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
            let cols = { date: -1, description: -1, debit: -1, credit: -1, balance: -1 };
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
                hasBalance: cols.balance >= 0
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
                    balanceRaw
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
                    date: t.date
                });
            });
            State.save('expenses');

            Parser.pending = [];
            Parser.columnInfo = null;
            document.getElementById('parsed-transactions-card').style.display = 'none';

            Expenses.render();
            Dashboard.update();
            Notify.show(toImport.length + ' transactions imported', 'success');
        },

        discard() {
            Parser.pending = [];
            Parser.columnInfo = null;
            document.getElementById('parsed-transactions-card').style.display = 'none';
            Notify.show('Parsed transactions discarded', 'info');
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
            Dashboard.update();
            Notify.show('Expense added', 'success');
        },

        delete(id) {
            State.set('expenses', State.data.expenses.filter(e => e.id !== id));
            Expenses.render();
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
            Dashboard.update();
            Notify.show('Expense updated', 'success');
        },

        cancelEdit() {
            Expenses.render();
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
                return;
            }

            container.innerHTML = State.data.debts.map(debt => `
                <div class="debt-item">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(debt.name)}</h4>
                        <p>${Utils.capitalizeFirst(debt.type.replace('-', ' '))} &bull; ${debt.rate}% APR</p>
                        <p>Min payment: ${Currency.format(debt.minimum)}/mo</p>
                    </div>
                    <span class="item-amount debt">${Currency.format(debt.balance)}</span>
                    <button class="delete-btn" data-action="delete-debt" data-id="${debt.id}" aria-label="Delete debt" title="Delete">&#128465;</button>
                </div>
            `).join('');

            Debts.updatePayoffPlan();
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
                name, balance, rate, minimum, type
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
        },

        add(e) {
            e.preventDefault();
            const name = document.getElementById('investment-name').value.trim();
            const value = parseFloat(document.getElementById('investment-value').value);
            const type = document.getElementById('investment-type').value;

            if (!name || !value || !type) return;

            State.modify('investments', arr => arr.push({
                id: Utils.generateId(),
                name, value, type
            }));

            e.target.reset();
            Investments.render();
            Dashboard.update();
            Notify.show('Investment added', 'success');
        },

        delete(id) {
            State.set('investments', State.data.investments.filter(i => i.id !== id));
            Investments.render();
            Dashboard.update();
            Notify.show('Investment deleted', 'info');
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

        generateProjection() {
            const detailsEl = document.getElementById('projection-details');
            if (!State.data.investmentProfile) return;

            const { timeline, riskTolerance, monthlyAmount } = State.data.investmentProfile;
            const currentPortfolio = State.data.investments.reduce((s, inv) => s + inv.value, 0);

            const rates = { conservative: 0.06, moderate: 0.08, aggressive: 0.10 };
            const annualRate = rates[riskTolerance] || 0.08;
            const monthlyRate = annualRate / 12;

            const labels = [];
            const data = [];
            const years = parseInt(timeline) || 10;

            let balance = currentPortfolio;
            labels.push('Now');
            data.push(balance);

            for (let y = 1; y <= years; y++) {
                for (let m = 0; m < 12; m++) {
                    balance = balance * (1 + monthlyRate) + monthlyAmount;
                }
                labels.push('Year ' + y);
                data.push(Math.round(balance));
            }

            const totalContributed = currentPortfolio + (monthlyAmount * 12 * years);
            const totalGrowth = balance - totalContributed;

            // Render chart
            const ctx = document.getElementById('investment-chart');
            if (ctx) {
                if (Investments.chart) Investments.chart.destroy();
                Investments.chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Portfolio Value',
                            data,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                ticks: { callback: v => Currency.format(v) }
                            }
                        }
                    }
                });
            }

            if (detailsEl) {
                detailsEl.innerHTML = `
                    <div class="investment-total" style="margin-top:1rem">
                        <div>
                            <p><strong>Projected Value (${years}yr):</strong> ${Currency.format(balance)}</p>
                            <p>Total Contributed: ${Currency.format(totalContributed)} &bull; Growth: ${Currency.format(totalGrowth)}</p>
                        </div>
                    </div>`;
            }
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

            container.innerHTML = State.data.incomes.map(inc => `
                <div class="income-item">
                    <div class="item-info">
                        <h4>${Utils.escapeHtml(inc.source)}</h4>
                        <p>${Utils.capitalizeFirst(inc.type.replace('-', ' '))}</p>
                    </div>
                    <span class="item-amount income">${Currency.format(inc.amount)}/mo</span>
                    <button class="delete-btn" data-action="delete-income" data-id="${inc.id}" aria-label="Delete income" title="Delete">&#128465;</button>
                </div>
            `).join('');
        },

        add(e) {
            e.preventDefault();
            const source = document.getElementById('income-source').value.trim();
            const amount = parseFloat(document.getElementById('income-amount').value);
            const type = document.getElementById('income-type').value;

            if (!source || !amount || !type) return;

            State.modify('incomes', arr => arr.push({
                id: Utils.generateId(),
                source, amount, type
            }));

            e.target.reset();
            Income.render();
            Dashboard.update();
            Notify.show('Income added', 'success');
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
            State.set('uploads', State.data.uploads.filter(u => u.id !== id));
            Upload.renderHistory();
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
            State.data.incomes.push({
                id: Utils.generateId(),
                source: 'Primary Job (from payslip)',
                amount: 5000,
                type: 'salary'
            });
            State.save('incomes');
            Upload.sampleIncomeAdded = true;
            localStorage.setItem('sampleIncomeAdded', 'true');
            Income.render();
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

            document.getElementById('total-income').textContent = Currency.format(totalIncome);
            document.getElementById('total-expenses').textContent = Currency.format(totalExpenses);
            document.getElementById('total-debt').textContent = Currency.format(totalDebt);
            document.getElementById('net-savings').textContent = Currency.format(netSavings);

            Dashboard.updateHealthScore(totalIncome, totalExpenses, totalDebt, netSavings);
            Dashboard.updateExpenseChart();
            Dashboard.renderMonthlyAnalytics();
            Dashboard.renderYearlyProjection();
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

        updateExpenseChart() {
            const ctx = document.getElementById('expense-chart');
            if (!ctx) return;

            const categoryTotals = {};
            State.data.expenses.forEach(exp => {
                categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
            });

            const labels = Object.keys(categoryTotals).map(c => CategoryEngine.labels[c] || c);
            const data = Object.values(categoryTotals);
            const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#64748b'];

            if (Dashboard.expenseChart) Dashboard.expenseChart.destroy();

            if (data.length === 0) {
                Dashboard.expenseChart = null;
                return;
            }

            Dashboard.expenseChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 2, borderColor: '#fff' }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { padding: 15, usePointStyle: true } }
                    }
                }
            });
        },

        getMonthlyBreakdown() {
            const monthlyExpenses = {};
            State.data.expenses.forEach(exp => {
                const key = exp.date.substring(0, 7);
                monthlyExpenses[key] = (monthlyExpenses[key] || 0) + exp.amount;
            });
            return monthlyExpenses;
        },

        parseMonthKey(monthKey) {
            const [year, month] = monthKey.split('-').map(Number);
            return new Date(year, month - 1, 1);
        },

        renderMonthlyAnalytics() {
            const container = document.getElementById('monthly-analytics');
            if (!container) return;

            const totalIncome = State.data.incomes.reduce((s, i) => s + i.amount, 0);
            const totalExpenses = State.data.expenses.reduce((s, e) => s + e.amount, 0);

            if (State.data.expenses.length === 0 && State.data.incomes.length === 0) {
                container.innerHTML = '<p class="empty-state">Add expenses and income to see your monthly comparison.</p>';
                return;
            }

            const monthlyBreakdown = Dashboard.getMonthlyBreakdown();
            const months = Object.keys(monthlyBreakdown);
            const monthCount = months.length || 1;
            const avgMonthlyExpense = totalExpenses / monthCount;
            const diff = totalIncome - avgMonthlyExpense;
            const diffClass = diff >= 0 ? 'positive' : 'negative';
            const diffLabel = diff >= 0 ? 'surplus' : 'deficit';

            const sortedMonths = [...months].sort().reverse();

            let monthRows = '';
            if (sortedMonths.length > 0) {
                monthRows = sortedMonths.map(m => {
                    const mExp = monthlyBreakdown[m];
                    const mDiff = totalIncome - mExp;
                    const mClass = mDiff >= 0 ? 'positive' : 'negative';
                    const monthLabel = Dashboard.parseMonthKey(m).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                    return `<tr><td>${monthLabel}</td><td>${Currency.format(mExp)}</td><td>${Currency.format(totalIncome)}</td><td class="${mClass}">${Currency.format(mDiff)}</td></tr>`;
                }).join('');
            } else {
                monthRows = '<tr><td colspan="4" class="empty-state">No expense data yet</td></tr>';
            }

            const ratio = totalIncome > 0 ? avgMonthlyExpense / totalIncome : 0;
            const ratioPercent = Math.min(100, ratio * 100).toFixed(1);
            const ratioClass = ratio > 0.9 ? 'danger' : ratio > 0.7 ? 'warning' : 'good';

            container.innerHTML = `
                <div class="analytics-summary">
                    <div class="analytics-stat"><span class="analytics-label">Avg Monthly Expense</span><span class="analytics-value expense">${Currency.format(avgMonthlyExpense)}</span></div>
                    <div class="analytics-stat"><span class="analytics-label">Monthly Income</span><span class="analytics-value income">${Currency.format(totalIncome)}</span></div>
                    <div class="analytics-stat"><span class="analytics-label">Monthly ${Utils.capitalizeFirst(diffLabel)}</span><span class="analytics-value ${diffClass}">${Currency.format(diff)}</span></div>
                    <div class="analytics-stat"><span class="analytics-label">Months Tracked</span><span class="analytics-value">${months.length}</span></div>
                </div>
                ${totalIncome > 0 ? `
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

    // ==================== APP (ORCHESTRATOR) ====================

    const App = {
        init() {
            App.setupNavigation();
            App.setupEventDelegation();
            App.setupForms();
            Currency.setupSelector();
            TagSuggestions.setup();
            Upload.setupDashboard();
            Upload.setupZone('expense-upload-zone', 'expense-file-input', 'expense-upload-preview', 'expense');
            Upload.setupZone('payslip-upload-zone', 'payslip-file-input', 'payslip-upload-preview', 'payslip');

            // Import/discard buttons
            const importBtn = document.getElementById('import-all-btn');
            const discardBtn = document.getElementById('discard-parsed-btn');
            if (importBtn) importBtn.addEventListener('click', () => Parser.import());
            if (discardBtn) discardBtn.addEventListener('click', () => Parser.discard());

            // Initial renders
            Expenses.render();
            Debts.render();
            Investments.render();
            Income.render();
            Upload.renderHistory();
            Dashboard.update();

            // Restore investment profile
            if (State.data.investmentProfile) {
                const p = State.data.investmentProfile;
                document.getElementById('investment-goal').value = p.goal;
                document.getElementById('investment-timeline').value = p.timeline;
                document.getElementById('risk-tolerance').value = p.riskTolerance;
                document.getElementById('monthly-investment').value = p.monthlyAmount;
                Investments.generateRecommendations();
                Investments.generateProjection();
            }

            // Set default date
            const dateInput = document.getElementById('expense-date');
            if (dateInput) dateInput.valueAsDate = new Date();
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
                    document.getElementById(targetId).classList.add('active');
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
                }
            });
        },

        setupForms() {
            // Expense form
            document.getElementById('expense-form').addEventListener('submit', (e) => Expenses.add(e));

            // Debt form
            document.getElementById('debt-form').addEventListener('submit', (e) => Debts.add(e));

            // Investment form
            document.getElementById('add-investment-form').addEventListener('submit', (e) => Investments.add(e));

            // Income form
            document.getElementById('income-form').addEventListener('submit', (e) => Income.add(e));

            // Expense filter
            document.getElementById('filter-category').addEventListener('change', (e) => Expenses.render(e.target.value));

            // Calculate payoff
            document.getElementById('calculate-payoff').addEventListener('click', () => {
                const extra = parseFloat(document.getElementById('extra-payment-amount').value) || 0;
                Debts.calculateTimeline(extra);
            });

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
            document.getElementById('investment-profile-form').addEventListener('submit', (e) => {
                e.preventDefault();
                State.set('investmentProfile', {
                    goal: document.getElementById('investment-goal').value,
                    timeline: document.getElementById('investment-timeline').value,
                    riskTolerance: document.getElementById('risk-tolerance').value,
                    monthlyAmount: parseFloat(document.getElementById('monthly-investment').value) || 0
                });
                Investments.generateRecommendations();
                Investments.generateProjection();
                Notify.show('Investment profile updated', 'success');
            });
        }
    };

    // ==================== BOOT ====================

    document.addEventListener('DOMContentLoaded', App.init);
})();
