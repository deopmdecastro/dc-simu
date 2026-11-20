import type { ComponentType } from '../types'

/**
 * Lista deliberadamente estreita de duplicados FUNCIONAIS: um item genérico sem 3D
 * só sai da biblioteca quando existe um aparelho com 3D com a mesma função, os
 * mesmos bornes (ou superconjunto) e a mesma classe de alimentação. Projetos
 * gravados nunca são reescritos — o tipo antigo continua a abrir e a simular.
 *
 * NÃO são equivalentes (manter distintos):
 *  · emergência (cogumelo com retenção) ≠ botoneira NF momentânea;
 *  · boia (sensor) ≠ relé de nível AVEL (controlador com sondas);
 *  · relé auxiliar de bobina genérica ≠ Finder 55.34 (bobina 24 V CC);
 *  · TOF por desalimentação da bobina ≠ GEYA GRT8-B1 (temporiza pela abertura de S);
 *  · LED 230 V ≠ AD22-22DS 24 V; buzzer genérico ≠ TBY-301 110 V;
 *  · contactor com NF 21/22 ≠ CWC09 (3NA+1NA); DPS genérico ≠ SPW02/SPW12;
 *  · iDPN N Vigi (RCBO 1P+N), iID 4P e Hager 2P entre si; térmico 6 A ≠ 3RU 1,1–1,6 A.
 */
export const FUNCTIONAL_DUPLICATE_REPLACEMENTS: Partial<Record<ComponentType, ComponentType>> = {
  // Interruptor diferencial 4P 40 A / 30 mA tipo AC.
  residualBreaker: 'residualBreakerSchneiderIid4p',
  // Botões Ø22 momentâneos ainda sem CAD nem bornes.
  buttonStart22: 'buttonNO',
  buttonStop22: 'buttonNC',
  // Sensor fotoelétrico 3 fios com saída COM/NA/NF.
  photoSensor: 'photoSensorXukt1ksml2',
  // Torre R/Y/G com comum.
  towerLight: 'towerLightSb23011',
  // Porta-fusível cilíndrico 1P (bornes 1/2).
  fuseHolder: 'fuseHolderSchneiderDf101v',
  // TON alimentado por A1/A2: GEYA multifunções em A, alimentação 12–240 V.
  timerRelayTON: 'timerGeyaGrt8M1',
  // Fonte comutada 24 V / 5 A.
  powerSupply: 'powerSupplyProauto24A',
}

export function blockedDuplicateReplacement(type: ComponentType, options: {
  blocked: (type: ComponentType) => boolean
  has3D: (type: ComponentType) => boolean
  available: (type: ComponentType) => boolean
}): ComponentType | null {
  const replacement=FUNCTIONAL_DUPLICATE_REPLACEMENTS[type]
  if(!replacement || (options.has3D(type)&&!options.blocked(type)))return null
  return options.has3D(replacement)&&options.available(replacement)?replacement:null
}
