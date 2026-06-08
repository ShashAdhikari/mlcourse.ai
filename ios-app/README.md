# FinanceTracker iOS App

Native iOS app built with Capacitor, wrapping the FinanceTracker web application.

## Directory Structure

```
ios-app/
├── QA/                 # QA environment (testing)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── UAT/                # UAT environment (pre-production)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── www/                # Build output (served by Capacitor)
├── ios/                # Native iOS project (generated)
├── package.json
├── capacitor.config.json
└── README.md
```

## Prerequisites

- Node.js 18+
- Xcode 14+ (macOS only)
- CocoaPods (`sudo gem install cocoapods`)

## Setup

```bash
# Install dependencies
npm install

# Initialize Capacitor (first time only)
npm run cap:init

# Add iOS platform
npm run cap:add:ios

# Install iOS dependencies
cd ios/App && pod install && cd ../..
```

## Development Workflow

### Deploy QA Build
```bash
npm run deploy:qa
npm run cap:open
```

### Deploy UAT Build
```bash
npm run deploy:uat
npm run cap:open
```

### Sync Changes
After modifying web files in QA/ or UAT/:
```bash
npm run cap:sync
```

## Building for Release

1. Open Xcode: `npm run cap:open`
2. Select your Team in Signing & Capabilities
3. Product > Archive
4. Distribute App > App Store Connect

## Features

- Expense tracking with categories
- Debt management and payoff projections
- Investment portfolio tracking
- Financial health dashboard
- CSV/Excel import
- Offline support (localStorage)
- Currency selection

## App Store Guidelines

- No backend required (all data stored locally)
- Privacy-friendly (no data leaves device)
- Requires iOS 13.0+
