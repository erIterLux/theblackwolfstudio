const data = require('./progressionSystem.json');

const LEVELS = data.levels;
const CATEGORIES = data.categories;
const LEVEL_MAP = new Map(LEVELS.map((level) => [level.key, level]));
const CATEGORY_MAP = new Map(CATEGORIES.map((category) => [category.key, category]));

function getLevel(levelKey) {
  return LEVEL_MAP.get(String(levelKey || '').trim()) || null;
}

function getCategory(categoryKey) {
  return CATEGORY_MAP.get(String(categoryKey || '').trim()) || null;
}

function getNextLevel(levelKey) {
  const level = getLevel(levelKey);
  if (!level) return null;
  return LEVELS.find((candidate) => candidate.order === level.order + 1) || null;
}

function buildProgressionAiContext() {
  const lines = [
    'The Black Wolf Studio progression has four sequential levels: White Wolf, Brown Wolf, Gray Wolf, and Black Wolf.',
    'Every level includes seven categories: Striking, Movement, Situational Awareness, Breath Control, Grappling, Ground, and Weapons.',
    'Members may upload evidence and reflect on practice, but only an authorized instructor can validate a category or approve a level.',
    'Do not tell a member that they have passed, earned, or completed a level. You may explain requirements and suggest low-risk practice questions for an instructor.',
    'Weapons guidance must remain risk-first and high-level: avoidance, distance, barriers, escape, communication, and emergency help. Do not provide weapon-disarm instructions.',
  ];

  for (const level of LEVELS) {
    lines.push(`\n${level.label} — ${level.theme}: ${level.description}`);
    for (const category of CATEGORIES) {
      const requirement = level.categories[category.key];
      lines.push(`${category.label}: ${requirement.summary}`);
      requirement.items.forEach((item) => lines.push(`- ${item}`));
    }
  }

  return lines.join('\n');
}

module.exports = {
  LEVELS,
  CATEGORIES,
  getLevel,
  getCategory,
  getNextLevel,
  buildProgressionAiContext,
};
