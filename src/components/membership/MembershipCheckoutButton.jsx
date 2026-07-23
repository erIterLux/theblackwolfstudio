import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { startMembershipCheckout } from '../../services/membership';

export default function MembershipCheckoutButton({ planKey, featured = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const beginCheckout = async () => {
    if (!user) {
      navigate('/login', { state: { from: location, membershipPlan: planKey } });
      return;
    }

    setLoading(true);
    setError('');
    try {
      await startMembershipCheckout(planKey);
    } catch (checkoutError) {
      console.error(checkoutError);
      setError(checkoutError?.message || 'Checkout could not be started.');
      setLoading(false);
    }
  };

  return (
    <div className="membership-action">
      <button
        type="button"
        className={featured ? 'button' : 'button button--dark-ghost'}
        onClick={beginCheckout}
        disabled={loading}
      >
        {loading ? 'Opening checkout…' : user ? 'Choose this plan' : 'Sign in to join'}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
