import {
    AlertTriangle,
    ArrowLeft,
    ArrowLeftRight,
    BarChart3,
    CalendarCheck2,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    CircleDollarSign,
    Download,
    Dumbbell,
    HeartPulse,
    RefreshCw,
    Search,
    ShieldCheck,
    TicketCheck,
    Users,
    Wrench,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
    exportStudioReport,
    getAttendanceReport,
    getEventReport,
    getMemberEngagementReport,
    getMembershipReport,
    getPrivateTrainingReport,
    getRevenueReport,
    getStudioReportSummary,
    getSystemHealthReport,
    repairStudioReportCounters,
} from '../services/reports';

const TABS = [
    ['overview', 'Overview'],
    ['revenue', 'Revenue'],
    ['memberships', 'Memberships'],
    ['events', 'Events'],
    ['privateTraining', 'Private training'],
    ['attendance', 'Attendance'],
    ['engagement', 'Member attention'],
    ['systemHealth', 'System health'],
];

const REPORT_PATHS = {
    overview: '',
    revenue: 'revenue',
    memberships: 'memberships',
    events: 'events',
    privateTraining: 'private-training',
    attendance: 'attendance',
    engagement: 'member-attention',
    systemHealth: 'system-health',
};

const PATH_REPORTS = Object.fromEntries(Object.entries(REPORT_PATHS).map(([key, value]) => [value, key]));


const REPORT_LOADERS = {
    overview: getStudioReportSummary,
    revenue: getRevenueReport,
    memberships: getMembershipReport,
    events: getEventReport,
    privateTraining: getPrivateTrainingReport,
    attendance: getAttendanceReport,
    engagement: getMemberEngagementReport,
    systemHealth: getSystemHealthReport,
};

const EXPORTS = [
    ['revenue', 'Revenue'],
    ['transactions', 'Transactions'],
    ['event_attendance', 'Event attendance'],
    ['private_attendance', 'Private attendance'],
    ['memberships', 'Memberships'],
    ['outstanding_credits', 'Outstanding credits'],
    ['discounts', 'Discounts'],
    ['refunds', 'Refunds'],
];

const TAB_EXPORTS = {
    revenue: ['revenue', 'Export revenue'],
    memberships: ['memberships', 'Export memberships'],
    events: ['event_attendance', 'Export event attendance'],
    privateTraining: ['private_attendance', 'Export private attendance'],
};

function formatMoney(cents, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(Number(cents || 0) / 100);
}

function formatDate(value, includeTime = false) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return '—';
    return date.toLocaleString('en-US', includeTime
        ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}

function readable(value) {
    return String(value || 'unknown').replaceAll('_', ' ');
}

function Metric({ icon: Icon, label, value, detail }) {
    return (
        <article className="report-metric">
            <Icon aria-hidden="true" />
            <div>
                <span>{label}</span>
                <strong>{value}</strong>
                {detail && <small>{detail}</small>}
            </div>
        </article>
    );
}

function Empty({ children = 'No records are available for this date range.' }) {
    return <p className="report-empty">{children}</p>;
}

function ReportScrollRegion({
    ariaLabel,
    children,
    className,
    guidance = 'Swipe or use the arrow controls to see the full report.',
}) {
    const regionRef = useRef(null);
    const [position, setPosition] = useState({
        canScrollLeft: false,
        canScrollRight: false,
    });

    const updatePosition = useCallback(() => {
        const region = regionRef.current;
        if (!region) return;
        const maxScrollLeft = Math.max(0, region.scrollWidth - region.clientWidth);
        const next = {
            canScrollLeft: region.scrollLeft > 2,
            canScrollRight: region.scrollLeft < maxScrollLeft - 2,
        };
        setPosition((current) => (
            current.canScrollLeft === next.canScrollLeft
            && current.canScrollRight === next.canScrollRight
                ? current
                : next
        ));
    }, []);

    useEffect(() => {
        const region = regionRef.current;
        if (!region) return undefined;

        const frame = window.requestAnimationFrame(updatePosition);
        const observer = new ResizeObserver(updatePosition);
        observer.observe(region);
        [...region.children].forEach((child) => observer.observe(child));
        window.addEventListener('resize', updatePosition);

        return () => {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('resize', updatePosition);
        };
    }, [children, updatePosition]);

    const move = (direction) => {
        const region = regionRef.current;
        if (!region) return;
        region.scrollBy({
            left: direction * Math.max(240, region.clientWidth * 0.78),
            behavior: 'smooth',
        });
    };

    return (
        <div className="report-scroll-shell">
            <div className="report-scroll-controls">
                <span><ArrowLeftRight size={17} aria-hidden="true" /> {guidance}</span>
                <div>
                    <button
                        type="button"
                        onClick={() => move(-1)}
                        disabled={!position.canScrollLeft}
                        aria-label={`Scroll ${ariaLabel} left`}
                    >
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => move(1)}
                        disabled={!position.canScrollRight}
                        aria-label={`Scroll ${ariaLabel} right`}
                    >
                        <ChevronRight size={20} aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div
                ref={regionRef}
                className={className}
                role="region"
                aria-label={ariaLabel}
                tabIndex={0}
                onScroll={updatePosition}
            >
                {children}
            </div>
        </div>
    );
}

