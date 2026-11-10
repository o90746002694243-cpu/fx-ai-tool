"use strict";
// These limits apply only to push alerts. Paper trades continue to be evaluated.
const PAIR_COOLDOWN_MS = 90 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 20 * 60 * 1000;
const REOPEN_WAIT_MS = 90 * 60 * 1000;
const nyClock = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function reopenCooldown(now = new Date()) {
  const parts = Object.fromEntries(nyClock.formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const minutes = Number(parts.hour)*60 + Number(parts.minute);
  return parts.weekday === 'Sun' && minutes >= 17*60 && minutes < 17*60+REOPEN_WAIT_MS/60000;
}
function allowedToPush(log, pair, now = Date.now()) {
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  const latestPair = entries.filter(e=>e.pair===pair && Number.isFinite(e.at) && e.at<=now).reduce((a,e)=>Math.max(a,e.at),-Infinity);
  const latestGlobal = entries.filter(e=>Number.isFinite(e.at) && e.at<=now).reduce((a,e)=>Math.max(a,e.at),-Infinity);
  if (now-latestPair < PAIR_COOLDOWN_MS) return {allowed:false,reason:'同一通貨の90分再通知制限'};
  if (now-latestGlobal < GLOBAL_COOLDOWN_MS) return {allowed:false,reason:'全通貨共通20分通知間隔'};
  return {allowed:true,reason:null};
}
function recordPush(log,pair,now=Date.now()) {
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  return {entries:[...entries.filter(e=>Number.isFinite(e.at) && e.at >= now-24*60*60*1000), {pair,at:now}].slice(-100)};
}
module.exports = {reopenCooldown,allowedToPush,recordPush};
