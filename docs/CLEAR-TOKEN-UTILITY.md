# CLEAR Token Utility Draft

**Date**: June 12, 2026  
**Status**: Working draft for discussion  
**Product context**: ClearRoute Cardano DEX aggregator

---

## Executive Summary

`CLEAR` should not be designed as a simple swap-reward token. That model is easy
to farm, hard to defend, and weak once emissions slow down.

The stronger model is:

> `CLEAR` is the economic coordination layer for trusted Cardano order flow.

ClearRoute creates value by aggregating demand, finding competitive execution,
and directing user flow toward liquidity venues. `CLEAR` should capture and
coordinate that value across traders, DEXs, solvers, market makers, wallets,
integrators, token projects, and the protocol itself.

The token should answer five questions clearly:

1. Why does a trader want it?
2. Why does a DEX or liquidity venue need it?
3. Why does a solver or market maker need it?
4. Why does a wallet or integrator need it?
5. Why does supply leave circulation?

If those answers are strong, `CLEAR` becomes more than an incentive token. It
becomes the access, accountability, and retention layer for Cardano liquidity.

---

## Core Thesis

ClearRoute should reward useful flow, not raw volume.

Users should still receive competitive execution first. Token rewards must never
silently justify worse swaps. `CLEAR` incentives should sit on top of best
execution, not replace it.

The key principle:

> A user earns because they contribute valuable, real, high-quality activity to
> the network. A venue earns flow because it performs well. A solver earns
> allocation because it settles reliably. An integrator earns upside because it
> sends clean, retained users.

This turns `CLEAR` into a token backed by network utility instead of pure
emissions.

---

## System Layers

### 1. CLEAR

The liquid utility token.

Potential uses:

- Pay platform, campaign, API, or premium feature fees
- Fund liquidity and user acquisition campaigns
- Bond liquidity venues, solvers, and market makers
- Access ecosystem programs
- Participate in governance when governance is mature
- Serve as the asset bought, burned, locked, or reserved by protocol activity

### 2. stCLEAR

The locked or staked version of `CLEAR`.

Potential uses:

- User fee tiers
- Rebate multipliers
- Campaign boosts
- Slippage protection tiers
- Solver and venue bonding
- API access and higher rate limits
- Integrator commercial rights
- Governance weight
- Long-term alignment

### 3. Clear Score

A non-transferable reputation score.

Clear Score should track useful behavior without becoming a directly tradable
asset. It is the anti-farming layer.

Potential signals:

- Real swap activity
- Execution-safe route usage
- Repeat usage over time
- Retained referred users
- Non-circular trading behavior
- Route reliability contribution
- Campaign participation quality
- Wallet or integrator flow quality
- Venue or solver performance history

Clear Score can unlock claims, boosts, access tiers, and reputation benefits,
but it should not be directly sellable.

---

## Participant Utility

### Traders

Traders want `CLEAR` because it makes using ClearRoute economically better
without sacrificing execution quality.

Trader utility:

- Earn rewards from qualified swaps
- Receive swap rebates or cashback
- Unlock lower aggregator fees
- Access higher reward tiers
- Receive boosted campaign rewards
- Qualify for slippage protection or execution insurance
- Access advanced routing features
- Build Clear Score for better long-term benefits
- Stake `CLEAR` for larger rebates and better tiers

Trader value proposition:

> If a user already trades on Cardano, ClearRoute gives them competitive
> execution plus additional value.

### DEXs And Liquidity Venues

DEXs and liquidity venues need `CLEAR` because it gives them accountable access
to order flow.

Venue utility:

- Bond `CLEAR` to qualify for preferred flow
- Sponsor liquidity campaigns
- Improve campaign visibility inside the aggregator
- Compete for routed flow based on performance
- Signal reliability, depth, and settlement quality
- Access analytics on campaign and route performance

Important constraint:

> A venue cannot buy bad routing. It can only earn more flow when its execution
> is competitive.

Venue ranking should account for:

- Quote competitiveness
- Net user output after fees
- Settlement success
- Slippage accuracy
- Liquidity depth
- Transaction failure rate
- Quote freshness
- Latency
- User outcome quality

### Solvers And Market Makers

Solvers and market makers need `CLEAR` because it lets them compete for
intent-based or RFQ-style order flow.

Solver utility:

- Bond `CLEAR` to access intent flow
- Submit private or competitive quotes
- Earn more allocation through strong performance
- Build a solver reputation history
- Participate in advanced routing modes
- Backstop failed fills with bonded collateral

Poor performance should reduce ranking. Severe failures should trigger bond
penalties.

### Wallets And Integrators

Wallets and integrators need `CLEAR` because it unlocks routing infrastructure,
campaign inventory, and commercial upside.

Integrator utility:

- Stake `CLEAR` for API access
- Unlock higher rate limits
- Access white-label swap routing
- Receive better commercial terms
- Participate in sponsored campaigns
- Earn from retained, qualified flow
- Access route, campaign, and user-quality analytics
- Offer users native reward programs powered by ClearRoute

Integrator value proposition:

