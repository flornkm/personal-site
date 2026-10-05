// A single path renders wide (image or video); an array renders 3-up (phone screenshots).
export type ProjectMedia = string | string[];

export type Project = {
  name: string;
  date: string;
  url?: string;
  /** One-sentence summary of the project and the work — read by screen readers,
   * crawlers, and the markdown variants of pages; the visual layout stays media-only. */
  description?: string;
  /** Projects without media are listed in the sidebar but not scrolled to. */
  media?: ProjectMedia[];
  /** Lower values lead the home page media column; the sidebar keeps array order regardless. */
  mediaOrder?: number;
};

export const PROJECTS: Project[] = [
  {
    name: "Rogo",
    description:
      "Design engineering for Rogo, an AI platform for financial research — design system, notifications, and agent workflows.",
    date: "2025 – 2026",
    url: "https://rogo.ai",
    mediaOrder: 0,
    media: [
      "/videos/rogo/design-system.webm",
      "/images/rogo/notifications.webp",
      "/videos/rogo/agent.webm",
    ],
  },
  {
    name: "Legora",
    description: "Design work for Legora, an AI platform for legal work.",
    date: "2026",
    url: "https://legora.com",
  },
  {
    name: "Flow",
    description:
      "Design and engineering for Flow Engineering’s web presence, from the company pages to an animated 404.",
    date: "2026",
    url: "https://flowengineering.com",
    mediaOrder: 1,
    media: ["/images/flow/hero.webp", "/videos/flow/company.webm", "/videos/flow/404.webm"],
  },
  {
    name: "Prodex",
    date: "2026",
  },
  {
    name: "Sona",
    description:
      "Product design for Sona, an app that records conversations and turns them into transcripts, summaries, and key insights.",
    date: "2024 – 2025",
    url: "https://sona.wtf",
    mediaOrder: 2,
    media: [
      [
        "/images/sona/recording.webp",
        "/images/sona/processing.webp",
        "/images/sona/key-insights.webp",
      ],
      ["/images/sona/transcript.webp", "/images/sona/sharing.webp", "/images/sona/follow-up.webp"],
      "/videos/sona/sona-use.webm",
      [
        "/images/sona/overview.webp",
        "/images/sona/export.webp",
        "/images/sona/mobile-protocol.webp",
      ],
      ["/images/sona/settings.webp", "/images/sona/upsell-modal.webp", "/images/sona/upsell.webp"],
      ["/images/sona/select.webp", "/images/sona/selected.webp", "/images/sona/bulk-delete.webp"],
      ["/images/sona/invite-user.webp", "/images/sona/faq.webp", "/images/sona/subscriber.webp"],
      ["/images/sona/login.webp", "/images/sona/otp.webp", "/images/sona/otp-loading.webp"],
      "/videos/sona/hero-video.webm",
      "/images/sona/devices.webp",
    ],
  },
  {
    name: "Superpower",
    description:
      "Interface work for Superpower, a preventative health platform — health data categories, protocols, and mobile app surfaces.",
    date: "2025 – 2026",
    url: "https://superpower.com",
    media: [
      "/images/superpower/modal.webp",
      "/videos/superpower/health-categories.webm",
      "/videos/superpower/scroll-effect.webm",
      [
        "/images/superpower/mobile-data-sheet.webp",
        "/images/superpower/mobile-data-categories.webp",
        "/images/superpower/mobile-protocol.webp",
      ],
      "/images/superpower/superpower-ai.webp",
      "/videos/superpower/protocol-reveal.webm",
      "/images/superpower/download-mobile-app.webp",
    ],
  },
  {
    name: "Delphi",
    description: "Design work for Delphi, a platform for interactive digital minds.",
    date: "2026",
    url: "https://delphi.ai",
  },
  {
    name: "Kalshi",
    description: "Design work for Kalshi, a regulated prediction-market exchange.",
    date: "2025",
    url: "https://kalshi.com",
  },
  {
    name: "Snaptrude",
    description: "Design work for Snaptrude, a collaborative 3D building-design tool.",
    date: "2025",
    url: "https://snaptrude.com",
  },
  {
    name: "Morphic",
    description: "Product design collaboration with Morphic.",
    date: "2024",
    url: "https://morphic.com",
  },
  {
    name: "Dash0",
    description: "Design work for Dash0, an OpenTelemetry-native observability platform.",
    date: "2024",
    url: "https://dash0.com",
  },
  {
    name: "Opral",
    description:
      "Design engineering for Opral, the company behind the inlang globalization ecosystem.",
    date: "2023 – 2024",
    url: "https://opral.com",
  },
];
