const PLAN_DEFINITIONS = Object.freeze({
  begin: Object.freeze({
    key: 'begin',
    name: 'Begin',
    wolfGuide: false,
    features: ['4 classes each month', 'Member resource library', 'Monthly progress check-in'],
  }),
  train: Object.freeze({
    key: 'train',
    name: 'Train',
    wolfGuide: true,
    features: ['Unlimited group classes', 'Member resource library', 'Workshop discounts', 'Wolf Guide access'],
  }),
  integrate: Object.freeze({
    key: 'integrate',
    name: 'Integrate',
    wolfGuide: true,
    features: ['Unlimited group classes', 'One private session each month', 'Personal practice plan', 'Wolf Guide access'],
  }),
});

const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);

function getPlanDefinition(planKey) {
  return PLAN_DEFINITIONS[String(planKey || '').trim().toLowerCase()] || null;
}

function buildPriceMap({ beginPriceId, trainPriceId, integratePriceId }) {
  return {
    begin: beginPriceId,
    train: trainPriceId,
    integrate: integratePriceId,
  };
}

function getPlanForPriceId(priceId, priceMap) {
  const match = Object.entries(priceMap).find(([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId);
  return match ? getPlanDefinition(match[0]) : null;
}

module.exports = {
  PLAN_DEFINITIONS,
  LIVE_MEMBERSHIP_STATUSES,
  getPlanDefinition,
  buildPriceMap,
  getPlanForPriceId,
};
