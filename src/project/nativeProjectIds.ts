/** Identidades sem dependências: seguras em todos os pontos de entrada ESM.
 * Nunca classificar um projeto pessoal pelo nome ou por um prefixo genérico.
 */
export const NATIVE_PARTIDA_ID = 'native-partida-direta-v5'
export const NATIVE_ESTRELA_KS1_ID = 'native-estrela-ks1-v1'
export const NATIVE_QUADRO_DISTRIBUICAO_ID = 'native-quadro-distribuicao-v1'
/** Identidade partilhada com a API SQLite. Nome/prefixo/nativeId nunca autorizam mutações. */
export { RETAINED_NATIVE_PROJECT_ID, isNativeProjectId } from './nativeProjectPolicy.mjs'