> A wallet can offer better swaps, user incentives, and monetization without
> building its own routing marketplace.

### Token Projects

Projects need `CLEAR` because it gives them qualified distribution and liquidity
acquisition.

Project utility:

- Spend `CLEAR` to sponsor swap campaigns
- Boost rewards for trades involving their token
- Access launch or liquidity programs
- Pay for featured campaign placement
- Reach active Cardano traders
- Measure campaign quality and retention
- Incentivize real usage instead of artificial volume

Important distinction:

> Projects are not paying for artificial volume. They are paying for
> execution-safe user acquisition.

### Protocol

The protocol needs `CLEAR` because it can convert aggregator activity into a
durable economic loop.

Protocol utility:

- Capture fees from aggregation, API usage, campaigns, and premium features
- Fund user incentives without relying only on inflation
- Burn or reserve tokens from fee activity
- Require bonds from professional liquidity participants
- Penalize bad execution or failed settlement
- Fund a protection reserve
- Create long-term alignment among traders, venues, solvers, and integrators

---

## Qualified Flow

Raw volume is not enough. It rewards wash trading and extractive farming.

ClearRoute should calculate rewards using qualified flow:

```text
Qualified Flow =
  swap value
  x execution quality
  x retention
  x protocol revenue contribution
  x route reliability
  x organic behavior score
  x campaign weight
  - sybil penalties
  - wash trading penalties
  - circular routing penalties
  - failed execution penalties
```

This does not need to be fully decentralized on day one. It can begin as an
internal scoring model, then become more transparent as data, abuse patterns,
and governance maturity improve.

Reward logic should prefer:

- Repeated organic usage over one-time farming
- Competitive execution over sponsored routing
- Retained users over empty referrals
- Net protocol value over gross trade size
- Route reliability over inflated activity

---

## Bonded Best Execution

The strongest `CLEAR` mechanic is bonded best execution.

Any venue, solver, market maker, or professional liquidity participant that
wants privileged access to ClearRoute flow must bond `CLEAR`.

The bond creates accountability.

Performance metrics:

- Quote competitiveness
- Settlement success
- Slippage accuracy
- Fill reliability
- Failed transaction rate
- Liquidity depth
- Quote freshness
- Latency
- Abusive or toxic behavior
- User outcome quality

Outcomes:

- Strong performance earns more flow
- Weak performance earns less flow
- Failed settlement can reduce reputation
- Severe or repeated failures can trigger bond penalties
- Penalties can be burned, sent to treasury, or directed to a protection reserve

This makes `CLEAR` the collateral asset behind trusted routing.

---

## User Reward Design

Avoid direct emissions on every trade.

A better model:

```text
User swaps
-> user earns Clear Score
-> Clear Score qualifies the user for rewards
-> rewards unlock or vest over time
-> continued useful activity boosts future claims
```

Example claim structure:

- 30% immediately claimable
- 70% vested over 30 to 180 days
- Vesting boosts for continued organic trading
- Higher boosts for staking `CLEAR`
- Reduced claims for suspected sybil, circular, or extractive behavior

This creates:

- Usage
- Retention
- Holding pressure
- Lower farm-and-dump risk
- Better alignment with real users

---

## Demand And Supply Sinks

`CLEAR` demand should come from business activity, not only speculation.

### Demand Sources

- Traders staking for better fee and reward tiers
- Venues bonding for routing access
- Solvers bonding for intent execution
- Market makers bonding for RFQ access
- Wallets staking for API and commercial rights
- Integrators staking for campaign inventory
- Projects buying or spending `CLEAR` for campaigns
- Governance participants posting proposal bonds
- Protocol buying `CLEAR` using revenue

### Supply Sinks

- User staking
- Venue bonds
- Solver bonds
- Integrator staking
- Campaign payments
- CLEAR-paid platform fees
- API fees paid in `CLEAR`
- Premium analytics fees
- Proposal bonds
- Penalty burns
- Campaign fee burns
- Buyback-and-burn
- Buyback-and-reserve

System loop:

```text
More aggregator usage
-> more valuable order flow
-> venues, solvers, wallets, and projects need CLEAR
-> CLEAR is bought, spent, bonded, locked, or burned
-> users receive rewards for real contribution
-> reputation and access compound over time
```

---

## Revenue Model

Potential revenue sources:

- Aggregator fee on swaps
- API access fees
- Wallet or integrator fees
- Campaign marketplace fees
- Featured campaign placement
- Premium routing tools
- Analytics products
- Solver or venue access fees
- Partner launch programs

Potential revenue uses:

- User rebates
- Buyback-and-burn
- Buyback-and-reserve
- Treasury runway
- Protection reserve
- Integrator incentives
- Liquidity operations
- Ecosystem grants

Revenue design should avoid language that implies passive profit rights or
guaranteed yield. Utility should be framed around access, usage, discounts,
protection, bonding, and network participation.

---

## Protection Reserve

ClearRoute can differentiate itself by protecting users from execution failures
within defined limits.

The reserve could be funded by:

