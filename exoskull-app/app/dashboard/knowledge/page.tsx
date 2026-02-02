'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Upload, AlertCircle } from 'lucide-react'

export default function KnowledgePage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Wiedza</h1>
        <p className="text-muted-foreground">
          Wgraj pliki by system lepiej Cie poznal
        </p>
      </div>

      <Card className="border-dashed border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload plikow
          </CardTitle>
          <CardDescription>
            Przeciagnij pliki tutaj lub kliknij by wybrac
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Ta funkcja jest w przygotowaniu</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Wkrotce bedziesz mogl wgrywac dokumenty, wyniki badan, notatki i inne pliki.
              System je przeanalizuje i wykorzysta jako kontekst w rozmowach.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Planowane funkcje
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>- Upload PDF, TXT, obrazow (do 10MB)</p>
          <p>- Automatyczne parsowanie i ekstrakcja tekstu</p>
          <p>- AI-generowane podsumowania</p>
          <p>- Kategoryzacja (zdrowie, produktywnosc, finanse)</p>
          <p>- Semantic search w Twoich dokumentach</p>
          <p>- Integracja z asystentem glosowym</p>
        </CardContent>
      </Card>
    </div>
  )
}
