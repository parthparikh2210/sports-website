import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'

export default async function SportPage({
  params,
}: {
  params: Promise<{ sport: string }>
}) {
  const { sport: slug } = await params

  const { data: sport } = await supabase
    .from('sports')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!sport) {
    notFound()
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('sport_id', sport.id)
    .order('start_time', { ascending: true })

  const live = matches?.filter((m) => m.status === 'live') ?? []
  const upcoming = matches?.filter((m) => m.status === 'upcoming') ?? []
  const finished = matches?.filter((m) => m.status === 'finished') ?? []

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{sport.name}</h1>

      {(!matches || matches.length === 0) ? (
        <div className="border rounded-lg p-8 text-center text-gray-400">
          {sport.has_live_api
            ? 'Live matches will appear here once we connect real-time data.'
            : 'Schedule and results will appear here.'}
        </div>
      ) : (
        <div className="space-y-8">
          {live.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Live
              </h2>
              <div className="space-y-3">
                {live.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}

          {finished.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Finished</h2>
              <div className="space-y-3">
                {finished.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function MatchCard({ match }: { match: any }) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{match.tournament_name}</p>
      <div className="flex justify-between items-center">
        <span className="font-medium">
          {match.home_team_name} vs {match.away_team_name}
        </span>
        <span className="font-semibold">
          {match.home_score ?? 0} - {match.away_score ?? 0}
        </span>
      </div>
      {match.match_info && <p className="text-sm text-gray-500 mt-1">{match.match_info}</p>}
    </div>
  )
}