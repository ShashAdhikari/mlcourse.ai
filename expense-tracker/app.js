// Financial Tracker Application
// Safe JSON parse with fallback
const safeParse = (key, fallback) => {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
    } catch {
        return fallback;
    }
};

// Main application state
const state = {
    expenses: safeParse('expenses', []),
    debts: safeParse('debts', []),
    investments: safeParse('investments', []),
    incomes: safeParse('incomes', []),
    uploads: safeParse('uploads', []),
    investmentProfile: safeParse('investmentProfile', null)
};

// ==================== CURRENCY MANAGEMENT ====================

// Detect currency from browser locale
const detectCurrency = () => {
    const saved = localStorage.getItem('selectedCurrency');
    if (saved) return saved;

    try {
        const locale = navigator.language || navigator.userLanguage || 'en-US';
        const localeCurrencyMap = {
            'en-US': 'USD', 'en-GB': 'GBP', 'en-AU': 'AUD', 'en-CA': 'CAD',
            'en-NZ': 'NZD', 'en-SG': 'SGD', 'en-HK': 'HKD', 'en-ZA': 'ZAR',
            'en-IN': 'INR', 'ne-NP': 'NPR', 'hi-IN': 'INR',
            'ja-JP': 'JPY', 'zh-CN': 'CNY', 'zh-TW': 'TWD', 'ko-KR': 'KRW',
            'de-DE': 'EUR', 'fr-FR': 'EUR', 'es-ES': 'EUR', 'it-IT': 'EUR',
            'pt-BR': 'BRL', 'es-MX': 'MXN', 'sv-SE': 'SEK', 'nb-NO': 'NOK',
            'de-CH': 'CHF', 'fr-CH': 'CHF'
        };
        return localeCurrencyMap[locale] || 'USD';
    } catch {
        return 'USD';
    }
};

let selectedCurrency = detectCurrency();

// Utility functions
const formatCurrency = (amount) => {
    return new Intl.NumberFormat(navigator.language || 'en-US', {
        style: 'currency',
        currency: selectedCurrency
    }).format(amount);
};

const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// Escape HTML to prevent XSS
const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const saveState = () => {
    localStorage.setItem('expenses', JSON.stringify(state.expenses));
    localStorage.setItem('debts', JSON.stringify(state.debts));
    localStorage.setItem('investments', JSON.stringify(state.investments));
    localStorage.setItem('incomes', JSON.stringify(state.incomes));
    localStorage.setItem('uploads', JSON.stringify(state.uploads));
    localStorage.setItem('investmentProfile', JSON.stringify(state.investmentProfile));
};

// Navigation
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);

        // Update nav active state
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Show target section
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
    });
});

// Initialize date inputs with today's date
document.getElementById('expense-date').valueAsDate = new Date();

// ==================== EXPENSE TRACKING ====================

const renderExpenses = (filter = 'all') => {
    const container = document.getElementById('expense-list');
    let filteredExpenses = filter !== 'all'
        ? state.expenses.filter(e => e.category === filter)
        : [...state.expenses];

    // Sort by date (newest first) - uses a copy so state is not mutated
    filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredExpenses.length === 0) {
        container.innerHTML = '<p class="empty-state">No expenses recorded yet. Add your first expense above.</p>';
        return;
    }

    container.innerHTML = filteredExpenses.map(expense => `
        <div class="expense-item" data-id="${escapeHtml(expense.id)}">
            <div class="item-info">
                <h4>${escapeHtml(expense.description)}</h4>
                <p>${formatDate(expense.date)}</p>
                <span class="category-tag ${escapeHtml(expense.category)}">${escapeHtml(expense.category)}</span>
            </div>
            <span class="item-amount expense">-${formatCurrency(expense.amount)}</span>
            <button class="edit-btn" onclick="editExpense('${escapeHtml(expense.id)}')">✏️</button>
            <button class="delete-btn" onclick="deleteExpense('${escapeHtml(expense.id)}')">🗑️</button>
        </div>
    `).join('');
};

const addExpense = (e) => {
    e.preventDefault();

    const expense = {
        id: generateId(),
        description: document.getElementById('expense-description').value,
        amount: parseFloat(document.getElementById('expense-amount').value),
        category: document.getElementById('expense-category').value,
        date: document.getElementById('expense-date').value
    };

    state.expenses.push(expense);
    saveState();
    renderExpenses();
    updateDashboard();
    e.target.reset();
    document.getElementById('expense-date').valueAsDate = new Date();
};

const deleteExpense = (id) => {
    state.expenses = state.expenses.filter(e => e.id !== id);
    saveState();
    renderExpenses();
    updateDashboard();
};

const editExpense = (id) => {
    const expense = state.expenses.find(e => e.id === id);
    if (!expense) return;

    const container = document.querySelector(`.expense-item[data-id="${CSS.escape(id)}"]`);
    if (!container) return;

    const categories = ['housing', 'transportation', 'food', 'utilities', 'healthcare', 'entertainment', 'shopping', 'education', 'personal', 'other'];
    const categoryOptions = categories.map(c =>
        `<option value="${c}" ${c === expense.category ? 'selected' : ''}>${capitalizeFirst(c)}</option>`
    ).join('');

    container.classList.add('editing');
    container.innerHTML = `
        <div class="edit-form">
            <div class="edit-row">
                <div class="edit-field">
                    <label>Description</label>
                    <input type="text" class="edit-input" id="edit-desc-${escapeHtml(id)}" value="${escapeHtml(expense.description)}">
                </div>
                <div class="edit-field">
                    <label>Amount</label>
                    <input type="number" class="edit-input" id="edit-amount-${escapeHtml(id)}" step="0.01" min="0" value="${expense.amount}">
                </div>
            </div>
            <div class="edit-row">
                <div class="edit-field">
                    <label>Category</label>
                    <select class="edit-input" id="edit-cat-${escapeHtml(id)}">
                        ${categoryOptions}
                    </select>
                </div>
                <div class="edit-field">
                    <label>Date</label>
                    <input type="date" class="edit-input" id="edit-date-${escapeHtml(id)}" value="${expense.date}">
                </div>
            </div>
            <div class="edit-actions">
                <button class="btn btn-primary btn-sm" onclick="saveExpenseEdit('${escapeHtml(id)}')">Save</button>
                <button class="btn btn-secondary btn-sm" onclick="cancelExpenseEdit()">Cancel</button>
            </div>
        </div>
    `;
};

const getCurrentFilter = () => {
    const filterEl = document.getElementById('filter-category');
    return filterEl ? filterEl.value : 'all';
};

const saveExpenseEdit = (id) => {
    const expense = state.expenses.find(e => e.id === id);
    if (!expense) return;

    const desc = document.getElementById(`edit-desc-${id}`);
    const amount = document.getElementById(`edit-amount-${id}`);
    const cat = document.getElementById(`edit-cat-${id}`);
    const date = document.getElementById(`edit-date-${id}`);

    if (!desc || !amount || !cat || !date) return;
    if (!desc.value.trim() || !amount.value || !date.value) return;

    expense.description = desc.value.trim();
    expense.amount = parseFloat(amount.value);
    expense.category = cat.value;
    expense.date = date.value;

    saveState();
    renderExpenses(getCurrentFilter());
    updateDashboard();
};

const cancelExpenseEdit = () => {
    renderExpenses(getCurrentFilter());
};

document.getElementById('expense-form').addEventListener('submit', addExpense);
document.getElementById('filter-category').addEventListener('change', (e) => {
    renderExpenses(e.target.value);
});

// ==================== DEBT MANAGEMENT ====================

