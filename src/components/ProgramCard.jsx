import { ArrowUpRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ProgramCard({ program }) {
  const Icon = program.icon;
  return (
    <article className="program-card">
      <div className="program-card__icon"><Icon /></div>
      <p className="eyebrow">{program.eyebrow}</p>
      <h3>{program.title}</h3>
      <p>{program.description}</p>
      <ul className="check-list">
        {program.outcomes.map((outcome) => (
          <li key={outcome}><Check size={17} /> {outcome}</li>
        ))}
      </ul>
      <Link to={`/programs#${program.slug}`} className="text-link">
        Learn about this training <ArrowUpRight size={17} />
      </Link>
    </article>
  );
}
