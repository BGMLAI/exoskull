"use client";

const CAPABILITIES = [
  { value: "56+", label: "narzedzi AI" },
  { value: "24/7", label: "asystent glosowy" },
  { value: "18", label: "automatycznych Modow" },
];

export function SocialProof() {
  return (
    <div className="flex justify-center gap-8 md:gap-12 py-8">
      {CAPABILITIES.map((item) => (
        <div key={item.label} className="text-center">
          <div className="text-3xl md:text-4xl font-bold text-foreground">
            {item.value}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
