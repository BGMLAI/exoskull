"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Zap,
  Database,
  Globe,
  Bell,
  Play,
  RotateCcw,
  Code2,
  History,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type SkillDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  tier: string;
  executor_code: string;
  config_schema: Record<string, unknown>;
  capabilities: {
    database: string[];
    tables: string[];
    notifications: boolean;
    externalApi: boolean;
  };
  risk_level: "low" | "medium" | "high";
  generation_prompt: string | null;
  generated_by: string;
  generation_tokens: number | null;
  approval_status: "pending" | "approved" | "rejected" | "revoked";
  approved_at: string | null;
  rejection_reason: string | null;
  security_audit: {
    passed: boolean;
    blockedPatterns: string[];
    warnings: string[];
    riskScore: number;
    analyzedAt: string;
  };
  usage_count: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type SkillVersion = {
  id: string;
  version: string;
  changelog: string | null;
  created_at: string;
};

type ExecutionLog = {
  action: string | null;
  success: boolean;
  execution_time_ms: number | null;
  error_message: string | null;
  created_at: string;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "Oczekuje na zatwierdzenie",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: Clock,
  },
  approved: {
    label: "Aktywny",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Odrzucony",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: XCircle,
  },
  revoked: {
    label: "Cofniety",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    icon: XCircle,
  },
};