function RevenueChart({ series = [] }) {
    const max = Math.max(1, ...series.map((item) => item.totalCents || 0));
    if (!series.length) return <Empty />;
    return (
        <ReportScrollRegion
            ariaLabel="Revenue over time chart"
            className="report-chart"
            guidance="Swipe the chart or use the arrows to review every date."
        >
            {series.map((item) => (
                <div className="report-chart__column" key={`${item.label}-${item.start}`}>
                    <div className="report-chart__value">{formatMoney(item.totalCents)}</div>
                    <div className="report-chart__bar" style={{ height: `${Math.max(4, (item.totalCents / max) * 150)}px` }}>
                        <span style={{ height: `${item.totalCents ? (item.membershipCents / item.totalCents) * 100 : 0}%` }} className="is-membership" />
                        <span style={{ height: `${item.totalCents ? (item.eventCents / item.totalCents) * 100 : 0}%` }} className="is-event" />
                        <span style={{ height: `${item.totalCents ? (item.privateTrainingCents / item.totalCents) * 100 : 0}%` }} className="is-private" />
                    </div>
                    <span>{item.label}</span>
                </div>
            ))}
        </ReportScrollRegion>
    );
}

function MoneyBreakdown({ title, data, noun }) {
    return (
        <article className="report-panel report-money-card">
            <h3>{title}</h3>
            <dl>
                <div><dt>Gross revenue</dt><dd>{formatMoney(data?.grossCents)}</dd></div>
                <div><dt>Discounts</dt><dd>{formatMoney(data?.discountCents)}</dd></div>
                <div><dt>Refunds</dt><dd>{formatMoney(data?.refundCents)}</dd></div>
                <div className="is-total"><dt>Net revenue</dt><dd>{formatMoney(data?.netCents)}</dd></div>
                <div><dt>{noun}</dt><dd>{data?.transactions || 0}</dd></div>
                <div><dt>Average purchase</dt><dd>{formatMoney(data?.averagePurchaseCents)}</dd></div>
            </dl>
        </article>
    );
}

const DEFAULT_TABLE_CONTROLS = Object.freeze({
    tableQuery: '',
    eventSort: 'date',
    attendanceType: 'all',
    attendanceStatus: 'all',
});

