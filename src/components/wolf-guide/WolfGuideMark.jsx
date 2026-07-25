export default function WolfGuideMark({ className = '' }) {
    return (
        <img
            className={`wolf-guide-mark${className ? ` ${className}` : ''}`}
            src="/images/wolf-guide-mark.webp"
            alt=""
            width="256"
            height="256"
            decoding="async"
        />
    );
}
