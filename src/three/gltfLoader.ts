import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

let draco: DRACOLoader | null = null

/**
 * GLTFLoader com os descompressores habituais: Meshopt (glTF-Transform, gltfpack…) e Draco.
 * Sem eles, modelos «compressed» falham a carregar (EXT_meshopt_compression / KHR_draco_mesh_compression).
 * O descodificador Draco só é descarregado se o modelo o exigir.
 */
export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/') }
  loader.setDRACOLoader(draco)
  return loader
}
