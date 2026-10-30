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
  { href: "/incidents", label: "Incident Rooms", icon: "rooms" },
  { href: "/reconstruct", label: "Reconstruct", icon: "reconstruct" },
  { href: "/architecture", label: "System Architecture", icon: "architecture" },
];

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
            <Link key={i.href} href={i.href} aria-label={i.label} aria-current={path === i.href || (i.href === "/reconstruct" && path.startsWith("/reconstructions/")) ? "page" : undefined}>
              <Icon name={i.icon} size={18} />
              <span>{i.label}</span>
            </Link>
          ))}
        </nav>
        <span style={{ marginLeft: "auto", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <SimulatedChip simulated={state.simulated} />
          <Link className="halt-btn halt-btn-primary" href={`/incidents/${state.incidentId}?view=overview`}>
            <span>OPEN INCIDENT</span>
            <span aria-hidden>→</span>
          </Link>
        </span>
      </header>
      <main className="v2-platform-main" id="platform-main">
        {children}
      </main>
    </div>
  );
}
