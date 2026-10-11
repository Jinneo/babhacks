import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,planRebalance,parseCSV} from '../src/portfolio.js';
const target={Stocks:60,Bonds:30,Cash:10};
test('sample rebalances stocks into bonds while preserving total and cash',()=>{const p=planRebalance(sample,target);assert.equal(p.total,10000);assert.equal(p.buy,1500);assert.equal(p.sell,1500);assert.equal(p.after.reduce((n,r)=>n+r.quantity*r.price,0),10000);assert.deepEqual(p.after.map(r=>r.quantity),[6000,3000,1000]);});
test('balanced portfolio does not execute',()=>{const p=planRebalance(planRebalance(sample,target).after,target);assert.equal(p.trades.length,0);});
test('threshold suppresses small drift',()=>assert.equal(planRebalance(sample,target,20).trades.length,0));
test('invalid targets and prices are rejected',()=>{assert.throws(()=>planRebalance(sample,{Stocks:80,Bonds:30,Cash:10}),/100/);assert.throws(()=>parseCSV('symbol,category,quantity,price\nVTI,Stocks,2,-4'),/positive/);assert.throws(()=>parseCSV('symbol,category,quantity,price\nVTI,Other,2,4'));});
test('CSV imports valid holdings and rejects unexpected columns',()=>{assert.deepEqual(parseCSV('symbol,category,quantity,price\nAUSD,Cash,100,1'),[{symbol:'AUSD',category:'Cash',quantity:100,price:1}]);assert.throws(()=>parseCSV('symbol,category,quantity,price\nAUSD,Cash,100,1,extra'));});
