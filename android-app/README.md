# FinanceTracker Android App

Native Android app built with Capacitor, wrapping the FinanceTracker web application.

## Directory Structure

```
android-app/
├── QA/                 # QA environment (testing)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── UAT/                # UAT environment (pre-production)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── www/                # Build output (served by Capacitor)
├── android/            # Native Android project (generated)
├── package.json
├── capacitor.config.json
└── README.md
```

## Prerequisites

- Node.js 18+
- Android Studio (Arctic Fox or later)
- Android SDK (API level 22+)
- Java 17+

## Setup

```bash
# Install dependencies
npm install

# Initialize Capacitor (first time only)
npm run cap:init

# Add Android platform
npm run cap:add:android
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

### Debug APK
```bash
cd android
./gradlew assembleDebug
# APK at: android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK/AAB
```bash
cd android
./gradlew assembleRelease
# or for App Bundle:
./gradlew bundleRelease
```

### Signing
1. Generate keystore: `keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias financetracker`
2. Configure signing in `android/app/build.gradle`
3. Build signed release

## Features

- Expense tracking with categories
- Debt management and payoff projections
- Investment portfolio tracking
- Financial health dashboard
- CSV/Excel import
- Offline support (localStorage)
- Currency selection

## Play Store Guidelines

- No backend required (all data stored locally)
- Privacy-friendly (no data leaves device)
- Requires Android 5.1+ (API 22)
- Target SDK: 34 (Android 14)
