/** Review corrections, 4 Nov 2026. Scenario assumptions, never scheme determinations. */
import { GROSS_MARGIN } from './hedge-config.js';
export const SCENARIO_DEFAULTS = Object.freeze({
  soldPercent: 100, sponsorshipPerKm: 0, discountPercent: 3.5, financeYears: 30,
  existingUncroppedM: 0, edgeFactor: 0.7, baselineHabitat: 'unknown',
  maintenancePerKm: 0, mrvAnnual: 0, setupCost: 0, salesFeePercent: 0,
  privateBenefitPerKm: 0, additionalFunding: 0, fenceSides: 'auto',
  fenceEligibility: 'unknown', sharedBoundary: 'no', parcelArable: 'unknown',
  targeting: 'unknown', hedgeConditions: 'unknown', waterbody: 'unknown',
  tripleFunding: 'assumed', efa: 'unknown', efaAdjustedAnnualPerKm: -1,
  grantInterpretation: 'unresolved', capitalPaymentYear: 0,
  creditSaleMode: 'annual', issuanceDelayYears: 0,
});
const choices = {
  baselineHabitat: ['unknown','cereal','existing-grassland'], fenceSides: ['auto','0','1','2'],
  fenceEligibility: ['unknown','eligible','ineligible'], sharedBoundary: ['no','yes'],
  parcelArable: ['unknown','yes','no'], targeting: ['unknown','yes','no'],
  hedgeConditions: ['unknown','yes','no'], waterbody: ['unknown','small','wide','still'],
  tripleFunding: ['assumed','exclude'], efa: ['unknown','no','yes'],
  grantInterpretation: ['unresolved','separate-outcomes','excluded'], creditSaleMode: ['annual','forward12'],
};
const bounds = {
  soldPercent:[0,100], sponsorshipPerKm:[0,100000], discountPercent:[0,30], financeYears:[10,50],
  existingUncroppedM:[0,60], edgeFactor:[0,2], maintenancePerKm:[0,100000], mrvAnnual:[0,1000000],
  setupCost:[0,10000000], salesFeePercent:[0,100], privateBenefitPerKm:[0,100000],
  additionalFunding:[0,10000000], efaAdjustedAnnualPerKm:[-1,100000], capitalPaymentYear:[0,1], issuanceDelayYears:[0,10],
};
export function normaliseScenario(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const out = {...SCENARIO_DEFAULTS};
  for (const [k,opts] of Object.entries(choices)) if (opts.includes(String(raw[k]))) out[k] = String(raw[k]);
  for (const [k,[lo,hi]] of Object.entries(bounds)) {
    if (raw[k] == null || raw[k] === '' || !Number.isFinite(Number(raw[k]))) continue;
    out[k] = Math.min(hi,Math.max(lo,Number(raw[k])));
  }
  for (const k of ['financeYears','capitalPaymentYear','issuanceDelayYears']) out[k] = Math.round(out[k]);
  return out;
}
export function incrementalIncome(record, inputs) {
  if (!record.hedgeConfig) return Number(record.farmImpacts?.[inputs.farmType]?.netIncomeForegone || 0) * inputs.lengthM / 1000;
  const s=normaliseScenario(inputs.scenario), cfg=record.hedgeConfig;
  const existing=Math.min(cfg.stripM,Math.max(s.existingUncroppedM,cfg.position==='watercourse'?2:0));
  const gm=GROSS_MARGIN[inputs.farmType] || 0;
  return Math.round(gm*(cfg.stripM-existing)/10*s.edgeFactor/10)*10*inputs.lengthM/1000;
}
export function grantScenario(record, inputs) {
  const s=normaliseScenario(inputs.scenario), cfg=record.hedgeConfig, a=record.hedgeOutputs.funding.aecs;
  const km=inputs.lengthM/1000, notes=[];
  const sides=s.fenceSides==='auto' ? (['Dairy','LFA Grazing'].includes(inputs.farmType)?(cfg.position==='boundary'?1:2):0):Number(s.fenceSides);
  if (s.fenceSides==='auto') notes.push('Fence sides are a farm-type assumption; check existing protection.');
  let hedge=s.hedgeConditions!=='no' && s.targeting!=='no';
  let strip=s.parcelArable!=='no' && s.targeting!=='no';
  if (cfg.form==='triple') {
    notes.push('Triple-row capital and annual hedge payments need an RPID ruling.');
    if(s.tripleFunding==='exclude') hedge=false;
  }
  if (cfg.position==='watercourse') {
    const min={small:3,wide:6,still:12}[s.waterbody];
    if(min && cfg.stripM<min) {strip=false;notes.push(`Water margin is below the ${min} m minimum for this waterbody.`);}
    notes.push('Hedge-in-water-margin layout and payable area still need RPID confirmation.');
  }
  if(s.parcelArable==='unknown') notes.push('Arable crop history is assumed, not evidenced (at least 3 of the last 5 years).');
  if(s.targeting==='unknown') notes.push('Spatial targeting is assumed.');
  if(s.hedgeConditions==='unknown') notes.push('Hedge access, habitat, planting and management conditions are assumed.');
  if(s.efa==='unknown') notes.push('EFA overlap is not assessed.');
  let annual=(hedge?a.hedgeAnnualPerKm:0)+(strip?a.stripAnnualPerKm:0);
  if(s.efa==='yes') {
    notes.push('EFA may remove an income-forgone component: use an RPID-confirmed combined annual amount.');
    annual=s.efaAdjustedAnnualPerKm<0?0:Math.min(annual,s.efaAdjustedAnnualPerKm);
  }
  const fence=s.fenceEligibility!=='ineligible' && hedge;
  if(sides && s.fenceEligibility==='unknown') notes.push('Fence grant assumes essential new protection, eligible existing condition and funding history.');
  const boundaryShare=cfg.position==='boundary' && s.sharedBoundary==='yes'?.5:1;
  const capital=(hedge?a.plantingCapitalPerKm*boundaryShare:0)+(fence?sides*a.fenceCapitalPerKmPerSide*boundaryShare:0);
  // Shared-boundary hedge payments follow the length each participant can claim.
  if(boundaryShare<1 && s.efa!=='yes') annual=(hedge?a.hedgeAnnualPerKm*boundaryShare:0)+(strip?a.stripAnnualPerKm:0);
  return {sides, capital:inputs.grants==='none'?0:capital*km, annual:inputs.grants==='none'?0:annual*km, notes,
    status:inputs.grants==='none'?'excluded':'conditional-scenario', potential:cfg.form!=='productive'};
}