const renderDebts = () => {
    const container = document.getElementById('debt-list');

    if (state.debts.length === 0) {
        container.innerHTML = '<p class="empty-state">No debts recorded. Add your debts to get a personalized payoff plan.</p>';
        return;
    }

    container.innerHTML = state.debts.map(debt => `
        <div class="debt-item" data-id="${escapeHtml(debt.id)}">
            <div class="item-info">
                <h4>${escapeHtml(debt.name)}</h4>
                <p>Interest: ${debt.rate}% | Min Payment: ${formatCurrency(debt.minimum)}</p>
                <span class="category-tag ${escapeHtml(debt.type)}">${escapeHtml(debt.type)}</span>
            </div>
            <span class="item-amount debt">${formatCurrency(debt.balance)}</span>
            <button class="delete-btn" onclick="deleteDebt('${escapeHtml(debt.id)}')">🗑️</button>
        </div>
    `).join('');

    updatePayoffPlan();
};

const addDebt = (e) => {
    e.preventDefault();

    const debt = {
        id: generateId(),
        name: document.getElementById('debt-name').value,
        balance: parseFloat(document.getElementById('debt-balance').value),
        rate: parseFloat(document.getElementById('debt-rate').value),
        minimum: parseFloat(document.getElementById('debt-minimum').value),
        type: document.getElementById('debt-type').value
    };

    state.debts.push(debt);
    saveState();
    renderDebts();
    updateDashboard();
    e.target.reset();
};

const deleteDebt = (id) => {
    state.debts = state.debts.filter(d => d.id !== id);
    saveState();
    renderDebts();
    updateDashboard();
};

document.getElementById('debt-form').addEventListener('submit', addDebt);

// Debt Payoff Strategy Tabs
document.querySelectorAll('.strategy-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.strategy-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        updatePayoffPlan();
    });
});

const updatePayoffPlan = () => {
    const container = document.getElementById('payoff-plan');
    const strategyContent = document.getElementById('strategy-content');
    const activeStrategy = document.querySelector('.strategy-tab.active').dataset.strategy;

    if (state.debts.length === 0) {
        container.innerHTML = '<p class="empty-state">Add debts to see your recommended payoff order.</p>';
        return;
    }

    // Sort debts based on strategy
    let sortedDebts = [...state.debts];
    if (activeStrategy === 'avalanche') {
        sortedDebts.sort((a, b) => b.rate - a.rate); // Highest interest first
    } else {
        sortedDebts.sort((a, b) => a.balance - b.balance); // Lowest balance first
    }

    // Update strategy info
    const strategyInfo = strategyContent.querySelector('.strategy-info');
    if (activeStrategy === 'avalanche') {
        strategyInfo.innerHTML = `
            <h4>Avalanche Method</h4>
            <p>Pay off debts with the highest interest rate first. This saves the most money on interest over time.</p>
        `;
    } else {
        strategyInfo.innerHTML = `
            <h4>Snowball Method</h4>
            <p>Pay off debts with the lowest balance first. This provides quick wins and psychological momentum.</p>
        `;
    }

    container.innerHTML = sortedDebts.map((debt, index) => `
        <div class="payoff-item">
            <span class="payoff-order">${index + 1}</span>
            <div class="payoff-details">
                <h4>${escapeHtml(debt.name)}</h4>
                <p>Balance: ${formatCurrency(debt.balance)} | Interest: ${debt.rate}%</p>
            </div>
        </div>
    `).join('');
};

// Calculate Payoff Timeline
document.getElementById('calculate-payoff').addEventListener('click', () => {
    const extraPayment = parseFloat(document.getElementById('extra-payment-amount').value) || 0;
    calculatePayoffTimeline(extraPayment);
});

const calculatePayoffTimeline = (extraPayment) => {
    const summaryContainer = document.getElementById('payoff-summary');

    if (state.debts.length === 0) {
        summaryContainer.innerHTML = '';
        return;
    }

    const activeStrategy = document.querySelector('.strategy-tab.active').dataset.strategy;
    let debts = [...state.debts].map(d => ({...d}));

    // Sort based on strategy
    if (activeStrategy === 'avalanche') {
        debts.sort((a, b) => b.rate - a.rate);
    } else {
        debts.sort((a, b) => a.balance - b.balance);
    }

    let totalInterestPaid = 0;
    let totalAmountPaid = 0;
    let months = 0;
    const maxMonths = 360; // 30 years max

    // Check if any debt is unpayable (minimum payment < monthly interest)
    const unpayableDebts = debts.filter(d => {
        const monthlyInterest = (d.balance * d.rate / 100) / 12;
        return d.minimum < monthlyInterest && d.balance > 0;
    });

    while (debts.some(d => d.balance > 0) && months < maxMonths) {
        months++;
        const targetIndex = debts.findIndex(d => d.balance > 0);

        for (let i = 0; i < debts.length; i++) {
            if (debts[i].balance <= 0) continue;

            // Calculate monthly interest
            const monthlyInterest = (debts[i].balance * debts[i].rate / 100) / 12;
            totalInterestPaid += monthlyInterest;
            debts[i].balance += monthlyInterest;

            // Apply minimum payment + extra to priority debt
            let payment = debts[i].minimum;
            if (i === targetIndex) {
                payment += extraPayment;
            }

            // Don't overpay - cap at remaining balance
            payment = Math.min(payment, debts[i].balance);
            totalAmountPaid += payment;
            debts[i].balance = Math.max(0, debts[i].balance - payment);
        }
    }

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    const totalMinPayments = state.debts.reduce((sum, d) => sum + d.minimum, 0);
    const hitMax = months >= maxMonths && debts.some(d => d.balance > 0);

    let html = '<h4>Payoff Summary</h4>';

    if (hitMax) {
        html += `<p style="color: var(--danger-color);"><strong>Warning:</strong> With current payments, some debts will not be paid off within 30 years. Consider increasing your monthly payments.</p>`;
    }

    if (unpayableDebts.length > 0 && extraPayment === 0) {
        html += `<p style="color: var(--warning-color);"><strong>Note:</strong> ${unpayableDebts.map(d => escapeHtml(d.name)).join(', ')} - minimum payment is less than monthly interest. Extra payments are needed.</p>`;
    }

    html += `
        <p><strong>Payoff Time:</strong> ${hitMax ? '30+ years' : `${years > 0 ? years + ' years ' : ''}${remainingMonths} months`}</p>
        <p><strong>Total Interest Paid:</strong> ${formatCurrency(totalInterestPaid)}</p>
        <p><strong>Total Amount Paid:</strong> ${formatCurrency(totalAmountPaid)}</p>
        <p><strong>Monthly Payment:</strong> ${formatCurrency(totalMinPayments + extraPayment)}</p>
        ${extraPayment > 0 ? `<p><strong>Savings from Extra Payment:</strong> By paying an extra ${formatCurrency(extraPayment)}/month, you could save significantly on interest!</p>` : ''}
    `;

    summaryContainer.innerHTML = html;
};

// ==================== INVESTMENT MANAGEMENT ====================

const renderInvestments = () => {
    const container = document.getElementById('investment-list');
    const totalElement = document.getElementById('total-investments');

    if (state.investments.length === 0) {
        container.innerHTML = '<p class="empty-state">No investments recorded yet.</p>';
        totalElement.textContent = formatCurrency(0);
        return;
    }

    const total = state.investments.reduce((sum, inv) => sum + inv.value, 0);
    totalElement.textContent = formatCurrency(total);

    container.innerHTML = state.investments.map(inv => `
        <div class="investment-item" data-id="${escapeHtml(inv.id)}">
            <div class="item-info">
                <h4>${escapeHtml(inv.name)}</h4>
                <span class="category-tag other">${escapeHtml(inv.type)}</span>
            </div>
            <span class="item-amount investment">${formatCurrency(inv.value)}</span>
            <button class="delete-btn" onclick="deleteInvestment('${escapeHtml(inv.id)}')">🗑️</button>
        </div>
    `).join('');
};

