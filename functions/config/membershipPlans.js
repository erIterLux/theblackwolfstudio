const PLAN_DEFINITIONS = Object.freeze({
    begin: Object.freeze({
        key: 'begin',
        name: 'Begin',
        wolfGuide: false,
        benefits: Object.freeze({
            progressionAccess: true,
            curriculumAccess: true,
            instructorReviews: false,
            wolfGuideAccess: false,
        }),
        discounts: Object.freeze({
            eventPercent: 5,
            privateTrainingPercent: 5,
        }),
        features: [
            'Progression tracking',
            'Member technique library',
            '5% member pricing on eligible events',
            '5% member pricing on eligible private training',
        ],
    }),
    train: Object.freeze({
        key: 'train',
        name: 'Train',
        wolfGuide: true,
        benefits: Object.freeze({
            progressionAccess: true,
            curriculumAccess: true,
            instructorReviews: true,
            wolfGuideAccess: true,
        }),
        discounts: Object.freeze({
            eventPercent: 10,
            privateTrainingPercent: 10,
        }),
        features: [
            'Full progression tracking',
            'Member technique library',
            'Instructor progression reviews',
            'Wolf Guide access',
            '10% member pricing on eligible events and private training',
        ],
    }),
    integrate: Object.freeze({
        key: 'integrate',
        name: 'Integrate',
        wolfGuide: true,
        benefits: Object.freeze({
            progressionAccess: true,
            curriculumAccess: true,
            instructorReviews: true,
            wolfGuideAccess: true,
        }),
        discounts: Object.freeze({
            eventPercent: 15,
            privateTrainingPercent: 15,
        }),
        features: [
            'Full progression tracking',
            'Member technique library',
            'Instructor progression reviews',
            'Wolf Guide access',
            '15% member pricing on eligible events and private training',
        ],
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
    const match = Object.entries(priceMap)
        .find(([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId);
    return match ? getPlanDefinition(match[0]) : null;
}

module.exports = {
    PLAN_DEFINITIONS,
    LIVE_MEMBERSHIP_STATUSES,
    getPlanDefinition,
    buildPriceMap,
    getPlanForPriceId,
};
