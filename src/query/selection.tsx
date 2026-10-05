/**
 * The selected natural event (map, log and detail panels share it).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type Selection = { selectedId: string | null; select: (id: string | null) => void }

const Ctx = createContext<Selection | null>(null)

export function SelectionScope({ children }: { children: ReactNode }) {
  const [selectedId, select] = useState<string | null>(null)
  const value = useMemo(() => ({ selectedId, select }), [selectedId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSelection(): Selection {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSelection outside SelectionScope')
  return v
}
