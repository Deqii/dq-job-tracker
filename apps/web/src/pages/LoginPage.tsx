import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { FormEvent } from 'react';

import { AuthShell } from '../components/AuthShell';
import { ErrorMessage, InlineError } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../hooks/auth-context';
import { getErrorMessage } from '../lib/api';
import { loginSchema } from '../schemas';
import type { LoginValues } from '../schemas';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginValues, string>>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof LoginValues>(key: K, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof LoginValues, string>> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as keyof LoginValues] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your job application tracker">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input"
            value={values.email}
            onChange={(event) => setField('email', event.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
          {errors.email ? <InlineError message={errors.email} /> : null}
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={values.password}
            onChange={(event) => setField('password', event.target.value)}
            placeholder="••••••••"
          />
          {errors.password ? <InlineError message={errors.password} /> : null}
        </div>
        <ErrorMessage message={formError} />
        <button type="submit" className="btn btn-primary btn-md w-full" disabled={submitting}>
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          Sign in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}