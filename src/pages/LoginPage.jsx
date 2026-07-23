import { LogIn, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const location = useLocation();
    const [mode, setMode] = useState(() => (
        location.state?.membershipPlan ? 'signup' : 'login'
    ));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const {
        user,
        signIn,
        signUp,
        signInWithGoogle,
        isFirebaseConfigured,
    } = useAuth();

    const navigate = useNavigate();
    const destination = location.state?.from?.pathname ?? '/member';

    useEffect(() => {
        if (user) {
            navigate(destination, { replace: true });
        }
    }, [user, destination, navigate]);

    const run = async (action) => {
        setError('');
        setBusy(true);

        try {
            // Navigation is handled once by the auth-state effect above. This
            // prevents the login page from navigating to two different routes.
            await action();
        } catch (nextError) {
            setError(
                String(nextError?.message || 'Sign-in failed.')
                    .replace('Firebase:', '')
                    .trim(),
            );
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (mode === 'signup' && password !== confirmPassword) {
            setError('The passwords do not match.');
            return;
        }
        run(() => (
            mode === 'login'
                ? signIn(email, password)
                : signUp(email, password)
        ));
    };

    return (
        <section className="auth-page">
            <div className="auth-page__visual">
                <img src="/images/black-wolf-mark-ui.png" alt="" width="256" height="256" decoding="async" />
                <p className="eyebrow eyebrow--light">Member space</p>
                <h1>Continue your practice between classes.</h1>
                <p>
                    Training notes, class resources, progression, bookings, and Wolf Guide are available here.
                </p>
            </div>

            <div className="auth-card">
                <p className="eyebrow">
                    {mode === 'login' ? 'Welcome back' : 'Create member access'}
                </p>
                <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>

                {!isFirebaseConfigured && (
                    <div className="config-warning">
                        Firebase is not configured yet. Copy <code>.env.example</code>{' '}
                        to <code>.env</code> and add your web app configuration to
                        enable authentication.
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <label>
                        Email
                        <input
                            required
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                        />
                    </label>

                    <label>
                        Password
                        <input
                            required
                            minLength="6"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete={mode === 'login'
                                ? 'current-password'
                                : 'new-password'}
                        />
                    </label>

                    {mode === 'signup' && (
                        <label>
                            Confirm password
                            <input
                                required
                                minLength="6"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                            />
                            <span className="auth-field-hint">
                                Re-enter the same password to prevent a typing mistake.
                            </span>
                        </label>
                    )}

                    {error && (
                        <p className="form-status form-status--error" role="alert">{error}</p>
                    )}

                    <button
                        className="button button--full"
                        type="submit"
                        disabled={busy || !isFirebaseConfigured}
                    >
                        {mode === 'login'
                            ? <LogIn size={18} />
                            : <UserPlus size={18} />}
                        {busy
                            ? 'Please wait…'
                            : mode === 'login'
                                ? 'Sign in'
                                : 'Create account'}
                    </button>
                </form>

                <button
                    className="button button--dark-ghost button--full"
                    type="button"
                    disabled={busy || !isFirebaseConfigured}
                    onClick={() => run(signInWithGoogle)}
                >
                    Continue with Google
                </button>

                <button
                    className="auth-toggle"
                    type="button"
                    onClick={() => {
                        setMode((current) => (
                            current === 'login' ? 'signup' : 'login'
                        ));
                        setConfirmPassword('');
                        setError('');
                    }}
                >
                    {mode === 'login'
                        ? 'New here? Create an account'
                        : 'Already have an account? Sign in'}
                </button>
            </div>
        </section>
    );
}
