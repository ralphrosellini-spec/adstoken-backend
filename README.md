# ADSToken (ADS) v2.0 & Staking Ecosystem

> **Whitepaper v2.0 Implementation for the Adsvilla Ecosystem**  
> Fixed Supply BEP-20 • DEX Price Discovery • Two-Module Staking • 3-Level Referrals • Community Tiers (V1-V6) • Participant-Protected Trading Safeguards

---

## 📌 Executive Summary: Answering Your Client's Request

### Why did the client ask for a "URL or API for their own app"?

The client already owns **Adsvilla** (a Get-Paid-To mobile & web platform where users earn from ads, video rewards, and surveys). They want to connect their existing app to the new **ADSToken (ADS)** economy.

Depending on how their app is built, they have two standard choices:

1. **The "URL" (The Staking dApp Web Application):**
   - Located in `/frontend`.
   - Hosted at a live URL (e.g. `https://staking.adsvilla.com`).
   - Their mobile app simply puts a button: **"Staking Portal"** or **"Earn ADS"** that opens this URL inside an in-app WebView or in MetaMask/Trust Wallet browser (as pictured in **Page 6, 7 & 8** of the whitepaper).
   - Handles wallet connection, ADS staking plans, USDT entry (1% daily with 2x/2.5x/3x caps), daily reward claiming (with 3% fee deduction), and referral links.

2. **The "API" (The Backend REST API Service):**
   - Located in `/backend`.
   - Running at `http://your-server-ip:5000/api` with interactive Swagger docs at `/api/docs`.
   - If their mobile app wants to show user staking balances, daily earnings, or team commissions natively in Kotlin/Swift/Flutter screens without opening a webview, their mobile app calls these REST API endpoints directly.
   - Includes the automated **0:01 AM UTC cron job** for daily ROI crediting and 3-tier referral calculations.

---

## 🏗 Repository Structure

```
ADSToken2.0/
├── contracts/               # Solidity Smart Contracts (Hardhat)
│   ├── contracts/
│   │   ├── ADSToken.sol     # Fixed 1B supply, 3% sell tax to treasury, 24h sell limits
│   │   ├── ADSStakingVault.sol # Module 1 (ADS), Module 2 (USDT), 3% fee, Participant checks
│   │   ├── MockUSDT.sol     # BEP-20 USDT mock for testing
│   │   └── IBEP20.sol
│   ├── scripts/deploy.js    # Automated deployment to BSC Testnet / Mainnet
│   └── test/                # Comprehensive unit tests
│
├── backend/                 # Node.js + Express + TypeScript REST API Engine
│   ├── src/
│   │   ├── controllers/     # Staking, user, withdrawal, referral handlers
│   │   ├── services/
│   │   │   ├── cron.service.ts     # 0:01 AM UTC daily reward distribution
│   │   │   ├── staking.service.ts  # ADS & USDT staking logic, 3% tax
│   │   │   ├── referral.service.ts # L1 10%, L2 3%, L3 2% calculations
│   │   │   ├── tier.service.ts     # Community Tiers (V1-V6) & weak-leg differential
│   │   │   └── db.service.ts       # Zero-config persistent database
│   │   ├── docs/swagger.ts  # Interactive Swagger API spec (/api/docs)
│   │   └── server.ts
│   └── package.json
│
└── frontend/                # Web3 Staking dApp ("The Staking URL")
    ├── src/
    │   ├── App.tsx          # Complete UI for Module 1, Module 2, Dashboard, Referrals, Tiers
    │   └── main.tsx
    ├── tailwind.config.js
    └── package.json
```

---

## 🚀 Quick Start Guide

### 1. Run the Smart Contracts (Compile & Test)
```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test
```

### 2. Run the Backend REST API Server (The "API")
```bash
cd backend
npm install
npm run dev
```
- **API Server:** `http://localhost:5000`
- **Interactive Swagger Docs:** `http://localhost:5000/api/docs`
- **Health Check:** `http://localhost:5000/api/health`

### 3. Run the Staking dApp Web Application (The "URL")
```bash
cd frontend
npm install
npm run dev
```
- Open browser at: `http://localhost:3000` (or host it at `https://staking.adsvilla.com`)

---

## 📊 Whitepaper v2.0 Key Modules Implemented

### 1. Tokenomics (Section 2 & 3)
- **Max Supply:** 1,000,000,000 ADS (Fixed, no post-launch minting)
- **Base Sell Tax:** 3% routed to Ecosystem Treasury
- **Network:** BNB Smart Chain (BEP-20)

### 2. Module 1: ADS Staking (Section 5, Page 6)
- **Flexible:** 0.20% Daily
- **30 Days:** 0.40% Daily
- **90 Days:** 0.60% Daily
- **180 Days:** 0.80% Daily
- **360 Days:** 1.00% Daily
- Capital returned 100% in ADS tokens upon maturity.
- Rewards credited daily at **0:01 AM UTC**.

### 3. Module 2: USDT Staking Entry (Section 5, Page 7)
- **Target Daily ROI:** 1% Daily
- **Multiplier Capping:**
  - $10 - $999: **2.0X** (reaches cap in 200 days)
  - $1,000 - $4,999: **2.5X** (reaches cap in 250 days)
  - $5,000+: **3.0X** (reaches cap in 300 days)
- **Capital Flow:** 80% to Buy ADS and burn, 20% to liquidity support.

### 4. 3-Level Referral Commission (Section 5, Page 9)
- **Level 1 (Direct): 10%** (Condition: Sponsor personal stake ≥ $100, referral volume ≥ $100)
- **Level 2: 3%** (Condition: ≥ 2 active referrals, team volume ≥ $500)
- **Level 3: 2%** (Condition: ≥ 3 active referrals, team volume ≥ $1,000)

### 5. Community Tier System (Page 9-10)
$$\text{Differential Bonus} = \text{Eligible Team Volume} \times (\text{Your Tier \%} - \text{Downline's Tier \%})$$
- **V1:** 100U Stake / 5,000U Weak-Leg → 10%
- **V2:** 500U Stake / 20,000U Weak-Leg → 20%
- **V3:** 1,000U Stake / 50,000U Weak-Leg → 30%
- **V4:** 3,000U Stake / 150,000U Weak-Leg → 35%
- **V5:** 5,000U Stake / 500,000U Weak-Leg → 45%
- **V6:** 10,000U Stake / 2,000,000U Weak-Leg → 55%

### 6. Participant-Protected Trading Safeguards (Section 10 & 11)
- **Participant:** Staked ≥ 50% for ≥ 7 days → allowed up to **10% rolling 24h sell limit**.
- **Non-Participant:** Allowed up to **3% rolling 24h sell limit**.
- **Pool Ceiling:** Any sell must be $\le 0.5\%$ of DEX LP ADS reserve.
