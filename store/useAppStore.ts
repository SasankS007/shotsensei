import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type StrokeType = "forehand" | "backhand" | "volley" | "slice";
export type AppMode = "stroke-analysis" | "ai-rally" | null;
export type ArenaDifficulty = "easy" | "medium" | "hard";

interface SessionEntry {
  id: string;
  mode: AppMode;
  date: string;
  summary: string;
}

/** Saved rep from The Dojo (stroke analysis). */
export interface DojoStrokeSave {
  id: string;
  date: string;
  strokeLabel: string;
  score: number;
  phase?: string;
  note?: string;
}

/** Finished Rally Arena match. */
export interface ArenaMatchSave {
  id: string;
  date: string;
  difficulty: ArenaDifficulty;
  won: boolean;
  playerScore: number;
  aiScore: number;
  trophyEarned: boolean;
}

export interface ArenaDifficultyStats {
  wins: number;
  losses: number;
}

interface AppState {
  currentMode: AppMode;
  selectedStroke: StrokeType;
  sessionHistory: SessionEntry[];
  /** Total arena wins — each win adds a trophy stack unit. */
  trophyCount: number;
  arenaStats: Record<ArenaDifficulty, ArenaDifficultyStats>;
  dojoSaves: DojoStrokeSave[];
  arenaMatches: ArenaMatchSave[];
  setCurrentMode: (mode: AppMode) => void;
  setSelectedStroke: (stroke: StrokeType) => void;
  addSession: (entry: SessionEntry) => void;
  saveDojoStroke: (payload: Omit<DojoStrokeSave, "id" | "date"> & { id?: string }) => void;
  recordArenaMatch: (payload: {
    difficulty: ArenaDifficulty;
    won: boolean;
    playerScore: number;
    aiScore: number;
  }) => void;
  clearHub: () => void;
}

const emptyArenaStats = (): Record<ArenaDifficulty, ArenaDifficultyStats> => ({
  easy: { wins: 0, losses: 0 },
  medium: { wins: 0, losses: 0 },
  hard: { wins: 0, losses: 0 },
});

const formatDate = () =>
  new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentMode: null,
      selectedStroke: "forehand",
      sessionHistory: [],
      trophyCount: 0,
      arenaStats: emptyArenaStats(),
      dojoSaves: [],
      arenaMatches: [],

      setCurrentMode: (mode) => set({ currentMode: mode }),
      setSelectedStroke: (stroke) => set({ selectedStroke: stroke }),

      addSession: (entry) =>
        set((state) => ({
          sessionHistory: [entry, ...state.sessionHistory].slice(0, 50),
        })),

      saveDojoStroke: (payload) => {
        const id = payload.id ?? `dojo-${Date.now()}`;
        const date = formatDate();
        const row: DojoStrokeSave = {
          id,
          date,
          strokeLabel: payload.strokeLabel,
          score: payload.score,
          phase: payload.phase,
          note: payload.note,
        };
        set((state) => ({
          dojoSaves: [row, ...state.dojoSaves].slice(0, 40),
        }));
        get().addSession({
          id,
          mode: "stroke-analysis",
          date,
          summary: `Dojo — ${row.strokeLabel} · score ${Math.round(row.score)}`,
        });
      },

      clearHub: () =>
        set({
          sessionHistory: [],
          trophyCount: 0,
          arenaStats: emptyArenaStats(),
          dojoSaves: [],
          arenaMatches: [],
        }),

      recordArenaMatch: ({ difficulty, won, playerScore, aiScore }) => {
        const id = `arena-${Date.now()}`;
        const date = formatDate();
        const trophyEarned = won;
        set((state) => {
          const arenaStats = { ...state.arenaStats };
          const cur = arenaStats[difficulty] ?? { wins: 0, losses: 0 };
          arenaStats[difficulty] = {
            wins: cur.wins + (won ? 1 : 0),
            losses: cur.losses + (won ? 0 : 1),
          };
          const row: ArenaMatchSave = {
            id,
            date,
            difficulty,
            won,
            playerScore,
            aiScore,
            trophyEarned,
          };
          return {
            arenaStats,
            trophyCount: state.trophyCount + (trophyEarned ? 1 : 0),
            arenaMatches: [row, ...state.arenaMatches].slice(0, 40),
          };
        });
        get().addSession({
          id,
          mode: "ai-rally",
          date,
          summary: `Rally Arena (${difficulty}) — ${won ? "Won" : "Lost"} ${playerScore}-${aiScore}${trophyEarned ? " · +1 trophy" : ""}`,
        });
      },
    }),
    {
      name: "stroke-sensei-hub",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        trophyCount: s.trophyCount,
        arenaStats: s.arenaStats,
        dojoSaves: s.dojoSaves,
        arenaMatches: s.arenaMatches,
        sessionHistory: s.sessionHistory,
      }),
    }
  )
);
