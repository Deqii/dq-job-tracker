import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-black text-brand-600">404</p>
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">The page you’re looking for doesn’t exist or was moved.</p>
      <Link to="/dashboard" className="btn btn-primary btn-md mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}