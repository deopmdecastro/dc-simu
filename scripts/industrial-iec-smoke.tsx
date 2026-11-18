import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { INDUSTRIAL_DEVICE_TYPES,INDUSTRIAL_INFO } from '../src/electrical/industrialDevices'
import { iecAssociationOf } from '../src/electrical/iecAssociation'
import { SymbolGlyph } from '../src/schematic/symbols'
import { CmdSymbol } from '../src/commands/symbols'
import { make,assertions } from './lib/electrical-fixture'
const {check,done}=assertions()
for(const type of INDUSTRIAL_DEVICE_TYPES){
 const c=make(type),a=iecAssociationOf(type),svg=renderToStaticMarkup(<svg><SymbolGlyph c={c} selected={false}/></svg>)
 check(svg.includes('<svg')&&svg.length>150,type+': actual schematic symbol renders')
 check(!!a.iec60617&&!!a.refLetter,type+': explicit IEC description and reference letter')
 check(c.ref.startsWith(a.refLetter!),type+': physical reference agrees with IEC association')
 if(a.primary){const cmd=renderToStaticMarkup(<svg><CmdSymbol part={{id:'iec',kind:a.primary,tag:c.ref,x:0,y:0,rot:0}}/></svg>);check(cmd.includes('<path')||cmd.includes('<circle')||cmd.includes('<line')||cmd.includes('<rect'),type+': primary IEC symbol actually renders')}
 check(!!INDUSTRIAL_INFO[type].scope,type+': documented electrical limitations')
}
check(iecAssociationOf('relaySocketFinder9023').primary!=='coil','passive socket is not misrepresented as a relay coil')
check(iecAssociationOf('buzzerMetaltexTby301').primary!=='lamp','acoustic signal is not misrepresented as an indicator lamp')
done('industrial IEC assertions')