- Protocol revenue
- Campaign fees
- A portion of penalties
- Treasury allocation
- Optional insurance-style fees

Potential uses:

- Compensate users for eligible failed settlements
- Cover verified execution shortfalls
- Refund aggregator fees on poor outcomes
- Backstop specific premium tiers

This should be rule-based, capped, and transparent. It should not promise broad
coverage of all market losses.

---

## Campaign Marketplace

Campaigns are the B2B demand engine for `CLEAR`.

Projects, DEXs, and ecosystem partners can sponsor campaigns to attract users,
liquidity, or attention.

Campaign examples:

- Boosted rewards for swapping into a token
- New pool launch incentives
- Stablecoin route incentives
- Wallet partner campaigns
- Liquidity migration campaigns
- Ecosystem-wide trading events

Rules:

- Campaigns cannot override execution-quality constraints
- Sponsored routes must be disclosed
- Users should see when rewards are campaign-funded
- Wash activity should be excluded
- Campaigns should optimize for retained users and useful flow, not empty volume

Campaign fee handling:

- Part to user rewards
- Part to treasury
- Part burned or reserved
- Part to integrator or wallet partners when applicable

---

## Initial Supply Model

This is only a placeholder model for discussion.

Example capped supply: `1,000,000,000 CLEAR`

| Category | Allocation | Notes |
|---|---:|---|
| User and qualified-flow incentives | 40% | Released over multiple years, adjusted by quality and abuse controls |
| Ecosystem, campaigns, venues, integrators | 20% | Growth programs, partner campaigns, liquidity incentives |
| Treasury | 15% | Operations, reserves, grants, future strategic needs |
| Team | 15% | Long vesting, cliff, clear lockups |
| Liquidity | 5% | Initial and ongoing liquidity support |
| Strategic contributors/advisors | 5% | Vesting required |

Emission rule:

```text
Actual Emissions =
  min(scheduled emissions, revenue-supported cap, quality-adjusted cap)
```

This allows emissions to expand when the network is creating real value and
tighten when activity is low quality or extractive.

---

## Launch Sequence

Do not launch the token first.

Recommended sequence:

1. Launch or harden the aggregator product
2. Track route quality, swaps, retention, and wallet behavior
3. Introduce Clear Score as a points/reputation system
4. Run points-based campaigns without a token
5. Build partner campaign mechanics
6. Add integrator/API access programs
7. Score venues and routes publicly
8. Introduce bonded venue or solver access
9. Launch `CLEAR` only after utility demand is visible
10. Add staking, bonding, burns, and campaign marketplace mechanics
11. Add protection reserve
12. Add governance after the system has meaningful usage

This reduces regulatory, economic, and product risk. It also gives the team
real data before finalizing token parameters.

---

## Risks

### Farming Risk

If rewards are tied to volume alone, users will farm the system.

Mitigation:

- Clear Score
- Retention weighting
- Sybil detection
- Circular trading penalties
- Vesting
- Reward caps
- Campaign-specific quality rules

### Execution Quality Risk

If sponsored routing worsens user outcomes, the aggregator loses trust.

Mitigation:

- Best-execution guardrails
- Sponsored route disclosure
- Net-output ranking
- Route quality thresholds
- Venue performance scoring

### Regulatory Risk

If the token is marketed as passive yield, profit share, or investment upside,
the project creates avoidable risk.

Mitigation:

- Utility-first design
- Avoid yield promises
- Avoid revenue-share framing
- Use legal review before public launch
- Launch points before token
- Make participation active and usage-based

### Liquidity Risk

If emissions exceed organic demand, the token becomes sell pressure.

Mitigation:

- Revenue-supported emissions
- Bonding and staking requirements
- Campaign demand
- Buyback/burn or reserve policies
- Long vesting
- Quality-adjusted distribution

### Complexity Risk

The full model is powerful but complex.

Mitigation:

- Launch in phases
- Start with Clear Score
- Prove campaigns before token launch
- Add bonding only after venue performance data exists
- Keep user-facing rewards simple

---

## Open Questions

1. Should `CLEAR` have a capped supply or controlled inflation?
2. What percentage of aggregator revenue should go to burns, reserves, rebates,
   and treasury?
3. Should staking be single-sided, time-locked, or tier-based?
4. Should `stCLEAR` be transferable or non-transferable?
5. What metrics define competitive execution?
6. How much worse can a sponsored route be before it is disallowed?
7. Should venue bonds be mandatory for all partners or only preferred access?
8. Should penalties be burned, reserved, or paid to affected users?
9. How should Clear Score handle privacy and sybil resistance?
10. Should the protocol launch with user rewards first or campaign marketplace
    first?
11. What legal jurisdictions matter for the launch?
12. What parts of the model should be on-chain versus off-chain at launch?

---

## One-Line Positioning

`CLEAR` coordinates trusted Cardano order flow: traders earn value for real
usage, venues and solvers bond `CLEAR` to access flow, wallets stake it for
routing infrastructure, projects spend it for qualified liquidity campaigns,
and protocol activity locks or burns supply over time.

