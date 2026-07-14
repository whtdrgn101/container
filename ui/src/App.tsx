import { Factory as FactoryIcon, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Color, GameState } from '@container/engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as api from '@/lib/api';

/** Display colors for the five container types (see engine COLORS). */
const COLOR_HEX: Record<Color, string> = {
  white: '#f8fafc',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
};

const DEFAULT_NAMES = ['Ann', 'Bob', 'Cid'];

function ContainerChip({ color }: { color: Color }) {
  return (
    <span
      className="inline-block h-4 w-6 rounded-sm border border-black/20 shadow-sm"
      style={{ backgroundColor: COLOR_HEX[color] }}
      title={color}
    />
  );
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      setGame(await api.createGame(names.map((name) => ({ name }))));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleProduce(playerId: string) {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      setGame(await api.produce(game.id, playerId));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Container</h1>
          {game && (
            <Button variant="outline" size="sm" data-testid="new-game" onClick={() => setGame(null)}>
              New game
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <p
            role="alert"
            data-testid="error"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {game ? (
          <section
            aria-label="Player boards"
            data-testid="board"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {game.players.map((player) => {
              const full = player.factoryStore.length >= player.factoryLimit;
              const broke = player.money < 1;
              return (
                <Card key={player.id} data-testid={`player-card-${player.id}`}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{player.name}</CardTitle>
                    <span
                      data-testid={`money-${player.id}`}
                      className="rounded-full bg-secondary px-2 py-0.5 text-sm font-medium tabular-nums"
                    >
                      ${player.money}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FactoryIcon className="h-4 w-4" aria-hidden />
                      <span>Factory</span>
                      {player.factories.map((factory) => (
                        <ContainerChip key={factory.id} color={factory.color} />
                      ))}
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Factory store</span>
                        <span data-testid={`store-count-${player.id}`}>
                          {player.factoryStore.length} / {player.factoryLimit}
                        </span>
                      </div>
                      <div className="flex min-h-6 flex-wrap gap-1" data-testid={`store-${player.id}`}>
                        {player.factoryStore.map((color, index) => (
                          <ContainerChip key={index} color={color} />
                        ))}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      data-testid={`produce-${player.id}`}
                      disabled={busy || full || broke}
                      onClick={() => handleProduce(player.id)}
                    >
                      <Plus className="h-4 w-4" aria-hidden /> Produce
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ) : (
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>New game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {names.map((name, index) => (
                <input
                  // eslint-disable-next-line react/no-array-index-key -- fixed-length setup form
                  key={index}
                  aria-label={`Player ${index + 1} name`}
                  data-testid={`player-name-${index}`}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={name}
                  onChange={(event) =>
                    setNames((prev) => prev.map((value, j) => (j === index ? event.target.value : value)))
                  }
                />
              ))}
              <Button className="w-full" data-testid="start-game" disabled={busy} onClick={handleStart}>
                Start game
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
