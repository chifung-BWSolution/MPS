const BID_STRATEGY_LABELS: Record<string, string> = {
  MANUAL_CPC: 'Manual CPC',
  MANUAL_CPM: 'Manual CPM',
  MANUAL_CPV: 'Manual CPV',
  MANUAL_CPA: 'Manual CPA',
  ENHANCED_CPC: 'Enhanced CPC',
  TARGET_CPA: 'Target CPA',
  TARGET_ROAS: 'Target ROAS',
  TARGET_SPEND: 'Maximize clicks',
  TARGET_IMPRESSION_SHARE: 'Target impression share',
  MAXIMIZE_CONVERSIONS: 'Maximize conversions',
  MAXIMIZE_CONVERSION_VALUE: 'Maximize conversion value',
  MAXIMIZE_CLICKS: 'Maximize clicks',
  TARGET_CPM: 'Target CPM',
  TARGET_CPV: 'Target CPV',
  COMMISSION: 'Commission',
  PERCENT_CPC: 'Percent CPC',
  LOWEST_COST_WITHOUT_CAP: 'Lowest cost',
  LOWEST_COST_WITH_BID_CAP: 'Bid cap',
  COST_CAP: 'Cost cap',
  LOWEST_COST_WITH_MIN_ROAS: 'Minimum ROAS',
};

export function formatBidStrategy(raw?: string | null): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  return BID_STRATEGY_LABELS[value] ?? value.replace(/_/g, ' ');
}
