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

// Utility functions
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
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

    // Show processing preview
    previewContainer.innerHTML = `
        <div class="upload-preview-item">
            <span class="file-icon">${type === 'expense' ? '📄' : '💵'}</span>
            <div class="file-info">
                <span class="file-name">${safeName}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <span class="file-status processing">Processing...</span>
        </div>
    `;

    // Simulate processing (in real app, this would parse the file)
    setTimeout(() => {
        upload.status = 'success';
        state.uploads.push(upload);
        saveState();

        previewContainer.innerHTML = `
            <div class="upload-preview-item">
                <span class="file-icon">${type === 'expense' ? '📄' : '💵'}</span>
                <div class="file-info">
                    <span class="file-name">${safeName}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
                <span class="file-status success">Uploaded</span>
            </div>
        `;

        renderUploadHistory();

        // For demo purposes, add some sample data
        if (type === 'expense') {
            addSampleExpenses();
        } else {
            addSampleIncome();
        }
    }, 1500);
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
        <div class="history-item">
            <span class="file-icon">${upload.type === 'expense' ? '📄' : '💵'}</span>
            <div class="file-info">
                <span class="file-name">${escapeHtml(upload.name)}</span>
                <span class="file-date">${formatDate(upload.date)}</span>
            </div>
            <span class="file-status success">Processed</span>
        </div>
    `).join('');
};

// Sample data functions (simulating file parsing)
// Track whether sample data has been added to avoid duplicates
let sampleExpensesAdded = false;
let sampleIncomeAdded = false;

const addSampleExpenses = () => {
    if (sampleExpensesAdded) return;
    sampleExpensesAdded = true;

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
    document.getElementById('net-savings').textContent = formatCurrency(netSavings);

    // Update health score
    updateHealthScore(totalIncome, totalExpenses, totalDebt, netSavings);

    // Update expense chart
    updateExpenseChart();
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

// ==================== INITIALIZATION ====================

const init = () => {
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

// Make delete functions globally accessible
window.deleteExpense = deleteExpense;
window.deleteDebt = deleteDebt;
window.deleteInvestment = deleteInvestment;
window.deleteIncome = deleteIncome;

// Initialize app
document.addEventListener('DOMContentLoaded', init);
