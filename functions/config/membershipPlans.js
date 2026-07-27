const PLAN_DEFINITIONS = Object.freeze({
    begin: Object.freeze({
        key: 'begin',
        name: 'Begin',
        wolfGuide: false,
        benefits: Object.freeze({
            progressionAccess: true,
            curriculumAccess: true,
            libraryAccessLevel: 'basic',
            instructorReviews: false,
            wolfGuideAccess: false,
            wolfGuideMessagesPerWeek: 0,
            wolfGuidePreviewMessages: 3,
            privateTrainingCreditsPerPeriod: 0,
            privateTrainingMaxParticipants: 0,
        }),
        discounts: Object.freeze({
            eventPercent: 5,
            privateTrainingPercent: 5,
            merchandisePercent: 5,
        }),
        features: [
            'Progression tracking',
            'Basic training library',
            '3-message Wolf Guide preview',
            '5% member pricing on eligible events, private training, and merchandise',
        ],
    }),
    train: Object.freeze({
        key: 'train',
        name: 'Train',
        wolfGuide: true,
        benefits: Object.freeze({
            progressionAccess: true,
            curriculumAccess: true,
            libraryAccessLevel: 'advanced',
            instructorReviews: true,
            wolfGuideAccess: true,
            wolfGuideMessagesPerWeek: 15,
            wolfGuidePreviewMessages: 0,
            privateTrainingCreditsPerPeriod: 0,
            privateTrainingMaxParticipants: 0,
        }),
        discounts: Object.freeze({
            eventPercent: 10,
            privateTrainingPercent: 10,
            merchandisePercent: 10,
        }),
        features: [
            'Full progression tracking',
            'Basic and advanced training library',
            'Instructor progression reviews',
            '15 Wolf Guide messages each week',
            '10% member pricing on eligible events, private training, and merchandise',
        ],
    }),
    integrate: Object.freeze({
        key: 'integrate',
        name: 'Integrate',
        wolfGuide: true,
        benefits: Object.freeze({
            progressionAccess: true,
            curriculumAccess: true,
            libraryAccessLevel: 'advanced',
            instructorReviews: true,
            wolfGuideAccess: true,
            wolfGuideMessagesPerWeek: 30,
            wolfGuidePreviewMessages: 0,
            privateTrainingCreditsPerPeriod: 1,
            privateTrainingMaxParticipants: 3,
        }),
        discounts: Object.freeze({
            eventPercent: 15,
            privateTrainingPercent: 15,
            merchandisePercent: 15,
        }),
        features: [
            'Full progression tracking',
            'Basic and advanced training library',
            'Instructor progression reviews',
            '30 Wolf Guide messages each week',
            '15% member pricing on eligible events, private training, and merchandise',
            '1 private lesson credit for up to 3 participants',
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
