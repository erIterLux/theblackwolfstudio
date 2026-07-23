export const progressionCategories = [
    { key: 'striking', label: 'Striking', description: 'Controlled striking mechanics, defense, range management, and responsible application.' },
    { key: 'movement', label: 'Movement', description: 'Balance, footwork, angles, posture recovery, and efficient movement under pressure.' },
    { key: 'situationalAwareness', label: 'Situational Awareness', description: 'Environmental scanning, boundary setting, de-escalation, and sound decisions before contact.' },
    { key: 'breathControl', label: 'Breath Control', description: 'Breathing and pacing skills that support steadiness, recovery, and deliberate action.' },
    { key: 'grappling', label: 'Grappling', description: 'Posture, framing, balance, grip awareness, and controlled positional problem-solving.' },
    { key: 'ground', label: 'Ground', description: 'Protection, movement, space creation, positional recovery, and a safe return to standing.' },
    { key: 'weapons', label: 'Weapons', description: 'Risk recognition, distance, barriers, escape priorities, and supervised scenario judgment.' },
];

const requirements = (summary, items) => ({ summary, items });

export const progressionLevels = [
    {
        key: 'white',
        label: 'White Wolf',
        shortLabel: 'White',
        order: 0,
        theme: 'Foundation',
        description: 'Build a calm, safe base. Demonstrate fundamental mechanics, awareness, and the ability to train with control.',
        categories: {
            striking: requirements('Demonstrate safe, repeatable striking fundamentals on approved training equipment.', [
                'Maintain a balanced stance and protective hand position before, during, and after a combination.',
                'Show controlled straight, palm, elbow, and knee mechanics at an instructor-approved intensity.',
                'Use a clear exhale with effort and recover posture after each strike.',
                'Demonstrate partner safety, target discipline, and immediate response to a stop command.',
            ]),
            movement: requirements('Move without crossing, collapsing posture, or losing visual awareness.', [
                'Step forward, backward, and laterally while preserving stance and balance.',
                'Pivot and change direction without turning away from the training partner.',
                'Recover a stable base after being lightly redirected or bumped.',
                'Move off a direct line and create a clear path toward an exit.',
            ]),
            situationalAwareness: requirements('Recognize early warning information and choose a safer option before physical engagement.', [
                'Identify exits, obstacles, bystanders, and changes in distance during a simple scenario.',
                'Use a clear verbal boundary and non-escalatory posture.',
                'Describe at least two pre-contact cues without assuming intent or escalating unnecessarily.',
                'Choose disengagement, assistance, or movement to safety when those options are available.',
            ]),
            breathControl: requirements('Use breath and orientation to stay present during foundational drills.', [
                'Avoid unnecessary breath-holding during movement and pad work.',
                'Use a comfortable exhale during effort without forced breath retention.',
                'Demonstrate a brief post-drill recovery practice using visual orientation and contact with the floor.',
                'Recognize and communicate when intensity should be reduced or paused.',
            ]),
            grappling: requirements('Establish safe posture and basic positional awareness at low resistance.', [
                'Demonstrate safe training etiquette, tapping, release, and partner communication.',
                'Use frames and posture to create space without cranking, striking, or forcing joints.',
                'Recognize common grips and maintain balance while seeking an exit.',
                'Complete a basic clinch-position recovery under cooperative resistance.',
            ]),
            ground: requirements('Protect yourself, orient, and return to standing without rushing.', [
                'Demonstrate safe falling mechanics on approved mats.',
                'Use a protected ground posture that keeps the head covered and the environment visible.',
                'Create enough space to move without exposing the head or turning away from the situation.',
                'Return to standing through an instructor-approved technical movement while maintaining awareness.',
            ]),
            weapons: requirements('Prioritize recognition, distance, barriers, escape, and help-seeking.', [
                'Identify a possible weapon early and immediately adjust distance and positioning.',
                'Use available barriers and exits rather than closing distance unnecessarily.',
                'State the studio priority order: avoid, disengage, escape, communicate, and seek emergency help.',
                'Complete a supervised awareness scenario without attempting an unsanctioned disarm.',
            ]),
        },
    },
    {
        key: 'brown',
        label: 'Brown Wolf',
        shortLabel: 'Brown',
        order: 1,
        theme: 'Integration',
        description: 'Connect fundamentals into fluid decisions. Maintain control while movement, uncertainty, and resistance increase.',
        categories: {
            striking: requirements('Blend striking, defense, movement, and disengagement at moderate intensity.', [
                'Link controlled combinations while changing angle and range.',
                'Demonstrate defense-to-counter transitions on pads without sacrificing posture.',
                'Scale power appropriately for the drill and partner.',
                'Finish combinations by regaining awareness and moving toward safety.',
            ]),
            movement: requirements('Use angles and transitions while pressure and environmental constraints increase.', [
                'Move around obstacles and confined spaces without losing balance.',
                'Change stance or direction while preserving defensive structure.',
                'Use angle changes to avoid being trapped against a wall or corner.',
                'Recover efficient movement after a short fatigue interval.',
            ]),
            situationalAwareness: requirements('Apply communication and positioning to more complex scenarios.', [
                'Use verbal de-escalation while maintaining distance and an exit path.',
                'Position safely when more than one person or obstacle is present.',
                'Distinguish between social conflict, boundary violations, and immediate danger.',
                'Explain the decision to leave, seek help, or intervene without unnecessary escalation.',
            ]),
            breathControl: requirements('Maintain usable breathing and recover deliberately during moderate stress.', [
                'Coordinate exhale with sustained combinations and movement.',
                'Recover to a steadier breathing rhythm within an instructor-defined interval after a round.',
                'Notice early signs of overactivation and choose an appropriate pacing adjustment.',
                'Use one low-risk regulation practice without disconnecting from situational awareness.',
            ]),
            grappling: requirements('Maintain posture and build exits under moderate, controlled resistance.', [
                'Preserve balance and head position during clinch movement.',
                'Use framing, grip-release principles, and angle changes to create an exit.',
                'Navigate a wall-based position without panic or unsafe force.',
                'Transition between two approved escape options when the first is unavailable.',
            ]),
            ground: requirements('Recover position and stand safely while a partner provides measured resistance.', [
                'Protect the head and maintain useful frames during positional pressure.',
                'Move from a compromised position toward a safer orientation.',
                'Create distance and stand without turning away from the partner.',
                'Recognize when remaining grounded is safer than standing immediately.',
            ]),
            weapons: requirements('Make disciplined choices in supervised weapon-awareness scenarios.', [
                'Use movement and barriers to increase time and distance.',
                'Choose escape or compliance appropriately within the rules of the scenario.',
                'Communicate clearly with bystanders or emergency services after disengagement.',
                'Explain why closing distance or attempting a disarm may increase risk.',
            ]),
        },
    },
    {
        key: 'gray',
        label: 'Gray Wolf',
        shortLabel: 'Gray',
        order: 2,
        theme: 'Adaptation',
        description: 'Adapt under pressure. Integrate technique, nervous-system awareness, judgment, and responsibility in changing conditions.',
        categories: {
            striking: requirements('Adapt striking choices to range, movement, fatigue, and a changing objective.', [
                'Transition between ranges while maintaining technical control.',
                'Use striking only long enough to create a safe opportunity to disengage.',
                'Demonstrate precision and restraint during unpredictable pad sequences.',
                'Coach a foundational striking drill with clear safety boundaries.',
            ]),
            movement: requirements('Move efficiently through non-patterned pressure and environmental complexity.', [
                'Maintain balance while navigating obstacles, changing surfaces, or limited space.',
                'Use layered footwork and angle changes against non-scripted pressure.',
                'Protect another person while still preserving an exit route.',
                'Demonstrate efficient movement after a demanding conditioning interval.',
            ]),
            situationalAwareness: requirements('Lead sound decision-making in layered scenarios.', [
                'Continuously reassess exits, bystanders, secondary risks, and changing behavior.',
                'Use proportionate communication and intervention choices.',
                'Demonstrate awareness of legal, ethical, and community consequences without giving legal advice.',
                'Complete an after-action reflection identifying what reduced or increased risk.',
            ]),
            breathControl: requirements('Regulate effectively across higher-intensity rounds without losing awareness.', [
                'Maintain functional breathing during sustained, non-patterned work.',
                'Select a regulation strategy that matches activation, fatigue, or shutdown cues.',
                'Return to useful orientation and communication after a stressful scenario.',
                'Support a partner with simple co-regulation cues while respecting consent.',
            ]),
            grappling: requirements('Chain positional solutions under meaningful but controlled resistance.', [
                'Transition between frames, posture, and movement when the first escape is blocked.',
                'Maintain control without relying on pain compliance or unsafe joint pressure.',
                'Recover from a disadvantaged clinch or wall position while preserving awareness.',
                'Explain the safety rationale behind the selected positional response.',
            ]),
            ground: requirements('Integrate positional recovery, disengagement, and awareness of secondary threats.', [
                'Move through multiple ground positions without sacrificing head protection.',
                'Choose between controlling space, disengaging, or standing based on the scenario.',
                'Stand under controlled pressure while monitoring the wider environment.',
                'Demonstrate safe partner care and immediate release when the drill ends.',
            ]),
            weapons: requirements('Use risk-first judgment in complex, supervised scenarios.', [
                'Recognize how distance, obstacles, additional people, and escape routes change the response.',
                'Demonstrate disciplined avoidance, barrier use, and movement to safety.',
                'Choose post-incident priorities including distance, communication, medical help, and emergency services.',
                'Explain the limitations of technique and why instructor-supervised practice is required.',
            ]),
        },
    },
    {
        key: 'black',
        label: 'Black Wolf',
        shortLabel: 'Black',
        order: 3,
        theme: 'Embodied leadership',
        description: 'Demonstrate durable skill, restraint, judgment, and the ability to help others train safely without replacing qualified instruction.',
        categories: {
            striking: requirements('Demonstrate adaptable, precise striking and safe leadership.', [
                'Maintain technical quality across changing ranges, intensity, and fatigue.',
                'Use the minimum necessary force within supervised scenarios and prioritize disengagement.',
                'Identify and correct common foundational errors without shaming the student.',
                'Lead a controlled striking drill with appropriate pacing and safety checks.',
            ]),
            movement: requirements('Move with economy and teach movement principles under uncertainty.', [
                'Demonstrate efficient positioning against changing pressure and environment.',
                'Protect balance and awareness while assisting another person.',
                'Adapt movement for different bodies, mobility needs, and training intensity.',
                'Assess movement quality and provide one clear, useful correction.',
            ]),
            situationalAwareness: requirements('Model ethical judgment, leadership, and reflective decision-making.', [
                'Lead a scenario briefing that centers avoidance, communication, proportionality, and escape.',
                'Identify when intervention would create more risk than seeking help.',
                'Track multiple variables without losing sight of the safest available outcome.',
                'Facilitate a non-shaming after-action review grounded in observable choices.',
            ]),
            breathControl: requirements('Use and teach low-risk regulation skills responsibly.', [
                'Maintain deliberate breathing and communication during demanding integrated rounds.',
                'Recognize when a member should pause, reduce intensity, or seek qualified support.',
                'Guide a brief, consent-based orientation or recovery practice without making medical claims.',
                'Demonstrate personal recovery habits that support sustainable training.',
            ]),
            grappling: requirements('Solve positional problems with control and coach safe practice.', [
                'Adapt framing, posture, and movement against varied partners and resistance.',
                'Maintain control while protecting both people from avoidable injury.',
                'Coach a positional drill with clear objectives, limits, and release conditions.',
                'Explain when disengagement is preferable to continued control.',
            ]),
            ground: requirements('Integrate ground recovery with judgment, restraint, and environmental awareness.', [
                'Demonstrate reliable recovery from multiple compromised positions.',
                'Return to standing or disengage based on the broader scenario rather than habit.',
                'Protect a training partner while applying realistic, controlled pressure.',
                'Teach a foundational ground-safety sequence with appropriate supervision.',
            ]),
            weapons: requirements('Demonstrate mature risk judgment and safe scenario leadership.', [
                'Lead weapon-awareness drills that prioritize avoidance, distance, barriers, escape, and help-seeking.',
                'Communicate the severe limits and uncertainty of any physical response to a weapon.',
                'Stop or redesign a drill when speed, intensity, or behavior becomes unsafe.',
                'Complete an instructor-led capstone scenario using restraint, judgment, and clear post-incident priorities.',
            ]),
        },
    },
];

export const progressionLevelMap = Object.fromEntries(progressionLevels.map((level) => [level.key, level]));
export const progressionCategoryMap = Object.fromEntries(progressionCategories.map((category) => [category.key, category]));

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
        levelKey,
        levelLabel: level.label,
        categoryKey,
        categoryLabel: category.label,
        text,
    };
}

export function getRequirementOptions(levelKeys = [], categoryKeys = []) {
    const levels = levelKeys.length ? levelKeys : progressionLevels.map((level) => level.key);
    const categories = categoryKeys.length ? categoryKeys : progressionCategories.map((category) => category.key);
    const options = [];

    for (const levelKey of levels) {
        const level = progressionLevelMap[levelKey];
        if (!level) continue;
        for (const categoryKey of categories) {
            const category = progressionCategoryMap[categoryKey];
            const items = level.categories?.[categoryKey]?.items || [];
            items.forEach((text, index) => {
                options.push({
                    reference: makeRequirementRef(levelKey, categoryKey, index),
                    levelKey,
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
