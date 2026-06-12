export type FeeBreakdown = {
  dexFeeAda: number;
  batcherFeeAda: number;
  networkFeeAda: number;
  aggregatorFeeAda: number;
  minAdaRequirement: number;
};

export function totalFeesAda(fees: FeeBreakdown): number {
  return (
    fees.dexFeeAda +
    fees.batcherFeeAda +
    fees.networkFeeAda +
    fees.aggregatorFeeAda +
    fees.minAdaRequirement
  );
}
