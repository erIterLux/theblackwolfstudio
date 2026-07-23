import { BookOpen, ShieldCheck, Target } from 'lucide-react';
import {
  getRequirementByRef,
  progressionCategoryMap,
  progressionLevelMap,
} from '../../data/progressionSystem';
import ContentMedia from './ContentMedia';

function ListSection({ title, items }) {
  if (!items?.length) return null;
  return (
    <section className="content-detail__list">
      <h3>{title}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

export default function ProgressionContentDetail({ item, compact = false }) {
  if (!item) return null;

  return (
    <article className={`content-detail${compact ? ' is-compact' : ''}`}>
      <header className="content-detail__header">
        <div>
          <p className="eyebrow">Training reference</p>
          <h2>{item.title}</h2>
          <p>{item.summary}</p>
        </div>
        <BookOpen size={34} />
      </header>

      <div className="content-tag-row">
        {(item.levelKeys || []).map((levelKey) => (
          <span key={levelKey}>{progressionLevelMap[levelKey]?.label || levelKey}</span>
        ))}
        {(item.categoryKeys || []).map((categoryKey) => (
          <span key={categoryKey}>{progressionCategoryMap[categoryKey]?.label || categoryKey}</span>
        ))}
      </div>

      <div className="content-detail__summary-grid">
        <ListSection title="Learning objectives" items={item.learningObjectives} />
        <ListSection title="Key points" items={item.keyPoints} />
        <ListSection title="Common mistakes" items={item.commonMistakes} />
        <ListSection title="Safety notes" items={item.safetyNotes} />
      </div>

      {(item.blocks || []).map((block) => (
        <section className={`content-block is-${block.type}`} key={block.id}>
          {block.type === 'text' ? (
            <>
              {block.heading && <h3>{block.heading}</h3>}
              {block.body && block.body.split('\n').map((paragraph, index) => (
                paragraph.trim() ? <p key={`${block.id}-${index}`}>{paragraph}</p> : null
              ))}
            </>
          ) : (
            <ContentMedia asset={block.asset} heading={block.heading} caption={block.caption} />
          )}
        </section>
      ))}

      {!!item.requirementRefs?.length && (
        <div className="content-detail__requirements">
          <Target size={18} />
          <div>
            <strong>Connected progression requirements</strong>
            <ul>
              {item.requirementRefs.map((reference) => {
                const requirement = getRequirementByRef(reference);
                return requirement ? (
                  <li key={reference}>
                    <strong>{requirement.levelLabel} · {requirement.categoryLabel}</strong>
                    <span>{requirement.text}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        </div>
      )}

      {!!item.safetyNotes?.length && (
        <div className="content-detail__boundary">
          <ShieldCheck size={18} />
          <p>Practice within the limits set by your instructor and stop when a drill becomes unsafe or unclear.</p>
        </div>
      )}
    </article>
  );
}