/** Find all finite IRRs > -100% via Bernstein subdivision on u=1/(2+r).
 * Cash polynomial: sum(c[t]*u^t*(1-u)^(n-t)). Sign variation bounds roots.
 * Degenerate/near-multiple roots are explicitly marked unresolved, never a pass. */
export function irrAnalysis(cash) {
  const c=[...cash]; while(c.length>1 && c.at(-1)===0)c.pop();
  if(c.every(x=>x===0))return {status:'indeterminate',rates:[]};
  const n=c.length-1; let choose=1;
  const scale=Math.max(...c.map(Math.abs));
  const b=c.map((v,i)=>{if(i)choose=choose*(n-i+1)/i;return v/scale/choose;});
  const roots=[];let unresolved=false;
  const variations=a=>{const signs=a.filter(v=>v!==0).map(Math.sign);return signs.slice(1).reduce((sum,v,i)=>sum+(v!==signs[i]?1:0),0);};
  const split=a=>{let row=[...a];const l=[row[0]],r=[row.at(-1)];while(row.length>1){row=row.slice(1).map((v,i)=>(v+row[i])/2);l.push(row[0]);r.push(row.at(-1));}return [l,r.reverse()];};
  const walk=(a,lo,hi,depth)=>{
    if(a[0]===0 && lo>0 && lo<1)roots.push(lo);
    if(a.at(-1)===0 && hi>0 && hi<1)roots.push(hi);
    const v=variations(a);if(v===0)return;
    if(depth>=48){if(v===1)roots.push((lo+hi)/2);else unresolved=true;return;}
    const [l,r]=split(a),mid=(lo+hi)/2;walk(l,lo,mid,depth+1);walk(r,mid,hi,depth+1);
  };
  walk(b,0,1,0);
  const rates=roots.sort((a,b)=>a-b).filter((u,i,a)=>i===0||Math.abs(u-a[i-1])>1e-10).map(u=>1/u-2).sort((a,b)=>a-b);
  return {status:unresolved?'unresolved':rates.length>1?'multiple':rates.length===1?'unique':'none',rates};
}
export function scenarioFunding(record, inputs) {
  if(!record?.hedgeOutputs?.funding || !record.hedgeConfig)return null;
  const s=normaliseScenario(inputs.scenario), f=record.hedgeOutputs.funding, cfg=record.hedgeConfig;
  const km=Math.max(0,Number(inputs.lengthM)||0)/1000, years=s.financeYears, rate=s.discountPercent/100;
  const a=grantScenario(record,{...inputs,lengthM:km*1000});
  const oncra=inputs.carbonRoute!=='contribution';
  const allowed=!oncra || s.grantInterpretation!=='excluded';
  const price=Math.max(0,Number(inputs.creditPrice)||0), sales=s.soldPercent/100*(1-s.salesFeePercent/100);
  const establishment=(f.establishmentCostPerM*1000+a.sides*9.15*1000)*km;
  const income=incrementalIncome(record,{...inputs,lengthM:km*1000});
  const annualCost=s.maintenancePerKm*km+s.mrvAnnual;
  const benefit=s.privateBenefitPerKm*km;
  const bands=Object.values(record.carbonSequestration || {});
  const carbonForYear=y=>(bands[Math.floor((y-1)/5)] || 0)/5*km*.64;
  const receipts=Array(years+1).fill(0);
  let forwardTonnes=0;
  if(oncra && allowed && s.creditSaleMode==='forward12'){
    for(let y=1;y<=12;y++)forwardTonnes+=carbonForYear(y);
    receipts[0]=forwardTonnes*price*sales;
  }
  for(let vintage=1;vintage<=years;vintage++){
    if(!allowed)continue;
    if(oncra){
      if(s.creditSaleMode==='forward12'&&vintage<=12)continue;
      const pay=vintage+s.issuanceDelayYears;if(pay<=years)receipts[pay]+=carbonForYear(vintage)*price*sales;
    }else receipts[vintage]=s.sponsorshipPerKm*km*s.soldPercent/100;
  }
  const schedule=Array.from({length:years+1},(_,year)=>{
    const capital=year===s.capitalPaymentYear?a.capital:0;
    const grant=year>0 && year<=5?a.annual:0;
    const costs=year===0?establishment+s.setupCost:income+annualCost;
    const privateBenefit=year>0?benefit:0;
    const otherFunding=year===0?s.additionalFunding:0;
    const without=capital+grant+privateBenefit+otherFunding-costs;
    return {year,capital,grant,costs,privateBenefit,otherFunding,carbon:receipts[year],withoutCarbon:without,withCarbon:without+receipts[year]};
  });
  const pvSum=fn=>schedule.reduce((sum,row)=>sum+fn(row)/(1+rate)**row.year,0);
  const ann=Array.from({length:years},(_,i)=>(1+rate)**(-i-1)).reduce((x,y)=>x+y,0);
  const pv={establishment,incomeForgone:income*ann,lifecycle:s.setupCost+annualCost*ann,
    aecsCapital:a.capital/(1+rate)**s.capitalPaymentYear,aecsAnnual:pvSum(r=>r.grant),
    privateBenefits:benefit*ann,additionalFunding:s.additionalFunding,carbon:pvSum(r=>r.carbon),
    water:Number(record.crewValuations?.[({riparian:'riparianTotal',crossSlope:'crossSlopeTotal',downSlope:'downSlopeTotal'})[inputs.placement]]||0)*km*ann};
  pv.costs=pv.establishment+pv.incomeForgone+pv.lifecycle;pv.grants=pv.aecsCapital+pv.aecsAnnual;
  pv.gapWithoutCarbon=-pvSum(r=>r.withoutCarbon);pv.gapAfterCarbon=-pvSum(r=>r.withCarbon);
  const drivers={establishment:pv.establishment,incomeForgone:pv.incomeForgone,lifecycle:pv.lifecycle,privateBenefits:-pv.privateBenefits};
  const sensitivity=Object.entries(drivers).map(([driver,value])=>({driver,minus20:pv.gapWithoutCarbon-.2*value,plus20:pv.gapWithoutCarbon+.2*value}));
  sensitivity.push({driver:'combined',minus20:pv.gapWithoutCarbon-.2*(pv.costs+pv.privateBenefits),plus20:pv.gapWithoutCarbon+.2*(pv.costs+pv.privateBenefits)});
  return {years,discountRate:rate,km,grantsIncluded:inputs.grants!=='none',carbonRoute:oncra?'oncra':'contribution',fenceSides:a.sides,scenario:s,
    annual:{aecs:a.annual,incomeForgone:income,ongoingCosts:annualCost,privateBenefits:benefit},pv,schedule,sensitivity,
    irr:irrAnalysis(schedule.map(r=>r.withoutCarbon)), grantNotes:a.notes,forwardTonnes,
    carbonTonnes30:oncra?Array.from({length:years},(_,i)=>carbonForYear(i+1)).reduce((x,y)=>x+y,0):null,
    carbonShareOfGap:pv.gapWithoutCarbon>0?pv.carbon/pv.gapWithoutCarbon:null,carbonShareOfCost:pv.costs>0?pv.carbon/pv.costs:0,grantShareOfCost:pv.costs>0?pv.grants/pv.costs:0,
    tests:{financial:'not-determined',commonPractice:'not-assessed',environmental:'not-assessed',
      grantClause:'ruling-needed',aecsAvailable:a.potential,regulatory:{gbrStripM:cfg.position==='watercourse'?2:0,plantingRequired:null}},
    aecsHedgeReason:a.hedgeReason||f.aecs.hedgeReason,aecsStripOption:f.aecs.stripOption,
  };
}