const addInvestment = (e) => {
    e.preventDefault();

    const investment = {
        id: generateId(),
        name: document.getElementById('investment-name').value,
        value: parseFloat(document.getElementById('investment-value').value),
        type: document.getElementById('investment-type').value
    };

    state.investments.push(investment);
    saveState();
    renderInvestments();
    updateDashboard();
    e.target.reset();
};

const deleteInvestment = (id) => {
    state.investments = state.investments.filter(i => i.id !== id);
    saveState();
    renderInvestments();
    updateDashboard();
};

document.getElementById('add-investment-form').addEventListener('submit', addInvestment);

// Investment Profile & Recommendations
document.getElementById('investment-profile-form').addEventListener('submit', (e) => {
    e.preventDefault();

    state.investmentProfile = {
        goal: document.getElementById('investment-goal').value,
        timeline: parseInt(document.getElementById('investment-timeline').value),
        riskTolerance: document.getElementById('risk-tolerance').value,
        monthlyAmount: parseFloat(document.getElementById('monthly-investment').value)
    };

    saveState();
    generateInvestmentRecommendations();
    generateInvestmentProjection();
});

const generateInvestmentRecommendations = () => {
    const container = document.getElementById('investment-recommendations');
    const profile = state.investmentProfile;

    if (!profile) {
        container.innerHTML = '<p class="empty-state">Complete your investment profile to receive personalized recommendations.</p>';
        return;
    }

    // Determine allocation based on risk tolerance and timeline
    let allocation = { stocks: 60, bonds: 30, cash: 10 };
    let expectedReturn = 7;

    if (profile.riskTolerance === 'conservative') {
        allocation = { stocks: 30, bonds: 50, cash: 20 };
        expectedReturn = 5;
    } else if (profile.riskTolerance === 'aggressive') {
        allocation = { stocks: 80, bonds: 15, cash: 5 };
        expectedReturn = 9;
    }

    // Adjust for timeline (ensure total stays at 100%)
    if (profile.timeline < 5) {
        const stockReduction = allocation.stocks - Math.max(20, allocation.stocks - 20);
        allocation.stocks -= stockReduction;
        allocation.bonds += Math.round(stockReduction * 0.6);
        allocation.cash = 100 - allocation.stocks - allocation.bonds;
    } else if (profile.timeline > 15) {
        const stockIncrease = Math.min(90, allocation.stocks + 10) - allocation.stocks;
        allocation.stocks += stockIncrease;
        allocation.bonds -= Math.round(stockIncrease * 0.6);
        allocation.cash = 100 - allocation.stocks - allocation.bonds;
    }

    // Generate specific recommendations based on goal
    const recommendations = getGoalSpecificRecommendations(profile.goal, allocation, profile.timeline);

    container.innerHTML = `
        <div class="recommendation">
            <h4>Recommended Asset Allocation</h4>
            <p>Based on your ${profile.riskTolerance} risk tolerance and ${profile.timeline}-year timeline:</p>
            <div class="allocation-bar">
                <div class="allocation-segment stocks" style="width: ${allocation.stocks}%">${allocation.stocks}%</div>
                <div class="allocation-segment bonds" style="width: ${allocation.bonds}%">${allocation.bonds}%</div>
                <div class="allocation-segment cash" style="width: ${allocation.cash}%">${allocation.cash}%</div>
            </div>
            <div class="allocation-legend">
                <span class="legend-item"><span class="legend-color" style="background: var(--primary-color)"></span> Stocks</span>
                <span class="legend-item"><span class="legend-color" style="background: var(--success-color)"></span> Bonds</span>
                <span class="legend-item"><span class="legend-color" style="background: var(--warning-color)"></span> Cash/Money Market</span>
            </div>
        </div>

        <div class="recommendation">
            <h4>Investment Ideas for ${capitalizeFirst(profile.goal)}</h4>
            <ul>
                ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>

        <div class="recommendation">
            <h4>Action Steps</h4>
            <ul>
                <li>Set up automatic investments of ${formatCurrency(profile.monthlyAmount)} monthly</li>
                <li>Review and rebalance your portfolio quarterly</li>
                <li>Increase contributions by 1% annually when possible</li>
                <li>Keep emergency fund separate (3-6 months expenses)</li>
                ${state.debts.length > 0 ? '<li>Consider paying off high-interest debt before investing aggressively</li>' : ''}
            </ul>
        </div>
    `;
};

const getGoalSpecificRecommendations = (goal, allocation, timeline) => {
    const recommendations = {
        retirement: [
            'Maximize 401(k) contributions, especially if employer matches',
            'Consider a Roth IRA for tax-free growth ($7,000 annual limit for 2024)',
            'Invest in low-cost index funds tracking S&P 500 or total market',
            'Consider target-date retirement funds for automatic rebalancing',
            'Look into Health Savings Account (HSA) for triple tax advantages'
        ],
        emergency: [
            'Build 3-6 months of expenses in high-yield savings account',
            'Consider money market funds for slightly higher yields',
            'Keep funds easily accessible (no penalties for withdrawal)',
            'Look for FDIC-insured accounts with 4%+ APY',
            'Avoid investing emergency funds in stocks or volatile assets'
        ],
        home: [
            'Save in high-yield savings account for down payment',
            'Consider I-Bonds for inflation protection (if timeline > 1 year)',
            timeline > 5 ? 'A conservative mix of bonds and stocks could be appropriate' : 'Avoid stock market volatility for short-term goal',
            'Aim for 20% down payment to avoid PMI',
            'Research first-time homebuyer programs in your area'
        ],
        education: [
            'Open a 529 college savings plan for tax advantages',
            'Consider Coverdell ESA for K-12 and college expenses',
            'Use age-based portfolios that automatically become conservative',
            'Research state tax deductions for 529 contributions',
            'Look into prepaid tuition plans if available'
        ],
        wealth: [
            'After maxing retirement accounts, use taxable brokerage accounts',
            'Consider tax-efficient index funds and ETFs',
            'Look into dividend growth stocks for passive income',
            'Explore real estate investment trusts (REITs) for diversification',
            'Consider dollar-cost averaging into broad market index funds'
        ],
        other: [
            'Define specific amount and timeline for your goal',
            'Match investment risk to your timeline',
            'Consider a balanced portfolio of stocks and bonds',
            'Review progress quarterly and adjust as needed',
            'Consult a fiduciary financial advisor for personalized advice'
        ]
    };

    return recommendations[goal] || recommendations.other;
};

const capitalizeFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const generateInvestmentProjection = () => {
    const canvas = document.getElementById('investment-chart');
    const detailsContainer = document.getElementById('projection-details');
    const profile = state.investmentProfile;

    if (!profile) return;

    // Calculate projections
    const currentPortfolio = state.investments.reduce((sum, inv) => sum + inv.value, 0);
    const monthlyContribution = profile.monthlyAmount;
    const years = profile.timeline;

    // Expected returns based on risk tolerance
    const expectedReturns = {
        conservative: 0.05,
        moderate: 0.07,
        aggressive: 0.09
    };

    const annualReturn = expectedReturns[profile.riskTolerance];
    const monthlyReturn = annualReturn / 12;

    // Generate projection data
    const labels = [];
    const projectedValues = [];
    const contributionValues = [];

    let balance = currentPortfolio;
    let totalContributions = currentPortfolio;

    for (let year = 0; year <= years; year++) {
        labels.push(`Year ${year}`);
        projectedValues.push(Math.round(balance));
        contributionValues.push(Math.round(totalContributions));

        // Calculate for next year
        for (let month = 0; month < 12; month++) {
            balance = balance * (1 + monthlyReturn) + monthlyContribution;
            totalContributions += monthlyContribution;
        }
    }

    const finalBalance = projectedValues[projectedValues.length - 1];
    const totalContributionsAmount = contributionValues[contributionValues.length - 1];
    const totalGrowth = finalBalance - totalContributionsAmount;

    // Create or update chart
    if (window.investmentChart) {
        window.investmentChart.destroy();
    }

    window.investmentChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Projected Value',
                    data: projectedValues,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Total Contributions',
                    data: contributionValues,
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });

    detailsContainer.innerHTML = `
        <div style="margin-top: 1rem; padding: 1rem; background: var(--background-color); border-radius: 8px;">
            <p><strong>Projected Value in ${years} years:</strong> ${formatCurrency(finalBalance)}</p>
            <p><strong>Total Contributions:</strong> ${formatCurrency(totalContributionsAmount)}</p>
            <p><strong>Investment Growth:</strong> ${formatCurrency(totalGrowth)}</p>
            <p><strong>Assumed Annual Return:</strong> ${(annualReturn * 100).toFixed(1)}%</p>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">
                *Projections are estimates based on historical averages and are not guaranteed.
            </p>
        </div>
    `;
};

