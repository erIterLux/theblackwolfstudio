function clean(value) {
    return String(value || '').trim();
}

export function eventLocationParts(location = {}) {
    const values = [
        clean(location.name),
        clean(location.address),
        clean(location.onlineUrl),
    ].filter(Boolean);
    return values.filter((value, index) => (
        values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
    ));
}

export function formatEventLocation(location, fallback = 'Location announced soon') {
    const parts = eventLocationParts(location);
    return parts.length ? parts.join(' · ') : fallback;
}
