import { PrefetchLink } from './PrefetchLink';

export default function Logo({
    compact = false,
    to = '/',
    label = 'The Black Wolf Studio home',
}) {
    return (
        <PrefetchLink to={to} className="brand" aria-label={label}>
            <span className="brand__mark-wrap">
                <img
                    className="brand__mark"
                    src="/images/black-wolf-mark-ui.png"
                    alt=""
                    width="256"
                    height="256"
                    decoding="async"
                />
            </span>
            {!compact && (
                <span className="brand__copy">
                    <strong>The Black Wolf</strong>
                    <span>Studio</span>
                </span>
            )}
        </PrefetchLink>
    );
}
