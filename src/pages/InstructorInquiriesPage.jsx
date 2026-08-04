import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import { listInquiries, updateInquiryStatus } from '../services/instructorInquiries';

const STATUS_OPTIONS = [
  ['all', 'All inquiries'],
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['closed', 'Closed'],
];

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf())
    ? date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    : 'Date unavailable';
}

function statusLabel(status) {
  if (status === 'contacted') return 'Contacted';
  if (status === 'closed') return 'Closed';
  return 'New';
}

export default function InstructorInquiriesPage() {
  const { isInstructor, loading: roleLoading } = useStudioRole();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [updatingId, setUpdatingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listInquiries();
      setItems(result?.inquiries || []);
    } catch (nextError) {
      setError(nextError?.message || 'Inquiries could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && isInstructor) queueMicrotask(load);
  }, [isInstructor, load, roleLoading]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => status === 'all' || item.status === status)
      .filter((item) => !normalizedQuery || [
        item.name,
        item.email,
        item.phone,
        item.interest,
        item.message,
      ].join(' ').toLowerCase().includes(normalizedQuery));
  }, [items, query, status]);

  const counts = useMemo(() => ({
    all: items.length,
    new: items.filter((item) => item.status === 'new').length,
    contacted: items.filter((item) => item.status === 'contacted').length,
    closed: items.filter((item) => item.status === 'closed').length,
  }), [items]);

  const changeStatus = async (inquiryId, nextStatus) => {
    setUpdatingId(inquiryId);
    setError('');
    try {
      const result = await updateInquiryStatus(inquiryId, nextStatus);
      setItems((current) => current.map((item) => (
        item.id === inquiryId ? result.inquiry : item
      )));
    } catch (nextError) {
      setError(nextError?.message || 'The inquiry status could not be updated.');
    } finally {
      setUpdatingId('');
    }
  };

  if (!roleLoading && !isInstructor) {
    return <section className="member-page"><div className="container"><h1>Instructor access required</h1></div></section>;
  }

  return (
    <section className="member-page inquiries-page">
      <div className="container">
        <header className="member-header member-header--refined inquiries-header">
          <div>
            <Link className="text-link" to="/instructor"><ArrowLeft size={17} /> Instructor overview</Link>
            <p className="eyebrow">Studio communications</p>
            <h1>Website inquiries</h1>
            <p>Review messages submitted through the studio contact form and track follow-up.</p>
          </div>
          <button className="button button--small button--dark-ghost" type="button" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'is-spinning' : ''} size={16} /> Refresh
          </button>
        </header>

        <div className="inquiry-summary" aria-label="Inquiry totals">
          <article><MessageSquareText /><strong>{counts.all}</strong><span>Total</span></article>
          <article><Clock3 /><strong>{counts.new}</strong><span>New</span></article>
          <article><Mail /><strong>{counts.contacted}</strong><span>Contacted</span></article>
          <article><CheckCircle2 /><strong>{counts.closed}</strong><span>Closed</span></article>
        </div>

        <div className="inquiry-filters">
          <label>
            <span>Search inquiries</span>
            <div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, interest, or message" /></div>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option value={value} key={value}>{label} ({counts[value]})</option>
              ))}
            </select>
          </label>
        </div>

        {loading && <p className="page-loader">Loading inquiries…</p>}
        {error && <p className="form-status form-status--error" role="alert">{error}</p>}

        {!loading && (
          <div className="inquiry-list">
            {filtered.map((item) => (
              <article className="inquiry-card" key={item.id}>
                <header>
                  <div>
                    <span className={`inquiry-status is-${item.status || 'new'}`}>{statusLabel(item.status)}</span>
                    <h2>{item.name || 'Website visitor'}</h2>
                    <p>{item.interest || 'General inquiry'}</p>
                  </div>
                  <time dateTime={item.createdAt || undefined}>{formatDate(item.createdAt)}</time>
                </header>

                <div className="inquiry-contact">
                  <a href={`mailto:${item.email}`}><Mail size={16} /><span>{item.email || 'Email unavailable'}</span></a>
                  {item.phone && <a href={`tel:${item.phone}`}><Phone size={16} /><span>{item.phone}</span></a>}
                </div>

                <div className="inquiry-message">
                  <p className="eyebrow">Message</p>
                  <p>{item.message || 'No additional message was provided.'}</p>
                </div>

                <footer>
                  {item.status !== 'new' && (
                    <button type="button" className="text-link" onClick={() => changeStatus(item.id, 'new')} disabled={updatingId === item.id}>Mark new</button>
                  )}
                  {item.status !== 'contacted' && (
                    <button type="button" className="button button--small button--dark-ghost" onClick={() => changeStatus(item.id, 'contacted')} disabled={updatingId === item.id}>Mark contacted</button>
                  )}
                  {item.status !== 'closed' && (
                    <button type="button" className="button button--small" onClick={() => changeStatus(item.id, 'closed')} disabled={updatingId === item.id}>Close inquiry</button>
                  )}
                </footer>
              </article>
            ))}
            {!filtered.length && !error && (
              <div className="empty-state-card">
                <MessageSquareText size={28} />
                <h2>No inquiries found</h2>
                <p>{items.length ? 'Try another search or status filter.' : 'New website inquiries will appear here.'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
