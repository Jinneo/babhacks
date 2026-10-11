export const sample = [
  {symbol:'VTI',category:'Stocks',quantity:30,price:250},
  {symbol:'BND',category:'Bonds',quantity:20,price:75},
  {symbol:'AUSD',category:'Cash',quantity:1000,price:1},
];
export const categories = ['Stocks','Bonds','Cash'];
export function validateHoldings(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error('Import between 1 and 100 holdings.');
  return rows.map(r => {
    const quantity = Number(r.quantity), price = Number(r.price);
    if (!/^[A-Za-z0-9.-]{1,15}$/.test(r.symbol) || !categories.includes(r.category) || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(price) || price <= 0 || quantity*price > 1e9) throw new Error('Each holding needs a symbol, Stocks/Bonds/Cash category, nonnegative quantity, and positive price.');
    return {symbol:r.symbol.toUpperCase(),category:r.category,quantity,price};
  });
}
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.shift()?.trim().toLowerCase() !== 'symbol,category,quantity,price') throw new Error('CSV header must be symbol,category,quantity,price.');
  return validateHoldings(lines.map(line=> {const cells=line.split(',').map(c=>c.trim());if(cells.length!==4)throw new Error('Each CSV row must have four columns.');return Object.fromEntries(['symbol','category','quantity','price'].map((k,i)=>[k,cells[i]]));}));
}
export function planRebalance(holdings, targets, threshold=2) {
  holdings = validateHoldings(holdings);
  if(categories.some(c=>!Number.isFinite(targets[c]) || targets[c]<0 || targets[c]>100) || Math.abs(categories.reduce((n,c)=>n+targets[c],0)-100)>0.001) throw new Error('Target allocations must total 100%.');
  if (!Number.isFinite(threshold) || threshold<0 || threshold>100) throw new Error('Drift threshold must be between 0 and 100.');
  const values=Object.fromEntries(categories.map(c=>[c,Math.round(holdings.filter(r=>r.category===c).reduce((n,r)=>n+r.quantity*r.price,0)*100)/100]));
  const total=categories.reduce((n,c)=>n+values[c],0);if(total<=0)throw new Error('Portfolio value must be greater than zero.');
  const allocations=categories.map(category=>({category,value:values[category],current:values[category]/total*100,target:targets[category]}));
  const drift=Math.max(...allocations.map(r=>Math.abs(r.current-r.target)));
  // Rebalance all asset categories together to preserve cash when threshold triggers.
  const trades=drift>threshold ? allocations.filter(r=>r.category!=='Cash').map(r=>({category:r.category,amount:Math.round((total*r.target/100-r.value)*100)/100})).filter(r=>Math.abs(r.amount)>=0.01) : [];
  const buy=trades.reduce((n,r)=>n+Math.max(0,r.amount),0), sell=trades.reduce((n,r)=>n+Math.max(0,-r.amount),0);
  return {total,allocations,drift,trades,buy:Math.round(buy*100)/100,sell:Math.round(sell*100)/100,after:categories.map(category=>({symbol:category==='Stocks'?'STOCK-DEMO':category==='Bonds'?'BOND-DEMO':'AUSD',category,quantity:trades.length ? Math.round(total*targets[category])/100 : values[category],price:1}))};
}
