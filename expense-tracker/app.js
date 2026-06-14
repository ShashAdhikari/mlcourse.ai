/**
 * WLTH - Wealth Intelligence Dashboard
 * Data-driven: transactions (income/expense) + investments + debts -> net worth.
 * Resilient: works fully even if Three.js / GSAP / Chart.js / SheetJS fail to load.
 */
(function() {
    'use strict';

    const hasGSAP  = () => typeof window.gsap !== 'undefined';
    const hasTHREE = () => typeof window.THREE !== 'undefined';
    const hasChart = () => typeof window.Chart !== 'undefined';
    const hasXLSX  = () => typeof window.XLSX !== 'undefined';

    // ==================== STORE ====================
    const Store = {
        data: {
            transactions: parse('wlth_transactions', []), // {id,description,amount,category,date,type}
            investments:  parse('wlth_investments', []),  // {id,name,value,assetType,date}
            debts:        parse('wlth_debts', []),         // {id,name,balance,rate,minimum,debtType,date}
            currency: localStorage.getItem('wlth_currency') || 'USD',
            theme: localStorage.getItem('wlth_theme') || 'dark'
        },
        save(key) { localStorage.setItem('wlth_' + key, JSON.stringify(this.data[key])); },
        saveAll() { ['transactions','investments','debts'].forEach(k => this.save(k)); },
        add(key, record) { this.data[key].push(record); this.save(key); },
        remove(key, id) { this.data[key] = this.data[key].filter(r => r.id !== id); this.save(key); },
        clear() {
            this.data.transactions = []; this.data.investments = []; this.data.debts = [];
            this.saveAll();
        }
    };

    function parse(key, fallback) {
        try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
        catch (e) { return fallback; }
    }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

    // ==================== CALC ====================
    const Calc = {
        sum(arr, fn) { return arr.reduce((s, x) => s + (fn(x) || 0), 0); },

        totalIncome()  { return this.sum(Store.data.transactions.filter(t => t.type === 'income'),  t => t.amount); },
        totalExpenses(){ return this.sum(Store.data.transactions.filter(t => t.type === 'expense'), t => t.amount); },
        liquidCash()   { return this.totalIncome() - this.totalExpenses(); },
        totalInvestments() { return this.sum(Store.data.investments, i => i.value); },
        totalDebt()    { return this.sum(Store.data.debts, d => d.balance); },
        netWorth()     { return this.liquidCash() + this.totalInvestments() - this.totalDebt(); },

        inMonth(dateStr, y, m) {
            const d = new Date(dateStr);
            return d.getFullYear() === y && d.getMonth() === m;
        },
        monthIncome(y, m) {
            return this.sum(Store.data.transactions.filter(t => t.type === 'income' && this.inMonth(t.date, y, m)), t => t.amount);
        },
        monthExpenses(y, m) {
            return this.sum(Store.data.transactions.filter(t => t.type === 'expense' && this.inMonth(t.date, y, m)), t => t.amount);
        },

        currentMonthIncome()  { const n = new Date(); return this.monthIncome(n.getFullYear(), n.getMonth()); },
        currentMonthExpenses(){ const n = new Date(); return this.monthExpenses(n.getFullYear(), n.getMonth()); },

        savingsRate() {
            const inc = this.currentMonthIncome();
            if (inc <= 0) return 0;
            return Math.round(((inc - this.currentMonthExpenses()) / inc) * 100);
        },

        // Velocity (based on current month so far)
        velocity() {
            const now = new Date();
            const dayOfMonth = now.getDate();
            const inc = this.currentMonthIncome();
            const exp = this.currentMonthExpenses();
            const spendPerDay = exp / dayOfMonth;
            const incomePerDay = inc / dayOfMonth;
            const cash = this.liquidCash();
            const runwayDays = spendPerDay > 0 ? cash / spendPerDay : Infinity;
            return {
                spendPerDay,
                spendPerHour: spendPerDay / 24,
                incomePerDay,
                netPerDay: incomePerDay - spendPerDay,
                savingsRate: this.savingsRate(),
                runwayMonths: runwayDays === Infinity ? Infinity : runwayDays / 30
            };
        },

        allocation() {
            const map = {};
            Store.data.investments.forEach(i => {
                const t = i.assetType || 'other';
                map[t] = (map[t] || 0) + i.value;
            });
            return map;
        },

        topExpenseCategory() {
            const map = {};
            Store.data.transactions.filter(t => t.type === 'expense').forEach(t => {
                map[t.category] = (map[t.category] || 0) + t.amount;
            });
            let top = null, max = 0;
            Object.keys(map).forEach(k => { if (map[k] > max) { max = map[k]; top = k; } });
            return top ? { category: top, amount: max } : null;
        },

        // Build last N month buckets with cumulative assets/liabilities/networth.
        monthlySeries() {
            const all = [
                ...Store.data.transactions.map(t => t.date),
                ...Store.data.investments.map(i => i.date),
                ...Store.data.debts.map(d => d.date)
            ].filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));

            const now = new Date();
            const end = new Date(now.getFullYear(), now.getMonth(), 1);
            let start;
            if (all.length) {
                const earliest = new Date(Math.min(...all));
                start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
            } else {
                start = new Date(end); start.setMonth(start.getMonth() - 5);
            }
            // cap to last 12 months for readability
            const maxStart = new Date(end); maxStart.setMonth(maxStart.getMonth() - 11);
            if (start < maxStart) start = maxStart;

            const labels = [], assets = [], liabilities = [], net = [];
            const cur = new Date(start);
            while (cur <= end) {
                const y = cur.getFullYear(), m = cur.getMonth();
                const monthEnd = new Date(y, m + 1, 0, 23, 59, 59);
                const upTo = (dateStr) => new Date(dateStr) <= monthEnd;

                const inc = this.sum(Store.data.transactions.filter(t => t.type === 'income' && upTo(t.date)), t => t.amount);
                const exp = this.sum(Store.data.transactions.filter(t => t.type === 'expense' && upTo(t.date)), t => t.amount);
                const inv = this.sum(Store.data.investments.filter(i => upTo(i.date)), i => i.value);
                const debt = this.sum(Store.data.debts.filter(d => upTo(d.date)), d => d.balance);

                const cash = inc - exp;
                const a = inv + Math.max(0, cash);
                const l = debt + Math.max(0, -cash);
                labels.push(cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
                assets.push(Math.round(a));
                liabilities.push(Math.round(l));
                net.push(Math.round(a - l));
                cur.setMonth(cur.getMonth() + 1);
            }
            return { labels, assets, liabilities, net };
        },

        monthOverMonthChange() {
            const s = this.monthlySeries();
            const n = s.net.length;
            if (n < 2) return null;
            const prev = s.net[n - 2], curr = s.net[n - 1];
            if (prev === 0) return curr === 0 ? 0 : null; // undefined baseline
            return ((curr - prev) / Math.abs(prev)) * 100;
        }
    };

    // ==================== FORMAT ====================
    const Fmt = {
        symbols: { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' },
        symbol() { return this.symbols[Store.data.currency] || '$'; },
        money(amount) {
            const v = Math.abs(Math.round(amount || 0)).toLocaleString('en-US');
            return (amount < 0 ? '-' : '') + this.symbol() + v;
        },
        moneyPrecise(amount) {
            const v = Math.abs(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return this.symbol() + v;
        },
        pct(n) {
            if (n === Infinity) return '∞';
            const r = Math.round(n * 10) / 10;
            return (r > 0 ? '+' : '') + r + '%';
        },
        date(dateStr) {
            const d = new Date(dateStr);
            if (isNaN(d)) return dateStr;
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
    };

    function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }
    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

    // Apply a staggered entrance animation to a freshly-rendered list's children.
    function staggerIn(container) {
        if (!container || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const kids = container.children;
        const n = Math.min(kids.length, 20); // cap stagger cost on large lists
        container.classList.remove('stagger');
        void container.offsetWidth; // force reflow so the animation re-triggers
        for (let i = 0; i < kids.length; i++) kids[i].style.setProperty('--i', i < n ? i : n);
        container.classList.add('stagger');
    }

    const ASSET_META = {
        stocks:     { label: 'Stocks & ETFs',    color: '#4facfe', icon: '📊' },
        crypto:     { label: 'Cryptocurrency',   color: '#a855f7', icon: '🪙' },
        realestate: { label: 'Real Estate',      color: '#00ff88', icon: '🏠' },
        bonds:      { label: 'Bonds & Fixed',    color: '#00d9ff', icon: '📜' },
        cash:       { label: 'Cash & Savings',   color: '#fbbf24', icon: '💵' },
        other:      { label: 'Other',            color: '#94a3b8', icon: '📦' }
    };
    const DEBT_META = {
        credit:   { label: 'Credit Card',   icon: '💳' },
        mortgage: { label: 'Mortgage',      icon: '🏠' },
        auto:     { label: 'Auto Loan',     icon: '🚗' },
        student:  { label: 'Student Loan',  icon: '🎓' },
        personal: { label: 'Personal Loan', icon: '👤' },
        other:    { label: 'Other',         icon: '📦' }
    };
    const CAT_ICON = {
        housing:'🏠', food:'🍔', transport:'🚗', utilities:'💡', entertainment:'🎬',
        healthcare:'🏥', shopping:'🛍️', salary:'💼', business:'🏢', investment:'📈', other:'📦'
    };

    // ==================== CLASSIFIER (on-device intelligence) ====================
    // Keyword + merchant dictionaries score a free-text label into a category.
    // Multi-word phrases score higher than single tokens; exact merchant hits win.
    const Classifier = {
        // [pattern, weight] — phrases (with spaces) are matched as substrings,
        // single tokens are matched on word boundaries.
        expense: {
            food: [['restaurant',3],['cafe',3],['coffee',3],['starbucks',5],['mcdonald',5],['burger',3],
                ['pizza',3],['grocery',4],['groceries',4],['supermarket',4],['whole foods',5],['trader joe',5],
                ['safeway',5],['kroger',5],['aldi',5],['dining',3],['doordash',5],['uber eats',5],['ubereats',5],
                ['grubhub',5],['deli',3],['bakery',3],['chipotle',5],['subway',4],['kfc',5],['taco',3],['sushi',3],
                ['diner',3],['bistro',3],['brewery',3],['pub',2],['snack',2],['lunch',2],['dinner',2],['breakfast',2],
                ['food',2],['eatery',3],['noodle',3],['ramen',3],['steakhouse',4],['panera',5],['wendys',5],['dunkin',5]],
            transport: [['uber',4],['lyft',5],['taxi',4],['cab',2],['gas station',5],['fuel',4],['shell',4],
                ['chevron',5],['exxon',5],['petrol',4],['parking',4],['toll',4],['transit',4],['metro',3],['mta',5],
                ['bus fare',5],['train',3],['airline',4],['flight',4],['delta air',5],['united air',5],['amtrak',5],
                ['car wash',4],['mechanic',4],['oil change',5],['dmv',4],['rideshare',5],['scooter',2],['bike share',4],
                ['ev charge',5],['charging',3],['airport',3]],
            housing: [['rent',4],['mortgage',5],['lease',3],['landlord',5],['apartment',3],['hoa',5],['property tax',5],
                ['home depot',5],['lowes',5],['ikea',5],['furniture',3],['maintenance',2],['plumber',4],['handyman',4],
                ['renovation',4],['cleaning service',4]],
            utilities: [['electric',4],['electricity',5],['water bill',5],['internet',4],['wifi',4],['comcast',5],
                ['verizon',4],['at&t',4],['t-mobile',5],['phone bill',5],['mobile plan',5],['utility',4],['power bill',5],
                ['sewage',5],['natural gas',5],['broadband',5],['spectrum',5],['xfinity',5],['cell phone',4],['data plan',4]],
            entertainment: [['netflix',5],['spotify',5],['hulu',5],['disney',5],['hbo',5],['movie',3],['cinema',4],
                ['theater',3],['concert',4],['gaming',3],['steam',3],['playstation',5],['xbox',5],['nintendo',5],
                ['youtube',3],['twitch',4],['amusement',4],['theme park',5],['music',2],['apple music',5],['prime video',5],
                ['paramount',4],['peacock',4],['event ticket',5],['festival',3],['bowling',3],['arcade',3]],
            healthcare: [['doctor',4],['hospital',5],['clinic',4],['pharmacy',5],['cvs',4],['walgreens',5],['medical',4],
                ['dental',5],['dentist',5],['vision',2],['optometry',5],['therapy',3],['medicine',4],['prescription',5],
                ['copay',5],['urgent care',5],['health insurance',5],['gym',3],['fitness',3],['wellness',2],['lab test',4]],
            shopping: [['amazon',4],['walmart',4],['target',3],['ebay',5],['etsy',5],['mall',3],['clothing',3],
                ['apparel',4],['nike',5],['adidas',5],['zara',5],['h&m',5],['best buy',5],['apple store',5],['retail',2],
                ['shoes',3],['electronics',3],['costco',3],['department store',5],['boutique',3],['sephora',5],['macys',5]],
            salary: [['salary',5],['payroll',5],['paycheck',5],['wages',5],['direct deposit',5],['employer',4],['stipend',4]],
            business: [['invoice',4],['consulting',5],['freelance',5],['client payment',5],['office supplies',5],
                ['saas',4],['software subscription',5],['business expense',5],['contractor',3],['advertising',3],['hosting',3]]
        },
        investment: {
            crypto: [['bitcoin',6],['btc',6],['ethereum',6],['eth',5],['crypto',5],['coinbase',5],['binance',5],
                ['solana',6],['cardano',6],['dogecoin',6],['ripple',5],['xrp',6],['litecoin',6],['altcoin',5],
                ['usdt',5],['usdc',5],['polkadot',6],['avalanche',5],['blockchain',4],['nft',4],['stablecoin',5],['ada',4],['sol',3]],
            stocks: [['stock',4],['etf',5],['shares',4],['equity',4],['s&p',5],['sp500',5],['nasdaq',5],['index fund',5],
                ['mutual fund',5],['vanguard',5],['fidelity',5],['schwab',5],['robinhood',5],['brokerage',5],['dividend',4],
                ['401k',5],['roth ira',5],['ira',4],['vti',5],['voo',5],['spy',4],['qqq',5],['tesla',4],['apple stock',5],
                ['nvidia',4],['microsoft',3],['amazon stock',5],['growth fund',5],['blue chip',4]],
            realestate: [['real estate',6],['rental',5],['property',4],['condo',5],['reit',6],['land',3],['building',3],
                ['house equity',5],['home equity',5],['duplex',5],['airbnb',4],['investment property',6]],
            bonds: [['bond',5],['treasury',6],['t-bill',6],['fixed income',6],['certificate of deposit',6],['municipal',5],
                ['corporate bond',6],['gilt',5],['savings bond',6],['cd ',4],['yield note',5]],
            cash: [['cash',4],['savings account',6],['checking',5],['money market',6],['hysa',6],['high yield',5],
                ['emergency fund',6],['bank balance',5],['deposit',3],['reserve',3]]
        },

        normalize(s) { return ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' '; },

        score(text, dict) {
            const t = this.normalize(text);
            let best = null, bestScore = 0, total = 0;
            Object.keys(dict).forEach(cat => {
                let s = 0;
                dict[cat].forEach(([pat, w]) => {
                    if (pat.indexOf(' ') >= 0 || /[&]/.test(pat)) { // phrase / special
                        if (t.indexOf(pat) >= 0) s += w;
                    } else { // single token, word-boundary
                        if (t.indexOf(' ' + pat + ' ') >= 0) s += w;
                    }
                });
                total += s;
                if (s > bestScore) { bestScore = s; best = cat; }
            });
            return { category: best, score: bestScore, confidence: total > 0 ? bestScore / total : 0 };
        },

        // Detect an ALL-CAPS ticker (2–5 letters) as a stock hint.
        looksLikeTicker(text) {
            return /(^|\s)[A-Z]{2,5}(\s|$)/.test(String(text || '')) && !/[a-z]{3,}/.test(String(text || ''));
        },

        classifyExpense(description) {
            const r = this.score(description, this.expense);
            // ignore income-only buckets when classifying an expense
            if (r.category === 'salary') return { category: 'other', confidence: 0 };
            return r.score > 0 ? { category: r.category, confidence: r.confidence } : { category: null, confidence: 0 };
        },

        classifyIncome(description) {
            const r = this.score(description, this.expense);
            if (r.category === 'salary' || r.category === 'business') return { category: r.category, confidence: r.confidence };
            return { category: null, confidence: 0 };
        },

        classifyInvestment(name) {
            const r = this.score(name, this.investment);
            if (r.score > 0) return { assetType: r.category, confidence: r.confidence };
            if (this.looksLikeTicker(name)) return { assetType: 'stocks', confidence: 0.5 };
            return { assetType: null, confidence: 0 };
        }
    };

    // ==================== ANIMATED NUMBERS ====================
    const Num = {
        // Tween an element's text to a new value. Stores last numeric in dataset.
        tween(el, to, fmt, dur = 0.7) {
            if (!el) return;
            const target = Number(to) || 0;
            const from = el.dataset.val !== undefined ? Number(el.dataset.val) : target;
            el.dataset.val = target;
            const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!hasGSAP() || reduce || from === target) { el.textContent = fmt(target); return; }
            gsap.killTweensOf(el);
            const o = { v: from };
            gsap.to(o, { v: target, duration: dur, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); } });
        }
    };

    // ==================== TOAST ====================
    const Toast = {
        show(msg, type = 'success') {
            const el = document.createElement('div');
            el.className = 'toast toast-' + type;
            el.textContent = msg;
            document.body.appendChild(el);
            requestAnimationFrame(() => el.classList.add('visible'));
            setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 300); }, 2800);
        }
    };

    // ==================== CONFETTI ====================
    const Confetti = {
        fire(x = 0.5, y = 0.5) {
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const colors = ['#00ff88', '#4facfe', '#a855f7', '#fbbf24', '#ff4757'];
            const container = document.createElement('div');
            container.className = 'confetti-container';
            container.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;`;
            document.body.appendChild(container);
            const count = 80;
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'confetti-piece';
                const color = colors[Math.floor(Math.random() * colors.length)];
                const size = 6 + Math.random() * 8;
                const startX = x * innerWidth + (Math.random() - 0.5) * 60;
                const startY = y * innerHeight;
                const angle = -90 + (Math.random() - 0.5) * 90;
                const velocity = 400 + Math.random() * 400;
                const rotation = Math.random() * 360;
                const rotSpeed = (Math.random() - 0.5) * 720;
                p.style.cssText = `
                    position:absolute;left:${startX}px;top:${startY}px;
                    width:${size}px;height:${size * 0.6}px;
                    background:${color};border-radius:2px;
                    transform:rotate(${rotation}deg);opacity:1;
                `;
                container.appendChild(p);
                if (hasGSAP()) {
                    const rad = angle * Math.PI / 180;
                    const vx = Math.cos(rad) * velocity;
                    const vy = Math.sin(rad) * velocity;
                    gsap.to(p, {
                        x: vx * 0.8,
                        y: vy * 0.8 + 600,
                        rotation: rotation + rotSpeed,
                        opacity: 0,
                        duration: 2 + Math.random(),
                        ease: 'power2.out',
                        delay: i * 0.008
                    });
                }
            }
            setTimeout(() => container.remove(), 4000);
        },
        celebrate(reason) {
            this.fire(0.5, 0.4);
            Background3D.burst();
            Toast.show(reason || '🎉 Milestone reached!');
        }
    };

    // ==================== KEYBOARD SHORTCUTS ====================
    const Keyboard = {
        sections: ['dashboard', 'portfolio', 'debt', 'analytics', 'transactions', 'import'],
        currentIndex: 0,
        init() {
            addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
                if (e.metaKey || e.ctrlKey) return;
                switch (e.key.toLowerCase()) {
                    case 'j': this.navigate(1); break;
                    case 'k': this.navigate(-1); break;
                    case 'n': e.preventDefault(); Modal.open('expense'); break;
                    case 'i': e.preventDefault(); Modal.open('income'); break;
                    case '/': e.preventDefault(); document.getElementById('tx-search')?.focus(); break;
                    case '?': this.showHelp(); break;
                }
            });
        },
        navigate(delta) {
            this.currentIndex = Math.max(0, Math.min(this.sections.length - 1, this.currentIndex + delta));
            const section = document.getElementById(this.sections[this.currentIndex]);
            section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Update nav
            document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + this.sections[this.currentIndex]));
        },
        showHelp() {
            const existing = document.querySelector('.keyboard-help');
            if (existing) { existing.remove(); return; }
            const el = document.createElement('div');
            el.className = 'keyboard-help glass';
            el.innerHTML = `
                <h4>Keyboard Shortcuts</h4>
                <div class="kb-row"><kbd>J</kbd><span>Next section</span></div>
                <div class="kb-row"><kbd>K</kbd><span>Previous section</span></div>
                <div class="kb-row"><kbd>N</kbd><span>New expense</span></div>
                <div class="kb-row"><kbd>I</kbd><span>New income</span></div>
                <div class="kb-row"><kbd>/</kbd><span>Search transactions</span></div>
                <div class="kb-row"><kbd>Esc</kbd><span>Close modal</span></div>
                <button class="kb-close" aria-label="Close">&times;</button>
            `;
            document.body.appendChild(el);
            el.querySelector('.kb-close').addEventListener('click', () => el.remove());
            requestAnimationFrame(() => el.classList.add('visible'));
            setTimeout(() => { if (el.parentNode) el.remove(); }, 8000);
        }
    };

    // ==================== TICKER ====================
    const Ticker = {
        quotes: [
            'Compound interest is the eighth wonder of the world. — Einstein',
            'Do not save what is left after spending; spend what is left after saving. — Buffett',
            'The stock market transfers money from the impatient to the patient.',
            'An investment in knowledge pays the best interest. — Franklin',
            'Wealth is the ability to fully experience life. — Thoreau',
            'Risk comes from not knowing what you are doing. — Buffett',
            'Know what you own, and know why you own it. — Lynch',
            'It is not how much money you make, but how much you keep.',
            'The best time to plant a tree was 20 years ago. The second best is now.',
            'Time in the market beats timing the market.'
        ],
        render() {
            const track = document.getElementById('ticker-track');
            if (!track) return;
            const v = Calc.velocity();
            const metrics = [
                ['NET WORTH', Fmt.money(Calc.netWorth())],
                ['INVESTMENTS', Fmt.money(Calc.totalInvestments())],
                ['DEBT', Fmt.money(Calc.totalDebt())],
                ['SAVINGS RATE', v.savingsRate + '%'],
                ['SPEND/DAY', Fmt.money(v.spendPerDay)]
            ];
            const items = [];
            metrics.forEach(([k, val]) => {
                items.push(`<span class="ticker-item ticker-metric"><span class="tk-key">${k}</span><span class="tk-val">${escapeHtml(val)}</span></span>`);
            });
            this.quotes.forEach(q => {
                items.push(`<span class="ticker-item ticker-quote">${escapeHtml(q)}</span>`);
            });
            // duplicate for seamless loop
            const html = items.join('<span class="ticker-sep">◆</span>');
            track.innerHTML = html + '<span class="ticker-sep">◆</span>' + html + '<span class="ticker-sep">◆</span>';
        }
    };

    // ==================== THREE.JS BG (Mouse-responsive parallax) ====================
    const Background3D = {
        rafId: null,
        mouse: { x: 0, y: 0, tx: 0, ty: 0 },
        init() {
            if (!hasTHREE()) return;
            const canvas = document.getElementById('bg-canvas');
            if (!canvas) return;
            try {
                this.scene = new THREE.Scene();
                this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
                this.camera.position.z = 50;
                this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
                this.renderer.setSize(innerWidth, innerHeight);
                this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
                const geo = new THREE.BufferGeometry();
                const count = 2000, pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
                const pal = [[0,1,0.53],[0.31,0.67,1],[0.66,0.33,0.97]];
                for (let i = 0; i < count * 3; i += 3) {
                    pos[i] = (Math.random()-0.5)*100; pos[i+1] = (Math.random()-0.5)*100; pos[i+2] = (Math.random()-0.5)*100;
                    const c = pal[Math.floor(Math.random()*pal.length)]; col[i]=c[0];col[i+1]=c[1];col[i+2]=c[2];
                }
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
                this.particles = new THREE.Points(geo, new THREE.PointsMaterial({ size:0.5, vertexColors:true, transparent:true, opacity:0.6, sizeAttenuation:true }));
                this.scene.add(this.particles);
                const loop = () => {
                    this.rafId = requestAnimationFrame(loop);
                    // Smooth mouse follow
                    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.05;
                    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.05;
                    // Rotate based on mouse + constant drift
                    this.particles.rotation.x += 0.0002 + this.mouse.y * 0.0001;
                    this.particles.rotation.y += 0.0003 + this.mouse.x * 0.0001;
                    // Subtle camera shift for parallax depth
                    this.camera.position.x = this.mouse.x * 2;
                    this.camera.position.y = this.mouse.y * 2;
                    this.camera.lookAt(0, 0, 0);
                    this.renderer.render(this.scene, this.camera);
                };
                loop();
                addEventListener('mousemove', (e) => {
                    this.mouse.tx = (e.clientX / innerWidth - 0.5) * 10;
                    this.mouse.ty = (e.clientY / innerHeight - 0.5) * 10;
                });
                addEventListener('resize', () => {
                    if (!this.renderer) return;
                    this.camera.aspect = innerWidth/innerHeight; this.camera.updateProjectionMatrix();
                    this.renderer.setSize(innerWidth, innerHeight);
                });
            } catch (e) {
                if (this.rafId) cancelAnimationFrame(this.rafId);
                if (canvas) canvas.style.display = 'none';
            }
        },
        // Burst effect for celebrations
        burst() {
            if (!this.particles) return;
            const pos = this.particles.geometry.attributes.position.array;
            const orig = pos.slice();
            // Explode outward
            for (let i = 0; i < pos.length; i += 3) {
                pos[i] *= 1.5; pos[i+1] *= 1.5; pos[i+2] *= 1.5;
            }
            this.particles.geometry.attributes.position.needsUpdate = true;
            // Animate back
            if (hasGSAP()) {
                gsap.to({}, { duration: 1.5, onUpdate: function() {
                    const p = this.progress();
                    const ease = 1 - Math.pow(1 - p, 3);
                    for (let i = 0; i < pos.length; i++) pos[i] = orig[i] * 1.5 + (orig[i] - orig[i] * 1.5) * ease;
                    Background3D.particles.geometry.attributes.position.needsUpdate = true;
                }});
            }
        }
    };

    // ==================== CHARTS ====================
    const Charts = {
        donut: null, wealth: null,

        sparkline(canvasId, values, color) {
            const c = document.getElementById(canvasId);
            if (!c) return;
            const ctx = c.getContext('2d');
            const w = c.width, h = c.height, pad = 3;
            ctx.clearRect(0, 0, w, h);
            if (!values.length) return;
            const max = Math.max(...values, 1), min = Math.min(...values, 0);
            const range = (max - min) || 1;
            const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
            const pts = values.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)]);
            // fill
            ctx.beginPath(); ctx.moveTo(pts[0][0], h);
            pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length-1][0], h); ctx.closePath();
            ctx.fillStyle = color + '22'; ctx.fill();
            // line
            ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        },

        renderSparks() {
            const s = Calc.monthlySeries();
            // derive monthly income/expense series (non-cumulative) for sparks
            const incSeries = [], expSeries = [], invSeries = [], debtSeries = [];
            const now = new Date();
            for (let k = s.labels.length - 1; k >= 0; k--) {
                const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
                incSeries.push(Calc.monthIncome(d.getFullYear(), d.getMonth()));
                expSeries.push(Calc.monthExpenses(d.getFullYear(), d.getMonth()));
            }
            // investments & debt: use cumulative series approximations
            this.sparkline('spark-income', incSeries.length ? incSeries : [0], '#00ff88');
            this.sparkline('spark-expenses', expSeries.length ? expSeries : [0], '#ff4757');
            this.sparkline('spark-investments', s.assets.length ? s.assets : [0], '#a855f7');
            this.sparkline('spark-debt', s.liabilities.length ? s.liabilities : [0], '#fbbf24');
        },

        renderDonut() {
            const el = document.getElementById('portfolio-donut');
            const wrap = el ? el.closest('.portfolio-chart') : null;
            if (!el) return;
            const alloc = Calc.allocation();
            const keys = Object.keys(alloc).filter(k => alloc[k] > 0);
            if (!hasChart() || keys.length === 0) {
                if (wrap) wrap.classList.toggle('chart-unavailable', !hasChart());
                if (this.donut) { this.donut.destroy(); this.donut = null; }
                if (hasChart() && keys.length === 0 && el) {
                    // clear canvas
                    el.getContext('2d').clearRect(0,0,el.width,el.height);
                }
                return;
            }
            if (wrap) wrap.classList.remove('chart-unavailable');
            const data = keys.map(k => alloc[k]);
            const colors = keys.map(k => (ASSET_META[k] || ASSET_META.other).color);
            const labels = keys.map(k => (ASSET_META[k] || ASSET_META.other).label);
            if (this.donut) {
                this.donut.data.labels = labels;
                this.donut.data.datasets[0].data = data;
                this.donut.data.datasets[0].backgroundColor = colors;
                this.donut.update();
                return;
            }
            this.donut = new Chart(el, {
                type: 'doughnut',
                data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }] },
                options: {
                    responsive: true, maintainAspectRatio: true, cutout: '70%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(10,10,15,0.9)', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)',
                            padding: 12, cornerRadius: 8, displayColors: false,
                            callbacks: { label: (c) => c.label + ': ' + Fmt.money(c.raw) }
                        }
                    }
                }
            });
        },

        renderWealth() {
            const el = document.getElementById('wealth-chart');
            const wrap = el ? el.closest('.main-chart') : null;
            if (!el) return;
            if (!hasChart()) { if (wrap) wrap.classList.add('chart-unavailable'); return; }
            if (wrap) wrap.classList.remove('chart-unavailable');
            const s = Calc.monthlySeries();
            const g = el.getContext('2d').createLinearGradient(0, 0, 0, 300);
            g.addColorStop(0, 'rgba(0,255,136,0.3)'); g.addColorStop(1, 'rgba(0,255,136,0)');
            const gr = el.getContext('2d').createLinearGradient(0, 0, 0, 300);
            gr.addColorStop(0, 'rgba(255,71,87,0.2)'); gr.addColorStop(1, 'rgba(255,71,87,0)');
            const ds = [
                { label: 'Assets', data: s.assets, borderColor: '#00ff88', backgroundColor: g, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, borderWidth: 2 },
                { label: 'Liabilities', data: s.liabilities, borderColor: '#ff4757', backgroundColor: gr, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, borderWidth: 2 }
            ];
            if (this.wealth) {
                this.wealth.data.labels = s.labels;
                this.wealth.data.datasets[0].data = s.assets;
                this.wealth.data.datasets[1].data = s.liabilities;
                this.wealth.update();
                return;
            }
            this.wealth = new Chart(el, {
                type: 'line',
                data: { labels: s.labels, datasets: ds },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(10,10,15,0.9)', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)',
                            padding: 12, cornerRadius: 8,
                            callbacks: { label: (c) => c.dataset.label + ': ' + Fmt.money(c.raw) }
                        }
                    },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)' } },
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', callback: (v) => Fmt.money(v) } }
                    }
                }
            });
        },

        renderAll() { this.renderDonut(); this.renderWealth(); this.renderSparks(); }
    };

    // ==================== ANIMATIONS ====================
    const Anim = {
        init() {
            if (!hasGSAP()) return;
            try {
                if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
                this.scroll(); this.cursor();
            } catch (e) {}
        },
        hero() {
            if (!hasGSAP()) return;
            try {
                // Dramatic hero entrance sequence
                const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

                // Set initial states
                gsap.set('.hero-badge', { opacity: 0, y: 40, scale: 0.8 });
                gsap.set('.hero-title .title-line', { opacity: 0, y: 80, rotateX: 40 });
                gsap.set('.hero-subtitle', { opacity: 0, y: 30 });
                gsap.set('.net-worth-display', { opacity: 0, y: 60, scale: 0.9 });
                gsap.set('.net-worth-value .amount', { opacity: 0, scale: 0.5 });
                gsap.set('.hero-cta', { opacity: 0, y: 30 });
                gsap.set('.scroll-indicator', { opacity: 0, y: 20 });

                tl
                    // Badge drops in with pop
                    .to('.hero-badge', { opacity: 1, y: 0, scale: 1, duration: 0.6 })
                    // Title lines sweep in with perspective
                    .to('.hero-title .title-line', {
                        opacity: 1, y: 0, rotateX: 0,
                        stagger: 0.15, duration: 0.9
                    }, '-=0.3')
                    // Subtitle fades in
                    .to('.hero-subtitle', { opacity: 1, y: 0, duration: 0.6 }, '-=0.5')
                    // Net worth card rises with spring
                    .to('.net-worth-display', {
                        opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'back.out(1.2)'
                    }, '-=0.3')
                    // Amount pops with counter animation
                    .to('.net-worth-value .amount', {
                        opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)'
                    }, '-=0.4')
                    // CTA buttons
                    .to('.hero-cta', { opacity: 1, y: 0, duration: 0.5 }, '-=0.2')
                    // Scroll indicator
                    .to('.scroll-indicator', { opacity: 1, y: 0, duration: 0.4 }, '-=0.1');

                // Particle burst after hero loads
                setTimeout(() => {
                    if (Background3D.particles) {
                        // Gentle zoom-in effect
                        gsap.from(Background3D.particles.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 2, ease: 'power2.out' });
                    }
                }, 200);

            } catch (e) { console.warn('Hero animation failed:', e); }
        },
        scroll() {
            if (!window.ScrollTrigger) return;
            gsap.utils.toArray('.stat-card, .velocity-item, .insight-card, .import-card').forEach((card, i) => {
                gsap.from(card, { scrollTrigger: { trigger: card, start: 'top 90%' }, opacity: 0, y: 40, duration: 0.5, delay: (i % 4) * 0.08 });
            });
            ['.portfolio-chart', '.asset-list', '.main-chart', '.debt-summary'].forEach(sel => {
                const elx = document.querySelector(sel);
                if (elx) gsap.from(elx, { scrollTrigger: { trigger: elx, start: 'top 85%' }, opacity: 0, y: 40, duration: 0.6 });
            });
        },
        cursor() {
            const glow = document.getElementById('cursor-glow');
            if (!glow || matchMedia('(max-width: 768px)').matches) return;
            addEventListener('mousemove', (e) => gsap.to(glow, { x: e.clientX, y: e.clientY, duration: 0.3, ease: 'power2.out' }));
        },
        counter(id, target, duration = 1.2) {
            const el = document.getElementById(id);
            if (!el) return;
            const val = Math.abs(Math.round(target));
            if (!hasGSAP()) { el.textContent = val.toLocaleString(); return; }
            gsap.to({ v: 0 }, { v: val, duration, ease: 'power2.out', onUpdate: function() { el.textContent = Math.round(this.targets()[0].v).toLocaleString(); } });
        }
    };

    // ==================== LOADER ====================
    const Loader = {
        done: false,
        hide() {
            if (this.done) return; this.done = true;
            const loader = document.getElementById('loader');
            const app = document.getElementById('app');
            if (app) app.classList.add('loaded');
            const finish = () => { if (loader) loader.classList.add('hidden'); Anim.hero(); Anim.counter('net-worth', Calc.netWorth(), 1.6); };
            if (hasGSAP() && loader) gsap.to(loader, { opacity: 0, duration: 0.4, onComplete: finish });
            else finish();
        }
    };

    // ==================== MODAL ====================
    const Modal = {
        kind: 'expense',
        open(kind = 'expense') {
            this.kind = kind;
            const modal = document.getElementById('entry-modal');
            this.setKind(kind);
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            const date = document.getElementById('f-date');
            if (date && !date.value) date.valueAsDate = new Date();
            setTimeout(() => document.getElementById('f-name')?.focus(), 80);
        },
        close() {
            const modal = document.getElementById('entry-modal');
            if (!modal.classList.contains('active')) return;
            modal.classList.remove('active');
            document.body.style.overflow = '';
            document.getElementById('entry-form').reset();
            this.manualCat = false; this.manualAsset = false;
            const cb = document.getElementById('cat-auto'); if (cb) cb.hidden = true;
            const ab = document.getElementById('asset-auto'); if (ab) ab.hidden = true;
        },
        manualCat: false,
        manualAsset: false,

        // Live auto-categorization from the description/name field.
        autoClassify() {
            const kind = document.getElementById('entry-kind').value;
            const name = document.getElementById('f-name').value;
            if (kind === 'expense' || kind === 'income') {
                if (this.manualCat) return;
                const res = kind === 'income' ? Classifier.classifyIncome(name) : Classifier.classifyExpense(name);
                const badge = document.getElementById('cat-auto');
                const sel = document.getElementById('f-category');
                if (res.category && sel) {
                    sel.value = res.category;
                    if (badge) badge.hidden = false;
                } else if (badge) { badge.hidden = true; }
            } else if (kind === 'investment') {
                if (this.manualAsset) return;
                const res = Classifier.classifyInvestment(name);
                const badge = document.getElementById('asset-auto');
                const sel = document.getElementById('f-asset-type');
                if (res.assetType && sel) {
                    sel.value = res.assetType;
                    if (badge) badge.hidden = false;
                } else if (badge) { badge.hidden = true; }
            }
        },

        setKind(kind) {
            this.kind = kind;
            this.manualCat = false; this.manualAsset = false;
            const cb = document.getElementById('cat-auto'); if (cb) cb.hidden = true;
            const ab = document.getElementById('asset-auto'); if (ab) ab.hidden = true;
            document.getElementById('entry-kind').value = kind;
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.kind === kind));
            const isTx = (kind === 'expense' || kind === 'income');
            const isInv = kind === 'investment';
            const isDebt = kind === 'debt';
            document.querySelectorAll('.field-tx').forEach(e => e.style.display = isTx ? '' : 'none');
            document.querySelectorAll('.field-inv').forEach(e => e.style.display = isInv ? '' : 'none');
            document.querySelectorAll('.field-debt').forEach(e => e.style.display = isDebt ? '' : 'none');

            const titles = { expense: 'Add Expense', income: 'Add Income', investment: 'Add Investment', debt: 'Add Debt' };
            document.getElementById('modal-title').textContent = titles[kind];
            document.getElementById('submit-label').textContent = 'Save ' + capitalize(kind);

            const nameLabel = document.getElementById('label-name');
            const amountLabel = document.getElementById('label-amount');
            const nameInput = document.getElementById('f-name');
            if (isTx) { nameLabel.textContent = 'Description'; nameInput.placeholder = 'What was this for?'; amountLabel.textContent = 'Amount'; }
            else if (isInv) { nameLabel.textContent = 'Asset Name'; nameInput.placeholder = 'e.g. S&P 500 ETF'; amountLabel.textContent = 'Current Value'; }
            else { nameLabel.textContent = 'Debt Name'; nameInput.placeholder = 'e.g. Visa Card'; amountLabel.textContent = 'Balance Owed'; }

            // default category for income vs expense
            if (isTx) {
                const cat = document.getElementById('f-category');
                if (kind === 'income') cat.value = 'salary'; else cat.value = 'housing';
            }
            const prefix = document.querySelector('#entry-modal .input-prefix');
            if (prefix) prefix.textContent = Fmt.symbol();
        },
        submit() {
            const kind = document.getElementById('entry-kind').value;
            const name = document.getElementById('f-name').value.trim();
            const amount = parseFloat(document.getElementById('f-amount').value);
            const date = document.getElementById('f-date').value || new Date().toISOString().slice(0, 10);

            if (!name || !(amount > 0)) { Toast.show('Enter a name and a valid amount', 'error'); return; }

            // Capture state before adding for milestone detection
            const prevNetWorth = Calc.netWorth();
            const isFirstEntry = Store.data.transactions.length === 0 && Store.data.investments.length === 0;
            const prevDebtCount = Store.data.debts.length;

            if (kind === 'expense' || kind === 'income') {
                Store.add('transactions', { id: uid(), description: name, amount, category: document.getElementById('f-category').value, date, type: kind });
            } else if (kind === 'investment') {
                Store.add('investments', { id: uid(), name, value: amount, assetType: document.getElementById('f-asset-type').value, date });
            } else if (kind === 'debt') {
                Store.add('debts', { id: uid(), name, balance: amount,
                    rate: parseFloat(document.getElementById('f-rate').value) || 0,
                    minimum: parseFloat(document.getElementById('f-minimum').value) || 0,
                    debtType: document.getElementById('f-debt-type').value, date });
            }
            this.close();
            UI.refresh();

            // Milestone celebrations
            const newNetWorth = Calc.netWorth();
            const milestones = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];
            const crossedMilestone = milestones.find(m => prevNetWorth < m && newNetWorth >= m);

            if (isFirstEntry) {
                setTimeout(() => Confetti.celebrate('🚀 Welcome! Your wealth journey begins!'), 300);
            } else if (crossedMilestone) {
                setTimeout(() => Confetti.celebrate(`🎉 ${Fmt.money(crossedMilestone)} net worth milestone!`), 300);
            } else if (kind === 'income' && amount >= 5000) {
                setTimeout(() => Confetti.fire(0.5, 0.5), 200);
                Toast.show('💰 Big income recorded!');
            } else if (prevDebtCount > 0 && Store.data.debts.length === 0) {
                setTimeout(() => Confetti.celebrate('🎊 Debt free! Incredible!'), 300);
            } else {
                Toast.show(capitalize(kind) + ' saved');
            }
        }
    };

    // ==================== CONFIRM DIALOG ====================
    const Confirm = {
        cb: null,
        show(text, cb) {
            this.cb = cb;
            document.getElementById('confirm-text').textContent = text;
            document.getElementById('confirm-modal').classList.add('active');
        },
        hide() { document.getElementById('confirm-modal').classList.remove('active'); this.cb = null; },
        ok() { const cb = this.cb; this.hide(); if (cb) cb(); }
    };

    // ==================== UPLOAD / IMPORT ====================
    const Upload = {
        init() {
            const dz = document.getElementById('dropzone');
            const input = document.getElementById('file-input');
            if (!dz || !input) return;
            dz.addEventListener('click', () => input.click());
            dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
            dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
            dz.addEventListener('drop', (e) => {
                e.preventDefault(); dz.classList.remove('dragover');
                if (e.dataTransfer.files.length) this.handle(e.dataTransfer.files[0]);
            });
            input.addEventListener('change', () => { if (input.files.length) this.handle(input.files[0]); input.value = ''; });
        },

        handle(file) {
            const name = file.name.toLowerCase();
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let rows;
                    if (name.endsWith('.csv')) rows = this.parseCSV(e.target.result);
                    else if (hasXLSX()) {
                        const wb = XLSX.read(e.target.result, { type: 'array' });
                        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
                    } else { this.result('Excel parsing unavailable offline. Please upload a CSV.', false); return; }
                    this.importRows(rows);
                } catch (err) { this.result('Could not read file: ' + err.message, false); }
            };
            reader.onerror = () => this.result('Failed to read file', false);
            if (name.endsWith('.csv')) reader.readAsText(file);
            else reader.readAsArrayBuffer(file);
        },

        parseCSV(text) {
            const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
            if (!lines.length) return [];
            const parseLine = (line) => {
                const out = []; let cur = '', inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
                    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
                    else cur += c;
                }
                out.push(cur); return out.map(s => s.trim());
            };
            const headers = parseLine(lines[0]).map(h => h.toLowerCase());
            return lines.slice(1).map(line => {
                const cells = parseLine(line); const obj = {};
                headers.forEach((h, i) => obj[h] = cells[i] != null ? cells[i] : '');
                return obj;
            });
        },

        pick(obj, candidates) {
            const keys = Object.keys(obj);
            for (const cand of candidates) {
                const k = keys.find(key => key.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cand));
                if (k != null && obj[k] !== '') return obj[k];
            }
            return '';
        },

        toNum(v) {
            if (typeof v === 'number') return v;
            const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
            return isNaN(n) ? 0 : Math.abs(n);
        },

        toDate(v) {
            if (!v) return new Date().toISOString().slice(0, 10);
            const d = new Date(v);
            if (!isNaN(d)) return d.toISOString().slice(0, 10);
            return new Date().toISOString().slice(0, 10);
        },

        importRows(rows) {
            if (!rows || !rows.length) { this.result('No rows found in file', false); return; }
            const target = document.getElementById('import-target').value;
            let count = 0, autoTagged = 0;
            rows.forEach(r => {
                const name = this.pick(r, ['description', 'name', 'merchant', 'detail', 'memo', 'payee']) || capitalize(target);
                const amount = this.toNum(this.pick(r, ['amount', 'value', 'balance', 'total', 'price', 'debit', 'credit']));
                const date = this.toDate(this.pick(r, ['date', 'time', 'posted', 'when']));
                if (amount <= 0) return;
                if (target === 'expense' || target === 'income') {
                    let cat = (this.pick(r, ['category', 'tag']) || '').toLowerCase();
                    let category = CAT_ICON[cat] ? cat : '';
                    // No usable category column -> classify intelligently from the description.
                    if (!category) {
                        const res = target === 'income' ? Classifier.classifyIncome(name) : Classifier.classifyExpense(name);
                        if (res.category) { category = res.category; autoTagged++; }
                        else category = (target === 'income' ? 'salary' : 'other');
                    }
                    Store.data.transactions.push({ id: uid(), description: String(name), amount, category, date, type: target });
                } else if (target === 'investment') {
                    let at = (this.pick(r, ['assettype', 'class']) || '').toLowerCase();
                    let assetType = ASSET_META[at] ? at : '';
                    if (!assetType) {
                        const res = Classifier.classifyInvestment(name);
                        if (res.assetType) { assetType = res.assetType; autoTagged++; }
                        else assetType = 'other';
                    }
                    Store.data.investments.push({ id: uid(), name: String(name), value: amount, assetType, date });
                } else if (target === 'debt') {
                    const dt = (this.pick(r, ['debttype', 'type', 'class']) || 'other').toLowerCase();
                    const debtType = DEBT_META[dt] ? dt : 'other';
                    Store.data.debts.push({ id: uid(), name: String(name), balance: amount, rate: this.toNum(this.pick(r, ['rate', 'apr', 'interest'])), minimum: this.toNum(this.pick(r, ['minimum', 'minpayment', 'payment'])), debtType, date });
                }
                count++;
            });
            Store.saveAll();
            UI.refresh();
            if (count > 0) {
                const extra = autoTagged > 0 ? ` (${autoTagged} auto-categorized)` : '';
                this.result(`Imported ${count} ${target}${count === 1 ? '' : 's'} successfully${extra}.`, true);
                Toast.show(`Imported ${count} record${count === 1 ? '' : 's'}`);
            } else this.result('No valid rows could be imported. Check that the file has amount/value columns.', false);
        },

        result(msg, ok) {
            const el = document.getElementById('import-result');
            if (!el) return;
            el.textContent = msg;
            el.className = 'import-result ' + (ok ? 'ok' : 'err');
        }
    };

    // ==================== BACKUP ====================
    const Backup = {
        export() {
            const blob = new Blob([JSON.stringify({
                version: 1, exported: new Date().toISOString(),
                transactions: Store.data.transactions, investments: Store.data.investments, debts: Store.data.debts
            }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'wlth-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            Toast.show('Backup downloaded');
        },
        import(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const d = JSON.parse(e.target.result);
                    Store.data.transactions = Array.isArray(d.transactions) ? d.transactions : [];
                    Store.data.investments = Array.isArray(d.investments) ? d.investments : [];
                    Store.data.debts = Array.isArray(d.debts) ? d.debts : [];
                    Store.saveAll(); UI.refresh();
                    Toast.show('Backup restored');
                } catch (err) { Toast.show('Invalid backup file', 'error'); }
            };
            reader.readAsText(file);
        }
    };

    // ==================== DEMO DATA ====================
    const Demo = {
        load() {
            const today = new Date();
            const iso = (monthsAgo, day) => {
                const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day);
                return d.toISOString().slice(0, 10);
            };
            const tx = [];
            // 6 months of salary + recurring expenses + a few variable ones
            for (let m = 5; m >= 0; m--) {
                tx.push({ id: uid(), description: 'Monthly Salary', amount: 6200, category: 'salary', date: iso(m, 1), type: 'income' });
                tx.push({ id: uid(), description: 'Freelance Project', amount: 900 + Math.round(Math.random()*600), category: 'business', date: iso(m, 14), type: 'income' });
                tx.push({ id: uid(), description: 'Rent', amount: 1800, category: 'housing', date: iso(m, 2), type: 'expense' });
                tx.push({ id: uid(), description: 'Groceries', amount: 420 + Math.round(Math.random()*180), category: 'food', date: iso(m, 6), type: 'expense' });
                tx.push({ id: uid(), description: 'Utilities', amount: 160 + Math.round(Math.random()*60), category: 'utilities', date: iso(m, 10), type: 'expense' });
                tx.push({ id: uid(), description: 'Transit & Fuel', amount: 140, category: 'transport', date: iso(m, 8), type: 'expense' });
                tx.push({ id: uid(), description: 'Dining Out', amount: 200 + Math.round(Math.random()*150), category: 'food', date: iso(m, 18), type: 'expense' });
                tx.push({ id: uid(), description: 'Subscriptions', amount: 75, category: 'entertainment', date: iso(m, 20), type: 'expense' });
            }
            const inv = [
                { id: uid(), name: 'S&P 500 ETF', value: 42000, assetType: 'stocks', date: iso(5, 1) },
                { id: uid(), name: 'Tech Growth Fund', value: 18500, assetType: 'stocks', date: iso(4, 12) },
                { id: uid(), name: 'Bitcoin', value: 15200, assetType: 'crypto', date: iso(3, 5) },
                { id: uid(), name: 'Ethereum', value: 6800, assetType: 'crypto', date: iso(2, 9) },
                { id: uid(), name: 'Rental Condo Equity', value: 38000, assetType: 'realestate', date: iso(5, 15) },
                { id: uid(), name: 'Treasury Bonds', value: 12000, assetType: 'bonds', date: iso(4, 1) },
                { id: uid(), name: 'High-Yield Savings', value: 9500, assetType: 'cash', date: iso(1, 1) }
            ];
            const debts = [
                { id: uid(), name: 'Visa Platinum', balance: 4200, rate: 19.9, minimum: 120, debtType: 'credit', date: iso(5, 1) },
                { id: uid(), name: 'Auto Loan', balance: 14500, rate: 5.4, minimum: 340, debtType: 'auto', date: iso(5, 1) },
                { id: uid(), name: 'Student Loan', balance: 21000, rate: 4.2, minimum: 260, debtType: 'student', date: iso(5, 1) }
            ];
            Store.data.transactions = tx; Store.data.investments = inv; Store.data.debts = debts;
            Store.saveAll();
            UI.refresh();
            Toast.show('Demo data loaded');
        }
    };

    // ==================== UI ====================
    const UI = {
        txFilter: 'all',
        txQuery: '',

        init() {
            this.applyTheme(Store.data.theme);
            this.wireNav();
            this.wireMobileMenu();
            this.wireModal();
            this.wireConfirm();
            this.wireTheme();
            this.wireCurrency();
            this.wireTabs();
            this.wireSearchFilter();
            this.wireDelegated();
            this.wireData();
            Upload.init();
            this.refresh();
        },

        refresh() {
            this.renderHero();
            this.renderStats();
            this.renderVelocity();
            this.renderAssets(true);
            this.renderDebts(true);
            this.renderInsights();
            this.renderTransactions(true);
            Ticker.render();
            Charts.renderAll();
        },

        // ---------- HERO ----------
        renderHero() {
            const nw = Calc.netWorth();
            const el = document.getElementById('net-worth');
            // Smoothly tween from the previous value (set directly until the loader's
            // dramatic count-up has run, to avoid a double animation on first paint).
            if (el && Loader.done) Num.tween(el, Math.abs(nw), (v) => Math.round(v).toLocaleString(), 0.7);
            const sym = document.getElementById('currency-symbol');
            if (sym) sym.textContent = (nw < 0 ? '-' : '') + Fmt.symbol();

            const change = Calc.monthOverMonthChange();
            const changeEl = document.getElementById('net-worth-change');
            const pctEl = document.getElementById('change-percent');
            if (changeEl && pctEl) {
                if (change === null) { pctEl.textContent = '—'; changeEl.classList.remove('negative'); changeEl.classList.add('positive'); }
                else { pctEl.textContent = Fmt.pct(change); changeEl.classList.toggle('positive', change >= 0); changeEl.classList.toggle('negative', change < 0); }
            }

            const bd = document.getElementById('net-worth-breakdown');
            if (bd) {
                bd.innerHTML = `
                    <div class="bd-item"><span class="bd-dot" style="background:var(--accent-green)"></span>Cash ${Fmt.money(Calc.liquidCash())}</div>
                    <div class="bd-item"><span class="bd-dot" style="background:var(--accent-purple)"></span>Invest ${Fmt.money(Calc.totalInvestments())}</div>
                    <div class="bd-item"><span class="bd-dot" style="background:var(--accent-red)"></span>Debt ${Fmt.money(Calc.totalDebt())}</div>`;
            }
        },

        // ---------- STAT CARDS ----------
        renderStats() {
            const money = (id, val) => { const e = document.getElementById(id); if (e) Num.tween(e, val, (v) => Fmt.money(v), 0.6); };
            money('stat-income', Calc.currentMonthIncome());
            money('stat-expenses', Calc.currentMonthExpenses());
            money('stat-investments', Calc.totalInvestments());
            money('stat-debt', Calc.totalDebt());

            // trends: compare current month vs previous month for income/expense
            const now = new Date();
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const trend = (id, curr, prior, goodWhenUp) => {
                const e = document.getElementById(id); if (!e) return;
                if (prior <= 0) { e.innerHTML = ''; return; }
                const pct = ((curr - prior) / prior) * 100;
                const up = pct >= 0;
                const good = goodWhenUp ? up : !up;
                e.className = 'stat-trend ' + (good ? 'positive' : 'negative');
                e.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="${up ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}"/></svg><span>${Fmt.pct(pct)}</span>`;
            };
            trend('trend-income', Calc.currentMonthIncome(), Calc.monthIncome(prev.getFullYear(), prev.getMonth()), true);
            trend('trend-expenses', Calc.currentMonthExpenses(), Calc.monthExpenses(prev.getFullYear(), prev.getMonth()), false);
            const ti = document.getElementById('trend-investments'); if (ti) ti.innerHTML = '';
            const td = document.getElementById('trend-debt'); if (td) td.innerHTML = '';
        },

        // ---------- VELOCITY ----------
        renderVelocity() {
            const v = Calc.velocity();
            const tw = (id, val, fmt) => { const e = document.getElementById(id); if (e) Num.tween(e, val, fmt, 0.6); };
            tw('vel-spend-day', v.spendPerDay, (x) => Fmt.money(x));
            tw('vel-spend-hour', v.spendPerHour, (x) => Fmt.moneyPrecise(x));
            tw('vel-income-day', v.incomePerDay, (x) => Fmt.money(x));
            tw('vel-net-day', v.netPerDay, (x) => Fmt.money(x));
            tw('vel-savings', v.savingsRate, (x) => Math.round(x) + '%');
            const runwayEl = document.getElementById('vel-runway');
            if (runwayEl) runwayEl.textContent = v.runwayMonths === Infinity ? '∞' : (Math.round(v.runwayMonths * 10) / 10) + ' mo';

            const netEl = document.getElementById('vel-net-day');
            if (netEl) netEl.style.color = v.netPerDay >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        },

        // ---------- ASSETS ----------
        renderAssets(animate) {
            const list = document.getElementById('asset-list');
            const totalEl = document.getElementById('portfolio-total');
            const total = Calc.totalInvestments();
            if (totalEl) Num.tween(totalEl, total, (v) => Fmt.money(v), 0.6);
            if (!list) return;
            const alloc = Calc.allocation();
            const keys = Object.keys(alloc).filter(k => alloc[k] > 0).sort((a, b) => alloc[b] - alloc[a]);
            if (!keys.length) {
                list.innerHTML = `<div class="empty-state mini"><div class="empty-icon">📈</div><h3>No investments yet</h3><p>Add an asset to see your allocation.</p><button class="btn-primary btn-glow" data-action="investment"><span>Add Asset</span><span class="btn-shimmer"></span></button></div>`;
                return;
            }
            list.innerHTML = keys.map(k => {
                const meta = ASSET_META[k] || ASSET_META.other;
                const pct = total > 0 ? Math.round((alloc[k] / total) * 100) : 0;
                return `<div class="asset-item">
                    <div class="asset-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
                    <div class="asset-info"><span class="asset-name">${escapeHtml(meta.label)}</span><span class="asset-allocation">${pct}% of portfolio</span></div>
                    <div class="asset-value"><span class="asset-amount">${Fmt.money(alloc[k])}</span></div>
                    <div class="asset-bar" style="--width:${pct}%;--color:${meta.color}"></div>
                </div>`;
            }).join('');
            if (animate) staggerIn(list);
        },

        // ---------- DEBTS ----------
        renderDebts(animate) {
            const summary = document.getElementById('debt-summary');
            const list = document.getElementById('debt-list');
            const debts = Store.data.debts;
            const total = Calc.totalDebt();
            const minTotal = Calc.sum(debts, d => d.minimum);
            const avgRate = debts.length ? (Calc.sum(debts, d => d.rate * d.balance) / (total || 1)) : 0;

            if (summary) {
                summary.innerHTML = `
                    <div class="debt-stat"><span class="debt-stat-label">Total Owed</span><span class="debt-stat-value">${Fmt.money(total)}</span></div>
                    <div class="debt-stat"><span class="debt-stat-label">Monthly Minimums</span><span class="debt-stat-value">${Fmt.money(minTotal)}</span></div>
                    <div class="debt-stat"><span class="debt-stat-label">Avg Interest (APR)</span><span class="debt-stat-value">${(Math.round(avgRate * 10) / 10) || 0}%</span></div>
                    <div class="debt-stat"><span class="debt-stat-label">Accounts</span><span class="debt-stat-value">${debts.length}</span></div>`;
            }
            if (!list) return;
            if (!debts.length) {
                list.innerHTML = `<div class="empty-state mini glass"><div class="empty-icon">🎉</div><h3>Debt free</h3><p>No debts tracked. Add one to monitor payoff.</p><button class="btn-primary btn-glow" data-action="debt"><span>Add Debt</span><span class="btn-shimmer"></span></button></div>`;
                return;
            }
            const sorted = debts.slice().sort((a, b) => b.balance - a.balance);
            list.innerHTML = sorted.map(d => {
                const meta = DEBT_META[d.debtType] || DEBT_META.other;
                const payoff = d.minimum > 0 ? Math.ceil(d.balance / d.minimum) : null;
                return `<div class="debt-item glass">
                    <div class="debt-icon">${meta.icon}</div>
                    <div class="debt-info">
                        <span class="debt-name">${escapeHtml(d.name)}</span>
                        <span class="debt-meta">${meta.label} • ${d.rate || 0}% APR${payoff ? ` • ~${payoff} mo at min` : ''}</span>
                    </div>
                    <div class="debt-amount">${Fmt.money(d.balance)}</div>
                    <button class="icon-del" data-del-debt="${d.id}" aria-label="Delete debt">×</button>
                </div>`;
            }).join('');
            if (animate) staggerIn(list);
        },

        // ---------- INSIGHTS ----------
        renderInsights() {
            const col = document.getElementById('insights-column');
            if (!col) return;
            const v = Calc.velocity();
            const top = Calc.topExpenseCategory();
            const nw = Calc.netWorth();
            const debt = Calc.totalDebt();

            const cards = [];
            // Smart insight
            if (top) {
                cards.push(`<div class="insight-card glass"><div class="insight-header"><span class="insight-icon">🎯</span><span class="insight-title">Top Spend Category</span></div>
                    <p class="insight-text">Your biggest expense area is <strong>${escapeHtml(capitalize(top.category))}</strong> at <strong>${Fmt.money(top.amount)}</strong> all-time. Trimming 10% saves <strong>${Fmt.money(top.amount * 0.1)}</strong>.</p></div>`);
            } else {
                cards.push(`<div class="insight-card glass"><div class="insight-header"><span class="insight-icon">🎯</span><span class="insight-title">Get Started</span></div>
                    <p class="insight-text">Add transactions or load demo data to unlock personalized insights.</p>
                    <button class="insight-action" data-action="goto-import">Load Demo Data</button></div>`);
            }
            // Runway / savings
            cards.push(`<div class="insight-card glass"><div class="insight-header"><span class="insight-icon">⏳</span><span class="insight-title">Cash Runway</span></div>
                <p class="insight-text">${v.runwayMonths === Infinity ? 'No spending recorded this month — runway is effectively unlimited.' : `At your current burn you have <strong>${Math.round(v.runwayMonths * 10) / 10} months</strong> of cash runway.`} Savings rate: <strong>${v.savingsRate}%</strong>.</p></div>`);
            // Debt insight
            if (debt > 0) {
                cards.push(`<div class="insight-card glass"><div class="insight-header"><span class="insight-icon">💳</span><span class="insight-title">Debt Focus</span></div>
                    <p class="insight-text">You carry <strong>${Fmt.money(debt)}</strong> in debt. Paying highest-APR balances first (avalanche) minimizes interest.</p></div>`);
            }
            // Quick actions
            cards.push(`<div class="insight-card glass quick-actions-card"><div class="insight-header"><span class="insight-icon">⚡</span><span class="insight-title">Quick Actions</span></div>
                <div class="quick-actions">
                    <button class="action-btn" data-action="expense"><span class="action-icon">−</span><span>Expense</span></button>
                    <button class="action-btn" data-action="income"><span class="action-icon">+</span><span>Income</span></button>
                    <button class="action-btn" data-action="investment"><span class="action-icon">📈</span><span>Invest</span></button>
                </div></div>`);
            col.innerHTML = cards.join('');
        },

        // ---------- TRANSACTIONS ----------
        renderTransactions(animate) {
            const container = document.getElementById('transactions-list');
            if (!container) return;
            let list = Store.data.transactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
            if (this.txFilter !== 'all') list = list.filter(t => t.type === this.txFilter);
            if (this.txQuery) list = list.filter(t => (t.description || '').toLowerCase().includes(this.txQuery) || (t.category || '').toLowerCase().includes(this.txQuery));
            const shown = list.slice(0, 15);

            if (!shown.length) {
                container.innerHTML = (this.txQuery || this.txFilter !== 'all')
                    ? `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No matches</h3><p>Try a different search or filter.</p></div>`
                    : `<div class="empty-state"><div class="empty-icon">📊</div><h3>No transactions yet</h3><p>Add your first income or expense, or load demo data.</p><button class="btn-primary btn-glow" data-action="expense"><span>Add Transaction</span><span class="btn-shimmer"></span></button></div>`;
                return;
            }
            container.innerHTML = shown.map(tx => {
                const icon = CAT_ICON[tx.category] || '📦';
                const isExp = tx.type === 'expense';
                return `<div class="transaction-item">
                    <div class="tx-icon">${icon}</div>
                    <div class="tx-info"><span class="tx-description">${escapeHtml(tx.description)}</span><span class="tx-meta">${escapeHtml(capitalize(tx.category))} • ${Fmt.date(tx.date)}</span></div>
                    <span class="tx-amount ${isExp ? 'expense' : 'income'}">${isExp ? '−' : '+'}${Fmt.moneyPrecise(tx.amount)}</span>
                    <button class="icon-del" data-del-tx="${tx.id}" aria-label="Delete transaction">×</button>
                </div>`;
            }).join('');
            if (animate) staggerIn(container);
        },

        // ---------- WIRING ----------
        wireNav() {
            const links = document.querySelectorAll('.nav-link');
            links.forEach(link => link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('href');
                document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
                document.getElementById('nav-links')?.classList.remove('active');
                document.getElementById('mobile-menu')?.classList.remove('open');
            }));
            const ids = ['dashboard', 'portfolio', 'debt', 'analytics', 'transactions'];
            const sections = ids.map(id => document.getElementById(id)).filter(Boolean);
            if (!sections.length) return;
            let ticking = false;
            const spy = () => {
                ticking = false;
                const line = scrollY + innerHeight * 0.33;
                let cur = sections[0].id;
                sections.forEach(s => { if (s.offsetTop <= line) cur = s.id; });
                links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
            };
            addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
            spy();
        },

        wireMobileMenu() {
            const toggle = document.getElementById('mobile-menu');
            const links = document.getElementById('nav-links');
            toggle?.addEventListener('click', () => { const open = links?.classList.toggle('active'); toggle.classList.toggle('open', open); });
        },

        wireModal() {
            const modal = document.getElementById('entry-modal');
            document.getElementById('modal-close')?.addEventListener('click', () => Modal.close());
            modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => Modal.close());
            document.getElementById('entry-form')?.addEventListener('submit', (e) => { e.preventDefault(); Modal.submit(); });
            document.querySelectorAll('.modal-tab').forEach(tab => tab.addEventListener('click', () => Modal.setKind(tab.dataset.kind)));
            addEventListener('keydown', (e) => { if (e.key === 'Escape') { Modal.close(); Confirm.hide(); } });

            // Live, on-device auto-categorization as the user types.
            let t;
            document.getElementById('f-name')?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => Modal.autoClassify(), 120); });
            document.getElementById('f-category')?.addEventListener('change', () => { Modal.manualCat = true; const b = document.getElementById('cat-auto'); if (b) b.hidden = true; });
            document.getElementById('f-asset-type')?.addEventListener('change', () => { Modal.manualAsset = true; const b = document.getElementById('asset-auto'); if (b) b.hidden = true; });
        },

        wireConfirm() {
            document.getElementById('confirm-cancel')?.addEventListener('click', () => Confirm.hide());
            document.getElementById('confirm-ok')?.addEventListener('click', () => Confirm.ok());
            document.querySelector('#confirm-modal .modal-backdrop')?.addEventListener('click', () => Confirm.hide());
        },

        wireTheme() {
            document.getElementById('theme-toggle')?.addEventListener('click', () => {
                const next = Store.data.theme === 'dark' ? 'light' : 'dark';
                Store.data.theme = next; localStorage.setItem('wlth_theme', next);
                this.applyTheme(next);
                Charts.renderAll(); // re-render charts for theme
            });
        },
        applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f5fb' : '#0a0a0f');
        },

        wireCurrency() {
            const sel = document.getElementById('currency-select');
            if (!sel) return;
            sel.value = Store.data.currency;
            sel.addEventListener('change', (e) => {
                Store.data.currency = e.target.value; localStorage.setItem('wlth_currency', e.target.value);
                this.refresh();
            });
        },

        wireTabs() {
            document.querySelectorAll('.time-filter .filter-btn').forEach(btn => btn.addEventListener('click', () => {
                document.querySelectorAll('.time-filter .filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applyTimeFilter(btn.dataset.period);
            }));
        },

        applyTimeFilter(period) {
            // Adjust the income/expense stat cards to show selected window
            const now = new Date();
            let inc, exp, label;
            if (period === 'month') { inc = Calc.currentMonthIncome(); exp = Calc.currentMonthExpenses(); label = 'This Month'; }
            else if (period === 'ytd') {
                inc = Calc.sum(Store.data.transactions.filter(t => t.type === 'income' && new Date(t.date).getFullYear() === now.getFullYear()), t => t.amount);
                exp = Calc.sum(Store.data.transactions.filter(t => t.type === 'expense' && new Date(t.date).getFullYear() === now.getFullYear()), t => t.amount);
                label = 'Year to Date';
            } else { inc = Calc.totalIncome(); exp = Calc.totalExpenses(); label = 'All Time'; }
            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            set('stat-income', Fmt.money(inc)); set('stat-expenses', Fmt.money(exp));
            set('label-income', 'Income (' + label + ')'); set('label-expenses', 'Expenses (' + label + ')');
        },

        wireSearchFilter() {
            document.getElementById('tx-search')?.addEventListener('input', (e) => { this.txQuery = e.target.value.trim().toLowerCase(); this.renderTransactions(); });
            document.querySelectorAll('#tx-filter .seg-btn').forEach(btn => btn.addEventListener('click', () => {
                document.querySelectorAll('#tx-filter .seg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active'); this.txFilter = btn.dataset.filter; this.renderTransactions();
            }));
        },

        wireDelegated() {
            document.addEventListener('click', (e) => {
                const actionEl = e.target.closest('[data-action]');
                if (actionEl) {
                    const a = actionEl.dataset.action;
                    if (a === 'add') { e.preventDefault(); Modal.open('expense'); return; }
                    if (['expense', 'income', 'investment', 'debt'].includes(a)) { e.preventDefault(); Modal.open(a); return; }
                    if (a === 'goto-import') { e.preventDefault(); document.getElementById('import')?.scrollIntoView({ behavior: 'smooth' }); return; }
                }
                const delTx = e.target.closest('[data-del-tx]');
                if (delTx) { const id = delTx.dataset.delTx; Store.remove('transactions', id); this.refresh(); Toast.show('Transaction deleted'); return; }
                const delDebt = e.target.closest('[data-del-debt]');
                if (delDebt) { const id = delDebt.dataset.delDebt; Store.remove('debts', id); this.refresh(); Toast.show('Debt deleted'); return; }
            });
        },

        wireData() {
            document.getElementById('btn-demo')?.addEventListener('click', () => {
                if (Store.data.transactions.length || Store.data.investments.length || Store.data.debts.length) {
                    Confirm.show('This will replace your current data with demo data. Continue?', () => Demo.load());
                } else Demo.load();
            });
            document.getElementById('btn-export')?.addEventListener('click', () => Backup.export());
            document.getElementById('btn-import-json')?.addEventListener('click', () => document.getElementById('json-input').click());
            document.getElementById('json-input')?.addEventListener('change', (e) => { if (e.target.files.length) Backup.import(e.target.files[0]); e.target.value = ''; });
            document.getElementById('btn-reset')?.addEventListener('click', () => {
                Confirm.show('This permanently deletes all your data on this device. This cannot be undone.', () => { Store.clear(); UI.refresh(); Toast.show('All data cleared'); });
            });
        }
    };

    // ==================== INIT ====================
    function init() {
        UI.init();
        Background3D.init();
        Anim.init();
        Keyboard.init();
        if (document.readyState === 'complete') setTimeout(() => Loader.hide(), 500);
        else addEventListener('load', () => setTimeout(() => Loader.hide(), 350));
        setTimeout(() => Loader.hide(), 2500); // safety net
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // expose for debugging/QA
    window.WLTH = { Store, Calc, UI, Demo, Classifier, Modal, Upload };
})();
