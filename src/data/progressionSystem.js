import progressionSystemData from '../../functions/config/progressionSystem.json';

export const progressionLevels = progressionSystemData.levels;
export const progressionCategories = progressionSystemData.categories;

const legacyLevelAliases = {
    brown: 'green',
    gray: 'blue',
};

export const progressionLevelMap = Object.fromEntries([
    ...progressionLevels.map((level) => [level.key, level]),
    ...Object.entries(legacyLevelAliases).map(([legacyKey, levelKey]) => [
        legacyKey,
        progressionLevels.find((level) => level.key === levelKey),
    ]),
]);

export const progressionCategoryMap = Object.fromEntries(
    progressionCategories.map((category) => [category.key, category]),
);

export const categoryStatusLabels = {
    locked: 'Locked',
    not_started: 'Not started',
    in_practice: 'In practice',
    submitted: 'Submitted',
    validated: 'Validated',
    needs_work: 'Needs work',
};

export const levelStatusLabels = {
    locked: 'Locked',
    active: 'Active',
    draft: 'In progress',
    submitted: 'Submitted',
    in_review: 'In review',
    needs_work: 'Needs work',
    ready_for_approval: 'Ready for approval',
    approved: 'Approved',
};

export function makeRequirementRef(levelKey, categoryKey, index) {
    return `${levelKey}:${categoryKey}:${index + 1}`;
}

export function getRequirementByRef(reference) {
    const [levelKey, categoryKey, rawIndex] = String(reference || '').split(':');
    const level = progressionLevelMap[levelKey];
    const category = progressionCategoryMap[categoryKey];
    const index = Number(rawIndex) - 1;
    const text = level?.categories?.[categoryKey]?.items?.[index];
    if (!level || !category || !text) return null;
    return {
        reference,
        levelKey: level.key,
        levelLabel: level.label,
        categoryKey,
        categoryLabel: category.label,
        text,
    };
}

export function getRequirementOptions(levelKeys = [], categoryKeys = []) {
    const levels = levelKeys.length ? levelKeys : progressionLevels.map((level) => level.key);
    const categories = categoryKeys.length
        ? categoryKeys
        : progressionCategories.map((category) => category.key);
    const options = [];

    for (const requestedLevelKey of levels) {
        const level = progressionLevelMap[requestedLevelKey];
        if (!level) continue;
        for (const categoryKey of categories) {
            const category = progressionCategoryMap[categoryKey];
            const items = level.categories?.[categoryKey]?.items || [];
            items.forEach((text, index) => {
                options.push({
                    reference: makeRequirementRef(level.key, categoryKey, index),
                    levelKey: level.key,
                    levelLabel: level.label,
                    categoryKey,
                    categoryLabel: category?.label || categoryKey,
                    text,
                });
            });
        }
    }

    return options;
}
