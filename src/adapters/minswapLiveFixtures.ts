import type { MinswapEstimateResponse } from "./minswapLiveAdapter";

export const minswapAdaSnekEstimateFixture: MinswapEstimateResponse = {
  token_in: "lovelace",
  token_out: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  amount_in: "1000",
  amount_out: "463906",
  min_amount_out: "461598",
  total_lp_fee: "10",
  total_dex_fee: "2",
  deposits: "2",
  avg_price_impact: 1.040666449917745,
  paths: [
    [
      {
        pool_id: "f5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4c.2ffadbb87144e875749122e0bbb9f535eeaa7f5660c6c4a91bcc4121e477f08d",
        protocol: "MinswapV2",
        token_in: "lovelace",
        token_out: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
        amount_in: "1000",
        amount_out: "463906",
        min_amount_out: "461598",
        lp_fee: "10",
        dex_fee: "2",
        deposits: "2",
        price_impact: 1.040666449917745,
      },
    ],
  ],
  amount_in_decimal: true,
};
