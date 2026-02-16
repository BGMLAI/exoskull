import type { WorldOrbData } from "@/components/3d/WorldOrb";

/**
 * Demo worlds — in production these come from DB (user+IORS co-created).
 * Extracted to a separate file so both 3D scene and HTML overlays can import
 * without pulling in Three.js dependencies.
 */
export const DEMO_WORLDS: WorldOrbData[] = [
  {
    id: "zdrowie",
    name: "Zdrowie",
    color: "#10b981",
    position: [12, 6, -5],
    radius: 1.5,
    moons: [
      { id: "sen", name: "Sen", orbitRadius: 3.0, speed: 0.3, phase: 0 },
      {
        id: "trening",
        name: "Trening",
        orbitRadius: 3.8,
        speed: 0.45,
        phase: 2.2,
      },
    ],
  },
  {
    id: "praca",
    name: "Praca",
    color: "#3b82f6",
    position: [-9, 8, -12],
    radius: 2.0,
    moons: [
      {
        id: "exoskull",
        name: "ExoSkull",
        orbitRadius: 3.6,
        speed: 0.3,
        phase: 0,
      },
      {
        id: "meeting",
        name: "Spotkania",
        orbitRadius: 4.4,
        speed: 0.45,
        phase: 1.5,
      },
      { id: "code", name: "Kod", orbitRadius: 5.2, speed: 0.15, phase: 3.0 },
    ],
  },
  {
    id: "relacje",
    name: "Relacje",
    color: "#f59e0b",
    position: [6, 5, 8],
    radius: 1.7,
    moons: [
      {
        id: "rodzina",
        name: "Rodzina",
        orbitRadius: 3.2,
        speed: 0.35,
        phase: 0.5,
      },
      {
        id: "przyjaciele",
        name: "Przyjaciele",
        orbitRadius: 4.0,
        speed: 0.2,
        phase: 2.8,
      },
    ],
  },
];
