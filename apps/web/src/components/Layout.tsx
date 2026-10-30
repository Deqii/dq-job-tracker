import { useState, type CSSProperties, type ReactElement } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/auth-context';
import { useDashboard } from '../hooks/useDashboard';
import { IconClose, IconLogout, IconMenu } from './Icons';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/applications', label: 'Applications' },
  { to: '/companies', label: 'Companies' },
  { to: '/tags', label: 'Tags' },
];

const NAV_ICONS: Record<string, ReactElement> = {
  '/dashboard': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg>
  ),
  '/applications': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path></svg>
  ),
  '/companies': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path><path d="M9 9v.01"></path><path d="M9 12v.01"></path><path d="M9 15v.01"></path><path d="M9 18v.01"></path></svg>
  ),
  '/tags': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><path d="M7 7h.01"></path></svg>
  ),
};

function displayName(email: string | undefined, capitalizeFirst = false): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? email;
  if (!local) return '?';
  return capitalizeFirst ? local.charAt(0).toUpperCase() + local.slice(1) : local;
}

// TODO(legacy): kept only for below-lg widths. Remove once the mobile shell is redesigned.
function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          <path d="M4 8h16M4 13h16M4 18h10" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">Job Tracker</p>
        <p className="text-xs text-slate-500">Application manager</p>
      </div>
    </div>
  );
}

// TODO(legacy): kept only for the below-lg slide-over.
function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="mt-6 space-y-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          <span className="flex h-5 w-5 items-center justify-center">{NAV_ICONS[item.to]}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

// TODO(legacy): kept only for the below-lg shell.
function UserFooter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="border-t border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {(user?.email[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Log out"
          title="Log out"
        >
          <IconLogout className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: dashboard } = useDashboard();
  const location = useLocation();
  const total = dashboard?.total ?? 0;
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  const name = displayName(user?.email, true);
  const stickerBase = isDashboard
    ? '500ms'
    : location.pathname.startsWith('/applications/')
      ? '300ms'
      : '400ms';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      {/* TODO(legacy): mobile shell only. Hidden from lg up. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <BrandMark />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <IconMenu className="h-5 w-5" />
        </button>
      </header>

      <div className="ed" style={{ '--sticker-base': stickerBase } as CSSProperties}>
        <div className="hidden lg:flex">
          <aside style={{ flex: '0 0 248px', background: 'var(--side)', borderRight: '2px solid var(--ink)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 6px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'var(--marker)', border: '2px solid var(--ink)', boxShadow: '3px 3px 0 var(--ink)', transform: 'rotate(-4deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1D1A16" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path></svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '20px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Job Tracker</span>
                <span style={{ fontSize: '12.5px', color: 'var(--ink2)' }}>Application manager</span>
              </div>
            </div>

            <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {NAV_ITEMS.map((item) => {
                const isApplications = item.to === '/applications';
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => (isActive ? '' : 'nav-b')}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      height: '46px',
                      padding: '0 16px',
                      borderRadius: '23px',
                      border: isActive ? '2px solid var(--ink)' : '2px solid transparent',
                      background: isActive ? 'var(--ink)' : undefined,
                      color: isActive ? 'var(--card)' : 'var(--ink2)',
                      fontWeight: isActive ? 700 : 600,
                    })}
                  >
                    {({ isActive }) => (
                      <>
                        <span style={{ display: 'flex', color: isActive ? 'var(--marker)' : undefined }}>{NAV_ICONS[item.to]}</span>
                        <span style={{ flex: '1 1 auto' }}>{item.label}</span>
                        {isApplications ? (
                          <span className="sticker" style={{ '--r': '-4deg', '--d': '0ms', minWidth: '28px', height: '22px', padding: '0 8px', borderRadius: '11px', border: '2px solid var(--ink)', background: 'var(--marker)', color: 'var(--ink)', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' } as CSSProperties}>{total}</span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            <div style={{ flex: '1 1 auto' }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 6px 0', borderTop: '2px dashed var(--ink3)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--marker)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontWeight: 800, fontSize: '16px', flex: '0 0 auto' }}>{name[0]?.toUpperCase()}</div>
              <span style={{ flex: '1 1 auto', fontWeight: 600 }}>{name}</span>
              <button type="button" className="nav-b" aria-label="Sign out" onClick={handleLogout} style={{ width: '44px', height: '44px', borderRadius: '50%', border: '2px solid transparent', color: 'var(--ink2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
              </button>
            </div>
          </aside>
        </div>

        <main style={{ flex: '999 1 560px', minWidth: 0, padding: '0 32px 48px' }}>
          <Outlet />
        </main>
      </div>

      {/* TODO(legacy): mobile slide-over only. Hidden from lg up. */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 pt-5">
              <BrandMark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <UserFooter />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
