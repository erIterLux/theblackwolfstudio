const STUDIO_WAIVER_VERSION = '2026-07-BWS-NJ-1';

const STUDIO_WAIVER_TITLE = 'The Black Wolf Studio Participant Release and Waiver of Liability';

const STUDIO_WAIVER_BODY = `This PARTICIPANT RELEASE AND WAIVER OF LIABILITY (this “Release”) is executed on the date set forth below by the participant named below (“Participant” or “I”), or by the Participant’s parent or legal guardian if the Participant is a minor, in favor of The Black Wolf Studio and its owners, officers, employees, instructors, independent contractors, volunteers, agents, event hosts, and applicable venue owners (collectively, the “Studio”). By signing below, Participant agrees to the terms of this Release on Participant’s own behalf. If Participant is a minor, the parent or legal guardian signing below agrees to the terms of this Release on behalf of the minor Participant and in the signer’s individual capacity to the fullest extent permitted by law.

I understand that the activities may include, but are not limited to, observation; use of the Studio’s, event host’s, or venue’s facilities or equipment; martial arts instruction; practical self-defense training; striking, kicking, blocking, movement, partner drills, grappling, clinch work, falls, takedowns, ground training, scenario-based exercises, padded or inert training-weapon exercises, physical conditioning, breath-control practices, somatic practices, private training sessions, workshops, and participation in on-site or off-site programs or events affiliated with the Studio (collectively, the “Activities”).

In exchange for being allowed to participate in the Activities and for other good and valuable consideration, the receipt and sufficiency of which I acknowledge, I hereby freely, voluntarily, and without duress execute this Release and agree to the following terms:

1. Assumption of Risk.

I am aware and understand that the Activities may be dangerous and may expose me to a variety of foreseen and unforeseen hazards and risks, including the risk of serious injury, disability, death, disease, and/or property damage. I acknowledge that any injuries that I sustain may result from or be compounded by the actions, omissions, or negligence of the Studio, including negligent emergency response of the Studio. Notwithstanding the risk, I acknowledge that I am voluntarily participating in the Activities with knowledge of the danger involved and hereby agree to accept and assume any and all risks of injury, disability, death, disease, and/or property damage arising from the Activities, whether caused by the ordinary negligence of the Studio or otherwise.

2. Medical Treatment.

I hereby give consent and authority to the Studio to obtain medical treatment on my behalf if I am injured or require medical attention during my participation in the Activities. I understand and agree that I am solely responsible for all costs related to such medical treatment or medical transportation. I hereby release, forever discharge, indemnify and hold harmless the Studio from any claim whatsoever in connection with such treatment or other medical services. I accept the risk of exposure to COVID-19, the flu, and other transmittable illnesses that may come with participating in the Activities.

3. Release and Waiver.

I hereby fully and forever release and discharge the Studio from, and expressly waive, any and all liability, claims, and demands of whatever kind or nature, either in law or in equity, that may arise from my participation in the Activities. I agree not to make or bring any such claim or demand against the Studio, and fully and forever release and discharge the Studio from liability under such claims or demands.

I UNDERSTAND THAT THIS RELEASE DISCHARGES THE STUDIO FROM ANY LIABILITY OR CLAIM THAT I, MY NEXT OF KIN, HEIRS, EXECUTORS, ADMINISTRATORS, DEPENDENTS, BENEFICIARIES AND ASSIGNS MAY HAVE AGAINST THE STUDIO WITH RESPECT TO ANY BODILY INJURY, PERSONAL INJURY, ILLNESS, DEATH, PROPERTY DAMAGE, OR PROPERTY LOSS THAT MAY RESULT FROM THE ACTIVITIES, WHETHER CAUSED BY THE NEGLIGENCE OF THE STUDIO OR OTHERWISE.

4. Insurance.

I UNDERSTAND THAT THE STUDIO DOES NOT ASSUME ANY RESPONSIBILITY FOR OR OBLIGATION TO PROVIDE FINANCIAL ASSISTANCE OR OTHER ASSISTANCE, INCLUDING BUT NOT LIMITED TO MEDICAL, HEALTH, OR DISABILITY INSURANCE OF ANY NATURE IN THE EVENT OF MY INJURY, ILLNESS, OR DEATH, OR DAMAGE TO OR LOSS OF MY PROPERTY. I expressly waive any claim for compensation or liability on the part of the Studio in the event of any injury or medical expense.

5. Indemnification.

I hereby agree to indemnify, defend, and hold harmless the Studio from any and all liability, losses, damages, judgments, or expenses, including attorneys’ fees, the costs of enforcing any right to indemnification under this Release, and the cost of pursuing any insurance providers, arising out of or resulting from any claim of a third party related to my participation in the Activities, including any claim related to my own negligence or the ordinary negligence of the Studio.

6. Transportation Waiver.

If the Studio provides or organizes transportation related to the Activities, I understand there are special dangers and risks inherent not only in the Activities but in being transported by vehicle, including but not limited to, the risk of serious physical injury, death or other harmful consequences which may arise directly or indirectly from my participation in being transported by vehicle to and from the Activities. I assume all risk of injury, damage and harm which may arise from transportation to and from the Activities. I further agree to release and hold harmless the Studio and agree to waive any right of recovery that I may have to bring a claim or lawsuit for damages against the Studio for any personal injury, death or other harmful consequences occurring to me arising out of my being transported to and from the Activities. I grant full and voluntary consent to be transported to and from the Activities.

7. Miscellaneous.

I hereby agree that this Release represents the full understanding between the Studio and me and supersedes all other prior agreements, understandings, representations, and warranties, both written and oral, between us, with respect to the subject matter hereof. If any term or provision of this Release shall be held to be invalid by any court of competent jurisdiction, that term or provision shall be deemed modified so as to be valid and enforceable to the full extent permitted. The invalidity of any such term or provision shall not otherwise affect the validity or enforceability of the remaining terms and provisions. This Release is binding on and inures to the benefit of the Studio and me and our respective heirs, executors, administrators, legal representatives, successors, and permitted assigns. Section headings are for convenience of reference only and shall not define, modify, expand, or limit any of the terms of this Release.

8. Governing Law.

I further expressly agree that this waiver and agreement are intended to be as broad and inclusive as is permitted by the law of the State of New Jersey and that if any portion thereof is held invalid, it is agreed that the balance shall, notwithstanding, continue in full legal force and effect.

BY SIGNING BELOW, I ACKNOWLEDGE THAT I HAVE READ AND UNDERSTAND ALL OF THE TERMS OF THIS RELEASE AND THAT I AM VOLUNTARILY GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE THE STUDIO. I RECOGNIZE THAT IF I HAVE ANY QUESTIONS REGARDING MY WAIVER OF RIGHTS, I SHOULD CONSULT AN ATTORNEY.`;

