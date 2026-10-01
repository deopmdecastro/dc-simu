import { create } from 'zustand'
import { profileApi } from './catalogApi'
import { BUILTIN_PROFILES, profileFromStored, type StoredProfile, type TerminalProfile } from './terminalProfiles'

/** Perfis personalizados guardados pelo administrador (visíveis a todos os utilizadores). */
interface ProfileStoreState {
  custom: StoredProfile[]
  loaded: boolean
  loading: boolean
  load: (force?: boolean) => Promise<void>
  save: (profile: Omit<StoredProfile, 'updatedAt' | 'updatedBy'>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  custom: [], loaded: false, loading: false,
  async load(force = false) {
    if (get().loading || (get().loaded && !force)) return
    set({ loading: true })
    try { set({ custom: await profileApi.list(), loaded: true }) } catch { set({ loaded: true }) } finally { set({ loading: false }) }
  },
  async save(profile) {
    const saved = await profileApi.save(profile)
    set((state) => ({ custom: [saved, ...state.custom.filter((entry) => entry.id !== saved.id)] }))
  },
  async remove(id) {
    await profileApi.remove(id)
    set((state) => ({ custom: state.custom.filter((entry) => entry.id !== id) }))
  },
}))

export const allProfiles = (custom: StoredProfile[]): TerminalProfile[] => [...BUILTIN_PROFILES, ...custom.map(profileFromStored)]
