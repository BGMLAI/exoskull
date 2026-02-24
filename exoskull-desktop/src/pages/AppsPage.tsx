import { Grid3X3 } from "lucide-react";

export default function AppsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Apps</h1>
        <p className="text-sm text-muted-foreground">
          Custom apps built by ExoSkull
        </p>
      </div>

      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <Grid3X3 className="mb-3 h-16 w-16" />
        <h2 className="text-lg font-medium">No Apps Yet</h2>
        <p className="mt-1 text-center text-sm">
          ExoSkull builds custom apps when your goals need them.
          <br />
          Set goals in the Goals page to get started.
        </p>
      </div>
    </div>
  );
}
