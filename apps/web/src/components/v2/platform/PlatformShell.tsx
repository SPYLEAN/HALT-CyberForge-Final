"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SimulatedChip } from "@/components/shell/SimulatedChip";
import { useIncident } from "@/lib/state/incident-store";

import { Icon, type IconName } from "../icons";

const ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/mission", label: "Mission Control", icon: "mission" },
  { href: "/firex", label: "Log Analysis", icon: "reconstruct" },
  { href: "/firex/incidents", label: "Incident Rooms", icon: "rooms" },
  { href: "/trust", label: "Trust Centre", icon: "proofseal" },
  { href: "/architecture", label: "System Architecture", icon: "architecture" },
];

function currentFor(path: string, href: string): boolean {
  if (path === href) return true;
  if (href === "/firex/incidents") return path.startsWith("/firex/incidents/");
  if (href === "/firex") return (path.startsWith("/firex/") && !path.startsWith("/firex/incidents")) || path === "/reconstruct" || path.startsWith("/reconstructions/");
  return href === "/trust" && path.startsWith("/trust/");
}

/** The platform's own chrome: the places above any single incident. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { state } = useIncident();
  return (
    <div className="v2-platform">
      <header className="v2-platform-bar" aria-label="HALT platform">
        <Link href="/" aria-label="HALT home" style={{ display: "inline-flex" }}>
          <Image src="/brand/halt-horizontal-bone.svg" alt="HALT" width={104} height={30} priority unoptimized />
        </Link>
        <nav aria-label="Platform">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-label={i.label} aria-current={currentFor(path, i.href) ? "page" : undefined}>
              <Icon name={i.icon} size={18} />
              <span>{i.label}</span>
            </Link>
          ))}
        </nav>
        <details className="v2-platform-menu" key={path}>
          <summary aria-label="Open navigation menu">
            <span aria-hidden>☰</span>
            <span>Menu</span>
          </summary>
          <nav aria-label="Platform menu">
            {ITEMS.map((i) => (
              <Link key={i.href} href={i.href} aria-current={currentFor(path, i.href) ? "page" : undefined}>
                <Icon name={i.icon} size={18} />
                <span>{i.label}</span>
              </Link>
            ))}
          </nav>
        </details>
        <span style={{ marginLeft: "auto", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          {/* The authored incident belongs to the Synthetic Response Lab and is offered only inside it. */}
          {path === "/incidents" ? (
            <>
              <SimulatedChip simulated={state.simulated} />
              <Link className="halt-btn halt-btn-primary" href={`/incidents/${state.incidentId}?view=overview`}>
                <span>OPEN LAB INCIDENT</span>
                <span aria-hidden>→</span>
              </Link>
            </>
          ) : null}
        </span>
      </header>
      <main className="v2-platform-main" id="platform-main">
        {children}
      </main>
    </div>
  );
}
