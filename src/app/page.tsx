"use client";

import type { ReactElement } from "react";
import { useMemo } from "react";
import type { TFunction } from "i18next";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Code2,
  Shield,
  Trophy,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import AuditSessionTimer from "@/components/AuditSessionTimer";
import ConnectButton from "@/components/ConnectButton";
import ContractTimeTraveler from "@/components/ContractTimeTraveler";
import EmergencyHaltButton from "@/components/EmergencyHaltButton";
import ErrorBoundary from "@/components/ErrorBoundary";
import EventMonitor from "@/components/EventMonitor";
import FeedbackModal from "@/components/FeedbackModal";
import ForceSyncButton from "@/components/ForceSyncButton";
import GasHeatmap from "@/components/GasHeatmap";
import GlobalStateSearch from "@/components/GlobalStateSearch";
import LanguageToggle from "@/components/LanguageToggle";
import Leaderboard from "@/components/leaderboard";
import NetworkStatus from "@/components/NetworkStatus";
import { ProofHistoryTable } from "@/components/ProofViewer";
import PRFeed from "@/components/PRFeed";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import SecurityScannerResults from "@/components/security";
import RelayerVault from "@/components/security/RelayerVault";
import AuditExport from "@/components/security/AuditExport";
import ContractCallGraph from "@/components/ContractCallGraph";
import TaskCard from "@/components/TaskCard";
import ThemeToggle from "@/components/ThemeToggle";
import TransactionFeed from "@/components/TransactionFeed";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import { AccessControl } from "@/components/Guard";
import SessionTimer from "@/components/timer";
import { useRole } from "@/context/RoleContext";
import { useWallet } from "@/context/WalletContext";
import { useAlerts } from "@/context/AlertContext";
import { AlertBanner } from "@/components/AlertBanner";
import type { UserRole } from "@/services/roleClient";

function getRoleLabel(
  role: UserRole,
  isLoading: boolean,
  t: TFunction,
): string {
  if (isLoading) {
    return t("role.checking");
  }

  switch (role) {
    case "admin":
      return t("common.admin");
    case "guardian":
      return t("common.guardian");
    default:
      return t("common.unauthorized");
  }
}

function getRoleHelperText(
  role: UserRole,
  isConnected: boolean,
  isLoading: boolean,
  t: TFunction,
): string {
  if (isLoading) {
    return t("role.checkingOnChain");
  }

  if (!isConnected) {
    return t("wallet.connectHelper");
  }

  if (role === "unauthorized") {
    return t("role.noPermissions");
  }

  return t("role.onChainAccess");
}

function getWelcomeTitle(
  isConnected: boolean,
  isRoleLoading: boolean,
  roleLabel: string,
  t: TFunction,
): string {
  if (!isConnected) {
    return t("welcome.guestTitle");
  }

  if (isRoleLoading) {
    return t("welcome.checkingTitle");
  }

  return t("welcome.returningTitle", { role: roleLabel });
}

function getWelcomeDescription(
  role: UserRole,
  isRoleLoading: boolean,
  t: TFunction,
): string {
  if (isRoleLoading) {
    return t("welcome.checkingDescription");
  }

  switch (role) {
    case "admin":
      return t("welcome.adminDescription");
    case "guardian":
      return t("welcome.guardianDescription");
    default:
      return t("welcome.guestDescription");
  }
}

