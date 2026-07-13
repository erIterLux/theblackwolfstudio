import { Link } from 'react-router-dom';

export default function Logo({ compact = false }) {
  return (
    <Link to="/" className="brand" aria-label="The Black Wolf Studio home">
      <span className="brand__mark-wrap">
        <img className="brand__mark" src="/images/black-wolf-mark.png" alt="" />
      </span>
      {!compact && (
        <span className="brand__copy">
          <strong>The Black Wolf</strong>
          <span>Studio</span>
        </span>
      )}
    </Link>
  );
}
