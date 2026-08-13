import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default async function Header() {
  const { data: sports } = await supabase.from('sports').select('*').order('id')

  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          AllSportsLive
        </Link>
        <nav className="flex gap-1 overflow-x-auto">
          {sports?.map((sport) => (
            <Link
              key={sport.id}
              href={`/${sport.slug}`}
              className="px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-100 whitespace-nowrap"
            >
              {sport.name}
            </Link>
          ))}
          <Link
            href="/events"
            className="px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-100 whitespace-nowrap"
          >
            Events
          </Link>
        </nav>
      </div>
    </header>
  )
}