export default function InstructorReportsPage() {
    const { isInstructor, loading: roleLoading } = useStudioRole();
    const navigate = useNavigate();
    const { reportSection = '' } = useParams();
    const tab = PATH_REPORTS[reportSection] || 'overview';
    const [preset, setPreset] = useState('30d');
    const [custom, setCustom] = useState({ startDate: '', endDate: '' });
    const [reportCache, setReportCache] = useState({});
    const [loadingKey, setLoadingKey] = useState('');
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState('');
    const [repairPreview, setRepairPreview] = useState(null);
    const [repairing, setRepairing] = useState(false);
    const [message, setMessage] = useState('');
    const [loadingMore, setLoadingMore] = useState(false);
    const [tableControls, setTableControls] = useState({});

    const payload = useMemo(() => (
        preset === 'custom'
            ? { preset, startDate: custom.startDate, endDate: custom.endDate }
            : { preset }
    ), [preset, custom]);

    const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);
    const activeCacheKey = `${tab}:${payloadKey}`;
    const activeTableControls = tableControls[activeCacheKey] || DEFAULT_TABLE_CONTROLS;
    const {
        tableQuery,
        eventSort,
        attendanceType,
        attendanceStatus,
    } = activeTableControls;
    const data = reportCache[activeCacheKey] || null;
    const loading = loadingKey === activeCacheKey;
    const customRangeReady = preset !== 'custom' || Boolean(custom.startDate && custom.endDate);

    const selectTab = (value) => {
        const path = REPORT_PATHS[value];
        navigate(path ? `/instructor/reports/${path}` : '/instructor/reports');
    };

    const updateTableControl = (key, value) => {
        setTableControls((current) => ({
            ...current,
            [activeCacheKey]: {
                ...DEFAULT_TABLE_CONTROLS,
                ...current[activeCacheKey],
                [key]: value,
            },
        }));
    };

    const load = useCallback(async ({ force = false, targetTab = tab } = {}) => {
        if (!isInstructor || !customRangeReady) return;
        const key = `${targetTab}:${payloadKey}`;
        if (!force && reportCache[key]) return;
        setLoadingKey(key);
        setError('');
        setMessage('');
        try {
            const loader = REPORT_LOADERS[targetTab] || getStudioReportSummary;
            const requestPayload = targetTab === 'attendance'
                ? { ...payload, pageSize: 100, force }
                : { ...payload, force };
            const result = await loader(requestPayload);
            setReportCache((current) => ({ ...current, [key]: result }));
            setRepairPreview(null);
        } catch (nextError) {
            console.error(`Studio ${targetTab} report could not be loaded:`, nextError);
            setError(nextError?.message || 'Studio reports could not be loaded.');
        } finally {
            setLoadingKey((current) => (current === key ? '' : current));
        }
    }, [customRangeReady, isInstructor, payload, payloadKey, reportCache, tab]);

    useEffect(() => {
        if (roleLoading || !isInstructor || !customRangeReady) return;
        queueMicrotask(() => load());
    }, [roleLoading, isInstructor, customRangeReady, load]);

    const download = async (type) => {
        setExporting(type);
        setError('');
        try {
            const result = await exportStudioReport({ ...payload, type });
            const blob = new Blob([result.content || ''], { type: result.mimeType || 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = result.filename || `black-wolf-${type}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            setMessage(`${result.rowCount || 0} rows exported.`);
        } catch (nextError) {
            setError(nextError?.message || 'The report could not be exported.');
        } finally {
            setExporting('');
        }
    };

    const loadMoreAttendance = async () => {
        if (tab !== 'attendance' || !data?.page?.hasMore || !data.page.nextCursor) return;
        setLoadingMore(true);
        setError('');
        try {
            const result = await getAttendanceReport({
                ...payload,
                pageSize: data.page.pageSize || 100,
                cursor: data.page.nextCursor,
            });
            setReportCache((current) => {
                const existing = current[activeCacheKey] || data;
                return {
                    ...current,
                    [activeCacheKey]: {
                        ...existing,
                        ...result,
                        attendance: {
                            ...result.attendance,
                            rows: [
                                ...(existing.attendance?.rows || []),
                                ...(result.attendance?.rows || []),
                            ],
                        },
                    },
                };
            });
        } catch (nextError) {
            setError(nextError?.message || 'More attendance records could not be loaded.');
        } finally {
            setLoadingMore(false);
        }
    };

    const previewRepair = async () => {
        setRepairing(true);
        setError('');
        try {
            const result = await repairStudioReportCounters(false);
            setRepairPreview(result);
            setMessage(result.repairCount ? `${result.repairCount} safe counter repair${result.repairCount === 1 ? '' : 's'} found.` : 'No safe counter repairs are needed.');
        } catch (nextError) {
            setError(nextError?.message || 'System counters could not be checked.');
        } finally {
            setRepairing(false);
        }
    };

    const applyRepair = async () => {
        if (!repairPreview?.repairCount) return;
        setRepairing(true);
        setError('');
        try {
            const result = await repairStudioReportCounters(true);
            setMessage(`${result.repairCount} safe counter repair${result.repairCount === 1 ? '' : 's'} applied. Financial records were not changed.`);
            setRepairPreview(null);
            await load({ force: true, targetTab: 'systemHealth' });
        } catch (nextError) {
            setError(nextError?.message || 'System counters could not be repaired.');
        } finally {
            setRepairing(false);
        }
    };


    const filteredEvents = useMemo(() => {
        const query = tableQuery.trim().toLowerCase();
        const rows = [...(data?.events?.events || [])].filter((event) => (
            !query
            || String(event.title || '').toLowerCase().includes(query)
            || String(event.status || '').toLowerCase().includes(query)
        ));
        rows.sort((left, right) => {
            if (eventSort === 'participants') return Number(right.participants || 0) - Number(left.participants || 0);
            if (eventSort === 'attendance') return Number(right.attendanceRate || 0) - Number(left.attendanceRate || 0);
            if (eventSort === 'revenue') return Number(right.netCents || 0) - Number(left.netCents || 0);
            return new Date(left.startsAt || 0) - new Date(right.startsAt || 0);
        });
        return rows;
    }, [data?.events?.events, eventSort, tableQuery]);

    const filteredAttendance = useMemo(() => {
        const query = tableQuery.trim().toLowerCase();
        return (data?.attendance?.rows || []).filter((row) => {
            if (attendanceType !== 'all' && row.type !== attendanceType) return false;
            if (attendanceStatus !== 'all' && row.status !== attendanceStatus) return false;
            if (!query) return true;
            return [row.participantName, row.title, row.instructorName, row.status, row.type]
                .some((value) => String(value || '').toLowerCase().includes(query));
        });
    }, [attendanceStatus, attendanceType, data?.attendance?.rows, tableQuery]);

    const contextualExport = TAB_EXPORTS[tab] || null;

    if (!roleLoading && !isInstructor) {
        return <section className="section section--light"><div className="container"><h1>Instructor access required</h1></div></section>;
    }

    const summary = data?.summary || {};
    const revenue = data?.revenue || {};
    const memberships = data?.memberships || {};
    const events = data?.events || {};
    const privateTraining = data?.privateTraining || {};
    const attendance = data?.attendance || {};
    const engagement = data?.engagement || {};
    const health = data?.systemHealth || {};

    return (
        <section className="member-page reports-page">
            <div className="container">
                <div className="member-header member-header--refined reports-heading">
                    <div>
                        <Link className="text-link" to="/instructor"><ArrowLeft size={17} /> Instructor overview</Link>
                        <p className="eyebrow">Instructor operations</p>
                        <h1>Studio reports</h1>
                        <p>Revenue, attendance, memberships, private-training obligations, member attention, and system health in one place.</p>
                    </div>
                    <div className="report-header-actions">
                        {contextualExport && (
                            <button type="button" className="button button--secondary" onClick={() => download(contextualExport[0])} disabled={Boolean(exporting)}>
                                <Download size={17} /> {exporting === contextualExport[0] ? 'Preparing…' : contextualExport[1]}
                            </button>
                        )}
                        <button type="button" className="button button--secondary" onClick={() => load({ force: true })} disabled={loading}>
                            <RefreshCw size={17} className={loading ? 'is-spinning' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                <div className="report-range-panel">
                    <div className="report-range-buttons" aria-label="Report date range">
                        {[['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['year', 'This year'], ['custom', 'Custom']].map(([value, label]) => (
                            <button key={value} type="button" className={preset === value ? 'is-active' : ''} onClick={() => setPreset(value)}>{label}</button>
                        ))}
                    </div>
                    {preset === 'custom' && (
                        <div className="report-custom-range">
                            <label><span>Start</span><input type="date" value={custom.startDate} onChange={(event) => setCustom((current) => ({ ...current, startDate: event.target.value }))} /></label>
                            <label><span>End</span><input type="date" value={custom.endDate} onChange={(event) => setCustom((current) => ({ ...current, endDate: event.target.value }))} /></label>
                            <button type="button" className="button button--primary" onClick={() => load({ force: true })} disabled={!custom.startDate || !custom.endDate}>Apply</button>
                        </div>
                    )}
                    {data?.range && <p>Reporting period: <strong>{formatDate(data.range.start)}</strong> through <strong>{formatDate(data.range.end)}</strong></p>}
                </div>

                {error && <p className="form-status form-status--error">{error}</p>}
                {message && <p className="form-status form-status--success">{message}</p>}
                {!customRangeReady && <p className="report-info">Choose both custom dates, then select Apply.</p>}
                {data?.meta?.truncatedCollections?.length > 0 && (
                    <p className="report-warning"><AlertTriangle size={18} /> Some large collections reached the report safety limit: {data.meta.truncatedCollections.join(', ')}. Narrow the date range before relying on totals.</p>
                )}

                <label className="report-section-select">
                    <span>Report section</span>
                    <select value={tab} onChange={(event) => selectTab(event.target.value)}>
                        {TABS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>

                <div className="report-tabs" role="tablist" aria-label="Studio report sections">
                    {TABS.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => selectTab(value)}>{label}</button>)}
                </div>

                {loading && <p className="page-loader">Building studio reports…</p>}

                {!loading && data && tab === 'overview' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid">
                            <Metric icon={CircleDollarSign} label="Net revenue" value={formatMoney(summary.netRevenueCents)} detail="Selected period" />
                            <Metric icon={Users} label="Active members" value={summary.activeMembers || 0} detail={`${summary.newMembers || 0} new`} />
                            <Metric icon={TicketCheck} label="Event registrations" value={summary.eventRegistrations || 0} detail={`${formatMoney(summary.eventRevenueCents)} revenue`} />
                            <Metric icon={Dumbbell} label="Private sessions" value={summary.privateSessionsCompleted || 0} detail={`${formatMoney(summary.privateTrainingRevenueCents)} revenue`} />
                            <Metric icon={CheckCircle2} label="Attendance rate" value={`${summary.attendanceRate || 0}%`} detail={`${summary.noShowRate || 0}% no-show`} />
                            <Metric icon={BarChart3} label="Discounts and refunds" value={formatMoney((summary.discountsCents || 0) + (summary.refundsCents || 0))} detail={`${formatMoney(summary.discountsCents)} discounts`} />
                        </div>

                        <article className="report-panel">
                            <div className="report-panel__heading"><div><p className="eyebrow">Revenue over time</p><h2>Net collected revenue</h2></div><div className="report-chart-legend"><span className="is-membership">Membership</span><span className="is-event">Events</span><span className="is-private">Private</span></div></div>
                            <RevenueChart series={revenue.series} />
                        </article>

                        <div className="report-two-column">
                            <article className="report-panel">
                                <div className="report-panel__heading"><div><p className="eyebrow">Needs attention</p><h2>Member follow-up</h2></div><HeartPulse /></div>
                                {engagement.deferred ? (
                                    <div className="report-deferred"><HeartPulse /><p>{engagement.message}</p></div>
                                ) : (
                                    <div className="report-action-counts">
                                        <div><strong>{engagement.counts?.inactiveMembers || 0}</strong><span>No attendance in 30 days</span></div>
                                        <div><strong>{engagement.counts?.unbookedPurchases || 0}</strong><span>Purchased but never booked</span></div>
                                        <div><strong>{engagement.counts?.expiringCredits || 0}</strong><span>Credits expiring soon</span></div>
                                        <div><strong>{engagement.counts?.repeatedNoShows || 0}</strong><span>Repeated no-shows</span></div>
                                    </div>
                                )}
                                <button type="button" className="text-link report-link-button" onClick={() => selectTab('engagement')}>Calculate member attention</button>
                            </article>
                            <article className="report-panel">
                                <div className="report-panel__heading"><div><p className="eyebrow">System health</p><h2>Records needing review</h2></div><ShieldCheck /></div>
                                {health.deferred ? (
                                    <div className="report-deferred"><ShieldCheck /><p>{health.message}</p></div>
                                ) : (
                                    <div className="report-health-summary">
                                        <div className="is-high"><strong>{health.counts?.high || 0}</strong><span>High priority</span></div>
                                        <div className="is-medium"><strong>{health.counts?.medium || 0}</strong><span>Counter or linkage issues</span></div>
                                        <div className="is-safe"><strong>{health.repairableCount || 0}</strong><span>Safe repairs available</span></div>
                                    </div>
                                )}
                                <button type="button" className="text-link report-link-button" onClick={() => selectTab('systemHealth')}>Run system health check</button>
                            </article>
                        </div>

                        <article className="report-panel">
                            <div className="report-panel__heading"><div><p className="eyebrow">Accounting and review</p><h2>Export studio data</h2></div><Download /></div>
                            <div className="report-export-grid">
                                {EXPORTS.map(([value, label]) => <button key={value} type="button" onClick={() => download(value)} disabled={Boolean(exporting)}><Download size={16} /> {exporting === value ? 'Preparing…' : label}</button>)}
                            </div>
                        </article>
                    </div>
                )}

                {!loading && data && tab === 'revenue' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid report-metric-grid--four">
                            <Metric icon={CircleDollarSign} label="Gross revenue" value={formatMoney(revenue.totals?.grossCents)} />
                            <Metric icon={TicketCheck} label="Discounts" value={formatMoney(revenue.totals?.discountCents)} />
                            <Metric icon={RefreshCw} label="Refunds" value={formatMoney(revenue.totals?.refundCents)} />
                            <Metric icon={BarChart3} label="Net revenue" value={formatMoney(revenue.totals?.netCents)} />
                        </div>
                        <article className="report-panel"><div className="report-panel__heading"><div><p className="eyebrow">Revenue trend</p><h2>Net revenue by category</h2></div></div><RevenueChart series={revenue.series} /></article>
                        <div className="report-three-column">
                            <MoneyBreakdown title="Memberships" data={revenue.membership} noun="Payments" />
                            <MoneyBreakdown title="Events" data={revenue.events} noun="Orders" />
                            <MoneyBreakdown title="Private training" data={revenue.privateTraining} noun="Packages sold" />
                        </div>
                    </div>
                )}

                {!loading && data && tab === 'memberships' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid report-metric-grid--four">
                            <Metric icon={Users} label="Active memberships" value={memberships.activeCount || 0} />
                            <Metric icon={Users} label="New memberships" value={memberships.newCount || 0} />
                            <Metric icon={CircleDollarSign} label="Monthly recurring" value={formatMoney(memberships.mrrCents)} detail="Based on latest stored paid invoices" />
                            <Metric icon={BarChart3} label="Retention" value={`${memberships.retentionRate || 0}%`} />
                        </div>
                        {memberships.alerts?.map((alert) => <p className="report-warning" key={alert.type}><AlertTriangle size={18} /> {alert.message}</p>)}
                        <div className="report-two-column">
                            <article className="report-panel"><h2>Membership status</h2><dl className="report-definition-list"><div><dt>Canceling at period end</dt><dd>{memberships.cancelingCount || 0}</dd></div><div><dt>Past due</dt><dd>{memberships.pastDueCount || 0}</dd></div><div><dt>Canceled in range</dt><dd>{memberships.canceledCount || 0}</dd></div><div><dt>Annual recurring revenue</dt><dd>{formatMoney(memberships.arrCents)}</dd></div></dl></article>
                            <article className="report-panel"><h2>Active plans</h2>{memberships.plans?.length ? <div className="report-plan-list">{memberships.plans.map((plan) => <div key={plan.planKey}><span>{plan.planName}</span><strong>{plan.count}</strong></div>)}</div> : <Empty />}</article>
                        </div>
                    </div>
                )}

                {!loading && data && tab === 'events' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid report-metric-grid--four">
                            <Metric icon={CalendarCheck2} label="Events" value={events.totals?.eventCount || 0} />
                            <Metric icon={Users} label="Participants" value={events.totals?.participants || 0} />
                            <Metric icon={CheckCircle2} label="Attendance" value={`${events.totals?.attendanceRate || 0}%`} />
                            <Metric icon={CircleDollarSign} label="Net revenue" value={formatMoney(events.totals?.netRevenueCents)} />
                        </div>
                        <div className="report-table-tools">
                            <label className="report-search-field">
                                <Search size={17} aria-hidden="true" />
                                <span className="sr-only">Search events</span>
                                <input value={tableQuery} onChange={(event) => updateTableControl('tableQuery', event.target.value)} placeholder="Search event or status" />
                            </label>
                            <label>
                                <span>Sort events</span>
                                <select value={eventSort} onChange={(event) => updateTableControl('eventSort', event.target.value)}>
                                    <option value="date">Date</option>
                                    <option value="participants">Most participants</option>
                                    <option value="attendance">Highest attendance</option>
                                    <option value="revenue">Highest revenue</option>
                                </select>
                            </label>
                            <small>{filteredEvents.length} of {events.events?.length || 0} events shown</small>
                        </div>
                        <ReportScrollRegion
                            ariaLabel="Event performance table"
                            className="report-table-wrap"
                        >
                            <table className="report-table">
                                <caption>Event registration, waiver, attendance, and revenue summary</caption>
                                <thead><tr><th>Event</th><th>Capacity</th><th>Participants</th><th>Waivers</th><th>Checked in</th><th>No-shows</th><th>Attendance</th><th>Net revenue</th></tr></thead>
                                <tbody>{filteredEvents.map((event) => <tr key={event.id}><td><strong>{event.title}</strong><span>{formatDate(event.startsAt)} · {readable(event.status)}</span></td><td>{event.capacity || 'Open'}</td><td>{event.participants}</td><td>{event.waiversComplete}/{event.participants}</td><td>{event.checkedIn}</td><td>{event.noShows}</td><td>{event.attendanceRate}%</td><td>{formatMoney(event.netCents)}</td></tr>)}</tbody>
                            </table>
                            {!filteredEvents.length && <Empty>{tableQuery ? 'No events match this search.' : 'No events are available for this date range.'}</Empty>}
                        </ReportScrollRegion>
                    </div>
                )}

                {!loading && data && tab === 'privateTraining' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid">
                            <Metric icon={Dumbbell} label="Packages sold" value={privateTraining.packagesSold || 0} />
                            <Metric icon={CheckCircle2} label="Completed sessions" value={privateTraining.sessions?.completed || 0} />
                            <Metric icon={CalendarCheck2} label="Reserved credits" value={privateTraining.credits?.reserved || 0} />
                            <Metric icon={TicketCheck} label="Available credits" value={privateTraining.credits?.available || 0} detail="Outstanding studio obligation" />
                            <Metric icon={AlertTriangle} label="No-shows" value={privateTraining.sessions?.noShows || 0} />
                            <Metric icon={RefreshCw} label="Late cancellations" value={privateTraining.sessions?.lateCanceled || 0} />
                        </div>
                        <article className="report-panel">
                            <h2>Instructor workload</h2>
                            <ReportScrollRegion
                                ariaLabel="Instructor workload table"
                                className="report-table-wrap report-table-wrap--flat"
                            >
                                <table className="report-table">
                                    <caption>Scheduled and completed private-training workload</caption>
                                    <thead><tr><th>Instructor</th><th>Scheduled</th><th>Completed</th><th>Teaching hours</th><th>Availability used</th><th>Cancellations</th><th>No-shows</th></tr></thead>
                                    <tbody>{privateTraining.instructors?.map((instructor) => <tr key={instructor.instructorUid}><td><strong>{instructor.instructorName}</strong></td><td>{instructor.sessionsScheduled}</td><td>{instructor.sessionsCompleted}</td><td>{instructor.teachingHours}</td><td>{instructor.availabilityUsed == null ? 'Not configured' : `${instructor.availabilityUsed}%`}</td><td>{instructor.cancellations}</td><td>{instructor.noShows}</td></tr>)}</tbody>
                                </table>
                                {!privateTraining.instructors?.length && <Empty />}
                            </ReportScrollRegion>
                        </article>
                    </div>
                )}

                {!loading && data && tab === 'attendance' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid report-metric-grid--four"><Metric icon={Users} label="Attendance records" value={attendance.totals?.records || 0} /><Metric icon={CheckCircle2} label="Attended" value={attendance.totals?.attended || 0} /><Metric icon={AlertTriangle} label="No-shows" value={attendance.totals?.noShows || 0} /><Metric icon={BarChart3} label="Attendance rate" value={`${attendance.totals?.attendanceRate || 0}%`} /></div>
                        <div className="report-table-tools report-table-tools--attendance">
                            <label className="report-search-field">
                                <Search size={17} aria-hidden="true" />
                                <span className="sr-only">Search loaded attendance records</span>
                                <input value={tableQuery} onChange={(event) => updateTableControl('tableQuery', event.target.value)} placeholder="Search participant, event, package, or instructor" />
                            </label>
                            <label>
                                <span>Attendance type</span>
                                <select value={attendanceType} onChange={(event) => updateTableControl('attendanceType', event.target.value)}>
                                    <option value="all">All types</option>
                                    <option value="event">Events</option>
                                    <option value="private_training">Private training</option>
                                </select>
                            </label>
                            <label>
                                <span>Status</span>
                                <select value={attendanceStatus} onChange={(event) => updateTableControl('attendanceStatus', event.target.value)}>
                                    <option value="all">All statuses</option>
                                    <option value="attended">Attended</option>
                                    <option value="registered">Registered</option>
                                    <option value="requested">Awaiting confirmation</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="rescheduled">Rescheduled</option>
                                    <option value="no_show">No-show</option>
                                    <option value="canceled">Canceled</option>
                                    <option value="late_canceled">Canceled late</option>
                                </select>
                            </label>
                            <small>{filteredAttendance.length} of {attendance.rows?.length || 0} loaded records shown</small>
                        </div>
                        <ReportScrollRegion
                            ariaLabel="Attendance records table"
                            className="report-table-wrap"
                        >
                            <table className="report-table">
                                <caption>Combined event and private-training attendance records</caption>
                                <thead><tr><th>Date</th><th>Type</th><th>Participant</th><th>Event or package</th><th>Instructor</th><th>Status</th></tr></thead>
                                <tbody>{filteredAttendance.map((row) => <tr key={row.id}><td>{formatDate(row.date, true)}</td><td>{row.type === 'event' ? 'Event' : 'Private training'}</td><td>{row.participantName}</td><td>{row.title}</td><td>{row.instructorName || '—'}</td><td><span className={`report-status is-${row.status}`}>{readable(row.status)}</span></td></tr>)}</tbody>
                            </table>
                            {!filteredAttendance.length && <Empty>{tableQuery || attendanceType !== 'all' || attendanceStatus !== 'all' ? 'No loaded attendance records match these filters.' : 'No attendance records are available for this date range.'}</Empty>}
                        </ReportScrollRegion>
                        {data.page && (
                            <div className="report-pagination">
                                <span>Showing {attendance.rows?.length || 0} of {data.page.totalRows || 0} records</span>
                                {data.page.hasMore && <button type="button" className="button button--secondary" onClick={loadMoreAttendance} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
                            </div>
                        )}
                    </div>
                )}

                {!loading && data && tab === 'engagement' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid report-metric-grid--four"><Metric icon={HeartPulse} label="Inactive members" value={engagement.counts?.inactiveMembers || 0} /><Metric icon={Dumbbell} label="Never booked" value={engagement.counts?.unbookedPurchases || 0} /><Metric icon={AlertTriangle} label="Credits expiring" value={engagement.counts?.expiringCredits || 0} /><Metric icon={Users} label="Repeated no-shows" value={engagement.counts?.repeatedNoShows || 0} /></div>
                        <div className="report-two-column">
                            <article className="report-panel"><h2>No attendance in 30 days</h2><div className="report-person-list">{engagement.inactiveMembers?.map((item) => <div key={item.uid}><div><strong>{item.name}</strong><span>{item.reason}</span></div><small>{item.lastAttendanceAt ? `Last attended ${formatDate(item.lastAttendanceAt)}` : 'No attendance recorded'}</small></div>)}{!engagement.inactiveMembers?.length && <Empty>No active members currently match this alert.</Empty>}</div></article>
                            <article className="report-panel"><h2>Private training follow-up</h2><div className="report-person-list">{engagement.unbookedPurchases?.map((item) => <div key={item.purchaseId}><div><strong>{item.name}</strong><span>{item.remainingSessions} session{item.remainingSessions === 1 ? '' : 's'} remaining</span></div><small>Never booked</small></div>)}{engagement.expiringCredits?.map((item) => <div key={`expiring-${item.purchaseId}`}><div><strong>{item.name}</strong><span>{item.remainingSessions} session{item.remainingSessions === 1 ? '' : 's'} remaining</span></div><small>Expires {formatDate(item.expiresAt)}</small></div>)}{!engagement.unbookedPurchases?.length && !engagement.expiringCredits?.length && <Empty>No private-training follow-up is currently needed.</Empty>}</div></article>
                        </div>
                        <article className="report-panel"><h2>Repeated no-shows and inactive progression</h2><div className="report-person-list report-person-list--wide">{engagement.repeatedNoShows?.map((item) => <div key={`no-show-${item.uid}`}><div><strong>{item.name}</strong><span>{item.count} no-shows recorded</span></div><small>Contact recommended</small></div>)}{engagement.progressionInactive?.map((item) => <div key={`progression-${item.uid}`}><div><strong>{item.name}</strong><span>{item.reason}</span></div><small>Progression follow-up</small></div>)}{!engagement.repeatedNoShows?.length && !engagement.progressionInactive?.length && <Empty>No repeated no-show or progression alerts.</Empty>}</div></article>
                    </div>
                )}

                {!loading && data && tab === 'systemHealth' && (
                    <div className="report-section-stack">
                        <div className="report-metric-grid report-metric-grid--four"><Metric icon={AlertTriangle} label="High priority" value={health.counts?.high || 0} /><Metric icon={Wrench} label="Counter issues" value={health.counts?.medium || 0} /><Metric icon={ShieldCheck} label="Safe repairs" value={health.repairableCount || 0} /><Metric icon={CheckCircle2} label="Total issues" value={health.issues?.length || 0} /></div>
                        <article className="report-panel report-repair-panel"><div><p className="eyebrow">Safe maintenance</p><h2>Recalculate aggregate counters</h2><p>This repairs event counters, registration counters, reserved-credit counters, and waiver status mirrors. It does not create purchases, alter payments, consume credits, or change Stripe records.</p></div><div className="report-repair-actions"><button type="button" className="button button--secondary" onClick={previewRepair} disabled={repairing}>{repairing ? 'Checking…' : 'Preview repairs'}</button>{repairPreview?.repairCount > 0 && <button type="button" className="button button--primary" onClick={applyRepair} disabled={repairing}>Apply {repairPreview.repairCount} safe repairs</button>}</div></article>
                        <div className="report-health-list">{health.issues?.map((issue, index) => <article key={`${issue.type}-${issue.recordId}-${index}`} className={`report-health-item is-${issue.severity}`}><div><span>{readable(issue.type)}</span><strong>{issue.message}</strong><small>Record: {issue.recordId}</small></div><em>{issue.repairable ? 'Safe counter repair available' : 'Manual review required'}</em></article>)}{!health.issues?.length && <div className="report-all-clear"><ShieldCheck /><h2>No report integrity issues found</h2><p>Stored counters and linked records are consistent with the records reviewed.</p></div>}</div>
                    </div>
                )}
            </div>
        </section>
    );
}
