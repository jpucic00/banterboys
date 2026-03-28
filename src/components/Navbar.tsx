"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="relative bg-bg-secondary border-b border-border">
      {/* Red corner — absolute from nav left edge, wide enough to cover logo at any viewport */}
      <div
        className="absolute left-0 top-0 h-full pointer-events-none"
        style={{
          width: "clamp(220px, calc((100vw - 1280px) / 2 + 320px), 50vw)",
          background: "linear-gradient(to right, #C62828 0%, #8B1A1A 55%, transparent 100%)",
        }}
      />
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-20 relative z-10">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Image
              src="/tibia/logo.png"
              alt="Banter Boys Bets"
              width={80}
              height={80}
              className="object-contain drop-shadow-md"
              style={{ height: "90px", width: "auto" }}
            />
          </Link>
        </div>

        <div className="hidden md:flex items-center absolute left-1/2 -translate-x-1/2">
          <NavLink href="/" active={pathname === "/"}>Overview</NavLink>
          <NavLink href="/bets" active={pathname === "/bets"}>PvP Bets</NavLink>
          <NavLink href="/tickets" active={pathname === "/tickets"}>Bet Slips</NavLink>
          {session?.user.role === "ADMIN" && (
            <NavLink href="/admin" active={pathname === "/admin"} accent>Admin</NavLink>
          )}
        </div>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <div className="flex items-center gap-2">
                {session.user.image && (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={26}
                    height={26}
                    className="rounded-full ring-1 ring-border-light"
                  />
                )}
                <span className="text-sm text-text-secondary hidden sm:block">
                  {session.user.alias ?? session.user.name}
                </span>
              </div>
              <button
                onClick={() => signOut()}
                className="text-xs text-text-muted hover:text-loss transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn("discord")}
              className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span className="md:hidden">Sign in</span>
              <span className="hidden md:inline">Sign in with Discord</span>
            </button>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`md:hidden p-1.5 rounded transition-colors ${menuOpen ? "bg-white/10 text-white" : "text-text-secondary hover:text-white hover:bg-white/5"}`}
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          {/* backdrop */}
          <div
            className="md:hidden fixed inset-0 top-20 bg-black/50 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div className="md:hidden absolute w-full z-20 border-t border-border shadow-xl"
            style={{ background: "linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)" }}
          >
            <div className="px-4 py-3 space-y-1">
              <MobileLink href="/" active={pathname === "/"} onClick={() => setMenuOpen(false)}>Overview</MobileLink>
              <MobileLink href="/bets" active={pathname === "/bets"} onClick={() => setMenuOpen(false)}>PvP Bets</MobileLink>
              <MobileLink href="/tickets" active={pathname === "/tickets"} onClick={() => setMenuOpen(false)}>Bet Slips</MobileLink>
              {session?.user.role === "ADMIN" && (
                <MobileLink href="/admin" active={pathname === "/admin"} onClick={() => setMenuOpen(false)}>Admin</MobileLink>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

function NavLink({
  href,
  children,
  active,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-1.5 text-sm font-medium transition-colors ${
        accent
          ? active
            ? "text-odds-green"
            : "text-odds-green-dim hover:text-odds-green"
          : active
            ? "text-[#F0A818]"
            : "text-text-secondary hover:text-white"
      }`}
    >
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-3 right-3 h-[3px] bg-gold rounded-t-full"
          style={{ boxShadow: "0 0 8px #F0A818, 0 0 16px #F0A81866" }}
        />
      )}
    </Link>
  );
}

function MobileLink({
  href,
  children,
  active,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      className={`block py-2 px-2 rounded text-sm transition-colors ${
        active
          ? "text-white bg-white/5"
          : "text-text-secondary hover:text-white hover:bg-white/5"
      }`}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
