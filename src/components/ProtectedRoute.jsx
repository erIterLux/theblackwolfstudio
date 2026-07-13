import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading, isFirebaseConfigured } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-loader">Loading member space…</div>;
  }

  if (!isFirebaseConfigured) {
    return <Navigate to="/login" replace state={{ from: location, firebaseMissing: true }} />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
