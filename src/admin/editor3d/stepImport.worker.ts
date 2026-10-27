// STEP tessellation stays off the UI thread; Vite bundles the WASM beside this worker.
// @ts-ignore package ships its browser ESM without TypeScript declarations
import occtImportJs from '@sunbox/occt-import-js/dist/occt-import-js.js'
// @ts-ignore Vite turns this into a same-origin asset URL
import wasmUrl from '@sunbox/occt-import-js/dist/occt-import-js.wasm?url'

type Request = { id: number; buffer: ArrayBuffer }
let importer: Promise<any> | null = null

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    importer ??= occtImportJs({ locateFile: () => wasmUrl })
    const occt = await importer
    const result = occt.ReadStepFile(new Uint8Array(data.buffer), { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.02, angularDeflection: 0.3 })
    if (!result?.success || !result.meshes?.length) throw new Error('O ficheiro STEP não contém geometria válida.')
    self.postMessage({ id: data.id, result })
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Não foi possível converter o ficheiro STEP.' })
  }
}
