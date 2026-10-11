# Agora Portfolio Agent

Local portfolio rebalancing demo using AUSD on Base Sepolia. A deterministic agent calculates allocation drift, proposes category trades, enforces a buy budget, and requires approval before execution. Holdings and prices are imported or simulated; no real securities are bought or sold.

## Start

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. **Simulation mode works immediately**, with no wallet or keys. Load sample holdings or import a CSV with this header:

```csv
symbol,category,quantity,price
VTI,Stocks,30,250
BND,Bonds,20,75
AUSD,Cash,1000,1
```

Categories: Stocks, Bonds, Cash. Prices are supplied by the CSV, not a live market feed. Set targets totaling 100%, drift threshold, and maximum gross buy spend. Run the agent, review the plan, and approve execution. The sample sells 1,500 simulated stocks and buys 1,500 simulated bonds.

The original wallet transfer UI is at `/transfer.html`; use it to request faucet AUSD and fund wallets.

## Enable real testnet AUSD / x402

1. Copy `.env.example` to `.env`.
2. Create a **dedicated Base Sepolia test wallet** for the demo broker/relayer. Put its private key in `RELAYER_PRIVATE_KEY` locally. Never use a wallet holding real assets or commit this file.
3. Fund the broker wallet with Base Sepolia ETH for relayer gas and test AUSD for simulated sell payouts. Get ETH through the link in the transfer lab and request AUSD there with the broker account connected.
4. Fund your user wallet with test AUSD. For the sample plan it needs **1,500.15 AUSD**: gross buys plus 0.10 data fee and 0.05 execution fee.
5. Restart `npm run dev`, choose **Base Sepolia** mode, and connect your user wallet.
6. Run the agent. Sign a 0.10 AUSD authorization to access the demo snapshot. Approve execution and sign the 1,500.05 AUSD buy + execution authorization. The broker then returns 1,500 AUSD for simulated sells.

## Payment flow

The local server acts as both resource server and facilitator:

- `/api/quote` produces an HTTP 402 and base64 `PAYMENT-REQUIRED` header with x402 v2 exact EVM requirements.
- Client signs an ERC-3009 `TransferWithAuthorization` with EIP-712. Domain metadata is read and checked against the token's on-chain domain separator.
- Client retries `/api/paid/:id` with base64 `PAYMENT-SIGNATURE`.
- Server checks token, chain, recipient, exact amount, request nonce, authorization validity, signer, and simulates the call before settlement.
- Relayer submits the AUSD authorization, pays gas, waits for confirmation, and returns a `PAYMENT-RESPONSE` receipt.
- Simulated sells are paid back from the funded broker. Imported holdings update only after both transfers confirm.

Quotes are bound to server-generated nonces and retained in the ignored `.local/settlements.json` journal. Pending transaction hashes are saved to allow same-quote retries. Signed client requests are retained in sessionStorage for recovery after a page refresh. If settlement is pending, retry the same action. Use **Cancel unsubmitted quote** if you want to discard an authorization before broadcast or recover from an expired quote. The server refuses cancellation after a transaction has been submitted. Do not delete the broker journal while reconciling a pending transaction.

## Scope and limits

This is a local, single-user prototype. The agent is rule-based, not an LLM. The paid data endpoint serves a labeled demo snapshot using imported prices. There is no bank integration, live pricing, or actual brokerage integration. Simulated category holdings replace individual positions after a rebalance; total simulated portfolio value is preserved, and service fees are charged separately to the wallet.

The x402 implementation is a local subset following the exact EVM / ERC-3009 flow, not a certified third-party facilitator integration. It requires a funded test relayer. End-to-end on-chain settlement must be verified with your wallet. Do not expose this demo broker on a public host: imported simulated holdings determine sell payouts. Settlement and journal writes are not atomic; a process crash immediately after a broadcast can require manual reconciliation. Test tokens have no monetary value.

`npm run build` validates and produces both frontend pages. The API is development-only; `vite preview` does not run the payment server.

## Checks

```sh
npm test
npm run build
```

References: [Agora deployments](https://docs.agora.finance/developer/contract-deployments), [x402 exact EVM specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md).