export default function Home(): ReactElement {
  const { t } = useTranslation();
  const { isConnected, reputation } = useWallet();
  const { role, isLoading: isRoleLoading } = useRole();
  const roleLabel = getRoleLabel(role, isRoleLoading, t);
  const { addAlert } = useAlerts();
  const roleHelperText = getRoleHelperText(role, isConnected, isRoleLoading, t);
  const welcomeTitle = getWelcomeTitle(
    isConnected,
    isRoleLoading,
    roleLabel,
    t,
  );
  const welcomeDescription = getWelcomeDescription(role, isRoleLoading, t);
  const widgets = useMemo(() => {
    const list = [
      {
        id: "pr-feed",
        title: t("app.prFeedTitle", { defaultValue: "PR Validation Queue" }),
        component: (
          <ErrorBoundary>
            <PRFeed />
          </ErrorBoundary>
        ),
      },
      {
        id: "state-search",
        title: t("app.stateSearchTitle", {
          defaultValue: "Global State Search",
        }),
        component: (
          <ErrorBoundary>
            <GlobalStateSearch />
          </ErrorBoundary>
        ),
      },
      {
        id: "transaction-feed",
        title: t("app.transactionFeedTitle", {
          defaultValue: "Activity Monitor",
        }),
        component: (
          <ErrorBoundary>
            <TransactionFeed />
          </ErrorBoundary>
        ),
      },
      {
        id: "security-scanner",
        title: t("app.securityScannerTitle", {
          defaultValue: "Security Check",
        }),
        component: (
          <ErrorBoundary>
            <SecurityScannerResults />
          </ErrorBoundary>
        ),
      },
      {
        id: "leaderboard",
        title: t("app.leaderboardTitle", {
          defaultValue: "Guardian Leaderboard",
        }),
        component: (
          <ErrorBoundary>
            <Leaderboard />
          </ErrorBoundary>
        ),
      },
      {
        id: "quick-actions",
        title: t("actions.heading", { defaultValue: "Quick Actions" }),
        component: (
          <div className="h-full flex flex-col justify-between">
            <div className="grid grid-cols-1 gap-3">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label={t("actions.networkStatus")}
                onClick={() => {
                  const el = document.getElementById("network-status-footer");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span className="font-medium">
                  {t("actions.networkStatus")}
                </span>
                <ArrowRight
                  className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white transition-colors"
                  aria-hidden="true"
                />
              </button>
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label={t("actions.stake")}
                onClick={() =>
                  addAlert({
                    type: "info",
                    title: t("actions.comingSoonTitle", { defaultValue: "Coming Soon" }),
                    message: t("actions.stakeComingSoon", { defaultValue: "Staking will be available in a future release." }),
                    source: "quick-actions",
                    dismissable: true,
                  })
                }
              >
                <span className="font-medium">{t("actions.stake")}</span>
                <ArrowRight
                  className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white transition-colors"
                  aria-hidden="true"
                />
              </button>
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label={t("actions.rewards")}
                onClick={() =>
                  addAlert({
                    type: "info",
                    title: t("actions.comingSoonTitle", { defaultValue: "Coming Soon" }),
                    message: t("actions.rewardsComingSoon", { defaultValue: "Rewards will be available in a future release." }),
                    source: "quick-actions",
                    dismissable: true,
                  })
                }
              >
                <span className="font-medium">{t("actions.rewards")}</span>
                <ArrowRight
                  className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white transition-colors"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "gas-heatmap",
        title: t("app.gasHeatmapTitle", {
          defaultValue: "Gas Heatmap Analysis",
        }),
        component: (
          <ErrorBoundary>
            <GasHeatmap />
          </ErrorBoundary>
        ),
      },
      {
        id: "session-timer",
        title: t("app.sessionTimerTitle", { defaultValue: "Session Timer" }),
        component: (
          <ErrorBoundary>
            <SessionTimer />
          </ErrorBoundary>
        ),
      },
      {
        id: "contract-time-traveler",
        title: t("app.contractTimeTravelerTitle", {
          defaultValue: "Contract Time Traveler",
        }),
        component: (
          <ErrorBoundary>
            <ContractTimeTraveler />
          </ErrorBoundary>
        ),
      },
      {
        id: "audit-session-timer",
        title: t("app.auditSessionTimerTitle", {
          defaultValue: "Audit Session Timer",
        }),
        component: (
          <ErrorBoundary>
            <AuditSessionTimer />
          </ErrorBoundary>
        ),
      },
      {
        id: "event-monitor",
        title: t("app.eventMonitorTitle", { defaultValue: "Event Monitor" }),
        component: (
          <ErrorBoundary>
            <EventMonitor />
          </ErrorBoundary>
        ),
      },
      {
        id: "contract-call-graph",
        title: t("app.contractCallGraphTitle", {
          defaultValue: "Contract Call Graph",
        }),
        component: (
          <ErrorBoundary>
            <ContractCallGraph />
          </ErrorBoundary>
        ),
      },
    ];

    if (role === "admin") {
      list.push({
        id: "task-card",
        title: t("admin.management", { defaultValue: "Admin Management" }),
        component: (
          <ErrorBoundary>
            <TaskCard />
          </ErrorBoundary>
        ),
      });
      list.push({
        id: "emergency-halt",
        title: t("admin.emergencyHalt", { defaultValue: "Emergency Halt" }),
        component: (
          <ErrorBoundary>
            <EmergencyHaltButton />
          </ErrorBoundary>
        ),
      });
      list.push({
        id: "admin-vault",
        title: t("admin.relayerVault", { defaultValue: "Relayer Vault" }),
        component: (
          <ErrorBoundary>
            <RelayerVault />
          </ErrorBoundary>
        ),
      });
      list.push({
        id: "audit-export",
        title: t("admin.auditExport", { defaultValue: "Audit Export" }),
        component: (
          <ErrorBoundary>
            <AuditExport />
          </ErrorBoundary>
        ),
      });
    }

    return list;
  }, [t, role]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/30">
                <Shield
                  className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Vero Guardian
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t("app.networkName")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PushNotificationToggle />
              <FeedbackModal />
              <LanguageToggle />
              <ThemeToggle />
              <ForceSyncButton />
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      <AlertBanner />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Welcome / Stats */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-white to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="text-center lg:text-left">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  {welcomeTitle}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto lg:mx-0">
                  {welcomeDescription}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 w-full lg:w-auto">
                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                    <Trophy className="w-4 h-4" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {t("stats.reputation")}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {isConnected ? reputation : "---"}
                  </p>
                </div>
                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-1">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {t("stats.validations")}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {isConnected ? 12 : "---"}
                  </p>
                </div>
                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-1">
                    <Shield className="w-4 h-4" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {t("stats.role")}
                    </span>
                  </div>
                  <p
                    className="text-2xl font-bold text-slate-900 dark:text-white"
                    aria-live="polite"
                  >
                    {roleLabel}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {roleHelperText}
                  </p>
                </div>
                <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-[1.02]">
                  <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400 mb-1">
                    <Activity className="w-4 h-4" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {t("common.active")}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{isConnected ? t('common.yes') : t('common.no')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - PR Feed */}
          <div className="lg:col-span-2 order-2 lg:order-1">
            <ErrorBoundary>
              <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-lg">
                <PRFeed />
              </div>
            </ErrorBoundary>
          </div>

          {/* Right Column - Admin Management & Quick Actions */}
          <div className="space-y-6">
            <ErrorBoundary>
              <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                <SessionTimer />
              </div>
            </ErrorBoundary>

            <ErrorBoundary>
              <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                <GlobalStateSearch />
              </div>
            </ErrorBoundary>

            <ErrorBoundary>
              <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                <ContractTimeTraveler />
              </div>
            </ErrorBoundary>

            <ErrorBoundary>
              <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                <ProofHistoryTable />
              </div>
            </ErrorBoundary>

            <ErrorBoundary>
              <TransactionFeed />
            </ErrorBoundary>

            <ErrorBoundary>
              <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                <SecurityScannerResults />
              </div>
            </ErrorBoundary>

            <AccessControl roles={['admin']}>
              {/* Admin Management */}
              <ErrorBoundary>
                <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-lg">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-3">
                    {t('admin.management')}
                  </p>
                </div>
              </ErrorBoundary>
            </AccessControl>
          </div>
        </div>

        {/* Dashboard Grid */}
        <DashboardGrid widgets={widgets} role={role} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 mt-12 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col gap-6">
            <div id="network-status-footer">
              <NetworkStatus />
            </div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-500">
                {t("app.footerCopyright")}
              </p>
              <nav
                className="flex items-center gap-6"
                aria-label={t("app.footerNavigation")}
              >
                <a
                  href="#"
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors focus:outline-none focus:underline"
                >
                  {t("common.documentation")}
                </a>
                <a
                  href="#"
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors focus:outline-none focus:underline"
                >
                  {t("common.discord")}
                </a>
                <a
                  href="#"
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors focus:outline-none focus:underline"
                >
                  {t("common.github")}
                </a>
              </nav>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