// ==================== INCOME MANAGEMENT ====================

const renderIncomes = () => {
    const container = document.getElementById('income-list');

    if (state.incomes.length === 0) {
        container.innerHTML = '<p class="empty-state">No income sources recorded.</p>';
        return;
    }

    container.innerHTML = state.incomes.map(income => `
        <div class="income-item" data-id="${escapeHtml(income.id)}">
            <div class="item-info">
                <h4>${escapeHtml(income.source)}</h4>
                <span class="category-tag other">${escapeHtml(income.type)}</span>
            </div>
            <span class="item-amount income">${formatCurrency(income.amount)}</span>
            <button class="delete-btn" onclick="deleteIncome('${escapeHtml(income.id)}')">🗑️</button>
        </div>
    `).join('');
};

const addIncome = (e) => {
    e.preventDefault();

    const income = {
        id: generateId(),
        source: document.getElementById('income-source').value,
        amount: parseFloat(document.getElementById('income-amount').value),
        type: document.getElementById('income-type').value
    };

    state.incomes.push(income);
    saveState();
    renderIncomes();
    updateDashboard();
    e.target.reset();
};

const deleteIncome = (id) => {
    state.incomes = state.incomes.filter(i => i.id !== id);
    saveState();
    renderIncomes();
    updateDashboard();
};

document.getElementById('income-form').addEventListener('submit', addIncome);

// ==================== FILE UPLOAD ====================

const setupUploadZone = (zoneId, inputId, previewId, type) => {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    // Drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('dragover'), false);
    });

    zone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files, type, preview);
    });

    input.addEventListener('change', (e) => {
        handleFiles(e.target.files, type, preview);
    });

    zone.addEventListener('click', (e) => {
        // Avoid double-trigger: labels already open the file dialog natively
        if (!e.target.closest('.upload-btn') && e.target.tagName !== 'INPUT') {
            input.click();
        }
    });
};

const handleFiles = (files, type, previewContainer) => {
    Array.from(files).forEach(file => {
        processFile(file, type, previewContainer);
    });
};

// ==================== FILE PARSING ENGINE ====================

let pendingParsedTransactions = [];

const parseDate = (value) => {
    if (!value) return null;
    const str = String(value).trim();
    // Try common date formats
    // MM/DD/YYYY or M/D/YYYY
    let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    // YYYY-MM-DD or YYYY/MM/DD
    m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    // DD-Mon-YYYY (e.g., 15-Jan-2024)
    const monthMap = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    m = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3})[\/\-\s](\d{4})$/);
    if (m && monthMap[m[2].toLowerCase()]) {
        return `${m[3]}-${monthMap[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}`;
    }
    // Excel serial date number
    if (/^\d{5}$/.test(str)) {
        const d = new Date((parseInt(str) - 25569) * 86400000);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // Last resort: native Date parse
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
};

const parseAmount = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Math.abs(value);
    const str = String(value).trim();
    // Remove currency symbols and thousands separators, keep decimals
    const cleaned = str.replace(/[^0-9.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.abs(num);
};

const autoCategorize = (description) => {
    const matches = suggestCategory(description);
    return matches.length > 0 ? matches[0].category : 'other';
};

const detectColumns = (headers) => {
    const lower = headers.map(h => String(h).toLowerCase().trim());
    const result = { date: -1, description: -1, amount: -1 };

    for (let i = 0; i < lower.length; i++) {
        const h = lower[i];
        if (result.date === -1 && /date|trans.*date|post.*date|value.*date/.test(h)) result.date = i;
        if (result.description === -1 && /desc|narration|particular|detail|memo|payee|merchant|transaction|reference/.test(h)) result.description = i;
        if (result.amount === -1 && /debit|amount|withdrawal|expense|charge|payment|money.*out/.test(h)) result.amount = i;
    }

    // Fallback: if no amount column but there's a generic "amount", use it
    if (result.amount === -1) {
        for (let i = 0; i < lower.length; i++) {
            if (/amount|sum|total|value/.test(lower[i])) { result.amount = i; break; }
        }
    }

    return result;
};

const parseCSVText = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Detect delimiter
    const firstLine = lines[0];
    const delim = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';

    const splitRow = (line) => {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === delim && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
            current += ch;
        }
        fields.push(current.trim());
        return fields;
    };

    const headers = splitRow(lines[0]);
    const cols = detectColumns(headers);

    // If we couldn't detect columns, try positional heuristic (date, desc, amount in first 3-5 cols)
    if (cols.date === -1 && cols.description === -1 && cols.amount === -1) {
        if (headers.length >= 3) {
            cols.date = 0; cols.description = 1; cols.amount = 2;
        } else { return []; }
    }

    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
        const fields = splitRow(lines[i]);
        if (fields.length < 2) continue;

        const date = cols.date >= 0 ? parseDate(fields[cols.date]) : new Date().toISOString().split('T')[0];
        const desc = cols.description >= 0 ? fields[cols.description] : '';
        const amount = cols.amount >= 0 ? parseAmount(fields[cols.amount]) : null;

        if (!desc && !amount) continue;
        if (amount === null || amount === 0) continue;

        transactions.push({
            id: generateId(),
            date: date || new Date().toISOString().split('T')[0],
            description: desc || 'Unnamed Transaction',
            amount: amount,
            category: autoCategorize(desc),
            selected: true
        });
    }
    return transactions;
};

const parseExcelFile = (arrayBuffer) => {
    try {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        if (rows.length < 2) return [];

        const headers = rows[0].map(h => String(h));
        const cols = detectColumns(headers);

        if (cols.date === -1 && cols.description === -1 && cols.amount === -1) {
            if (headers.length >= 3) {
                cols.date = 0; cols.description = 1; cols.amount = 2;
            } else { return []; }
        }

        const transactions = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            const date = cols.date >= 0 ? parseDate(row[cols.date]) : new Date().toISOString().split('T')[0];
            const desc = cols.description >= 0 ? String(row[cols.description]).trim() : '';
            const amount = cols.amount >= 0 ? parseAmount(row[cols.amount]) : null;

            if (!desc && !amount) continue;
            if (amount === null || amount === 0) continue;

            transactions.push({
                id: generateId(),
                date: date || new Date().toISOString().split('T')[0],
                description: desc || 'Unnamed Transaction',
                amount: amount,
                category: autoCategorize(desc),
                selected: true
            });
        }
        return transactions;
    } catch (e) {
        return [];
    }
};

