import { Link, NavLink } from 'react-router-dom';
import { prefetchRoute } from '../routes/routeRegistry';

function createIntentHandler(to, suppliedHandler) {
  return (event) => {
    suppliedHandler?.(event);
    if (!event.defaultPrevented) void prefetchRoute(to);
  };
}

function prefetchProps(to, props) {
  return {
    onFocus: createIntentHandler(to, props.onFocus),
    onPointerDown: createIntentHandler(to, props.onPointerDown),
    onPointerEnter: createIntentHandler(to, props.onPointerEnter),
    onTouchStart: createIntentHandler(to, props.onTouchStart),
  };
}

export function PrefetchLink({ to, ...props }) {
  return (
    <Link
      {...props}
      {...prefetchProps(to, props)}
      to={to}
    />
  );
}

export function PrefetchNavLink({ to, ...props }) {
  return (
    <NavLink
      {...props}
      {...prefetchProps(to, props)}
      to={to}
    />
  );
}
