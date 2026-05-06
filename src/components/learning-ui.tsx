import {
  Bell,
  BookOpen,
  Bot,
  Crown,
  Database,
  Home,
  Lock,
  MoreHorizontal,
  Search,
  Sparkles,
  Target,
  Trophy,
  User,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Language, Translation } from "../i18n";
import type { AccessDecision, AppState, PlanSlug } from "../types";
import { getActivePlans, getSubscriptionSummary } from "../services/subscription";

export type AppView = "home" | "practice" | "tests" | "ai" | "vocabulary" | "progress" | "premium" | "admin";

const navItems = [
  { id: "home" as const, labelKey: "home" as const, icon: Home },
  { id: "practice" as const, labelKey: "practice" as const, icon: Target },
  { id: "tests" as const, labelKey: "tests" as const, icon: BookOpen },
  { id: "ai" as const, labelKey: "ai" as const, icon: Bot },
  { id: "vocabulary" as const, labelKey: "vocabulary" as const, icon: Sparkles },
  { id: "progress" as const, labelKey: "progress" as const, icon: Trophy },
  { id: "premium" as const, labelKey: "premium" as const, icon: Crown },
  { id: "admin" as const, labelKey: "admin" as const, icon: Database },
];

const mobilePrimaryItems = navItems.filter((item) => ["home", "practice", "tests", "progress"].includes(item.id));
const mobileMoreItems = navItems.filter((item) => !["home", "practice", "tests", "progress"].includes(item.id));

export function AppLayout({
  view,
  onViewChange,
  summary,
  language,
  t,
  onLanguageChange,
  children,
}: {
  view: AppView;
  onViewChange: (view: AppView) => void;
  summary: ReturnType<typeof getSubscriptionSummary>;
  language: Language;
  t: Translation;
  onLanguageChange: (language: Language) => void;
  children: ReactNode;
}) {
  return (
    <div className="future-shell">
      <FloatingDock view={view} onViewChange={onViewChange} t={t} />
      <div className="content-shell">
        <Topbar
          summary={summary}
          language={language}
          t={t}
          onLanguageChange={onLanguageChange}
          onUpgrade={() => onViewChange("premium")}
        />
        <main className="page-transition">{children}</main>
      </div>
    </div>
  );
}