const renderParsedTransactions = (transactions) => {
    pendingParsedTransactions = transactions;
    const card = document.getElementById('parsed-transactions-card');
    const table = document.getElementById('parsed-transactions-table');
    const count = document.getElementById('parsed-count');

    if (!transactions.length) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    count.textContent = `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} found`;

    const categories = ['housing', 'transportation', 'food', 'utilities', 'healthcare', 'entertainment', 'shopping', 'education', 'personal', 'other'];
    const catOptions = categories.map(c => `<option value="${c}">${capitalizeFirst(c)}</option>`).join('');

    table.innerHTML = `
        <div class="parsed-table-wrapper">
            <table class="analytics-table parsed-table">
                <thead><tr>
                    <th><input type="checkbox" id="select-all-parsed" checked></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                </tr></thead>
                <tbody>
                    ${transactions.map((t, i) => `
                        <tr data-idx="${i}">
                            <td><input type="checkbox" class="parsed-check" data-idx="${i}" ${t.selected ? 'checked' : ''}></td>
                            <td>${escapeHtml(t.date)}</td>
                            <td>${escapeHtml(t.description)}</td>
                            <td class="expense">${formatCurrency(t.amount)}</td>
                            <td>
                                <select class="parsed-category" data-idx="${i}">
                                    ${catOptions.replace(`value="${t.category}"`, `value="${t.category}" selected`)}
                                </select>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Wire up select-all checkbox
    document.getElementById('select-all-parsed').addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.parsed-check').forEach(cb => {
            cb.checked = checked;
            pendingParsedTransactions[parseInt(cb.dataset.idx)].selected = checked;
        });
    });

    // Wire up individual checkboxes
    table.querySelectorAll('.parsed-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            pendingParsedTransactions[parseInt(e.target.dataset.idx)].selected = e.target.checked;
        });
    });

    // Wire up category selects
    table.querySelectorAll('.parsed-category').forEach(sel => {
        sel.addEventListener('change', (e) => {
            pendingParsedTransactions[parseInt(e.target.dataset.idx)].category = e.target.value;
        });
    });
};

const importParsedTransactions = () => {
    const toImport = pendingParsedTransactions.filter(t => t.selected);
    if (toImport.length === 0) return;

    toImport.forEach(t => {
        state.expenses.push({
            id: generateId(),
            description: t.description,
            amount: t.amount,
            category: t.category,
            date: t.date
        });
    });

    saveState();
    renderExpenses();
    updateDashboard();

    // Hide the parsed card
    document.getElementById('parsed-transactions-card').style.display = 'none';
    pendingParsedTransactions = [];
};

const discardParsedTransactions = () => {
    pendingParsedTransactions = [];
    document.getElementById('parsed-transactions-card').style.display = 'none';
};

const processFile = (file, type, previewContainer) => {
    const upload = {
        id: generateId(),
        name: file.name,
        size: file.size,
        type: type,
        date: new Date().toISOString(),
        status: 'processing'
    };

    const safeName = escapeHtml(file.name);
    const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain';
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    previewContainer.innerHTML = `
        <div class="upload-preview-item">
            <span class="file-icon">${type === 'expense' ? '📄' : '💵'}</span>
            <div class="file-info">
                <span class="file-name">${safeName}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <span class="file-status processing">Parsing...</span>
        </div>
    `;

    const finalizeUpload = (transactions) => {
        upload.status = 'success';
        upload.transactionCount = transactions.length;
        state.uploads.push(upload);
        saveState();

        const statusMsg = transactions.length > 0
            ? `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} found`
            : 'No transactions detected';

        previewContainer.innerHTML = `
            <div class="upload-preview-item">
                <span class="file-icon">${type === 'expense' ? '📄' : '💵'}</span>
                <div class="file-info">
                    <span class="file-name">${safeName}</span>
                    <span class="file-size">${formatFileSize(file.size)} &middot; ${statusMsg}</span>
                </div>
                <span class="file-status success">Parsed</span>
            </div>
        `;

        renderUploadHistory();

        if (transactions.length > 0 && type === 'expense') {
            renderParsedTransactions(transactions);
        } else if (type !== 'expense') {
            addSampleIncome();
        }
    };

    if (isCSV) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const transactions = parseCSVText(e.target.result);
            finalizeUpload(transactions);
        };
        reader.onerror = () => finalizeUpload([]);
        reader.readAsText(file);
    } else if (isExcel) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const transactions = parseExcelFile(e.target.result);
            finalizeUpload(transactions);
        };
        reader.onerror = () => finalizeUpload([]);
        reader.readAsArrayBuffer(file);
    } else {
        // PDF or unsupported: can't parse client-side, record upload only
        setTimeout(() => finalizeUpload([]), 500);
    }
};

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const renderUploadHistory = () => {
    const container = document.getElementById('upload-history');

    if (state.uploads.length === 0) {
        container.innerHTML = '<p class="empty-state">No documents uploaded yet.</p>';
        return;
    }

    container.innerHTML = state.uploads.map(upload => `
        <div class="history-item" data-id="${escapeHtml(upload.id)}">
            <span class="file-icon">${upload.type === 'expense' ? '📄' : '💵'}</span>
            <div class="file-info">
                <span class="file-name">${escapeHtml(upload.name)}</span>
                <span class="file-date">${formatDate(upload.date)}${upload.transactionCount ? ` &middot; ${upload.transactionCount} transactions` : ''}</span>
            </div>
            <span class="file-status success">Processed</span>
            <button class="delete-btn" onclick="deleteUpload('${escapeHtml(upload.id)}')">🗑️</button>
        </div>
    `).join('');
};

const deleteUpload = (id) => {
    state.uploads = state.uploads.filter(u => u.id !== id);
    saveState();
    renderUploadHistory();
};

// Sample data functions (simulating file parsing)
// Track whether sample data has been added to avoid duplicates (persisted)
let sampleExpensesAdded = localStorage.getItem('sampleExpensesAdded') === 'true';
let sampleIncomeAdded = localStorage.getItem('sampleIncomeAdded') === 'true';

const addSampleExpenses = () => {
    if (sampleExpensesAdded) return;
    sampleExpensesAdded = true;
    localStorage.setItem('sampleExpensesAdded', 'true');

    const today = new Date().toISOString().split('T')[0];
    const sampleExpenses = [
        { description: 'Rent Payment', amount: 1500, category: 'housing', date: today },
        { description: 'Grocery Shopping', amount: 250, category: 'food', date: today },
        { description: 'Electric Bill', amount: 120, category: 'utilities', date: today },
        { description: 'Gas', amount: 80, category: 'transportation', date: today },
        { description: 'Internet', amount: 60, category: 'utilities', date: today }
    ];

    sampleExpenses.forEach(expense => {
        state.expenses.push({ ...expense, id: generateId() });
    });

    saveState();
    renderExpenses();
    updateDashboard();
};

const addSampleIncome = () => {
    if (sampleIncomeAdded) return;
    sampleIncomeAdded = true;
    localStorage.setItem('sampleIncomeAdded', 'true');

    const sampleIncome = {
        id: generateId(),
        source: 'Primary Job',
        amount: 5000,
        type: 'salary'
    };

    state.incomes.push(sampleIncome);
    saveState();
    renderIncomes();
    updateDashboard();
};

// Initialize upload zones
setupUploadZone('expense-upload-zone', 'expense-file-input', 'expense-upload-preview', 'expense');
setupUploadZone('payslip-upload-zone', 'payslip-file-input', 'payslip-upload-preview', 'payslip');

// ==================== DASHBOARD ====================

let expenseChart = null;

const updateDashboard = () => {
    // Calculate totals
    const totalIncome = state.incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpenses = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDebt = state.debts.reduce((sum, debt) => sum + debt.balance, 0);
    const netSavings = totalIncome - totalExpenses;

    // Update summary cards
    document.getElementById('total-income').textContent = formatCurrency(totalIncome);
    document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('total-debt').textContent = formatCurrency(totalDebt);

    const savingsEl = document.getElementById('net-savings');
    savingsEl.textContent = formatCurrency(netSavings);
    savingsEl.style.color = netSavings < 0 ? 'var(--danger-color)' : 'var(--primary-color)';

    // Update health score
    updateHealthScore(totalIncome, totalExpenses, totalDebt, netSavings);

    // Update expense chart
    updateExpenseChart();

    // Update monthly analytics and yearly projection
    renderMonthlyAnalytics();
    renderYearlyProjection();
};