const RISK_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Niskie ryzyko", color: "text-green-600 dark:text-green-400" },
  medium: {
    label: "Srednie ryzyko",
    color: "text-yellow-600 dark:text-yellow-400",
  },
  high: { label: "Wysokie ryzyko", color: "text-red-600 dark:text-red-400" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Approval state
  const [approvalCode, setApprovalCode] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Execution test state
  const [testMethod, setTestMethod] = useState<string>("getData");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);

  // UI state
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadAll();
  }, [id]);

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setUserId(user.id);
    await loadSkill(user.id);
  }

  async function loadSkill(tenantId: string) {
    try {
      setLoading(true);
      const res = await fetch(`/api/skills/${id}`);

      if (!res.ok) {
        router.push("/dashboard/skills");
        return;
      }

      const data = await res.json();
      setSkill(data.skill);
      setVersions(data.versions || []);
      setLogs(data.recentExecutions || []);
    } catch (error) {
      console.error("[SkillDetail] Load error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!userId || !approvalCode.trim()) return;
    setApproving(true);
    setApprovalError(null);
    setApprovalMessage(null);

    try {
      const res = await fetch(`/api/skills/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: approvalCode.trim(), channel: "sms" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setApprovalError(data.error || "Zatwierdzenie nie powiodlo sie");
        return;
      }

      setApprovalMessage(data.message);
      setApprovalCode("");
      await loadSkill(userId);
    } catch (error) {
      console.error("[SkillDetail] Approve error:", error);
      setApprovalError("Blad polaczenia");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!userId) return;
    if (!confirm("Odrzucic ten skill?")) return;

    try {
      const res = await fetch(`/api/skills/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reject",
          reason: "Odrzucony z dashboard",
        }),
      });

      if (res.ok) {
        await loadSkill(userId);
      }
    } catch (error) {
      console.error("[SkillDetail] Reject error:", error);
    }
  }

  async function handleTestExecution() {
    if (!userId || !skill) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await fetch(`/api/skills/${id}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: testMethod,
          sandbox: skill.approval_status !== "approved",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setTestError(data.error || "Wykonanie nie powiodlo sie");
        return;
      }

      setTestResult(data);
    } catch (error) {
      console.error("[SkillDetail] Test error:", error);
      setTestError("Blad polaczenia");
    } finally {
      setTesting(false);
    }
  }

  async function handleRollback(version: string) {
    if (!userId) return;
    if (!confirm(`Przywrocic wersje ${version}?`)) return;

    try {
      const res = await fetch(`/api/skills/${id}/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version }),
      });

      if (res.ok) {
        await loadSkill(userId);
      }
    } catch (error) {
      console.error("[SkillDetail] Rollback error:", error);
    }
  }

  function copyCode() {
    if (!skill) return;
    navigator.clipboard.writeText(skill.executor_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Skill nie znaleziony.
      </div>
    );
  }

  const statusCfg =
    STATUS_CONFIG[skill.approval_status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const riskCfg = RISK_CONFIG[skill.risk_level] || RISK_CONFIG.low;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-4 md:p-8 space-y-6 overflow-y-auto h-full">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/skills")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Powrot do listy
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{skill.name}</h1>
            <Badge className={statusCfg.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusCfg.label}
            </Badge>
          </div>
          {skill.description && (
            <p className="text-muted-foreground">{skill.description}</p>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{skill.slug}</span>
            <span>v{skill.version}</span>
            <span>{new Date(skill.created_at).toLocaleString("pl-PL")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Approval Section (if pending) */}
          {skill.approval_status === "pending" && (
            <Card className="border-yellow-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <Clock className="h-5 w-5" />
                  Oczekuje na zatwierdzenie
                </CardTitle>
                <CardDescription>
                  Kod potwierdzajacy zostal wyslany SMS-em. Wpisz go ponizej.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="approval-code">Kod potwierdzajacy</Label>
                    <Input
                      id="approval-code"
                      value={approvalCode}
                      onChange={(e) => setApprovalCode(e.target.value)}
                      placeholder="6-cyfrowy kod"
                      maxLength={6}
                      disabled={approving}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleApprove}
                    disabled={approving || approvalCode.length < 6}
                  >
                    {approving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Zatwierdz
                  </Button>
                  <Button variant="destructive" onClick={handleReject}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Odrzuc
                  </Button>
                </div>
                {approvalError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="inline h-4 w-4 mr-1" />
                    {approvalError}
                  </p>
                )}
                {approvalMessage && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" />
                    {approvalMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Rejection reason */}
          {skill.approval_status === "rejected" && skill.rejection_reason && (
            <Card className="border-red-500/50">
              <CardContent className="p-4">
                <p className="text-sm text-red-600 dark:text-red-400">
                  <XCircle className="inline h-4 w-4 mr-1" />
                  Powod odrzucenia: {skill.rejection_reason}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Test Execution (approved or pending sandbox) */}
          {(skill.approval_status === "approved" ||
            skill.approval_status === "pending") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Test Execution
                </CardTitle>
                <CardDescription>
                  Uruchom metode skilla w sandbox i sprawdz wynik.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {skill.approval_status === "pending" && (
                  <div className="text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Tryb sandbox — wyniki nie sa zapisywane
                  </div>
                )}
                <div className="flex gap-3">
                  <select
                    value={testMethod}
                    onChange={(e) => setTestMethod(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="getData">getData()</option>
                    <option value="getInsights">getInsights()</option>
                    <option value="getActions">getActions()</option>
                  </select>
                  <Button onClick={handleTestExecution} disabled={testing}>
                    {testing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Uruchom
                  </Button>
                </div>

                {testError && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md font-mono">
                    {testError}
                  </div>
                )}
                {testResult && (
                  <pre className="text-sm bg-muted p-3 rounded-md overflow-auto max-h-64 font-mono">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}

          {/* Code Viewer */}
          <Card>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setCodeExpanded(!codeExpanded)}
            >
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Kod Executora
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyCode();
                    }}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  {codeExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            {codeExpanded && (
              <CardContent>
                <pre className="text-sm bg-muted p-4 rounded-md overflow-auto max-h-[500px] font-mono leading-relaxed">
                  {skill.executor_code}
                </pre>
              </CardContent>
            )}
          </Card>

          {/* Execution Logs */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Ostatnie wykonania
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-mono">
                          {log.action || "getData"}
                        </span>
                        {log.execution_time_ms && (
                          <span className="text-muted-foreground">
                            {log.execution_time_ms}ms
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {log.error_message && (
                          <span className="text-red-600 dark:text-red-400 text-xs truncate max-w-[200px]">
                            {log.error_message}
                          </span>
                        )}
                        <span className="text-muted-foreground text-xs">
                          {new Date(log.created_at).toLocaleString("pl-PL")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column - Sidebar */}
        <div className="space-y-6">
          {/* Security Audit */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4" />
                Audyt bezpieczenstwa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ryzyko</span>
                <span className={`text-sm font-medium ${riskCfg.color}`}>
                  {riskCfg.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Wynik audytu
                </span>
                {skill.security_audit?.passed ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    PASS
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                    FAIL
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Risk Score
                </span>
                <span className="text-sm font-mono">
                  {skill.security_audit?.riskScore ?? "-"}/100
                </span>
              </div>

              {skill.security_audit?.warnings?.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">
                    Ostrzezenia:
                  </p>
                  {skill.security_audit.warnings.map((w, i) => (
                    <p
                      key={i}
                      className="text-xs text-yellow-600 dark:text-yellow-400"
                    >
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {skill.security_audit?.blockedPatterns?.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">
                    Zablokowane:
                  </p>
                  {skill.security_audit.blockedPatterns.map((p, i) => (
                    <p
                      key={i}
                      className="text-xs text-red-600 dark:text-red-400 font-mono"
                    >
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Uprawnienia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {skill.capabilities?.database?.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span>DB: {skill.capabilities.database.join(", ")}</span>
                </div>
              )}
              {skill.capabilities?.tables?.length > 0 && (
                <div className="text-sm pl-6">
                  <span className="text-muted-foreground">Tabele: </span>
                  {skill.capabilities.tables.map((t, i) => (
                    <span
                      key={i}
                      className="font-mono text-xs bg-muted px-1 py-0.5 rounded mr-1"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {skill.capabilities?.externalApi && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>Zewnetrzne API</span>
                </div>
              )}
              {skill.capabilities?.notifications && (
                <div className="flex items-center gap-2 text-sm">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span>Powiadomienia</span>
                </div>
              )}
              {!skill.capabilities?.database?.length &&
                !skill.capabilities?.externalApi &&
                !skill.capabilities?.notifications && (
                  <p className="text-sm text-muted-foreground">
                    Brak specjalnych uprawnien
                  </p>
                )}
            </CardContent>
          </Card>

          {/* Usage Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Statystyki
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Uzycia</span>
                <span className="font-medium">{skill.usage_count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ostatnie</span>
                <span>
                  {skill.last_used_at
                    ? new Date(skill.last_used_at).toLocaleString("pl-PL")
                    : "Nigdy"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tokeny</span>
                <span>{skill.generation_tokens || "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Generator</span>
                <span className="font-mono text-xs">{skill.generated_by}</span>
              </div>
            </CardContent>
          </Card>

          {/* Version History */}
          {versions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Historia wersji
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-sm py-2 border-b last:border-0"
                  >
                    <div>
                      <span className="font-mono">v{v.version}</span>
                      {v.changelog && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.changelog}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString("pl-PL")}
                      </p>
                    </div>
                    {v.version !== skill.version && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRollback(v.version)}
                        title="Przywroc te wersje"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Generation Prompt */}
          {skill.generation_prompt && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Prompt generujacy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground italic">
                  &ldquo;{skill.generation_prompt}&rdquo;
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