export function FloatingDock({ view, onViewChange, t }: { view: AppView; onViewChange: (view: AppView) => void; t: Translation }) {
  const [moreOpen, setMoreOpen] = useState(false);

  function navigate(viewId: AppView) {
    onViewChange(viewId);
    setMoreOpen(false);
  }

  return (
    <>
      <nav className="floating-dock" aria-label="Primary navigation">
        <div className="dock-brand">
          <div className="orb-logo" />
          <div>
            <strong>TOEIC</strong>
            <span>AI Lab</span>
          </div>
        </div>
        <div className="dock-items dock-items-desktop">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "dock-item active" : "dock-item"}
                onClick={() => navigate(item.id)}
                aria-label={t.nav[item.labelKey]}
              >
                <Icon size={18} />
                <span>{t.nav[item.labelKey]}</span>
              </button>
            );
          })}
        </div>
        <div className="dock-items dock-items-mobile">
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "dock-item active" : "dock-item"}
                onClick={() => navigate(item.id)}
                aria-label={t.nav[item.labelKey]}
              >
                <Icon size={18} />
                <span>{t.nav[item.labelKey]}</span>
              </button>
            );
          })}
          <button
            className={mobileMoreItems.some((item) => item.id === view) || moreOpen ? "dock-item active" : "dock-item"}
            onClick={() => setMoreOpen((open) => !open)}
            aria-label={t.nav.more}
          >
            <MoreHorizontal size={18} />
            <span>{t.nav.more}</span>
          </button>
        </div>
      </nav>
      {moreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="mobile-more-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <strong>{t.nav.more}</strong>
            <div className="mobile-more-grid">
              {mobileMoreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={view === item.id ? "more-item active" : "more-item"}
                    onClick={() => navigate(item.id)}
                    aria-label={t.nav[item.labelKey]}
                  >
                    <Icon size={20} />
                    <span>{t.nav[item.labelKey]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Topbar({
  summary,
  language,
  t,
  onLanguageChange,
  onUpgrade,
}: {
  summary: ReturnType<typeof getSubscriptionSummary>;
  language: Language;
  t: Translation;
  onLanguageChange: (language: Language) => void;
  onUpgrade: () => void;
}) {
  return (
    <header className="topbar-glass">
      <label className="search-pill">
        <Search size={18} />
        <input placeholder={t.topbar.search} aria-label={t.topbar.search} />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="topbar-actions">
        {!summary.isPremium && (
          <GradientButton onClick={onUpgrade}>
            <Crown size={16} />
            {t.topbar.upgrade}
          </GradientButton>
        )}
        <div className="language-toggle" aria-label="Language selector">
          <button className={language === "vi" ? "active" : ""} onClick={() => onLanguageChange("vi")}>
            VI
          </button>
          <button className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>
            EN
          </button>
        </div>
        <button className="round-action" aria-label={t.topbar.notifications}>
          <Bell size={18} />
          <i />
        </button>
        <button className="avatar-button" aria-label={t.topbar.profile}>
          <User size={18} />
        </button>
      </div>
    </header>
  );
}

export function GlassCard({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}

export function GradientButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button className={`gradient-button ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button className={`ghost-button ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  meta,
  tone = "indigo",
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "indigo" | "sky" | "green" | "amber";
}) {
  return (
    <GlassCard className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{meta}</p>
    </GlassCard>
  );
}

export function LockedFeatureOverlay({
  title = "Unlock smarter TOEIC learning",
  description = "Nâng cấp Premium để mở AI explanations, weakness analysis và lộ trình học cá nhân hóa.",
  onUpgrade,
  onLater,
  upgradeLabel = "Upgrade to Premium",
  maybeLaterLabel = "Maybe later",
}: {
  title?: string;
  description?: string;
  onUpgrade: () => void;
  onLater?: () => void;
  upgradeLabel?: string;
  maybeLaterLabel?: string;
}) {
  return (
    <div className="locked-overlay">
      <Lock size={26} />
      <h3>{title}</h3>
      <p>{description}</p>
      <GradientButton onClick={onUpgrade}>{upgradeLabel}</GradientButton>
      {onLater && (
        <button className="link-button" onClick={onLater}>
          {maybeLaterLabel}
        </button>
      )}
    </div>
  );
}

export function UpgradePremiumModal({
  decision,
  state,
  t,
  onClose,
  onSubscribe,
}: {
  decision?: AccessDecision | null;
  state: AppState;
  t: Translation;
  onClose: () => void;
  onSubscribe: (planSlug: PlanSlug) => void;
}) {
  const premiumPlans = getActivePlans(state).filter((plan) => plan.slug !== "free");
  if (!decision) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="premium-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close premium modal">
          <X size={18} />
        </button>
        <div className="modal-heading">
          <Crown size={30} />
          <div>
            <h2>{decision.code === "DAILY_TEST_LIMIT_REACHED" ? t.locked.outOfTests : t.locked.title}</h2>
            <p>{decision.message ?? t.locked.premiumRequired}</p>
          </div>
        </div>
        <div className="plan-compare">
          <div>
            <strong>{t.premium.freePlan}</strong>
            <span>5 tests/day</span>
            <span>{t.premium.basicScore}</span>
            <span>{t.premium.noAiCoach}</span>
          </div>
          <div className="premium-column">
            <strong>{t.premium.premiumPlan}</strong>
            <span>{t.premium.unlimitedTests}</span>
            <span>{t.premium.aiExplanations}</span>
            <span>{t.premium.adaptiveStudyPlan}</span>
          </div>
        </div>
        <div className="modal-plans">
          {premiumPlans.map((plan) => (
            <button
              key={plan.id}
              className={plan.slug === "premium_quarterly" ? "modal-plan best" : "modal-plan"}
              onClick={() => onSubscribe(plan.slug)}
            >
              {plan.slug === "premium_quarterly" && <small>{t.premium.bestValue}</small>}
              <strong>{plan.name.replace("Premium ", "")}</strong>
              <span>{plan.price.toLocaleString("vi-VN")}đ</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
