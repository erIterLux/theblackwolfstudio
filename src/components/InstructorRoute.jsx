import { Navigate, useLocation } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';

export default function InstructorRoute({ children }) {
  const location = useLocation();
  const {
    loading,
    error,
    isInstructor,
    refresh,
  } = useStudioRole();

  if (loading) {
    return <div className="page-loader">Loading instructor workspace…</div>;
  }

  if (error) {
    return (
      <main className="portal-access-state" id="main-content">
        <div className="portal-access-state__card" role="alert">
          <p className="eyebrow">Instructor access</p>
          <h1>We could not verify your studio role.</h1>
          <p>{error}</p>
          <button className="button" type="button" onClick={refresh}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!isInstructor) {
    return (
      <Navigate
        to="/member"
        replace
        state={{ from: location, instructorAccessRequired: true }}
      />
    );
  }

  return children;
}