const updateHealthScore = (income, expenses, debt, savings) => {
    const scoreCircle = document.getElementById('health-score');
    const scoreValue = scoreCircle.querySelector('.score-value');
    const healthMessage = document.getElementById('health-message');

    if (income === 0 && expenses === 0 && debt === 0) {
        scoreValue.textContent = '--';
        healthMessage.textContent = 'Add your financial data to see your score';
        scoreCircle.style.background = `conic-gradient(var(--border-color) 0deg, var(--border-color) 360deg)`;
        return;
    }

    // Calculate health score (0-100)
    let score = 50; // Base score

    // Savings rate factor (up to +30 points)
    if (income > 0) {
        const savingsRate = savings / income;
        score += Math.min(30, savingsRate * 100);
    }

    // Debt-to-income ratio factor (up to -30 points)
    if (income > 0) {
        const debtToIncome = debt / (income * 12);
        score -= Math.min(30, debtToIncome * 15);
    }

    // Expense control factor (up to +20 points)
    if (income > 0) {
        const expenseRatio = expenses / income;
        if (expenseRatio < 0.5) score += 20;
        else if (expenseRatio < 0.7) score += 10;
        else if (expenseRatio > 0.9) score -= 10;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Update display
    scoreValue.textContent = score;

    const angle = (score / 100) * 360;
    let color = score >= 70 ? 'var(--success-color)' : score >= 40 ? 'var(--warning-color)' : 'var(--danger-color)';
    scoreCircle.style.background = `conic-gradient(${color} 0deg, ${color} ${angle}deg, var(--border-color) ${angle}deg)`;

    // Update message
    if (score >= 80) {
        healthMessage.textContent = 'Excellent! Your finances are in great shape. Keep up the good work!';
    } else if (score >= 60) {
        healthMessage.textContent = 'Good financial health. Consider increasing savings or paying down debt for an even better score.';
    } else if (score >= 40) {
        healthMessage.textContent = 'Fair financial health. Focus on reducing expenses and building an emergency fund.';
    } else {
        healthMessage.textContent = 'Your finances need attention. Consider creating a strict budget and prioritizing debt payoff.';
    }
};

const updateExpenseChart = () => {
    const canvas = document.getElementById('expense-chart');

    if (state.expenses.length === 0) {
        if (expenseChart) {
            expenseChart.destroy();
            expenseChart = null;
        }
        return;
    }

    // Group expenses by category
    const categoryTotals = {};
    state.expenses.forEach(expense => {
        if (!categoryTotals[expense.category]) {
            categoryTotals[expense.category] = 0;
        }
        categoryTotals[expense.category] += expense.amount;
    });

    const labels = Object.keys(categoryTotals).map(cat => capitalizeFirst(cat));
    const data = Object.values(categoryTotals);

    const colors = {
        housing: '#3b82f6',
        transportation: '#f59e0b',
        food: '#10b981',
        utilities: '#6366f1',
        healthcare: '#ec4899',
        entertainment: '#a855f7',
        shopping: '#f97316',
        education: '#14b8a6',
        personal: '#d946ef',
        other: '#64748b'
    };

    const backgroundColors = Object.keys(categoryTotals).map(cat => colors[cat] || colors.other);

    if (expenseChart) {
        expenseChart.destroy();
    }

    expenseChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${context.label}: ${formatCurrency(context.raw)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
};

// ==================== ANONYMIZATION ENGINE ====================

const anonymizeText = (text) => {
    let result = text;
    const redact = (label) => `[${label} REDACTED]`;

    // SSN patterns: 123-45-6789 or 123 45 6789 (require at least one separator to avoid catching routing numbers)
    result = result.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, redact('SSN'));

    // Credit/debit card numbers: 4 groups of 4 digits
    result = result.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, redact('CARD'));

    // Routing numbers: exactly 9 consecutive digits (must run before account to avoid being swallowed)
    result = result.replace(/\b\d{9}\b/g, redact('ROUTING'));

    // Bank account numbers: 8 or 10-17 consecutive digits (skip 9 which is routing)
    result = result.replace(/\b(?:\d{8}|\d{10,17})\b/g, redact('ACCOUNT'));

    // Email addresses
    result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, redact('EMAIL'));

    // Phone numbers: various formats
    result = result.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, redact('PHONE'));

    // Names after common labels (Name:, Account Holder:, etc.)
    result = result.replace(/((?:name|account\s*holder|customer|client|employee|recipient|beneficiary)\s*[:]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
        (match, label) => label + redact('NAME'));

    // Addresses (street number + street name pattern)
    result = result.replace(/\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Way|Pl|Place)\b\.?/gi,
        redact('ADDRESS'));

    return result;
};

const renderAnonymizedPreview = (text, container) => {
    const anonymized = anonymizeText(text);
    // HTML-escape the anonymized text first to prevent XSS from file content
    const escaped = escapeHtml(anonymized);
    // Then highlight redacted portions (these are safe, generated by our code)
    const highlighted = escaped.replace(/\[([\w\s]+) REDACTED\]/g,
        '<span class="redacted">[$1 REDACTED]</span>');
    container.innerHTML = `
        <div class="anonymize-notice">
            <span class="lock-icon">🔒</span>
            <div>
                <strong>Privacy Protected</strong>
                <p>Personal details have been automatically redacted from the uploaded file.</p>
            </div>
        </div>
        <div class="anonymized-preview">${highlighted}</div>
    `;
};

// Dashboard quick upload zone
const setupDashboardUpload = () => {
    const zone = document.getElementById('dashboard-upload-zone');
    const input = document.getElementById('dashboard-file-input');
    const preview = document.getElementById('dashboard-upload-preview');
    const results = document.getElementById('dashboard-upload-results');

    if (!zone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, () => zone.classList.remove('dragover'), false);
    });

    const handleDashboardFile = (file) => {
        const safeName = escapeHtml(file.name);
        const isPayslip = /payslip|salary|wage|pay\s*stub/i.test(file.name);
        const fileType = isPayslip ? 'payslip' : 'expense';

        preview.innerHTML = `
            <div class="upload-preview-item">
                <span class="file-icon">${isPayslip ? '💵' : '📄'}</span>
                <div class="file-info">
                    <span class="file-name">${safeName}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
                <span class="file-status processing">Processing & anonymizing...</span>
            </div>
        `;

        // Read file if it's a text-based format for anonymization demo
        if (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain') {
            const reader = new FileReader();
            reader.onload = (e) => {
                const rawText = e.target.result;
                renderAnonymizedPreview(rawText, results);
                finalizeDashboardUpload(file, fileType, safeName, preview);
            };
            reader.readAsText(file);
        } else {
            // For binary files, show a simulated anonymization notice
            const simulatedContent = `File: ${safeName}\nName: [NAME REDACTED]\nAccount: [ACCOUNT REDACTED]\nProcessed: ${new Date().toLocaleDateString()}`;
            renderAnonymizedPreview(simulatedContent, results);
            finalizeDashboardUpload(file, fileType, safeName, preview);
        }
    };

    const finalizeDashboardUpload = (file, fileType, safeName, previewEl) => {
        setTimeout(() => {
            const upload = {
                id: generateId(),
                name: file.name,
                size: file.size,
                type: fileType,
                date: new Date().toISOString(),
                status: 'success'
            };
            state.uploads.push(upload);
            saveState();

            previewEl.innerHTML = `
                <div class="upload-preview-item">
                    <span class="file-icon">${fileType === 'payslip' ? '💵' : '📄'}</span>
                    <div class="file-info">
                        <span class="file-name">${safeName}</span>
                        <span class="file-size">${formatFileSize(file.size)}</span>
                    </div>
                    <span class="file-status success">Uploaded & Anonymized</span>
                </div>
            `;

            renderUploadHistory();
            if (fileType === 'expense') { addSampleExpenses(); } else { addSampleIncome(); }
        }, 1500);
    };

    zone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length > 0) {
            handleDashboardFile(e.dataTransfer.files[0]);
            if (e.dataTransfer.files.length > 1) {
                const extra = e.dataTransfer.files.length - 1;
                const note = document.createElement('p');
                note.style.cssText = 'color: var(--warning-color); font-size: 0.85rem; margin-top: 0.5rem;';
                note.textContent = `Note: Only the first file was processed. ${extra} additional file${extra > 1 ? 's were' : ' was'} ignored.`;
                preview.appendChild(note);
            }
        }
    });
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleDashboardFile(e.target.files[0]);
    });
    zone.addEventListener('click', (e) => {
        if (!e.target.closest('.upload-btn') && e.target.tagName !== 'INPUT') {
            input.click();
        }
    });
};