const STUDIO_WAIVER_ACKNOWLEDGEMENT = 'BY SIGNING BELOW, I ACKNOWLEDGE THAT I HAVE READ AND UNDERSTAND ALL OF THE TERMS OF THIS RELEASE AND THAT I AM VOLUNTARILY GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE THE STUDIO.';

const STUDIO_WAIVER_MINOR_ACKNOWLEDGEMENT = 'I certify that I am the participant’s parent or legal guardian and am authorized to sign on the participant’s behalf. I have read and understand all of the terms of this Release, consent to the minor participant’s participation in the Activities, and agree to the Release on the minor participant’s behalf and in my individual capacity to the fullest extent permitted by law.';

function scopeStatement(scope, context = {}) {
  if (scope === 'membership') {
    return 'Membership scope: This signed record is the participant’s current Black Wolf Studio membership waiver. It applies to membership-based Studio Activities while this waiver version and the participant’s membership remain current, including eligible private training and events unless a separate event-specific waiver or addendum is required.';
  }
  if (scope === 'private_training') {
    return `Private-training scope: This signed record applies to ${context.participantName || 'the named participant'} for the private-training package “${context.title || 'Private training'}”${context.referenceId ? ` (package ${context.referenceId})` : ''} and the sessions used under that package.`;
  }
  return `Event scope: This signed record applies only to ${context.participantName || 'the named participant'} for “${context.title || 'the identified Studio event'}”${context.dateLabel ? ` on ${context.dateLabel}` : ''}.`;
}

function approvedWaiverTerms({ scope, context = {}, override = null } = {}) {
  const source = override || {};
  return {
    version: String(source.version || STUDIO_WAIVER_VERSION),
    title: String(source.title || STUDIO_WAIVER_TITLE),
    body: String(source.body || STUDIO_WAIVER_BODY),
    acknowledgement: String(source.acknowledgement || STUDIO_WAIVER_ACKNOWLEDGEMENT),
    minorAcknowledgement: String(
      source.minorAcknowledgement || STUDIO_WAIVER_MINOR_ACKNOWLEDGEMENT,
    ),
    scope,
    scopeStatement: scopeStatement(scope, context),
  };
}

module.exports = {
  STUDIO_WAIVER_VERSION,
  STUDIO_WAIVER_TITLE,
  STUDIO_WAIVER_BODY,
  STUDIO_WAIVER_ACKNOWLEDGEMENT,
  STUDIO_WAIVER_MINOR_ACKNOWLEDGEMENT,
  approvedWaiverTerms,
  scopeStatement,
};
