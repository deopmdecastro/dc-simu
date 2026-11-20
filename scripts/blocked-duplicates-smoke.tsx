import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { FUNCTIONAL_DUPLICATE_REPLACEMENTS,blockedDuplicateReplacement } from '../src/catalog/blockedDuplicates'
import { useComponentSettings } from '../src/admin/componentSettings'
import { internalBridges } from '../src/electrical/engine'
import { canInsertComponent3D } from '../src/three/modelPaths'
import { SymbolGlyph } from '../src/schematic/symbols'
import { useSimStore } from '../src/store/useSimStore'
import { make,assertions } from './lib/electrical-fixture'
import { TEMPLATES,paletteGroups } from '../src/electrical/factory'
import { industrialTemplates } from '../src/electrical/industrialDevices'
const {check,done}=assertions(),settings=useComponentSettings.getState()
const old=make('residualBreaker'),next=make('residualBreakerSchneiderIid4p')
check(Object.keys(FUNCTIONAL_DUPLICATE_REPLACEMENTS).sort().join()==='buttonStart22,buttonStop22,fuseHolder,photoSensor,powerSupply,residualBreaker,timerRelayTON,towerLight','equivalence list is deliberately limited to verified functional duplicates')
for(const distinct of ['emergencyButton','emergencyButtonKeyP20ACR','floatSwitch','auxRelay','auxRelay4','timerRelayTOF','timerRelayStarDelta','ledGreen','ledRed','buzzer','contactor','surgeProtector','thermalRelay','residualBreakerSchneiderIdpnVigi','residualBreakerHagerCfc225p','meterKws306','multimeterDm20','plcLogo','hmi','pressureSwitch','thermostat'] as const)
  check(!(distinct in FUNCTIONAL_DUPLICATE_REPLACEMENTS),distinct+' stays a distinct library item (not a functional duplicate)')
for(const [from,to] of Object.entries(FUNCTIONAL_DUPLICATE_REPLACEMENTS)){
  check(canInsertComponent3D(to!)&&TEMPLATES[from as keyof typeof TEMPLATES].category===TEMPLATES[to!].category,from+' → '+to+': replacement has 3D and the same category')
}
for(const group of paletteGroups())for(const item of group.items)
  check(group.group!=='Relés'||item.category==='relay',item.type+': only relay-category items live in the Relés folder')
for(const [type,tpl] of Object.entries(industrialTemplates()))check(tpl.category==='relay'?tpl.group==='Relés':tpl.group!=='Relés',type+': industrial folder follows its category (no fallback into Relés)')
check(paletteGroups().find(g=>g.group==='Comando')!.items.some(i=>i.type==='pushButtonXb2No'),'KEOLEA XB2 push buttons are in the Comando folder')
check(JSON.stringify(internalBridges(old).map(pair=>pair.map(id=>old.terminals.find(t=>t.id===id)?.label)))===JSON.stringify(internalBridges(next).map(pair=>pair.map(id=>next.terminals.find(t=>t.id===id)?.label))),'old and new 4P devices have equivalent independent pole topology')
check(['inA','sensmA','rcdType'].every(k=>old.state[k]===next.state[k]),'replacement keeps 40 A / 30 mA / AC functional ratings')
const options={has3D:canInsertComponent3D,blocked:()=>false,available:()=>true}
check(blockedDuplicateReplacement('residualBreaker',options)===next.type,'no-3D verified duplicate hides only if usable replacement exists')
check(!blockedDuplicateReplacement('residualBreaker',{...options,available:()=>false}),'blocked/unavailable replacement never hides the original')
check(!blockedDuplicateReplacement('residualBreaker',{...options,has3D:()=>true}),'a working unblocked original is not removed')
check(!blockedDuplicateReplacement('residualBreakerSchneiderIdpnVigi',{...options,blocked:()=>true}),'1P+N RCBO is not treated as duplicate 4P RCCB')
settings.apply({disabledComponents:[],components:[{type:'residualBreakerSchneiderIid4p',status:'active',minPlan:'pro'}]},'user')
check(!useComponentSettings.getState().blocked.residualBreakerSchneiderIid4p,'plan restriction is not an administrative block')
settings.set([{type:'residualBreaker',note:'duplicate'}]);check(useComponentSettings.getState().blocked.residualBreaker,'explicit blocking remains distinguishable');settings.reset()
const st=()=>useSimStore.getState();st().newProject();useSimStore.setState({components:[old],wires:[]});const saved=st().saveJSON();st().newProject();st().loadJSON(saved)
check(st().components[0].type==='residualBreaker','saved projects preserve the old component type; no destructive migration')
assert.deepEqual(st().components[0].terminals.map(t=>t.id),old.terminals.map(t=>t.id));check(true,'all saved terminal endpoint identities are preserved')
check(renderToStaticMarkup(<svg><SymbolGlyph c={old} selected={false}/></svg>).length>100,'hidden legacy type remains renderable in an existing project')
done('blocked duplicate compatibility assertions')
