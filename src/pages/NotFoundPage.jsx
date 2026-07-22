import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFoundPage({
  homePath = '/',
  homeLabel = 'Return to the studio website',
  workspace = false,
}) {
  return (
    <section className={workspace ? 'member-page not-found-page' : 'not-found-page'}>
      <div className="container">
        <div className="not-found-card">
          <p className="eyebrow">Page not found</p>
          <h1>That page is not available.</h1>
          <p>
            The address may have changed, or the page may require a different account permission.
          </p>
          <Link className="button" to={homePath}>
            <ArrowLeft size={18} aria-hidden="true" />
            {homeLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
