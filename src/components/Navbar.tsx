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
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden text-text-secondary"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn("discord")}
              className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Sign in with Discord
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-border bg-bg-secondary px-4 py-3 space-y-1 relative z-10">
          <MobileLink href="/" active={pathname === "/"} onClick={() => setMenuOpen(false)}>Overview</MobileLink>
          <MobileLink href="/bets" active={pathname === "/bets"} onClick={() => setMenuOpen(false)}>PvP Bets</MobileLink>
          <MobileLink href="/tickets" active={pathname === "/tickets"} onClick={() => setMenuOpen(false)}>Bet Slips</MobileLink>
          {session?.user.role === "ADMIN" && (
            <MobileLink href="/admin" active={pathname === "/admin"} onClick={() => setMenuOpen(false)}>Admin</MobileLink>
          )}
        </div>
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
