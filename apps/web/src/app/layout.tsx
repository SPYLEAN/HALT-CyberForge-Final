import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { OpsProvider } from "@/lib/api/ops";
import { IncidentProvider } from "@/lib/state/incident-store";

import "./globals.css";
import "@/styles/v2.css";

// Canonical typefaces (tokens.json type.families), exposed as the variables tokens.css reads.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HALT — Proof-Carrying Cyber Response",
  description: "Stop the attack. Not the business.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${archivo.variable} ${plexMono.variable}`}>
      <body className="body">
        {/* Shared by the landing page and the Command Center: the incident never restarts between them. */}
        <IncidentProvider incidentId="INC-2417">
          <OpsProvider incidentId="INC-2417">{children}</OpsProvider>
        </IncidentProvider>
      </body>
    </html>
  );
}
