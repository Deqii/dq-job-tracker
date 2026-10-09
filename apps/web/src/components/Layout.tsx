import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/auth-context';
import {
  IconBriefcase,
  IconBuilding,
  IconClose,
  IconInbox,
  IconLogout,
  IconMenu,
  IconTag,
} from './Icons';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconInbox },
  { to: '/applications', label: 'Applications', icon: IconBriefcase },
  { to: '/companies', label: 'Companies', icon: IconBuilding },
  { to: '/tags', label: 'Tags', icon: IconTag },
];

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
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

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

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-4 pt-5">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavItems />
        </div>
        <UserFooter />
      </aside>

      {/* Mobile slide-over */}
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

      {/* Mobile top bar */}
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

      {/* Main content */}
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}