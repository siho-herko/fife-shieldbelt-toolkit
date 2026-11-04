import fs from 'node:fs';
import {calculate} from '../calc.js';
const root=new URL('../../../',import.meta.url);
const db=JSON.parse(fs.readFileSync(new URL('fife-shieldbelt-toolkit/fife-shieldbelt-calculator/data/fife_interventions_db_v12.json',root)));
const cases=db.interventions.filter(r=>r.biome==='Fife (East Neuk Coast)'&&r.hedgeConfig).map(record=>{
 const code=record.hedgeConfig.preset;
 const result=calculate({farmType:'Cereals',placement:code==='HV7'?'riparian':'crossSlope',lengthM:1000,creditPrice:70,carbonRoute:'oncra',grants:'aecs',windbreakOrient:'NS'},record);
 return {code,record,result};
});
const gbp=x=>Math.round(x).toLocaleString('en-GB');
for(const name of ['resilience-fife','resilience-east-neuk','resilience-dreel-burn']){
 const file=new URL(`trigrammatic-microsites/${name}/public/index.html`,root);let s=fs.readFileSync(file,'utf8');
 if(!s.includes('id="test-phase-notice"')) s=s.replace(/<body([^>]*)>/,`<body$1><aside id="test-phase-notice" style="padding:1rem max(1rem,4vw);background:#fff3cf;color:#342b16;border-bottom:1px solid #b99b51;line-height:1.5"><strong>Test-phase demonstration — no current farmer offer.</strong> This project explores a possible ONCRA–AECS arrangement and barriers under current rules. Buyer demand is unconfirmed. Prices, sales and grant receipts are hypothetical; eligibility needs project-specific decisions.</aside>`);
 for(const {code,result:r} of cases){
  const reg=new RegExp('<tr><td[^>]*>[\\s\\S]*?'+code+' [\\s\\S]*?</tr>','g');
  // Match only the ten-cell preset row, leaving all other tables intact.
  s=s.replace(/<tr>\s*<td[^>]*>[\s\S]*?<\/tr>/g,row=>{
   if(!new RegExp('(?:<strong>|>)'+code+' ').test(row))return row;
   const cells=[...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];if(cells.length!==10)return row;
   cells[3][2]='&pound;'+gbp(r.netIncomeForegone);
   cells[7][2]=r.fundingStack.pv.grants?gbp(r.fundingStack.pv.aecsCapital)+' + '+gbp(r.aecsAnnual)+'/yr':'not used';
   cells[8][2]=gbp(Math.round(r.fundingStack.pv.gapWithoutCarbon/10)*10);
   cells[9][2]=Math.round(r.fundingStack.carbonShareOfGap*100)+'%';
   return '<tr>'+cells.map(c=>`<td${c[1]}>${c[2]}</td>`).join('')+'</tr>';
  });
 }
 s=s.replace(/3\.5% \(HM Treasury Green Book discount rate\)/g,'3.5% (chosen financial scenario rate, not an evidenced operator hurdle; Treasury public appraisal now uses 3% real for years 1–30, guidance updated 28 October 2026)');
 s=s.replace('Screening estimates, not advice or cash.', 'Research scenarios, not a current offer or an ONCRA pass. AECS is potential cash; water value is a separate non-cash public benefit.');
 s=s.replace(/Combining (?:them|AECS) with ONCRA units needs a written ONCRA ruling \(Guidelines (?:&sect;|§)8\.2\.2\)/g,'Combining AECS with ONCRA needs decisions under Guidelines §§4.2.1 and 8.2.2, including the opportunity to use a grant');
 s=s.replace(/plus income forgone on a cereal farm,/g,'plus incremental income forgone on a cereal farm (HV7 excludes the existing statutory 2 m water margin),');
 if(!s.includes('The table assumes all modelled units sell')) s=s.replace(/divided by that gap\./g,'divided by that gap. The table assumes all modelled units sell, zero sales fees and annual receipts; no buyer is confirmed. A funding gap is not an IRR result or an additionality determination.');
 s=s.replace(/Maintenance, MRV and registry costs are not yet included,/g,'Maintenance, MRV and registry costs are zero/uncosted in this table (the calculator now has inputs for them),');
 s=s.replace(/Beaver Buffer Wood/g,'Willow Bank Buffer');
 // Planting cost sweep (Claude, 4 Nov 2026): central planting cost with its range, not a falsely precise point estimate
 s=s.replace(/&pound;10\.95&ndash;14\.52 per metre, a planning estimate until contractor quotes are obtained/g,'central &pound;16/m for a double row and &pound;20/m for a triple row (range &pound;11&ndash;30/m, from a bulk-buy programme build-up to England&rsquo;s full-cost BN11 rate; no contractor quotes yet; adjustable in the calculator)');
 s=s.replace(/£10\.95–14\.52 per metre, a planning estimate until contractor quotes are obtained/g,'central £16/m for a double row and £20/m for a triple row (range £11–30/m, from a bulk-buy programme build-up to England’s full-cost BN11 rate; no contractor quotes yet; adjustable in the calculator)');
 s=s.replace(/establishment cost £10\.95–14\.52\/m from the data/g,'establishment cost at the central planting estimate (£16/m double row, £20/m triple row; range £11–30/m)');
 s=s.replace(/Native wet woodland with leaky dam characteristics to hold water in the Dreel Burn catchment during drought periods and slow flow during storms\./g,'Native wet woodland for bank habitat and site-dependent flow resistance. Trees alone do not establish leaky-dam performance or improve drought flows; engineered features need separate design and consents.');
 s=s.replace(/A deep-rooted Willow Bank Buffer uses mature trunks to create &#x27;leaky dams&#x27; that slow floodwater and can reduce damage downstream; the effect depends on the site\./g,'A Willow Bank Buffer can add site-dependent flow resistance and bank habitat. Any leaky barriers need separate design, evidence and consents; woodland alone does not establish downstream flood protection.');
 s=s.replace('Triple row by default on slopes and in NVZ catchments; double row via the toggle.', 'Triple row is the programme’s contour design assumption, not a universal nitrate rule; double row is available via the toggle.');
 s=s.replace(/Income forgone, cereals/g,'Incremental income forgone, cereals');
 // Make grant conditions visible with each new preset table, not only in source notes.
 s=s.replace(/Carbon is a provisional literature estimate; biodiversity units use SSE Toolkit v1\.0 rules with assumed inputs\./g,'Carbon is provisional; the productive hedge needs a coppice/root ledger. SSE HLU and margin BU are separate, with assumed inputs; SPBM consultation units are not interchangeable. AECS assumes an eligible targeted parcel and management; triple-row capital and annual payments and hedge-in-water-margin geometry await RPID. HV3 now models a 3 m managed strip with 2.5 m potentially payable.');
 fs.writeFileSync(file,s);
}
fs.writeFileSync(new URL('fife-shieldbelt-toolkit/docs/review-preset-values-2026-11-04.json',root),JSON.stringify(cases.map(({code,result:r})=>({code,income:r.netIncomeForegone,aecs:r.aecsAnnual,gap:r.fundingStack.pv.gapWithoutCarbon,carbonPV:r.fundingStack.pv.carbon})),null,2));
console.log('Updated three microsites and regenerated preset values from the revised calculator.');
