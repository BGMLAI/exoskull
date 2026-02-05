"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import type { AutonomyData } from "./useAutonomyData";
import type { AutonomyGrantUI } from "./types";
import { CATEGORY_LABELS, CATEGORY_ICONS } from "./types";

interface Props {
  data: AutonomyData;
}

export function PermissionsTab({ data }: Props) {
  const { grants, createGrant, toggleGrant, updateGrant, deleteGrant } = data;

  // New grant form
  const [showNew, setShowNew] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newDailyLimit, setNewDailyLimit] = useState("");
  const [newSpendingLimit, setNewSpendingLimit] = useState("");
  const [newExpires, setNewExpires] = useState("");

  // Edit grant
  const [editGrant, setEditGrant] = useState<AutonomyGrantUI | null>(null);
  const [editDailyLimit, setEditDailyLimit] = useState("");
  const [editSpendingLimit, setEditSpendingLimit] = useState("");
  const [editExpires, setEditExpires] = useState("");

  const handleCreate = async () => {
    const ok = await createGrant(newPattern, newCategory, {
      dailyLimit: newDailyLimit ? parseInt(newDailyLimit) : undefined,
      spendingLimit: newSpendingLimit
        ? parseFloat(newSpendingLimit)
        : undefined,
      expiresAt: newExpires || undefined,
    });
    if (ok) {
      setNewPattern("");
      setNewDailyLimit("");
      setNewSpendingLimit("");
      setNewExpires("");
      setShowNew(false);
    }
  };

  const handleEdit = async () => {
    if (!editGrant) return;
    await updateGrant(editGrant.id, {
      dailyLimit: editDailyLimit ? parseInt(editDailyLimit) : undefined,
      spendingLimit: editSpendingLimit
        ? parseFloat(editSpendingLimit)
        : undefined,
      expiresAt: editExpires || undefined,
    });
    setEditGrant(null);
  };

  const openEdit = (grant: AutonomyGrantUI) => {
    setEditGrant(grant);
    setEditDailyLimit(grant.daily_limit?.toString() || "");
    setEditSpendingLimit(grant.spending_limit?.toString() || "");
    setEditExpires(grant.expires_at?.split("T")[0] || "");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Uprawnienia</h2>
          <p className="text-sm text-muted-foreground">
            Wzorce akcji, ktore ExoSkull moze wykonywac bez pytania
          </p>
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Dodaj
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowe uprawnienie</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label>Wzorzec akcji</Label>
                <Input
                  placeholder="np. send_sms:*, create_task, health:*"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  * = wildcard. Np: send_sms:family, health:*, create_task, *
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Kategoria</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {CATEGORY_ICONS[k]} {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Limit dzienny</Label>
                  <Input
                    type="number"
                    placeholder="bez limitu"
                    value={newDailyLimit}
                    onChange={(e) => setNewDailyLimit(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Limit wydatkow</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="bez limitu"
                    value={newSpendingLimit}
                    onChange={(e) => setNewSpendingLimit(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Wygasa</Label>
                <Input
                  type="date"
                  value={newExpires}
                  onChange={(e) => setNewExpires(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>
                Anuluj
              </Button>
              <Button onClick={handleCreate} disabled={!newPattern.trim()}>
                Dodaj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editGrant} onOpenChange={(o) => !o && setEditGrant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edytuj:{" "}
              <code className="font-mono text-sm">
                {editGrant?.action_pattern}
              </code>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Limit dzienny</Label>
                <Input
                  type="number"
                  placeholder="bez limitu"
                  value={editDailyLimit}
                  onChange={(e) => setEditDailyLimit(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Limit wydatkow</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="bez limitu"
                  value={editSpendingLimit}
                  onChange={(e) => setEditSpendingLimit(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Wygasa</Label>
              <Input
                type="date"
                value={editExpires}
                onChange={(e) => setEditExpires(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGrant(null)}>
              Anuluj
            </Button>
            <Button onClick={handleEdit}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Categories */}
      {Object.keys(grants).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Brak uprawnien</h3>
            <p className="text-muted-foreground">
              Dodaj uprawnienia zeby ExoSkull mogl dzialac autonomicznie
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grants).map(([category, categoryGrants]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span>{CATEGORY_ICONS[category] || "⚙️"}</span>
                {CATEGORY_LABELS[category] || category}
                <Badge variant="secondary" className="text-xs ml-auto">
                  {categoryGrants.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoryGrants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono">
                      {grant.action_pattern}
                    </code>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Uzyto: {grant.use_count}x</span>
                      {grant.daily_limit && (
                        <span>Limit: {grant.daily_limit}/d</span>
                      )}
                      {grant.spending_limit && (
                        <span>Max: {grant.spending_limit} PLN</span>
                      )}
                      {grant.expires_at && (
                        <span>
                          Do:{" "}
                          {new Date(grant.expires_at).toLocaleDateString(
                            "pl-PL",
                          )}
                        </span>
                      )}
                      {grant.error_count > 0 && (
                        <span className="text-red-500">
                          Bledy: {grant.error_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(grant)}
                      title="Edytuj"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={grant.is_active ? "outline" : "default"}
                      onClick={() => toggleGrant(grant.id, grant.is_active)}
                      title={grant.is_active ? "Wylacz" : "Wlacz"}
                    >
                      {grant.is_active ? (
                        <ShieldCheck className="w-4 h-4" />
                      ) : (
                        <ShieldOff className="w-4 h-4" />
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Usun">
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Usunac uprawnienie?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Wzorzec{" "}
                            <code className="font-mono">
                              {grant.action_pattern}
                            </code>{" "}
                            zostanie trwale usuniety. ExoSkull nie bedzie mogl
                            juz wykonywac tej akcji autonomicznie.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteGrant(grant.id)}
                          >
                            Usun
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