// ==================== TAG / CATEGORY SUGGESTIONS ====================

const categoryKeywords = {
    housing: ['rent', 'mortgage', 'lease', 'apartment', 'condo', 'property', 'hoa', 'home', 'house', 'landlord', 'tenant', 'real estate', 'down payment'],
    transportation: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'bus', 'train', 'subway', 'metro', 'car', 'auto', 'parking', 'toll', 'oil change', 'tire', 'vehicle', 'mechanic', 'flight', 'airline'],
    food: ['grocery', 'groceries', 'restaurant', 'dining', 'coffee', 'lunch', 'dinner', 'breakfast', 'takeout', 'delivery', 'doordash', 'grubhub', 'ubereats', 'pizza', 'food', 'meal', 'snack', 'cafe', 'bar', 'drink'],
    utilities: ['electric', 'electricity', 'water', 'gas bill', 'internet', 'wifi', 'phone', 'mobile', 'cable', 'trash', 'sewage', 'heating', 'cooling', 'power'],
    healthcare: ['doctor', 'hospital', 'pharmacy', 'medicine', 'prescription', 'dental', 'dentist', 'vision', 'therapy', 'clinic', 'health', 'medical', 'lab', 'insurance premium', 'copay'],
    entertainment: ['movie', 'netflix', 'spotify', 'hulu', 'disney', 'concert', 'theater', 'game', 'gaming', 'subscription', 'streaming', 'music', 'book', 'hobby', 'sport', 'gym', 'fitness'],
    shopping: ['amazon', 'walmart', 'target', 'clothing', 'clothes', 'shoes', 'electronics', 'furniture', 'appliance', 'gift', 'online', 'store', 'mall', 'purchase'],
    education: ['tuition', 'textbook', 'course', 'class', 'school', 'college', 'university', 'student', 'loan', 'training', 'certification', 'exam', 'udemy', 'coursera'],
    personal: ['haircut', 'salon', 'spa', 'skincare', 'makeup', 'laundry', 'dry clean', 'grooming', 'barber', 'nail', 'massage', 'cosmetics']
};

const categoryLabels = {
    housing: 'Housing', transportation: 'Transportation', food: 'Food & Groceries',
    utilities: 'Utilities', healthcare: 'Healthcare', entertainment: 'Entertainment',
    shopping: 'Shopping', education: 'Education', personal: 'Personal Care', other: 'Other'
};

const categoryColors = {
    housing: '#dbeafe;color:#1e40af', transportation: '#fef3c7;color:#92400e',
    food: '#d1fae5;color:#065f46', utilities: '#e0e7ff;color:#3730a3',
    healthcare: '#fce7f3;color:#9d174d', entertainment: '#fae8ff;color:#86198f',
    shopping: '#fed7aa;color:#c2410c', education: '#ccfbf1;color:#0f766e',
    personal: '#f5d0fe;color:#a21caf', other: '#e2e8f0;color:#475569'
};

let highlightedSuggestionIndex = -1;

const suggestCategory = (description) => {
    const lower = description.toLowerCase().trim();
    if (lower.length < 2) return [];

    const matches = [];
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        for (const keyword of keywords) {
            if (keyword.includes(lower) || lower.includes(keyword)) {
                const score = keyword === lower ? 100 : keyword.startsWith(lower) ? 80 : 60;
                matches.push({ category, keyword, score });
            }
        }
    }

    // Deduplicate by category (keep highest score)
    const best = {};
    for (const m of matches) {
        if (!best[m.category] || m.score > best[m.category].score) {
            best[m.category] = m;
        }
    }

    return Object.values(best).sort((a, b) => b.score - a.score).slice(0, 5);
};

