# Auditoria de bornes dos modelos GLB

Gerado por `npm run audit:terminals`. Posições manuais são preservadas; bornes sem calibração são projetados para a superfície coerente com a sua vista elétrica.

| Componente | Bornes | Superfície | Tipologia explícita | Estado |
|---|---:|---|---|---|
| Disjuntor monopolar (`breaker1p`) | 2 | OK | OK | ✅ |
| Disjuntor WEG MDW-C10 · 1P 10 A curva C (`breakerWegMdwC10`) | 2 | OK | OK | ✅ |
| Disjuntor bipolar (`breaker2p`) | 4 | OK | OK | ✅ |
| Phoenix Contact EC 1 12DC/1A S-R · 3000760 (`phoenixEcb3000760`) | 5 | OK | OK | ✅ |
| Botoeira dupla NHD NPB22-D11 · START/STOP (`dualPushButtonNpb22D11`) | 4 | OK | OK | ✅ |
| Botão de emergência Metaltex P20AKR · 1NF (`emergencyButton`) | 2 | OK | OK | ✅ |
| Botão de emergência Metaltex P20ACR · chave · 1NF (`emergencyButtonKeyP20ACR`) | 2 | OK | OK | ✅ |
| Contator WEG CWC09 · 9 A (3NA + 1NA) (`contactorWegCWC09`) | 12 | OK | OK | ✅ |
| Relé de segurança Allen-Bradley Guardmaster MSR127TP (`safetyRelay`) | 15 | OK | OK | ✅ |
| Sinaleiro LED AD22-22DS · 24 V (`pilotLightAd22`) | 2 | OK | OK | ✅ |
| Motor SEW DRN80MK4/B3 · 0,55 kW (`motor3ph`) | 7 | OK | OK | ✅ |
| Siemens LOGO! 12/24RC (8DI/4DQ) (`plcSiemensLogo1224RC`) | 19 | OK | OK | ✅ |
| CLP LS Electric XGB XBM-DN32S · 16DI/16DO (`plcLsXbmDn32s`) | 34 | OK | OK | ✅ |
| Siemens SIMATIC TS Adapter IE Basic · 6ES7972-0EB00-0XA0 (`siemensTsAdapterIeBasic`) | 4 | OK | OK | ✅ |
| Borne Phoenix Contact PTI 6 · 3213972 (`terminalPhoenixPti6`) | 2 | OK | OK | ✅ |
| Borne de terra (verde/amarelo) (`terminalPE`) | 2 | OK | OK | ✅ |
| Calha DIN perfurada 15×5,5 mm (galvanizada) · 1 m (`dinRail15x55`) | 0 | OK | OK | ✅ |
| Fonte Proauto / DRAN120-24A · 24V 5A (`powerSupplyProauto24A`) | 9 | OK | OK | ✅ |
| Multímetro digital RGK DM-20 (`multimeterDm20`) | 4 | OK | OK | ✅ |

**19 modelos GLB auditados · 131 bornes.**
