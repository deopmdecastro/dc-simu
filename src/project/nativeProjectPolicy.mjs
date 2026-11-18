/** Shared by browser and SQLite API; identity is exact, never inferred from a name. */
export const RETAINED_NATIVE_PROJECT_ID = 'f8df6df2-c5dd-4b86-ba54-93aeeddc566b'
export const isNativeProjectId = id => id === RETAINED_NATIVE_PROJECT_ID
