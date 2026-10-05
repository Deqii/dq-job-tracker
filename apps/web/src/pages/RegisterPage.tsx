import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FormEvent } from 'react';

import { AuthShell } from '../components/AuthShell';
import { ErrorMessage, InlineError } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../hooks/auth-context';
import { getErrorMessage } from '../lib/api';
import { registerSchema } from '../schemas';
import type { RegisterValues } from '../schemas';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState<RegisterValues>({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterValues, string>>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof RegisterValues>(key: K, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof RegisterValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = (issue.path[0] ?? 'confirmPassword') as keyof RegisterValues;
        if (key === 'confirmPassword' && next[key]) continue;
        next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSubmitting(true);
    try {
      await register(parsed.data.email, parsed.data.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start tracking every application">
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
            autoComplete="new-password"
            className="input"
            value={values.password}
            onChange={(event) => setField('password', event.target.value)}
            placeholder="At least 8 characters"
          />
          {errors.password ? <InlineError message={errors.password} /> : null}
        </div>
        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="input"
            value={values.confirmPassword}
            onChange={(event) => setField('confirmPassword', event.target.value)}
            placeholder="Repeat your password"
          />
          {errors.confirmPassword ? <InlineError message={errors.confirmPassword} /> : null}
        </div>
        <ErrorMessage message={formError} />
        <button type="submit" className="btn btn-primary btn-md w-full" disabled={submitting}>
          {submitting ? <Spinner className="h-4 w-4" /> : null}
          Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}