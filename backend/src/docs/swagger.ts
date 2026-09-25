export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "ADSToken v2.0 - Staking & Ecosystem API",
    version: "2.0.0",
    description:
      "REST API Service for Adsvilla Mobile App and Web Staking dApp. Implements Whitepaper v2.0 parameters: ADS Staking (0.2%-1.0%), USDT Staking (1% daily with 2x/2.5x/3x caps), 3% base withdrawal tax, 3-level referrals (10%/3%/2%), and Community Tiers (V1-V6 differential bonuses).",
  },
  servers: [
    {
      url: "http://localhost:5000/api",
      description: "Local Development Server",
    },
  ],
  paths: {
    "/staking/plans": {
      get: {
        summary: "Get all Staking Plans (ADS & USDT)",
        description: "Returns plan durations, daily reward percentages, and USDT return caps.",
        responses: {
          200: {
            description: "Success",
          },
        },
      },
    },
    "/user/connect": {
      post: {
        summary: "Connect user wallet and bind optional referrer",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  address: { type: "string", example: "0x71C...3a9" },
                  referrer: { type: "string", example: "0x89D...1b2" },
                },
                required: ["address"],
              },
            },
          },
        },
        responses: {
          200: { description: "User record returned" },
        },
      },
    },
    "/user/{address}/dashboard": {
      get: {
        summary: "Get complete user staking dashboard",
        parameters: [
          {
            name: "address",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "User stakes, rewards, participant status, and tier" },
        },
      },
    },
    "/stake-ads": {
      post: {
        summary: "Stake ADS tokens",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  amount: { type: "number", example: 1000 },
                  periodDays: { type: "number", example: 360 },
                  referrer: { type: "string" },
                },
                required: ["address", "amount", "periodDays"],
              },
            },
          },
        },
        responses: { 200: { description: "Stake created successfully" } },
      },
    },
    "/stake-usdt": {
      post: {
        summary: "Stake USDT tokens (Module 2)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  amountUsdt: { type: "number", example: 500 },
                  referrer: { type: "string" },
                },
                required: ["address", "amountUsdt"],
              },
            },
          },
        },
        responses: { 200: { description: "USDT Stake created with automatic cap assignment" } },
      },
    },
    "/withdraw": {
      post: {
        summary: "Withdraw earnings or matured principal",
        description: "Applies 3% base sell tax routed to the Ecosystem Treasury as specified in Whitepaper Section 7.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  token: { type: "string", enum: ["ADS", "USDT"] },
                  amount: { type: "number", example: 100 },
                },
                required: ["address", "token", "amount"],
              },
            },
          },
        },
        responses: { 200: { description: "Withdrawal processed (gross, 3% tax, net amount)" } },
      },
    },
    "/referrals/{address}": {
      get: {
        summary: "Get user's 3-level referral network and commissions",
        parameters: [
          {
            name: "address",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "Direct referrals, team stats, and L1/L2/L3 commissions" } },
      },
    },
    "/tiers/{address}": {
      get: {
        summary: "Get Community Tier (V1-V6) and differential bonus info",
        parameters: [
          {
            name: "address",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "Tier rank, weak-leg volume, and differential earnings" } },
      },
    },
    "/stats/ecosystem": {
      get: {
        summary: "Get global ecosystem and treasury statistics",
        responses: { 200: { description: "Total staked ADS/USDT, total burn, treasury balances" } },
      },
    },
    "/admin/trigger-daily-distribution": {
      post: {
        summary: "Manual trigger for 0:01 AM UTC daily ROI distribution",
        description: "Executes the daily reward calculation immediately for testing and verification.",
        responses: { 200: { description: "Distribution results summary" } },
      },
    },
  },
};
