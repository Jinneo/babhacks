https://x.com/BagBalancer

# BagBalencer

BagBalencer turns a user’s goals and selected coins into a researched, diversified crypto portfolio with a protected AUSD reserve.

It is a testnet demo. Recommendations are educational, and nothing moves without wallet approval.

## What It Does

- Collects the user’s goals, time horizon, risk tolerance, and portfolio limits
- Researches selected assets using current market data and cited sources
- Builds a diversified allocation from a searchable library of 50 coins
- Keeps a user-defined portion of the portfolio in AUSD
- Shows risk, confidence, market scenarios, and a portfolio chart
- Uses x402 for an optional test-AUSD research payment on Base Sepolia
- Previews an allowlisted AUSD/CTK rebalance on Ethereum Sepolia

## Run Locally

```sh
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

Connect a browser wallet on Ethereum Sepolia. You will need Sepolia ETH for gas and test AUSD or CTK for the rebalance demo.

## Live Research

Add the local research agent to `.env`:

```dotenv
RESEARCH_AGENT_BIN=/absolute/path/to/local-research-agent
```

Each submission creates a portfolio proposal only. Research cannot move assets from the user’s wallet.

## x402 Payment

When enabled, clicking “Research + balance my bag” processes a payment of 0.10 test AUSD on Base Sepolia before beginning the research.

The payment is signed by the user’s wallet, settled by the local relayer, and displayed with an onchain transaction receipt.

Configure the relayer in `.env`:

```dotenv
BASE_SEPOLIA_RPC=https://sepolia.base.org
RELAYER_PRIVATE_KEY=0x...
```

The relayer needs Base Sepolia ETH for gas. The connected wallet needs Base Sepolia test AUSD.

If x402 is not configured, research still works and the interface displays “x402-ready” instead of claiming that a payment occurred.

## Safety

- Portfolio trades require explicit wallet approval
- Execution is restricted to the configured AUSD/CTK pair
- Reserve, spending, concentration, drift, and slippage limits are enforced
- Portfolio proposals cannot execute payments or trades
- Success is displayed only after a confirmed onchain receipt

## Test and Build

```sh
npm test
npm run build
```

The original AUSD transfer playground is available at:

```text
/transfer.html
```

## Links

BagBalancer on X:  
https://x.com/BagBalancer

Agora contract deployments:  
https://docs.agora.finance/developer/contract-deployments

Agora testnet token guide:  
https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens
