"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Mic, Plus, Package, Brain, Settings } from "lucide-react";
import Link from "next/link";

export function QuickActionsWidget() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Szybkie akcje
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Link href="/dashboard/chat">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Mic className="h-4 w-4" />
              Rozmowa
            </Button>
          </Link>
          <Link href="/dashboard/tasks">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Plus className="h-4 w-4" />
              Nowe zadanie
            </Button>
          </Link>
          <Link href="/dashboard/skills">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Package className="h-4 w-4" />
              Skills
            </Button>
          </Link>
          <Link href="/dashboard/memory">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Brain className="h-4 w-4" />
              Pamiec
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Settings className="h-4 w-4" />
              Ustawienia
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