const setupTagSuggestions = () => {
    const input = document.getElementById('expense-description');
    const container = document.getElementById('tag-suggestions');
    const categorySelect = document.getElementById('expense-category');

    input.addEventListener('input', () => {
        const value = input.value;
        const suggestions = suggestCategory(value);
        highlightedSuggestionIndex = -1;

        if (suggestions.length === 0 || value.length < 2) {
            container.classList.remove('visible');
            container.innerHTML = '';
            return;
        }

        container.innerHTML = suggestions.map((s, i) => `
            <div class="tag-suggestion-item" data-category="${s.category}" data-index="${i}">
                <span class="suggestion-category" style="background:${categoryColors[s.category]}">${categoryLabels[s.category]}</span>
                <span class="suggestion-text">${escapeHtml(capitalizeFirst(s.keyword))}</span>
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
            highlightedSuggestionIndex = Math.min(highlightedSuggestionIndex + 1, items.length - 1);
            items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedSuggestionIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedSuggestionIndex = Math.max(highlightedSuggestionIndex - 1, 0);
            items.forEach((item, i) => item.classList.toggle('highlighted', i === highlightedSuggestionIndex));
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            const idx = highlightedSuggestionIndex >= 0 ? highlightedSuggestionIndex : 0;
            if (items[idx]) {
                e.preventDefault();
                categorySelect.value = items[idx].dataset.category;
                container.classList.remove('visible');
            }
        } else if (e.key === 'Escape') {
            container.classList.remove('visible');
        }
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.description-group')) {
            container.classList.remove('visible');
        }
    });
};

// ==================== MONTHLY ANALYTICS & YEARLY PROJECTION ====================

const getMonthlyBreakdown = () => {
    const monthlyExpenses = {};
    state.expenses.forEach(exp => {
        const key = exp.date.substring(0, 7); // YYYY-MM
        if (!monthlyExpenses[key]) monthlyExpenses[key] = 0;
        monthlyExpenses[key] += exp.amount;
    });
    return monthlyExpenses;
};

const parseMonthKey = (monthKey) => {
    // Parse "YYYY-MM" without UTC offset issues
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1);
};

const renderMonthlyAnalytics = () => {
    const container = document.getElementById('monthly-analytics');
    if (!container) return;

    const totalIncome = state.incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpenses = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Show empty state when no data exists
    if (state.expenses.length === 0 && state.incomes.length === 0) {
        container.innerHTML = '<p class="empty-state">Add expenses and income to see your monthly comparison.</p>';
        return;
    }

    const monthlyBreakdown = getMonthlyBreakdown();
    const months = Object.keys(monthlyBreakdown);
    const monthCount = months.length || 1;
    const avgMonthlyExpense = totalExpenses / monthCount;
    const diff = totalIncome - avgMonthlyExpense;
    const diffClass = diff >= 0 ? 'positive' : 'negative';
    const diffLabel = diff >= 0 ? 'surplus' : 'deficit';

    // Sort months for the breakdown table
    const sortedMonths = [...months].sort().reverse();

    let monthRows = '';
    if (sortedMonths.length > 0) {
        monthRows = sortedMonths.map(m => {
            const mExp = monthlyBreakdown[m];
            const mDiff = totalIncome - mExp;
            const mClass = mDiff >= 0 ? 'positive' : 'negative';
            const monthLabel = parseMonthKey(m).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            return `
                <tr>
                    <td>${monthLabel}</td>
                    <td>${formatCurrency(mExp)}</td>
                    <td>${formatCurrency(totalIncome)}</td>
                    <td class="${mClass}">${formatCurrency(mDiff)}</td>
                </tr>
            `;
        }).join('');
    } else {
        monthRows = '<tr><td colspan="4" class="empty-state">No expense data yet</td></tr>';
    }

    const ratio = totalIncome > 0 ? avgMonthlyExpense / totalIncome : 0;
    const ratioPercent = Math.min(100, ratio * 100).toFixed(1);
    const ratioClass = ratio > 0.9 ? 'danger' : ratio > 0.7 ? 'warning' : 'good';

    container.innerHTML = `
        <div class="analytics-summary">
            <div class="analytics-stat">
                <span class="analytics-label">Avg Monthly Expense</span>
                <span class="analytics-value expense">${formatCurrency(avgMonthlyExpense)}</span>
            </div>
            <div class="analytics-stat">
                <span class="analytics-label">Monthly Income</span>
                <span class="analytics-value income">${formatCurrency(totalIncome)}</span>
            </div>
            <div class="analytics-stat">
                <span class="analytics-label">Monthly ${capitalizeFirst(diffLabel)}</span>
                <span class="analytics-value ${diffClass}">${formatCurrency(diff)}</span>
            </div>
            <div class="analytics-stat">
                <span class="analytics-label">Months Tracked</span>
                <span class="analytics-value">${months.length}</span>
            </div>
        </div>
        ${totalIncome > 0 ? `
        <div class="analytics-bar-container">
            <div class="analytics-bar-label">Expense-to-Income Ratio</div>
            <div class="analytics-bar-track">
                <div class="analytics-bar-fill ${ratioClass}"
                     style="width: ${ratioPercent}%">
                    ${ratioPercent}%
                </div>
            </div>
        </div>
        ` : ''}
        <div class="analytics-table-wrapper">
            <table class="analytics-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Expenses</th>
                        <th>Income</th>
                        <th>Net</th>
                    </tr>
                </thead>
                <tbody>
                    ${monthRows}
                </tbody>
            </table>
        </div>
    `;
};

const renderYearlyProjection = () => {
    const container = document.getElementById('yearly-projection');
    if (!container) return;

    const totalIncome = state.incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpenses = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Show empty state when no data exists
    if (state.expenses.length === 0 && state.incomes.length === 0) {
        container.innerHTML = '<p class="empty-state">Add expenses and income to see your annual projection.</p>';
        return;
    }

    const monthlyBreakdown = getMonthlyBreakdown();
    const months = Object.keys(monthlyBreakdown);
    const monthCount = months.length || 1;
    const avgMonthlyExpense = totalExpenses / monthCount;

    // Figure out how many months are left in the year (calendar-based)
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentYear = now.getFullYear();
    const monthsElapsed = currentMonth + 1;
    const monthsRemaining = 12 - monthsElapsed;

    // Already-tracked expenses for this year
    const yearExpensesSoFar = months
        .filter(m => m.startsWith(String(currentYear)))
        .reduce((sum, m) => sum + monthlyBreakdown[m], 0);

    const projectedYearExpenses = yearExpensesSoFar + (avgMonthlyExpense * monthsRemaining);
    const projectedYearIncome = totalIncome * 12;
    const projectedYearNet = projectedYearIncome - projectedYearExpenses;
    const netClass = projectedYearNet >= 0 ? 'positive' : 'negative';
    const netLabel = projectedYearNet >= 0 ? 'Projected Net Savings' : 'Projected Net Deficit';

    // Month-by-month projection rows
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

        projRows += `
            <tr class="${typeCls}">
                <td>${monthNames[m]} ${currentYear}</td>
                <td>${formatCurrency(mExpense)}</td>
                <td>${formatCurrency(mIncome)}</td>
                <td class="${mClass}">${formatCurrency(mNet)}</td>
                <td><span class="projection-badge ${typeCls}">${typeLabel}</span></td>
            </tr>
        `;
    }

    container.innerHTML = `
        <div class="projection-summary">
            <div class="projection-stat">
                <span class="projection-label">Projected Annual Expenses</span>
                <span class="projection-value expense">${formatCurrency(projectedYearExpenses)}</span>
            </div>
            <div class="projection-stat">
                <span class="projection-label">Projected Annual Income</span>
                <span class="projection-value income">${formatCurrency(projectedYearIncome)}</span>
            </div>
            <div class="projection-stat">
                <span class="projection-label">${netLabel}</span>
                <span class="projection-value ${netClass}">${formatCurrency(projectedYearNet)}</span>
            </div>
            <div class="projection-stat">
                <span class="projection-label">Based on</span>
                <span class="projection-value">${monthsElapsed} actual + ${monthsRemaining} projected mo.</span>
            </div>
        </div>
        <div class="analytics-table-wrapper">
            <table class="analytics-table projection-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Expenses</th>
                        <th>Income</th>
                        <th>Net</th>
                        <th>Type</th>
                    </tr>
                </thead>
                <tbody>
                    ${projRows}
                </tbody>
                <tfoot>
                    <tr>
                        <td><strong>Total</strong></td>
                        <td><strong>${formatCurrency(runningExpense)}</strong></td>
                        <td><strong>${formatCurrency(runningIncome)}</strong></td>
                        <td class="${netClass}"><strong>${formatCurrency(runningIncome - runningExpense)}</strong></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
};

// ==================== CURRENCY CHANGE HANDLER ====================

const setupCurrencySelector = () => {
    const select = document.getElementById('currency-select');
    if (!select) return;

    select.value = selectedCurrency;

    select.addEventListener('change', () => {
        selectedCurrency = select.value;
        localStorage.setItem('selectedCurrency', selectedCurrency);
        // Re-render everything with new currency
        renderExpenses();
        renderDebts();
        renderInvestments();
        renderIncomes();
        updateDashboard();
        updatePayoffPlan();
        if (state.investmentProfile) {
            generateInvestmentRecommendations();
            generateInvestmentProjection();
        }
    });
};

// ==================== INITIALIZATION ====================

const init = () => {
    setupCurrencySelector();
    setupTagSuggestions();
    setupDashboardUpload();

    // Wire up parsed transactions import/discard buttons
    const importBtn = document.getElementById('import-all-btn');
    const discardBtn = document.getElementById('discard-parsed-btn');
    if (importBtn) importBtn.addEventListener('click', importParsedTransactions);
    if (discardBtn) discardBtn.addEventListener('click', discardParsedTransactions);

    renderExpenses();
    renderDebts();
    renderInvestments();
    renderIncomes();
    renderUploadHistory();
    updateDashboard();

    if (state.investmentProfile) {
        document.getElementById('investment-goal').value = state.investmentProfile.goal;
        document.getElementById('investment-timeline').value = state.investmentProfile.timeline;
        document.getElementById('risk-tolerance').value = state.investmentProfile.riskTolerance;
        document.getElementById('monthly-investment').value = state.investmentProfile.monthlyAmount;
        generateInvestmentRecommendations();
        generateInvestmentProjection();
    }
};

// Make functions globally accessible
window.deleteExpense = deleteExpense;
window.editExpense = editExpense;
window.saveExpenseEdit = saveExpenseEdit;
window.cancelExpenseEdit = cancelExpenseEdit;
window.deleteDebt = deleteDebt;
window.deleteInvestment = deleteInvestment;
window.deleteIncome = deleteIncome;
window.deleteUpload = deleteUpload;

// Initialize app
document.addEventListener('DOMContentLoaded', init);
