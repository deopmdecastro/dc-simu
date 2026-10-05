# Auditoria de bornes dos modelos GLB

Gerado por `npm run audit:terminals`. Posições manuais são preservadas; bornes sem calibração são projetados para a superfície coerente com a sua vista elétrica.

| Componente | Bornes | Superfície | Tipologia explícita | Estado |
|---|---:|---|---|---|
| Disjuntor Schneider Easy9 EZ9 · 1P (`breaker1p`) | 2 | medido no GLB | OK | ✅ |
| Disjuntor WEG MDW-C10-3 · 3P 10 A curva C (`breakerWegMdwC10`) | 6 | medido no GLB | OK | ✅ |
| Disjuntor Steck SD C25 · 1P 25 A curva C (`breakerSteckSdC25`) | 2 | medido no GLB | OK | ✅ |
| Disjuntor Schneider Easy9 EZ9 · 2P (`breaker2p`) | 4 | medido no GLB | OK | ✅ |
| Disjuntor Schneider Easy9 EZ9 · 3P (`breaker3p`) | 6 | medido no GLB | OK | ✅ |
| Phoenix Contact EC 1 12DC/1A S-R · 3000760 (`phoenixEcb3000760`) | 5 | medido no GLB | OK | ✅ |
| Botoeira dupla NHD NPB22-D11 · START/STOP (`dualPushButtonNpb22D11`) | 4 | medido no GLB | OK | ✅ |
| Botão de emergência Metaltex P20AKR · 1NF (`emergencyButton`) | 2 | medido no GLB | OK | ✅ |
| Botão de emergência Metaltex P20ACR · chave · 1NF (`emergencyButtonKeyP20ACR`) | 2 | medido no GLB | OK | ✅ |
| Contator WEG CWC09 · 9 A (3NA + 1NA) (`contactorWegCWC09`) | 10 | medido no GLB | OK | ✅ |
| Relé de segurança Allen-Bradley Guardmaster MSR127TP (`safetyRelay`) | 16 | medido no GLB | OK | ✅ |
| Sinaleiro LED AD22-22DS · 24 V (`pilotLightAd22`) | 2 | medido no GLB | OK | ✅ |
| Motor SEW DRN80MK4/B3 · 0,55 kW (`motor3ph`) | 7 | medido no GLB | OK | ✅ |
| Siemens LOGO! 12/24RC (8DI/4DQ) (`plcSiemensLogo1224RC`) | 19 | medido no GLB | OK | ✅ |
| CLP LS Electric XGB XBM-DN32S · 16DI/16DO (`plcLsXbmDn32s`) | 34 | medido no GLB | OK | ✅ |
| Siemens SIMATIC TS Adapter IE Basic · 6ES7972-0EB00-0XA0 (`siemensTsAdapterIeBasic`) | 4 | medido no GLB | OK | ✅ |
| Borne Phoenix Contact PTI 6 · 3213972 (`terminalPhoenixPti6`) | 2 | medido no GLB | OK | ✅ |
| Borne de terra (verde/amarelo) (`terminalPE`) | 2 | medido no GLB | OK | ✅ |
| Calha DIN perfurada 15×5,5 mm (galvanizada) · 1 m (`dinRail15x55`) | 0 | OK | OK | ✅ |
| Fonte Proauto / DRAN120-24A · 24V 5A (`powerSupplyProauto24A`) | 9 | medido no GLB | OK | ✅ |
| Multímetro digital RGK DM-20 (`multimeterDm20`) | 2 | medido no GLB | OK | ✅ |

**21 modelos GLB auditados · 140 bornes.**
