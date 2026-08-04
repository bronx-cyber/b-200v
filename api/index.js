// api/index.js - BRONX OSINT V200 ULTRA - CYBERPUNK EDITION
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

const REAL_API_BASE = 'https://ft-osint-api.duckdns.org/api';
const REAL_API_KEYS = ['bronx-bot-9999', 'bronx-bot-9999', 'bronx-ultra-king-ft-bro-op', 'bronx-ultra-king-ft-bro-op'];
let currentKeyIndex = 0;
function getNextKey() { const key = REAL_API_KEYS[currentKeyIndex]; currentKeyIndex = (currentKeyIndex + 1) % REAL_API_KEYS.length; return key; }

const FAKE_IPS = [
    '103.15.224.' + Math.floor(Math.random()*255), '117.98.45.' + Math.floor(Math.random()*255),
    '152.67.89.' + Math.floor(Math.random()*255), '157.34.123.' + Math.floor(Math.random()*255),
    '182.76.55.' + Math.floor(Math.random()*255), '223.188.12.' + Math.floor(Math.random()*255),
    '45.112.67.' + Math.floor(Math.random()*255), '51.89.234.' + Math.floor(Math.random()*255),
    '77.45.178.' + Math.floor(Math.random()*255), '91.234.56.' + Math.floor(Math.random()*255),
    '176.32.90.' + Math.floor(Math.random()*255), '198.54.123.' + Math.floor(Math.random()*255),
];
const BROWSERS = ['Chrome/120', 'Firefox/121', 'Safari/17.2', 'Edge/120', 'Opera/106', 'Brave/1.62', 'Arc/1.21'];

function getFakeIP() { return FAKE_IPS[Math.floor(Math.random() * FAKE_IPS.length)]; }
function getFakeBrowser() { return BROWSERS[Math.floor(Math.random() * BROWSERS.length)]; }

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'BRONX_ULTRA';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'king5';
const MASTER_API_KEY = process.env.MASTER_API_KEY || 'BRONX_MASTER_' + Math.random().toString(36).substring(2,10).toUpperCase();

const DATA_DIR = process.env.RENDER_DATA_DIR || '/tmp';
const DATA_FILE = path.join(DATA_DIR, 'bronx_v200_data.json');
const LOGS_FILE = path.join(DATA_DIR, 'bronx_v200_logs.json');
const ADMIN_LOGS_FILE = path.join(DATA_DIR, 'bronx_v200_admin_logs.json');

let keyStorage = {};
let customAPIs = [];
let requestLogs = [];
let adminSessions = {};
let permanentTokens = {};
let cooldownTimers = {};
let protectedData = {};
let dailyLimits = {};
let perSecondLimits = {};
let adminLogs = [];
let keyMonitorLogs = [];

function saveToDisk(){
    try{
        const ks={};
        Object.entries(keyStorage).forEach(([k,v])=>{if(!v._hardcoded)ks[k]=v});
        const d={keys:ks, apis:customAPIs, tokens:permanentTokens, logs:requestLogs.slice(-1000), protected:protectedData};
        fs.writeFileSync(DATA_FILE, JSON.stringify(d,null,2));
        fs.writeFileSync(LOGS_FILE, JSON.stringify(keyMonitorLogs.slice(-500), null, 2));
        fs.writeFileSync(ADMIN_LOGS_FILE, JSON.stringify(adminLogs.slice(-200), null, 2));
    }catch(e){}
}

function loadFromDisk(){
    try{
        if(fs.existsSync(DATA_FILE)){
            const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
            if(d.keys) Object.entries(d.keys).forEach(([k,v])=>{keyStorage[k]=v});
            if(d.apis?.length>0) customAPIs=d.apis;
            if(d.tokens){permanentTokens=d.tokens; Object.entries(permanentTokens).forEach(([t])=>{adminSessions[t]={expiresAt:Date.now()+(365*24*60*60*1000),permanent:true}})}
            if(d.logs) requestLogs=d.logs;
            if(d.protected) protectedData=d.protected;
        }
        if(fs.existsSync(LOGS_FILE)) keyMonitorLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
        if(fs.existsSync(ADMIN_LOGS_FILE)) adminLogs = JSON.parse(fs.readFileSync(ADMIN_LOGS_FILE, 'utf8'));
        return true;
    }catch(e){}
    return false;
}

function scheduleSave(){setTimeout(()=>saveToDisk(),2000)}
setInterval(()=>scheduleSave(),5*60*1000);

function getIndiaTime(){return new Date(new Date().getTime()+(5.5*60*60*1000))}
function getIndiaDate(){return getIndiaTime().toISOString().split('T')[0]}
function getIndiaDateTime(){return getIndiaTime().toISOString().replace('T',' ').substring(0,19)}
function isKeyExpired(d){if(!d||d==='LIFETIME')return false;return getIndiaTime()>new Date(d)}
function parseExpiryDate(s){if(!s||s==='LIFETIME')return null;const p=s.split('-');if(p.length===3)return p[0].length===4?new Date(+p[0],+p[1]-1,+p[2],23,59,59):new Date(+p[2],+p[1]-1,+p[0],23,59,59);const d=new Date(s);return isNaN(d.getTime())?null:d}

function checkCooldown(k){
    const kd=keyStorage[k];
    if(!kd||!kd.cooldown)return{allowed:true};
    const n=Date.now();
    if(cooldownTimers[k]&&(n-cooldownTimers[k])<(kd.cooldown*1000))return{allowed:false,remaining:Math.ceil((kd.cooldown*1000-(n-cooldownTimers[k]))/1000)};
    cooldownTimers[k]=n;
    return{allowed:true}
}

function checkPerSecondLimit(k){
    const kd=keyStorage[k];
    if(!kd||!kd.perSecondLimit||kd.perSecondLimit<=0)return{allowed:true};
    const now = Date.now();
    const windowKey = k + '_ps_' + Math.floor(now / 1000);
    if(!perSecondLimits[windowKey]) perSecondLimits[windowKey] = 0;
    if(perSecondLimits[windowKey] >= kd.perSecondLimit) return {allowed:false, message: `⚡ Rate Limit ${kd.perSecondLimit}/s Reached!`};
    perSecondLimits[windowKey]++;
    return {allowed:true};
}

function checkDailyLimit(k){
    const kd=keyStorage[k];
    if(!kd||!kd.dailyLimit)return{allowed:true};
    const today=getIndiaDate();
    const dk=k+'_'+today;
    if(!dailyLimits[dk])dailyLimits[dk]=0;
    if(dailyLimits[dk]>=kd.dailyLimit)return{allowed:false,remaining:0,message:`🔴 Daily Limit ${kd.dailyLimit}/${kd.dailyLimit} Reached!`};
    return{allowed:true,used:dailyLimits[dk],remaining:kd.dailyLimit-dailyLimits[dk]}
}

function isProtected(value){
    for(const key in protectedData){
        if(value.includes(protectedData[key]))return protectedData[key]
    }
    return null
}

function checkKeyValid(k){
    if(!k)return{valid:false,error:'Missing key'};
    const kd=keyStorage[k];
    if(!kd)return{valid:false,error:'🔑 Key Not Found!\n\n🛒 Purchase Paid API Key\n📅 30 Days = ₹300\n👑 Lifetime = ₹5000\n\n💬 DM @BRONX_ULTRA on Telegram'};
    if(kd.stopped)return{valid:false,error:'⛔ Key Stopped!'};
    if(kd.expiry&&isKeyExpired(kd.expiry))return{valid:false,error:'⏰ Key Expired on '+kd.expiryStr};
    if(!kd.unlimited&&kd.used>=kd.limit)return{valid:false,error:`🔴 ${kd.limit}/${kd.limit} LIMIT REACHED!`};
    const dl=checkDailyLimit(k);
    if(!dl.allowed)return{valid:false,error:dl.message};
    const ps=checkPerSecondLimit(k);
    if(!ps.allowed)return{valid:false,error:ps.message};
    const cd=checkCooldown(k);
    if(!cd.allowed)return{valid:false,error:'⏱️ Cooldown '+cd.remaining+'s'};
    return{valid:true,keyData:kd}
}

function incrementKeyUsage(k, ep, ip, browser){
    if(keyStorage[k]&&!keyStorage[k].unlimited){
        keyStorage[k].used++;
        const dk=k+'_'+getIndiaDate();
        if(!dailyLimits[dk])dailyLimits[dk]=0;
        dailyLimits[dk]++;
        if(keyStorage[k].used%5===0)scheduleSave();
    }
    keyMonitorLogs.push({
        key: k.substring(0, 8) + '***',
        fullKey: k,
        endpoint: ep,
        ip: ip,
        browser: browser,
        timestamp: getIndiaDateTime(),
        date: getIndiaDate()
    });
    if(keyMonitorLogs.length > 500) keyMonitorLogs = keyMonitorLogs.slice(-500);
}

function checkKeyScope(kd,ep){
    if(!kd?.scopes?.length)return{valid:false,error:'No scopes'};
    if(kd.scopes.includes('*'))return{valid:true};
    if(kd.scopes.includes(ep))return{valid:true};
    if(ep.startsWith('c/')&&kd.scopes.includes('custom'))return{valid:true};
    const isCustom=customAPIs.some(a=>a.endpoint===ep||'c/'+a.endpoint===ep);
    if(isCustom&&kd.scopes.includes('custom'))return{valid:true};
    return{valid:false,error:`Scope denied. Required: ${ep}`}
}

function generateToken(){const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';let t='';for(let i=0;i<32;i++)t+=c.charAt(Math.floor(Math.random()*c.length));return t}

function isAdminAuth(t){
    if(!t)return false;
    if(adminSessions[t]){
        if(adminSessions[t].permanent)return true;
        if(Date.now()<adminSessions[t].expiresAt)return true;
        delete adminSessions[t];
        delete permanentTokens[t];
    }
    return false;
}

function sanitizeResponse(d){
    if(!d)return d;
    try{
        const c=JSON.parse(JSON.stringify(d));
        delete c.credit;delete c.truecaller_name;delete c.cached;delete c.cached_at;
        delete c.api_by;delete c.by;delete c.channel;delete c.developer;
        delete c.api_key;delete c.real_url;delete c.source_url;delete c.owner;
        delete c.key_note;delete c.response_time_ms;
        if(c.meta){delete c.meta.api_by;delete c.meta.response_time_ms;delete c.meta.quota_used;if(Object.keys(c.meta).length===0)delete c.meta}
        c.powered_by="@BRONX_ULTRA";
        return c;
    }catch(e){return d}
}

function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}

function createMasterKey(){return{name:'👑 OWNER',scopes:['*'],type:'owner',limit:999999,used:0,cooldown:0,dailyLimit:0,perSecondLimit:0,expiry:null,expiryStr:'LIFETIME',created:getIndiaDateTime(),unlimited:true,hidden:true,_hardcoded:false}}

function initHardcodedKeys(){
    const now=getIndiaDateTime();
    const hc=[
        {key:'BRONX_PREMIUM_V100_01',name:'Premium 01',limit:999999,expiry:'31-12-2028',scopes:['*']},
        {key:'BRONX_PREMIUM_V100_02',name:'Premium 02',limit:999999,expiry:'31-12-2028',scopes:['*']},
        {key:'BRONX_PREMIUM_V100_03',name:'Premium 03',limit:999999,expiry:'31-12-2028',scopes:['*']},
        {key:'BRONX_PREMIUM_V100_04',name:'Premium 04',limit:999999,expiry:'31-12-2028',scopes:['*']},
        {key:'BRONX_PREMIUM_V100_05',name:'Premium 05',limit:999999,expiry:'31-12-2028',scopes:['*']},
        {key:'BRONX_ULTRA_OSINT_01',name:'Ultra 01',limit:888888,expiry:'30-06-2029',scopes:['number','aadhar','upi','pan']},
        {key:'BRONX_ULTRA_OSINT_02',name:'Ultra 02',limit:888888,expiry:'30-06-2029',scopes:['number','aadhar','upi','pan']},
        {key:'BRONX_KING_OP_V100',name:'King OP',limit:999999,expiry:'31-12-2030',scopes:['*']},
        {key:'BRONX_ELITE_V100_01',name:'Elite 01',limit:999999,expiry:'31-12-2030',scopes:['*']},
        {key:'BRONX_GOD_TIER_V100',name:'God Tier',limit:999999,expiry:'31-12-2030',scopes:['*']}
    ];
    hc.forEach(d=>{
        if(!keyStorage[d.key])keyStorage[d.key]={
            name:d.name,scopes:d.scopes,type:'hardcoded',limit:d.limit,used:0,
            cooldown:0,dailyLimit:0,perSecondLimit:0,
            expiry:parseExpiryDate(d.expiry),expiryStr:d.expiry,
            created:now,unlimited:true,hidden:true,_hardcoded:true
        }
    });
}

function initCustomAPIs(){
    customAPIs=[
        {id:1,name:'Number Info',endpoint:'number-advanced',param:'num',example:'9876543210',visible:true,realAPI:'https://num-tg-info-api.vercel.app/info?number={param}'},
        {id:2,name:'Vehicle RC',endpoint:'rc-details',param:'ca_number',example:'MH02FZ0555',visible:true,realAPI:'https://simple-rc-info.vercel.app/rc?num={param}'},
        {id:3,name:'Aadhar',endpoint:'aadhar-verify',param:'aadhar',example:'393933081942',visible:true,realAPI:'https://bronx-king-vip999.vercel.app/api/aadhaar?num={param}'},
        {id:4,name:'Email',endpoint:'email-lookup',param:'mail',example:'user@gmail.com',visible:true,realAPI:'https://bronx-king-mail-opi.vercel.app/mail={param}'},
        {id:5,name:'Telegram',endpoint:'telegram-scan',param:'id',example:'7530266953',visible:true,realAPI:'https://bronx-tg-king-bro.vercel.app/tg?key=BRONXop&query={param}'},
        {id:6,name:'SMS Bomber',endpoint:'sms-bomber',param:'number',example:'1234567890',visible:true,realAPI:'https://bronx-sms-api-ulimate.vercel.app/api/key-bronx-paid-vip?number={param}&counter=10'},
        {id:7,name:'Number Backup',endpoint:'num-op',param:'num',example:'9876543210',visible:true,realAPI:'https://tfqdeadlo-inddataapi.hf.space/search?mobile={param}'}
    ];
}

const endpoints={
    number:{p:'num',i:'📱',e:'9876543210',d:'Mobile Lookup',c:'phone'},
    aadhar:{p:'num',i:'🆔',e:'393933081942',d:'Aadhaar',c:'phone'},
    leakinfo:{p:'term',i:'🕵️',e:'email@example.com',d:'Leak Info',c:'phone'},
    name:{p:'name',i:'🔍',e:'abhiraaj',d:'Name Search',c:'phone'},
    numv2:{p:'num',i:'📱',e:'6205949840',d:'Number v2',c:'phone'},
    adv:{p:'num',i:'📱',e:'9876543210',d:'Advanced Intel',c:'phone'},
    adharfamily:{p:'num',i:'👨‍👩‍👧‍👦',e:'984154610245',d:'Family',c:'phone'},
    adharration:{p:'num',i:'📋',e:'701984830542',d:'Ration Card',c:'phone'},
    imei:{p:'imei',i:'📱',e:'357817383506298',d:'IMEI',c:'phone'},
    calltracer:{p:'num',i:'📞',e:'9876543210',d:'Call Tracer',c:'phone'},
    challan:{p:'vehicle',i:'📋',e:'UP42BB2572',d:'Challan',c:'vehicle'},
    numleak:{p:'num',i:'🔓',e:'9876543210',d:'Number Leak',c:'phone'},
    bomber:{p:'number',i:'💣',e:'9876543210',d:'SMS Bomber',c:'phone'},
    numtoupi:{p:'num',i:'💳',e:'8945996482',d:'Num to UPI',c:'finance'},
    upi:{p:'upi',i:'💰',e:'example@ybl',d:'UPI',c:'finance'},
    ifsc:{p:'ifsc',i:'🏦',e:'SBIN0001234',d:'IFSC',c:'finance'},
    pan:{p:'pan',i:'📄',e:'AXDPR2606K',d:'PAN',c:'finance'},
    pincode:{p:'pin',i:'📍',e:'110001',d:'Pincode',c:'location'},
    ip:{p:'ip',i:'🌐',e:'8.8.8.8',d:'IP Lookup',c:'location'},
    vehicle:{p:'vehicle',i:'🚗',e:'MH02FZ0555',d:'Vehicle',c:'vehicle'},
    rc:{p:'owner',i:'📋',e:'UP92P2111',d:'veh2num',c:'vehicle'},
    veh2num:{p:'vehicle',i:'🚗',e:'KL41V3504',d:'Veh to Num',c:'vehicle'},
    ff:{p:'uid',i:'🎮',e:'123456789',d:'Free Fire',c:'gaming'},
    bgmi:{p:'uid',i:'🎮',e:'5121439477',d:'BGMI',c:'gaming'},
    insta:{p:'username',i:'📸',e:'cristiano',d:'Instagram',c:'social'},
    git:{p:'username',i:'💻',e:'ftgamer2',d:'GitHub',c:'social'},
    tg:{p:'info',i:'📲',e:'JAUUOWNER',d:'Telegram',c:'social'},
    tgidinfo:{p:'id',i:'📲',e:'7530266953',d:'TG ID Info',c:'social'},
    snap:{p:'username',i:'👻',e:'priyapanchal272',d:'Snapchat',c:'social'},
    pk:{p:'num',i:'🇵🇰',e:'03331234567',d:'Pakistan',c:'pakistan'},
    pkv2:{p:'num',i:'🇵🇰',e:'3359736848',d:'Pakistan v2',c:'pakistan'}
};

app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({extended:true,limit:'50mb'}));
app.set('json spaces',2);

app.use((req,res,next)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type,x-api-key,x-admin-token');
    if(req.method==='OPTIONS')return res.status(200).end();
    next();
});

app.get('/',(req,res)=>{try{res.send(renderHome())}catch(e){res.send('Error loading homepage')}});
app.get('/docs',(req,res)=>{try{res.send(renderDocs())}catch(e){res.send('Error loading docs')}});
app.get('/test',(req,res)=>{res.json({status:'✅ BRONX V200 ULTRA',storage:'RENDER DISK',endpoints:Object.keys(endpoints).length,total_keys:Object.keys(keyStorage).length,custom_apis:customAPIs.length})});

app.get('/api/leakinfo',async(req,res)=>{
    try{
        const t=req.query.term||req.query.info;
        if(!t)return res.json({error:'Missing term'});
        const prot=isProtected(t);
        if(prot)return res.json({error:'🔒 PROTECTED',protected:true});
        const r=await axios.get(`${REAL_API_BASE}/leakinfo?key=${getNextKey()}&info=${encodeURIComponent(t)}`,{timeout:30000});
        res.json({...sanitizeResponse(r.data),api_info:{endpoint:'leakinfo'}});
    }catch(e){res.json({error:'API error'})}
});

app.get('/api/custom/:ep',async(req,res)=>{
    try{
        const api=customAPIs.find(a=>a.endpoint===req.params.ep&&a.visible);
        if(!api)return res.json({error:'Not found'});
        const key=req.query.key;
        if(!key)return res.json({error:'Key required'});
        const kc=checkKeyValid(key);
        if(!kc.valid)return res.json({error:kc.error});
        const sc=checkKeyScope(kc.keyData,'custom');
        const sc2=checkKeyScope(kc.keyData,req.params.ep);
        if(!sc.valid&&!sc2.valid)return res.json({error:'Scope denied'});
        const pv=req.query[api.param]||req.query.number;
        if(!pv)return res.json({error:'Missing param'});
        const prot=isProtected(pv);
        if(prot)return res.json({error:'🔒 PROTECTED',protected:true});
        const fakeIP = getFakeIP();
        const fakeBrowser = getFakeBrowser();
        let url=api.realAPI.replace(/\{param\}/gi,encodeURIComponent(pv));
        const r=await axios.get(url,{timeout:30000,headers:{'User-Agent':fakeBrowser,'X-Forwarded-For':fakeIP}});
        incrementKeyUsage(key, 'c/'+req.params.ep, fakeIP, fakeBrowser);
        requestLogs.push({timestamp:getIndiaDateTime(),key:key.substring(0,8)+'***',endpoint:'c/'+req.params.ep,param:pv.substring(0,20),status:'success',ip:fakeIP,browser:fakeBrowser});
        if(requestLogs.length>1000)requestLogs=requestLogs.slice(-1000);
        res.json({...sanitizeResponse(r.data),api_info:{key_owner:kc.keyData?.name,remaining:kc.keyData?.unlimited?'∞':Math.max(0,(kc.keyData?.limit||0)-(kc.keyData?.used||0)),dailyRemaining:kc.keyData?.dailyLimit?Math.max(0,kc.keyData.dailyLimit-(dailyLimits[key+'_'+getIndiaDate()]||0)):'∞',limit:kc.keyData?.unlimited?'∞':kc.keyData?.limit,used:kc.keyData?.used||0,perSecondLimit:kc.keyData?.perSecondLimit||'∞',created:kc.keyData?.created,expiry:kc.keyData?.expiryStr||'LIFETIME'}});
    }catch(e){res.json({error:'API error'})}
});

app.get('/api/number',async(req,res)=>{
    try{
        const key=req.query.key;
        const num=req.query.num;
        if(!key)return res.json({error:'Key required'});
        if(!num)return res.json({error:'Missing num param'});
        const kc=checkKeyValid(key);
        if(!kc.valid)return res.json({error:kc.error});
        const sc=checkKeyScope(kc.keyData,'number');
        if(!sc.valid)return res.json({error:sc.error});
        const prot=isProtected(num);
        if(prot)return res.json({error:'🔒 PROTECTED',protected:true});
        const fakeIP = getFakeIP();
        const fakeBrowser = getFakeBrowser();
        const url=`${REAL_API_BASE}/number?key=${getNextKey()}&num=${encodeURIComponent(num)}`;
        const r=await axios.get(url,{timeout:30000,headers:{'User-Agent':fakeBrowser,'X-Forwarded-For':fakeIP}});
        incrementKeyUsage(key, 'number', fakeIP, fakeBrowser);
        requestLogs.push({timestamp:getIndiaDateTime(),key:key.substring(0,8)+'***',endpoint:'number',param:num,status:'success',ip:fakeIP,browser:fakeBrowser});
        if(requestLogs.length>1000)requestLogs=requestLogs.slice(-1000);
        res.json({...sanitizeResponse(r.data),api_info:{key_owner:kc.keyData?.name,remaining:kc.keyData?.unlimited?'∞':Math.max(0,(kc.keyData?.limit||0)-(kc.keyData?.used||0)),dailyRemaining:kc.keyData?.dailyLimit?Math.max(0,kc.keyData.dailyLimit-(dailyLimits[key+'_'+getIndiaDate()]||0)):'∞',limit:kc.keyData?.unlimited?'∞':kc.keyData?.limit,used:kc.keyData?.used||0,perSecondLimit:kc.keyData?.perSecondLimit||'∞',created:kc.keyData?.created,expiry:kc.keyData?.expiryStr||'LIFETIME'}});
    }catch(e){res.json({error:'API error'})}
});

app.get('/api/key-bronx/:ep',async(req,res)=>{
    try{
        const ep=req.params.ep;
        if(!endpoints[ep])return res.json({error:'Endpoint not found'});
        const key=req.query.key;
        if(!key)return res.json({error:'Key required'});
        const kc=checkKeyValid(key);
        if(!kc.valid)return res.json({error:kc.error});
        const sc=checkKeyScope(kc.keyData,ep);
        if(!sc.valid)return res.json({error:sc.error});
        const pv=req.query[endpoints[ep].p];
        if(!pv)return res.json({error:'Missing '+endpoints[ep].p});
        const prot=isProtected(pv);
        if(prot)return res.json({error:'🔒 '+ep+' PROTECTED',protected:true});
        const fakeIP = getFakeIP();
        const fakeBrowser = getFakeBrowser();
        const url=`${REAL_API_BASE}/${ep}?key=${getNextKey()}&${endpoints[ep].p}=${encodeURIComponent(pv)}`;
        const r=await axios.get(url,{timeout:30000,headers:{'User-Agent':fakeBrowser,'X-Forwarded-For':fakeIP}});
        incrementKeyUsage(key, ep, fakeIP, fakeBrowser);
        requestLogs.push({timestamp:getIndiaDateTime(),key:key.substring(0,8)+'***',endpoint:ep,param:pv,status:'success',ip:fakeIP,browser:fakeBrowser});
        if(requestLogs.length>1000)requestLogs=requestLogs.slice(-1000);
        res.json({...sanitizeResponse(r.data),api_info:{key_owner:kc.keyData?.name,remaining:kc.keyData?.unlimited?'∞':Math.max(0,(kc.keyData?.limit||0)-(kc.keyData?.used||0)),dailyRemaining:kc.keyData?.dailyLimit?Math.max(0,kc.keyData.dailyLimit-(dailyLimits[key+'_'+getIndiaDate()]||0)):'∞',limit:kc.keyData?.unlimited?'∞':kc.keyData?.limit,used:kc.keyData?.used||0,perSecondLimit:kc.keyData?.perSecondLimit||'∞',created:kc.keyData?.created,expiry:kc.keyData?.expiryStr||'LIFETIME'}});
    }catch(e){res.json({error:'API error'})}
});

app.get('/admin',(req,res)=>{
    try{
        const token=req.query.token||req.headers['x-admin-token'];
        if(token&&isAdminAuth(token))return res.send(renderAdmin(token));
        res.send(renderLogin());
    }catch(e){res.send('Error loading admin')}
});

app.post('/admin/login',async(req,res)=>{
    const{username,password}=req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const browser = req.headers['user-agent'] || 'Unknown';
    if(username===ADMIN_USERNAME&&password===ADMIN_PASSWORD){
        const token=generateToken();
        adminSessions[token]={expiresAt:Date.now()+(365*24*60*60*1000),permanent:true};
        permanentTokens[token]={createdAt:getIndiaDateTime()};
        adminLogs.push({user: username,action: 'LOGIN',ip: ip,browser: browser,timestamp: getIndiaDateTime(),status: 'SUCCESS'});
        scheduleSave();
        res.json({success:true,token,message:'✅ Access Granted',redirect:'/admin?token='+token});
    } else {
        adminLogs.push({user: username,action: 'LOGIN_FAILED',ip: ip,browser: browser,timestamp: getIndiaDateTime(),status: 'FAILED'});
        res.json({success:false,error:'Invalid credentials'});
    }
});

app.post('/admin/generate-key',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const{keyName,keyOwner,scopes,limit,expiryDate,days,cooldown,dailyLimit,perSecondLimit}=req.body;
    if(!keyName||!keyOwner)return res.json({e:'Missing fields'});
    if(keyStorage[keyName])return res.json({e:'Key already exists'});
    const ks=scopes||['number'];
    let exp=null,es=expiryDate||'LIFETIME';
    if(days&&!isNaN(days)){
        const d=new Date(getIndiaTime().getTime()+parseInt(days)*24*60*60*1000);
        exp=d;
        es=d.toISOString().split('T')[0].split('-').reverse().join('-');
    }else if(expiryDate&&expiryDate!=='LIFETIME'){
        exp=parseExpiryDate(expiryDate);
        es=expiryDate;
    }
    keyStorage[keyName]={
        name:keyOwner,scopes:ks,type:'generated',limit:parseInt(limit)||100,used:0,
        cooldown:parseInt(cooldown)||0,dailyLimit:parseInt(dailyLimit)||0,
        perSecondLimit:parseInt(perSecondLimit)||0,expiry:exp,expiryStr:es,
        created:getIndiaDateTime(),unlimited:false,hidden:false,_hardcoded:false
    };
    saveToDisk();
    res.json({success:true,key:keyName,scopes:ks,cooldown:(parseInt(cooldown)||0)+'s',dailyLimit:dailyLimit||'Unlimited',perSecondLimit:perSecondLimit||'Unlimited',expiry:es,message:'🔑 Key Generated!'});
});

app.post('/admin/push-key',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const{keyName,days}=req.body;
    if(!keyStorage[keyName])return res.json({e:'Key not found'});
    if(keyStorage[keyName]._hardcoded)return res.json({e:'Cannot push hardcoded key'});
    const d=parseInt(days)||30;
    const ne=new Date(getIndiaTime().getTime()+d*24*60*60*1000);
    keyStorage[keyName].expiry=ne;
    keyStorage[keyName].expiryStr=ne.toISOString().split('T')[0].split('-').reverse().join('-');
    keyStorage[keyName].used=0;
    saveToDisk();
    res.json({success:true,message:`⬆ Pushed ${d} days!`});
});

app.post('/admin/delete-key',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    if(req.body.keyName===MASTER_API_KEY||keyStorage[req.body.keyName]?._hardcoded)return res.json({e:'Protected key'});
    delete keyStorage[req.body.keyName];
    saveToDisk();
    res.json({success:true});
});

app.post('/admin/reset-key-usage',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    if(keyStorage[req.body.keyName]){keyStorage[req.body.keyName].used=0;saveToDisk();res.json({success:true});}
});

app.post('/admin/reset-all',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    Object.keys(keyStorage).forEach(k=>{if(k!==MASTER_API_KEY&&!keyStorage[k]._hardcoded)keyStorage[k].used=0});
    dailyLimits={};perSecondLimits={};saveToDisk();res.json({success:true});
});

app.post('/admin/clear-logs',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    requestLogs=[];keyMonitorLogs=[];saveToDisk();res.json({success:true});
});

app.post('/admin/add-api',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const{name,endpoint,param,example,realAPI,visible}=req.body;
    if(!name||!endpoint)return res.json({e:'Missing fields'});
    customAPIs.push({id:customAPIs.length+1,name,endpoint,param:param||'num',example:example||'9876543210',visible:visible!==false,realAPI:realAPI||''});
    saveToDisk();res.json({success:true});
});

app.post('/admin/toggle-api',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const api=customAPIs.find(a=>a.id===parseInt(req.body.id));
    if(api){api.visible=!api.visible;saveToDisk();res.json({success:true,visible:api.visible})}
    else res.json({e:'API not found'});
});

app.post('/admin/delete-api',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const idx=customAPIs.findIndex(a=>a.id===parseInt(req.body.id));
    if(idx>-1){customAPIs.splice(idx,1);saveToDisk();res.json({success:true})}
    else res.json({e:'API not found'});
});

app.post('/admin/update-scopes',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const{keyName,scopes}=req.body;
    if(!keyStorage[keyName])return res.json({e:'Key not found'});
    if(keyStorage[keyName]._hardcoded)return res.json({e:'Hardcoded key'});
    keyStorage[keyName].scopes=scopes;
    saveToDisk();res.json({success:true});
});

app.post('/admin/add-protection',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const{value}=req.body;
    if(!value)return res.json({e:'Missing value'});
    protectedData[value]=value;
    saveToDisk();res.json({success:true,message:'✅ Protected: '+value});
});

app.post('/admin/remove-protection',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    delete protectedData[req.body.value];
    saveToDisk();res.json({success:true});
});

app.post('/admin/stop-key',async(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    if(!keyStorage[req.body.keyName])return res.json({e:'Key not found'});
    if(keyStorage[req.body.keyName]._hardcoded)return res.json({e:'Hardcoded key'});
    keyStorage[req.body.keyName].stopped=!keyStorage[req.body.keyName].stopped;
    saveToDisk();res.json({success:true,stopped:keyStorage[req.body.keyName].stopped});
});

app.post('/admin/import-keys',async(req,res)=>{
    try{
        if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
        const body = req.body;
        let keysToImport = body.keys || body;
        if (keysToImport.keys && typeof keysToImport.keys === 'object' && !Array.isArray(keysToImport.keys)) {
            keysToImport = keysToImport.keys;
        }
        const metadataFields = ['success', 'total', 'keys', 'exported_at'];
        let imported=0,skipped=0;
        Object.entries(keysToImport).forEach(([keyName,keyData])=>{
            if(metadataFields.includes(keyName) && typeof keyData !== 'object') return;
            if(!keyData || typeof keyData !== 'object') return;
            if(keyStorage[keyName]){skipped++;return;}
            if(keyData._hardcoded) return;
            keyStorage[keyName]={
                name: keyData.name || 'Imported',scopes: keyData.scopes || ['number'],
                type: 'generated',limit: keyData.limit || 100,used: keyData.used || 0,
                cooldown: keyData.cooldown || 0,dailyLimit: keyData.dailyLimit || 0,
                perSecondLimit: keyData.perSecondLimit || 0,
                expiry: keyData.expiry ? new Date(keyData.expiry) : null,
                expiryStr: keyData.expiryStr || 'LIFETIME',
                created: keyData.created || getIndiaDateTime(),
                unlimited: keyData.unlimited || false,hidden: false,_hardcoded: false
            };
            imported++;
        });
        saveToDisk();
        res.json({success:true,imported,skipped,message:`✅ ${imported} keys imported, ${skipped} skipped!`});
    }catch(e){res.json({e:'Error importing keys'})}
});

app.get('/admin/export-keys',async(req,res)=>{
    try{
        if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
        const exportKeys={};
        Object.entries(keyStorage).forEach(([k,v])=>{
            if(!v._hardcoded&&!v.hidden){
                exportKeys[k]={
                    name:v.name,scopes:v.scopes,limit:v.limit,used:v.used,
                    cooldown:v.cooldown||0,dailyLimit:v.dailyLimit||0,
                    perSecondLimit:v.perSecondLimit||0,expiry:v.expiry,
                    expiryStr:v.expiryStr,created:v.created,
                    unlimited:v.unlimited||false,stopped:v.stopped||false
                };
            }
        });
        res.json({success:true,total:Object.keys(exportKeys).length,keys:exportKeys,exported_at:getIndiaDateTime()});
    }catch(e){res.json({e:'Error exporting keys'})}
});

app.get('/admin/monitor-logs',(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    res.json({logs: keyMonitorLogs.slice(-100), total: keyMonitorLogs.length});
});

app.get('/admin/admin-logs',(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    res.json({logs: adminLogs.slice(-100), total: adminLogs.length});
});

app.get('/admin/stats',(req,res)=>{
    if(!isAdminAuth(req.headers['x-admin-token']||req.query.token))return res.json({e:'Unauthorized'});
    const today = getIndiaDate();
    const weekAgo = new Date(getIndiaTime().getTime() - 7*24*60*60*1000).toISOString().split('T')[0];
    const monthAgo = new Date(getIndiaTime().getTime() - 30*24*60*60*1000).toISOString().split('T')[0];
    const todayLogs = keyMonitorLogs.filter(l=>l.date===today);
    const weekLogs = keyMonitorLogs.filter(l=>l.date>=weekAgo);
    const monthLogs = keyMonitorLogs.filter(l=>l.date>=monthAgo);
    const keyCount = {};
    keyMonitorLogs.forEach(l=>{if(!keyCount[l.key]) keyCount[l.key] = 0;keyCount[l.key]++;});
    const topKeys = Object.entries(keyCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>({key:k,requests:v}));
    res.json({totalRequests: keyMonitorLogs.length,todayRequests: todayLogs.length,weeklyRequests: weekLogs.length,monthlyRequests: monthLogs.length,topKeys: topKeys});
});

app.use((req,res)=>{res.json({error:'Not found'})});

// ============================================
// 🎨 CYBERPUNK GLASSMORPHISM THEME CSS
// ============================================
const CYBERPUNK_CSS = `
<style>
:root {
  --bg-primary: #090B12;
  --bg-secondary: #111827;
  --bg-card: rgba(20, 20, 35, 0.7);
  --border-color: rgba(255, 255, 255, 0.08);
  --text-primary: #FFFFFF;
  --text-secondary: #A1A1AA;
  --text-muted: #71717A;
  --accent-primary: #7C3AED;
  --accent-secondary: #6366F1;
  --accent-success: #22C55E;
  --accent-warning: #F59E0B;
  --accent-danger: #EF4444;
  --accent-info: #06B6D4;
  --gradient-primary: linear-gradient(135deg, #7C3AED, #6366F1);
  --gradient-rainbow: linear-gradient(90deg, #7C3AED, #6366F1, #A855F7, #EC4899, #7C3AED);
  --shadow-glow: 0 0 25px rgba(124, 58, 237, 0.35);
  --shadow-card: 0 8px 32px rgba(0, 0, 0, 0.4);
  --border-radius: 18px;
  --glass-blur: blur(18px);
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
*{margin:0;padding:0;box-sizing:border-box}
body{
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
  position: relative;
}
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: 
    radial-gradient(ellipse at 50% 0%, rgba(124, 58, 237, 0.08), transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(99, 102, 241, 0.05), transparent 50%);
  pointer-events: none;
  z-index: 0;
}
.grid-bg {
  position: fixed;
  inset: 0;
  background-image: 
    linear-gradient(rgba(124, 58, 237, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124, 58, 237, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  z-index: 0;
  pointer-events: none;
}
#particles-canvas, #snowfall-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
#particles-canvas { z-index: 0; }
#snowfall-canvas { z-index: 1; }
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:var(--bg-primary)}
::-webkit-scrollbar-thumb{background:linear-gradient(#7C3AED,#6366F1);border-radius:10px}
.topnav {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: rgba(9, 11, 18, 0.85);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--border-color);
  padding: 14px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.topnav .brand {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 6px;
  background: var(--gradient-rainbow);
  background-size: 300% 300%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: rainbowShift 3s linear infinite;
}
@keyframes rainbowShift {
  0%{background-position:0% 50%}
  100%{background-position:300% 50%}
}
.topnav .nav-links { display: flex; gap: 8px; align-items: center; }
.topnav .nav-links a {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 10px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 10px;
  transition: var(--transition);
  border: 1px solid transparent;
  letter-spacing: 1px;
}
.topnav .nav-links a:hover {
  color: var(--accent-primary);
  border-color: rgba(124, 58, 237, 0.3);
  background: rgba(124, 58, 237, 0.08);
}
.topnav .time { color: var(--text-muted); font-size: 9px; font-family: monospace; }
.container { max-width: 1500px; margin: 0 auto; padding: 24px; position: relative; z-index: 10; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 20px; }
.stat-card {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 22px 18px;
  text-align: center;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--gradient-rainbow);
  background-size: 400% 400%;
  animation: rainbowShift 4s linear infinite;
  opacity: 0;
  transition: var(--transition);
}
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 0 30px rgba(124, 58, 237, 0.25);
  border-color: rgba(124, 58, 237, 0.3);
}
.stat-card:hover::before { opacity: 1; }
.stat-card .stat-icon { font-size: 28px; margin-bottom: 8px; }
.stat-card .stat-value {
  font-size: 30px;
  font-weight: 900;
  font-family: 'Orbitron', sans-serif;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.stat-card .stat-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 3px;
  color: var(--text-muted);
  margin-top: 4px;
}
.tabs-container {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  padding: 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  backdrop-filter: var(--glass-blur);
}
.tab {
  padding: 10px 18px;
  background: transparent;
  border: none;
  border-radius: 10px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: var(--transition);
  letter-spacing: 1px;
  font-family: 'Inter', sans-serif;
  white-space: nowrap;
}
.tab:hover { color: var(--text-primary); background: rgba(124, 58, 237, 0.08); }
.tab.active {
  background: rgba(124, 58, 237, 0.15);
  color: #fff;
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.2);
}
.panel { display: none; }
.panel.active { display: block; animation: fadeIn 0.4s ease; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.card {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 24px;
  margin-bottom: 16px;
  transition: var(--transition);
}
.card:hover { box-shadow: 0 0 30px rgba(124, 58, 237, 0.15); }
.card-header {
  font-family: 'Orbitron', sans-serif;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #fff;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-header i { color: var(--accent-primary); }
.table-container { max-height: 450px; overflow: auto; border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th {
  background: rgba(124, 58, 237, 0.06);
  color: var(--text-muted);
  padding: 12px 10px;
  text-align: left;
  font-size: 9px;
  letter-spacing: 2px;
  font-weight: 600;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  z-index: 2;
}
td { padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.03); color: var(--text-secondary); }
tr:hover td { background: rgba(124, 58, 237, 0.04); }
code {
  font-family: 'Space Grotesk', monospace;
  font-size: 10px;
  background: rgba(124, 58, 237, 0.1);
  padding: 3px 7px;
  border-radius: 6px;
  color: #A78BFA;
}
.btn-cyber {
  padding: 13px 28px;
  background: var(--gradient-rainbow);
  background-size: 400% 400%;
  color: #fff;
  border: none;
  border-radius: 14px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  letter-spacing: 2px;
  font-family: 'Orbitron', sans-serif;
  animation: rainbowShift 4s ease infinite;
  transition: var(--transition);
  text-transform: uppercase;
}
.btn-cyber:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(124, 58, 237, 0.4);
}
.btn-action {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid;
  cursor: pointer;
  font-size: 11px;
  transition: var(--transition);
  background: transparent;
  margin: 2px;
  font-family: 'Inter', sans-serif;
}
.btn-reset { color: #22C55E; border-color: rgba(34, 197, 94, 0.3); }
.btn-reset:hover { background: rgba(34, 197, 94, 0.1); box-shadow: 0 0 15px rgba(34, 197, 94, 0.2); }
.btn-push { color: #F59E0B; border-color: rgba(245, 158, 11, 0.3); }
.btn-push:hover { background: rgba(245, 158, 11, 0.1); box-shadow: 0 0 15px rgba(245, 158, 11, 0.2); }
.btn-stop { color: #EF4444; border-color: rgba(239, 68, 68, 0.3); }
.btn-stop:hover { background: rgba(239, 68, 68, 0.1); box-shadow: 0 0 15px rgba(239, 68, 68, 0.2); }
.btn-delete { color: #EC4899; border-color: rgba(236, 72, 153, 0.3); }
.btn-delete:hover { background: rgba(236, 72, 153, 0.1); box-shadow: 0 0 15px rgba(236, 72, 153, 0.2); }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.form-group label {
  display: block;
  color: var(--text-muted);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 6px;
  font-weight: 600;
}
.form-group input, .form-group select {
  width: 100%;
  padding: 12px 16px;
  background: rgba(9, 11, 18, 0.8);
  border: 1.5px solid rgba(124, 58, 237, 0.2);
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  transition: var(--transition);
}
.form-group input:focus, .form-group select:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.2);
}
.scope-box {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: rgba(9, 11, 18, 0.5);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  max-height: 150px;
  overflow: auto;
}
.scope-box label {
  cursor: pointer;
  font-size: 10px;
  color: var(--text-muted);
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
}
.scope-box label:hover { color: var(--accent-primary); background: rgba(124, 58, 237, 0.08); }
.scope-box input[type="checkbox"] { accent-color: var(--accent-primary); }
textarea {
  width: 100%;
  height: 200px;
  background: rgba(9, 11, 18, 0.8);
  border: 1.5px solid rgba(124, 58, 237, 0.2);
  border-radius: 14px;
  color: #A78BFA;
  font-size: 12px;
  padding: 16px;
  font-family: 'Space Grotesk', monospace;
  resize: vertical;
  outline: none;
  transition: var(--transition);
}
textarea:focus { border-color: var(--accent-primary); box-shadow: 0 0 20px rgba(124, 58, 237, 0.2); }
.live-logs {
  background: rgba(5, 5, 15, 0.9);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 16px;
  max-height: 350px;
  overflow: auto;
  font-family: 'Space Grotesk', monospace;
  font-size: 10px;
}
.log-entry {
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.log-time { color: var(--text-muted); }
.log-key { color: #A78BFA; }
.log-endpoint { color: #C4B5FD; }
.log-ip { color: #F59E0B; }
.log-browser { color: #22C55E; }
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  padding: 16px 24px;
  border-radius: 12px;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  animation: slideIn 0.4s ease;
  max-width: 400px;
  backdrop-filter: blur(10px);
}
.toast.success { background: rgba(34, 197, 94, 0.9); box-shadow: 0 0 25px rgba(34, 197, 94, 0.3); }
.toast.error { background: rgba(239, 68, 68, 0.9); box-shadow: 0 0 25px rgba(239, 68, 68, 0.3); }
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.copy-url { cursor: pointer; transition: var(--transition); color: #22C55E; }
.copy-url:hover { text-shadow: 0 0 10px rgba(34, 197, 94, 0.5); }
/* Sidebar-like category sections */
.category-section {
  margin-bottom: 20px;
}
.category-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-primary);
  letter-spacing: 3px;
  text-transform: uppercase;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}
@media(max-width:768px){
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .form-grid{grid-template-columns:1fr}
  .topnav{padding:10px 16px}
  .tabs-container{overflow-x:auto;flex-wrap:nowrap}
}
</style>`;

// ============================================
// V200 ULTRA CYBERPUNK LOGIN PAGE
// ============================================
function renderLogin(){
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>BRONX V200 | CYBERPUNK</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
${CYBERPUNK_CSS}
<style>
body{display:flex;align-items:center;justify-content:center;overflow:hidden}
.login-container{position:relative;z-index:10;width:440px;max-width:90vw}
.login-card{
  background:rgba(20,20,35,0.7);
  backdrop-filter:blur(18px);
  border:1px solid rgba(255,255,255,0.08);
  border-radius:20px;
  padding:50px 40px;
  position:relative;
  box-shadow:0 0 40px rgba(124,58,237,0.15),0 8px 32px rgba(0,0,0,0.4);
  overflow:hidden;
}
.login-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--gradient-rainbow);background-size:300% 300%;animation:rainbowShift 4s linear infinite}
.login-logo{text-align:center;margin-bottom:10px}
.login-logo .icon{font-size:50px;display:inline-block;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.1);opacity:0.8}}
.login-logo .brand{font-family:'Orbitron',sans-serif;font-size:13px;font-weight:900;letter-spacing:10px;background:var(--gradient-rainbow);background-size:300% 300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:rainbowShift 3s linear infinite;margin-top:6px}
.login-title{text-align:center;font-family:'Orbitron',sans-serif;font-size:28px;font-weight:900;color:#fff;margin-bottom:5px;letter-spacing:3px}
.login-subtitle{text-align:center;color:var(--text-muted);font-size:11px;letter-spacing:5px;text-transform:uppercase;margin-bottom:35px}
.input-group{position:relative;margin-bottom:20px}
.input-group .input-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:16px;transition:.3s;z-index:2}
.input-group input{width:100%;padding:16px 16px 16px 48px;background:rgba(9,11,18,0.8);border:1.5px solid rgba(124,58,237,0.2);border-radius:14px;color:#fff;font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:.4s}
.input-group input:focus{border-color:var(--accent-primary);box-shadow:0 0 25px rgba(124,58,237,0.2)}
.input-group input:focus~.input-icon{color:var(--accent-primary)}
.login-btn{width:100%;padding:17px;background:var(--gradient-rainbow);background-size:400% 400%;color:#fff;border:none;border-radius:14px;cursor:pointer;font-size:15px;font-weight:700;letter-spacing:4px;font-family:'Orbitron',sans-serif;animation:rainbowShift 4s ease infinite;transition:.3s;position:relative;overflow:hidden}
.login-btn:hover{transform:translateY(-3px);box-shadow:0 0 40px rgba(124,58,237,0.4)}
.message{text-align:center;margin-top:16px;font-size:12px;font-weight:600;min-height:20px}
.login-footer{text-align:center;margin-top:25px;font-size:10px;color:var(--text-muted);letter-spacing:2px}
.login-footer span{background:var(--gradient-primary);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700}
.glow-dots{position:absolute;width:6px;height:6px;background:var(--accent-primary);border-radius:50%;box-shadow:0 0 15px var(--accent-primary);animation:dotFloat 4s ease-in-out infinite}
.dot-1{top:20px;right:30px;animation-delay:0s}
.dot-2{bottom:30px;left:25px;animation-delay:1.5s}
.dot-3{top:50%;right:15px;animation-delay:3s}
@keyframes dotFloat{0%,100%{transform:translateY(0);opacity:0.5}50%{transform:translateY(-10px);opacity:1}}
</style></head><body>
<div class="grid-bg"></div>
<canvas id="particles-canvas"></canvas>
<canvas id="snowfall-canvas"></canvas>
<div class="login-container"><div class="login-card">
<div class="glow-dots dot-1"></div><div class="glow-dots dot-2"></div><div class="glow-dots dot-3"></div>
<div class="login-logo"><span class="icon">🛡️</span><div class="brand">BRONX OSINT</div></div>
<h2 class="login-title">V200 ULTRA</h2>
<p class="login-subtitle">Cyberpunk Dashboard</p>
<div class="input-group"><i class="fas fa-user input-icon"></i><input type="text" id="username" placeholder="Username" autocomplete="off"></div>
<div class="input-group"><i class="fas fa-lock input-icon"></i><input type="password" id="password" placeholder="Password" autocomplete="off"></div>
<button class="login-btn" onclick="login()"><i class="fas fa-key"></i> AUTHENTICATE</button>
<div class="message" id="message"></div>
<div class="login-footer">Powered by <span>@BRONX_ULTRA</span></div>
</div></div>
<script>
const pc=document.getElementById('particles-canvas'),pctx=pc.getContext('2d');pc.width=window.innerWidth;pc.height=window.innerHeight;
const parts=[];for(let i=0;i<80;i++)parts.push({x:Math.random()*pc.width,y:Math.random()*pc.height,s:Math.random()*2+.5,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,o:Math.random()*.6+.1});
function ap(){pctx.clearRect(0,0,pc.width,pc.height);parts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=pc.width;if(p.x>pc.width)p.x=0;if(p.y<0)p.y=pc.height;if(p.y>pc.height)p.y=0;pctx.beginPath();pctx.arc(p.x,p.y,p.s,0,Math.PI*2);pctx.fillStyle='rgba(124,58,237,'+p.o+')';pctx.fill()});parts.forEach((p,i)=>{parts.slice(i+1).forEach(p2=>{const d=Math.hypot(p.x-p2.x,p.y-p2.y);if(d<120){pctx.beginPath();pctx.moveTo(p.x,p.y);pctx.lineTo(p2.x,p2.y);pctx.strokeStyle='rgba(124,58,237,'+(0.05*(1-d/120))+')';pctx.lineWidth=0.5;pctx.stroke()}})});requestAnimationFrame(ap)}ap();
const sc=document.getElementById('snowfall-canvas'),sctx=sc.getContext('2d');sc.width=window.innerWidth;sc.height=window.innerHeight;
const snow=[];for(let i=0;i<60;i++)snow.push({x:Math.random()*sc.width,y:Math.random()*sc.height,s:Math.random()*3+1,sp:Math.random()*1+.3,w:Math.random()*.5-.25,o:Math.random()*.5+.1});
function as(){sctx.clearRect(0,0,sc.width,sc.height);snow.forEach(s=>{s.y+=s.sp;s.x+=s.w;if(s.y>sc.height){s.y=-5;s.x=Math.random()*sc.width}if(s.x<0)s.x=sc.width;if(s.x>sc.width)s.x=0;sctx.beginPath();sctx.arc(s.x,s.y,s.s,0,Math.PI*2);sctx.fillStyle='rgba(200,210,255,'+s.o+')';sctx.fill()});requestAnimationFrame(as)}as();
async function login(){
const u=document.getElementById('username').value.trim(),p=document.getElementById('password').value.trim(),m=document.getElementById('message');
if(!u||!p){m.style.color='#F59E0B';m.innerHTML='<i class="fas fa-exclamation-triangle"></i> Fill all fields';return}
m.style.color='#7C3AED';m.innerHTML='<i class="fas fa-spinner fa-spin"></i> Authenticating...';
try{const r=await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});const d=await r.json();
if(d.success){m.style.color='#22C55E';m.innerHTML='<i class="fas fa-check-circle"></i> '+d.message;setTimeout(()=>location.href=d.redirect,600)}
else{m.style.color='#EF4444';m.innerHTML='<i class="fas fa-times-circle"></i> '+d.error}}catch(e){m.style.color='#EF4444';m.innerHTML='<i class="fas fa-plug"></i> Connection error'}}
document.addEventListener('keydown',(e)=>{if(e.key==='Enter')login()});
</script></body></html>`;
}

// ============================================
// V200 ULTRA CYBERPUNK ADMIN PANEL
// ============================================
function renderAdmin(token){
    try{
        const allKeys=Object.entries(keyStorage).filter(([k,d])=>!d._hardcoded&&!d.hidden).map(([k,d])=>({
            key:k, name:d.name||'?', limit:d.unlimited?'∞':d.limit, used:d.used||0,
            left:d.unlimited?'∞':Math.max(0,(d.limit||0)-(d.used||0)),
            dailyLimit:d.dailyLimit||0, perSecondLimit:d.perSecondLimit||0,
            expiry:d.expiryStr||'Lifetime', isExpired:d.expiry?isKeyExpired(d.expiry):false,
            scopes:d.scopes||[], cooldown:d.cooldown||0, created:d.created||''
        }));
        const hcCount=Object.values(keyStorage).filter(k=>k._hardcoded).length;
        const todayReqs=requestLogs.filter(l=>l.timestamp&&l.timestamp.startsWith(getIndiaDate())).length;
        const stoken=esc(token);
        
        let keysHTML=allKeys.map(k=>{
            let s='🟢 ACTIVE';
            if(k.isExpired){s='🔴 EXPIRED'} else if(k.left==0){s='🟠 LIMIT'}
            const sd=k.scopes.includes('*')?'🌟 ALL':k.scopes.slice(0,2).join(',')+(k.scopes.length>2?'..':'');
            return `<tr>
                <td><code>${esc(k.key.substring(0,12))}${k.key.length>12?'..':''}</code></td>
                <td style="color:#C4B5FD">${esc(k.name)}</td><td>${k.limit}</td><td>${k.used}</td>
                <td>${k.dailyLimit||'∞'}</td><td>${k.perSecondLimit||'∞'}/s</td>
                <td style="color:${k.left==0?'#EF4444':'#A78BFA'}">${k.left}</td>
                <td>${esc(k.expiry)}</td><td style="color:#C4B5FD">${sd}</td><td>${s}</td><td>${esc(k.created||'')}</td>
                <td style="text-align:center">
                    <button class="btn-action btn-reset" onclick="resetKey('${esc(k.key)}')" title="Reset"><i class="fas fa-sync-alt"></i></button>
                    <button class="btn-action btn-push" onclick="pushKey('${esc(k.key)}')" title="Push"><i class="fas fa-arrow-up"></i></button>
                    <button class="btn-action btn-stop" onclick="stopKey('${esc(k.key)}')" title="Stop"><i class="fas fa-ban"></i></button>
                    <button class="btn-action btn-delete" onclick="deleteKey('${esc(k.key)}')" title="Delete"><i class="fas fa-trash"></i></button>
                </td></tr>`;
        }).join('');
        
        const apiHTML=customAPIs.map(a=>`<tr>
            <td>${a.id}</td><td style="color:#A78BFA">${esc(a.name)}</td><td><code>/${esc(a.endpoint)}</code></td>
            <td>${esc(a.param)}</td><td style="color:${a.visible?'#22C55E':'#EF4444'}">${a.visible?'👁 Visible':'🙈 Hidden'}</td>
            <td>
                <button class="btn-action btn-push" onclick="toggleAPI(${a.id})">${a.visible?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>'}</button>
                <button class="btn-action btn-delete" onclick="deleteAPI(${a.id})"><i class="fas fa-trash"></i></button>
            </td></tr>`).join('');
        
        const protHTML=Object.keys(protectedData).map(v=>`<tr>
            <td><code style="color:#EF4444">${esc(v)}</code></td><td>🔒 Protected</td>
            <td><button class="btn-action btn-delete" onclick="removeProt('${esc(v)}')"><i class="fas fa-unlock"></i></button></td>
        </tr>`).join('')||'<tr><td colspan="3" style="color:var(--text-muted)">No protected data</td></tr>';
        
        // Group endpoints by category
        const categories = {};
        Object.entries(endpoints).forEach(([n,e])=>{
            const cat = e.c || 'other';
            if(!categories[cat]) categories[cat] = [];
            categories[cat].push({name:n, ...e});
        });
        
        const epHTML = Object.entries(categories).map(([cat, eps])=>`
            <div class="category-section">
                <div class="category-title">📂 ${cat.toUpperCase()}</div>
                <div class="table-container" style="max-height:none">
                    <table><thead><tr><th>Icon</th><th>Endpoint</th><th>Description</th><th>Example</th><th>Full URL</th></tr></thead>
                    <tbody>${eps.map(e=>`<tr>
                        <td>${e.i}</td><td><code>/${e.name}</code></td><td>${e.d}</td><td><code>${e.p}=${e.e}</code></td>
                        <td><code class="copy-url" onclick="copyEndpoint('${e.name}','${e.p}','${e.e}')" style="cursor:pointer">GET /api/key-bronx/${e.name}?key=KEY&${e.p}=${e.e}</code></td>
                    </tr>`).join('')}</tbody></table>
                </div>
            </div>
        `).join('');

        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>BRONX V200 | CYBERPUNK DASHBOARD</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
${CYBERPUNK_CSS}
</head><body>
<div class="grid-bg"></div>
<canvas id="particles-canvas"></canvas>
<canvas id="snowfall-canvas"></canvas>
<nav class="topnav">
  <span class="brand">🛡️ BRONX V200</span>
  <span class="time" id="liveTime">${getIndiaDateTime()}</span>
  <div class="nav-links">
    <a href="/"><i class="fas fa-home"></i> Home</a>
    <a href="/docs"><i class="fas fa-book"></i> Docs</a>
    <a href="/admin"><i class="fas fa-sign-out-alt"></i> Logout</a>
  </div>
</nav>
<div class="container">
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon">🔑</div><div class="stat-value">${allKeys.length}</div><div class="stat-label">Gen Keys</div></div>
    <div class="stat-card"><div class="stat-icon">💎</div><div class="stat-value">${hcCount}</div><div class="stat-label">Hardcoded</div></div>
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value" id="statToday">${todayReqs}</div><div class="stat-label">Today</div></div>
    <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-value" id="statTotal">${requestLogs.length}</div><div class="stat-label">Total</div></div>
    <div class="stat-card"><div class="stat-icon">🔒</div><div class="stat-value">${Object.keys(protectedData).length}</div><div class="stat-label">Protected</div></div>
    <div class="stat-card"><div class="stat-icon">🔌</div><div class="stat-value">${customAPIs.length}</div><div class="stat-label">Custom APIs</div></div>
  </div>

  <div class="tabs-container">
    <button class="tab active" onclick="switchTab('dashboard')"><i class="fas fa-chart-pie"></i> Dashboard</button>
    <button class="tab" onclick="switchTab('generate')"><i class="fas fa-plus-circle"></i> Generate</button>
    <button class="tab" onclick="switchTab('keys')"><i class="fas fa-key"></i> Keys</button>
    <button class="tab" onclick="switchTab('endpoints')"><i class="fas fa-list"></i> Endpoints</button>
    <button class="tab" onclick="switchTab('import')"><i class="fas fa-download"></i> Import</button>
    <button class="tab" onclick="switchTab('export')"><i class="fas fa-upload"></i> Export</button>
    <button class="tab" onclick="switchTab('scopes')"><i class="fas fa-crosshairs"></i> Scopes</button>
    <button class="tab" onclick="switchTab('push')"><i class="fas fa-arrow-up"></i> Push</button>
    <button class="tab" onclick="switchTab('protect')"><i class="fas fa-shield-alt"></i> Protect</button>
    <button class="tab" onclick="switchTab('apis')"><i class="fas fa-plug"></i> APIs</button>
    <button class="tab" onclick="switchTab('addapi')"><i class="fas fa-puzzle-piece"></i> Add API</button>
    <button class="tab" onclick="switchTab('monitor')"><i class="fas fa-desktop"></i> Monitor</button>
    <button class="tab" onclick="switchTab('adminlogs')"><i class="fas fa-history"></i> Admin Logs</button>
    <button class="tab" onclick="switchTab('settings')"><i class="fas fa-cog"></i> Settings</button>
  </div>

  <div class="panel active" id="panel-dashboard">
    <div class="card"><div class="card-header"><i class="fas fa-fire"></i> Request Overview</div>
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card"><div class="stat-value" id="dashToday">-</div><div class="stat-label">Today</div></div>
        <div class="stat-card"><div class="stat-value" id="dashWeek">-</div><div class="stat-label">This Week</div></div>
        <div class="stat-card"><div class="stat-value" id="dashMonth">-</div><div class="stat-label">This Month</div></div>
        <div class="stat-card"><div class="stat-value" id="dashTotal">-</div><div class="stat-label">All Time</div></div>
      </div>
    </div>
    <div class="card"><div class="card-header"><i class="fas fa-trophy"></i> Top 5 Keys</div>
      <div class="table-container"><table><thead><tr><th>Key</th><th>Requests</th><th>Last IP</th><th>Browser</th></tr></thead>
        <tbody id="topKeysBody"><tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Loading...</td></tr></tbody></table></div>
    </div>
  </div>

  <div class="panel" id="panel-generate">
    <div class="card"><div class="card-header"><i class="fas fa-wand-magic-sparkles"></i> Generate New API Key</div>
      <div class="form-grid">
        <div class="form-group"><label>Key ID</label><input id="gk" placeholder="MY_KEY_NAME"></div>
        <div class="form-group"><label>Owner Name</label><input id="go" placeholder="Client Name"></div>
        <div class="form-group"><label>Total Limit</label><input id="gl" type="number" value="100"></div>
        <div class="form-group"><label>Daily Limit (0=∞)</label><input id="gdl" type="number" value="0"></div>
        <div class="form-group"><label>Per Second (0=∞)</label><input id="gpsl" type="number" value="0"></div>
        <div class="form-group"><label>Cooldown (sec)</label><input id="gc" type="number" value="0"></div>
        <div class="form-group"><label>Days Valid</label><input id="gd" type="number" value="30"></div>
        <div style="grid-column:1/-1" class="form-group"><label>Scopes</label>
          <div class="scope-box">
            <label><input type="checkbox" value="*" id="scope-all" checked> 🌟 ALL</label>
            ${Object.keys(endpoints).map(e=>`<label><input type="checkbox" value="${e}" class="scope-cb"> ${endpoints[e].i} ${e}</label>`).join('')}
            <label><input type="checkbox" value="custom" class="scope-cb"> 🔧 Custom</label>
          </div>
        </div>
        <div style="grid-column:1/-1"><button class="btn-cyber" onclick="generateKey()" style="width:100%"><i class="fas fa-rocket"></i> GENERATE KEY</button></div>
      </div>
    </div>
  </div>

  <div class="panel" id="panel-keys">
    <div class="card"><div class="card-header"><i class="fas fa-key"></i> All Keys (${allKeys.length})</div>
      <div class="table-container"><table><thead><tr><th>KEY</th><th>OWNER</th><th>LIMIT</th><th>USED</th><th>DAY</th><th>/SEC</th><th>LEFT</th><th>EXPIRY</th><th>SCOPES</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>${keysHTML}</tbody></table></div>
    </div>
  </div>

  <div class="panel" id="panel-endpoints">
    <div class="card"><div class="card-header"><i class="fas fa-list"></i> API Endpoints Documentation (${Object.keys(endpoints).length})</div>
      ${epHTML}
    </div>
  </div>

  <div class="panel" id="panel-import">
    <div class="card"><div class="card-header"><i class="fas fa-download"></i> Import Keys (JSON)</div>
      <p style="color:var(--text-muted);font-size:11px;margin-bottom:12px">Paste JSON data. Supports nested formats.</p>
      <textarea id="importData" placeholder='{"MY_KEY":{"name":"User","scopes":["*"],"limit":100,...}}'></textarea>
      <button class="btn-cyber" onclick="importKeys()" style="width:100%;margin-top:12px"><i class="fas fa-download"></i> IMPORT KEYS</button>
      <p id="importMsg" style="margin-top:10px;text-align:center;font-size:12px"></p>
    </div>
  </div>

  <div class="panel" id="panel-export">
    <div class="card"><div class="card-header"><i class="fas fa-upload"></i> Export Keys</div>
      <p style="color:var(--text-muted);font-size:11px;margin-bottom:12px">Exports all generated keys.</p>
      <textarea id="exportData" readonly style="color:#A78BFA"></textarea>
      <button class="btn-cyber" onclick="loadExport()" style="width:100%;margin-top:8px"><i class="fas fa-sync"></i> LOAD EXPORT DATA</button>
      <button class="btn-cyber" onclick="copyExport()" style="width:100%;margin-top:8px;background:linear-gradient(135deg,#22C55E,#06B6D4)"><i class="fas fa-copy"></i> COPY</button>
    </div>
  </div>

  <div class="panel" id="panel-scopes">
    <div class="card"><div class="card-header"><i class="fas fa-crosshairs"></i> Update Key Scopes</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Key Name</label><input id="sk" placeholder="Enter key name"></div>
        <div style="grid-column:1/-1" class="form-group"><label>Select Scopes</label>
          <div class="scope-box">
            <label><input type="checkbox" value="*" id="scope-all2"> 🌟 ALL</label>
            ${Object.keys(endpoints).map(e=>`<label><input type="checkbox" value="${e}" class="scope-cb2"> ${endpoints[e].i} ${e}</label>`).join('')}
            <label><input type="checkbox" value="custom" class="scope-cb2"> 🔧 Custom</label>
          </div>
        </div>
        <div style="grid-column:1/-1"><button class="btn-cyber" onclick="updateScopes()" style="width:100%"><i class="fas fa-save"></i> UPDATE SCOPES</button></div>
      </div>
    </div>
  </div>

  <div class="panel" id="panel-push">
    <div class="card"><div class="card-header"><i class="fas fa-arrow-up"></i> Push Key Expiry</div>
      <div class="form-grid">
        <div class="form-group"><label>Key Name</label><input id="pk" placeholder="Enter key name"></div>
        <div class="form-group"><label>Days</label><input id="pd" type="number" value="30"></div>
        <div style="grid-column:1/-1"><button class="btn-cyber" onclick="pushKeyAction()" style="width:100%"><i class="fas fa-arrow-up"></i> PUSH KEY</button></div>
      </div>
    </div>
  </div>

  <div class="panel" id="panel-protect">
    <div class="card"><div class="card-header"><i class="fas fa-shield-alt"></i> Data Protection</div>
      <div class="form-grid">
        <div class="form-group"><label>Value</label><input id="protVal" placeholder="e.g., 9876543210"></div>
        <div style="grid-column:1/-1"><button class="btn-cyber" onclick="addProtection()" style="width:100%"><i class="fas fa-lock"></i> ADD PROTECTION</button></div>
      </div>
      <br><div class="table-container" style="max-height:300px"><table><thead><tr><th>Value</th><th>Status</th><th>Action</th></tr></thead><tbody>${protHTML}</tbody></table></div>
    </div>
  </div>

  <div class="panel" id="panel-apis">
    <div class="card"><div class="card-header"><i class="fas fa-plug"></i> Custom APIs (${customAPIs.length})</div>
      <div class="table-container" style="max-height:350px"><table><thead><tr><th>ID</th><th>Name</th><th>Endpoint</th><th>Param</th><th>Status</th><th>Actions</th></tr></thead><tbody>${apiHTML}</tbody></table></div>
    </div>
  </div>

  <div class="panel" id="panel-addapi">
    <div class="card"><div class="card-header"><i class="fas fa-puzzle-piece"></i> Add Custom API</div>
      <div class="form-grid">
        <div class="form-group"><label>API Name</label><input id="aname" placeholder="My API"></div>
        <div class="form-group"><label>Endpoint</label><input id="aep" placeholder="my-api"></div>
        <div class="form-group"><label>Param</label><input id="aparam" value="num"></div>
        <div class="form-group"><label>Example</label><input id="aex" placeholder="9876543210"></div>
        <div style="grid-column:1/-1" class="form-group"><label>Real URL ({param})</label><input id="aurl" placeholder="https://api.com?param={param}"></div>
        <div style="grid-column:1/-1"><button class="btn-cyber" onclick="addAPI()" style="width:100%"><i class="fas fa-plus"></i> ADD API</button></div>
      </div>
    </div>
  </div>

  <div class="panel" id="panel-monitor">
    <div class="card"><div class="card-header"><i class="fas fa-desktop"></i> Live Key Monitor <span style="font-size:10px;color:#22C55E">● LIVE</span></div>
      <div class="live-logs" id="monitorLogs"><div style="color:var(--text-muted);text-align:center">Loading...</div></div>
    </div>
  </div>

  <div class="panel" id="panel-adminlogs">
    <div class="card"><div class="card-header"><i class="fas fa-history"></i> Admin Login Logs</div>
      <div class="table-container" style="max-height:400px"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>IP</th><th>Browser</th><th>Status</th></tr></thead>
        <tbody id="adminLogsBody"><tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Loading...</td></tr></tbody></table></div>
    </div>
  </div>

  <div class="panel" id="panel-settings">
    <div class="card"><div class="card-header"><i class="fas fa-cog"></i> System Settings</div>
      <button class="btn-cyber" onclick="resetAll()" style="width:100%;margin-bottom:12px"><i class="fas fa-sync-alt"></i> RESET ALL USAGE</button>
      <button class="btn-cyber" onclick="clearLogs()" style="width:100%;background:linear-gradient(135deg,#F59E0B,#EF4444)"><i class="fas fa-trash"></i> CLEAR ALL LOGS</button>
    </div>
  </div>
</div>

<script>
const TOKEN='${stoken}';
const pc=document.getElementById('particles-canvas'),pctx=pc.getContext('2d');pc.width=window.innerWidth;pc.height=window.innerHeight;
const parts=[];for(let i=0;i<80;i++)parts.push({x:Math.random()*pc.width,y:Math.random()*pc.height,s:Math.random()*2+.5,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,o:Math.random()*.6+.1});
function ap(){pctx.clearRect(0,0,pc.width,pc.height);parts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=pc.width;if(p.x>pc.width)p.x=0;if(p.y<0)p.y=pc.height;if(p.y>pc.height)p.y=0;pctx.beginPath();pctx.arc(p.x,p.y,p.s,0,Math.PI*2);pctx.fillStyle='rgba(124,58,237,'+p.o+')';pctx.fill()});parts.forEach((p,i)=>{parts.slice(i+1).forEach(p2=>{const d=Math.hypot(p.x-p2.x,p.y-p2.y);if(d<120){pctx.beginPath();pctx.moveTo(p.x,p.y);pctx.lineTo(p2.x,p2.y);pctx.strokeStyle='rgba(124,58,237,'+(0.05*(1-d/120))+')';pctx.lineWidth=0.5;pctx.stroke()}})});requestAnimationFrame(ap)}ap();
const sc=document.getElementById('snowfall-canvas'),sctx=sc.getContext('2d');sc.width=window.innerWidth;sc.height=window.innerHeight;
const snow=[];for(let i=0;i<60;i++)snow.push({x:Math.random()*sc.width,y:Math.random()*sc.height,s:Math.random()*3+1,sp:Math.random()*1+.3,w:Math.random()*.5-.25,o:Math.random()*.5+.1});
function as(){sctx.clearRect(0,0,sc.width,sc.height);snow.forEach(s=>{s.y+=s.sp;s.x+=s.w;if(s.y>sc.height){s.y=-5;s.x=Math.random()*sc.width}if(s.x<0)s.x=sc.width;if(s.x>sc.width)s.x=0;sctx.beginPath();sctx.arc(s.x,s.y,s.s,0,Math.PI*2);sctx.fillStyle='rgba(200,210,255,'+s.o+')';sctx.fill()});requestAnimationFrame(as)}as();
setInterval(()=>{document.getElementById('liveTime').textContent=new Date().toISOString().replace('T',' ').substring(0,19)},1000);

function switchTab(tabName){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const panel=document.getElementById('panel-'+tabName);
  if(panel)panel.classList.add('active');
  event.target.classList.add('active');
  if(tabName==='dashboard')loadDashboardStats();
  if(tabName==='monitor')loadMonitorLogs();
  if(tabName==='adminlogs')loadAdminLogs();
}
function showToast(msg,type='success'){
  const toast=document.createElement('div');toast.className='toast '+type;toast.innerHTML=msg;
  document.body.appendChild(toast);setTimeout(()=>toast.remove(),3000);
}
async function apiCall(url,data=null){
  const options={method:data?'POST':'GET',headers:{'Content-Type':'application/json','x-admin-token':TOKEN}};
  if(data)options.body=JSON.stringify(data);
  const res=await fetch(url,options);return await res.json();
}
async function generateKey(){
  const keyName=document.getElementById('gk').value.trim(),keyOwner=document.getElementById('go').value.trim();
  if(!keyName||!keyOwner){showToast('⚠ Fill Key ID and Owner Name','error');return}
  let scopes=[];if(document.getElementById('scope-all').checked)scopes=['*'];
  else document.querySelectorAll('.scope-cb:checked').forEach(c=>scopes.push(c.value));
  const data={keyName,keyOwner,scopes,limit:document.getElementById('gl').value,dailyLimit:parseInt(document.getElementById('gdl').value)||0,perSecondLimit:parseInt(document.getElementById('gpsl').value)||0,days:parseInt(document.getElementById('gd').value)||30,cooldown:parseInt(document.getElementById('gc').value)||0};
  const res=await apiCall('/admin/generate-key',data);
  res.success?(showToast('✅ Key Generated: '+keyName),setTimeout(()=>location.reload(),1500)):showToast('❌ '+(res.e||'Error'),'error');
}
async function resetKey(k){if(confirm('Reset usage?')){await apiCall('/admin/reset-key-usage',{keyName:k});location.reload()}}
async function deleteKey(k){if(confirm('DELETE?')){await apiCall('/admin/delete-key',{keyName:k});location.reload()}}
async function stopKey(k){if(!confirm('Stop/Activate?'))return;const res=await apiCall('/admin/stop-key',{keyName:k});res.success?location.reload():showToast('❌ Error','error')}
async function pushKey(k){const d=prompt('Days?','30');if(!d)return;const res=await apiCall('/admin/push-key',{keyName:k,days:parseInt(d)});res.success?(showToast('✅ '+res.message),setTimeout(()=>location.reload(),1000)):showToast('❌ Error','error')}
async function pushKeyAction(){const k=document.getElementById('pk').value.trim(),d=parseInt(document.getElementById('pd').value)||30;if(!k){showToast('⚠ Enter key name','error');return}const res=await apiCall('/admin/push-key',{keyName:k,days:d});res.success?(showToast('✅ '+res.message),setTimeout(()=>location.reload(),1000)):showToast('❌ Error','error')}
async function updateScopes(){const k=document.getElementById('sk').value.trim();if(!k){showToast('⚠ Enter key name','error');return}let scopes=[];if(document.getElementById('scope-all2').checked)scopes=['*'];else document.querySelectorAll('.scope-cb2:checked').forEach(c=>scopes.push(c.value));const res=await apiCall('/admin/update-scopes',{keyName:k,scopes});res.success?(showToast('✅ Updated'),setTimeout(()=>location.reload(),1000)):showToast('❌ Error','error')}
async function addProtection(){const v=document.getElementById('protVal').value.trim();if(!v)return;const res=await apiCall('/admin/add-protection',{value:v});res.success?(showToast(res.message),setTimeout(()=>location.reload(),1000)):showToast('❌ Error','error')}
async function removeProt(v){if(!confirm('Remove?'))return;await apiCall('/admin/remove-protection',{value:v});location.reload()}
async function addAPI(){const n=document.getElementById('aname').value.trim(),e=document.getElementById('aep').value.trim();if(!n||!e){showToast('⚠ Fill name & endpoint','error');return}const res=await apiCall('/admin/add-api',{name:n,endpoint:e,param:document.getElementById('aparam').value,example:document.getElementById('aex').value,realAPI:document.getElementById('aurl').value,visible:true});res.success?(showToast('✅ Added!'),setTimeout(()=>location.reload(),1000)):showToast('❌ Error','error')}
async function toggleAPI(id){await apiCall('/admin/toggle-api',{id});location.reload()}
async function deleteAPI(id){if(confirm('Delete?')){await apiCall('/admin/delete-api',{id});location.reload()}}
async function resetAll(){if(confirm('Reset ALL?')){await apiCall('/admin/reset-all');showToast('✅ Reset');setTimeout(()=>location.reload(),1000)}}
async function clearLogs(){if(confirm('Clear ALL?')){await apiCall('/admin/clear-logs');showToast('✅ Cleared');setTimeout(()=>location.reload(),1000)}}
async function importKeys(){const d=document.getElementById('importData').value.trim(),msg=document.getElementById('importMsg');if(!d){msg.style.color='#EF4444';msg.textContent='❌ Paste JSON first!';return}try{let jsonData=JSON.parse(d);const res=await apiCall('/admin/import-keys',jsonData);if(res.success){msg.style.color='#22C55E';msg.textContent='✅ '+res.message;setTimeout(()=>location.reload(),1500)}else{msg.style.color='#EF4444';msg.textContent='❌ '+(res.e||'Error')}}catch(e){msg.style.color='#EF4444';msg.textContent='❌ Invalid JSON!'}}
let exportData='';
async function loadExport(){const res=await apiCall('/admin/export-keys');if(res.success){exportData=JSON.stringify(res,null,2);document.getElementById('exportData').value=exportData;showToast('✅ Loaded')}else showToast('❌ Error','error')}
async function copyExport(){const ta=document.getElementById('exportData');if(!ta.value){showToast('⚠ Click LOAD first!','error');return}try{await navigator.clipboard.writeText(ta.value);showToast('✅ Copied!')}catch(e){ta.select();document.execCommand('copy');showToast('✅ Copied!')}}
async function loadDashboardStats(){
  try{const res=await apiCall('/admin/stats');if(res){document.getElementById('dashToday').textContent=res.todayRequests||0;document.getElementById('dashWeek').textContent=res.weeklyRequests||0;document.getElementById('dashMonth').textContent=res.monthlyRequests||0;document.getElementById('dashTotal').textContent=res.totalRequests||0;document.getElementById('statToday').textContent=res.todayRequests||0;document.getElementById('statTotal').textContent=res.totalRequests||0;if(res.topKeys){const tbody=document.getElementById('topKeysBody');tbody.innerHTML=res.topKeys.map(k=>'<tr><td style="color:#A78BFA">'+k.key+'</td><td>'+k.requests+'</td><td style="color:#F59E0B">-</td><td style="color:#22C55E">-</td></tr>').join('')||'<tr><td colspan="4">No data</td></tr>'}}}catch(e){}
}
async function loadMonitorLogs(){
  try{const res=await apiCall('/admin/monitor-logs');const c=document.getElementById('monitorLogs');if(res&&res.logs){c.innerHTML=res.logs.reverse().map(l=>'<div class="log-entry"><span class="log-time">'+l.timestamp+'</span><span class="log-key">'+l.key+'</span><span class="log-endpoint">/'+l.endpoint+'</span><span class="log-ip">'+l.ip+'</span><span class="log-browser">'+l.browser+'</span></div>').join('')||'<div style="color:var(--text-muted)">No logs</div>'}}catch(e){}
}
async function loadAdminLogs(){
  try{const res=await apiCall('/admin/admin-logs');const tbody=document.getElementById('adminLogsBody');if(res&&res.logs){tbody.innerHTML=res.logs.reverse().map(l=>{const sc=l.status==='SUCCESS'?'#22C55E':'#EF4444';return '<tr><td>'+l.timestamp+'</td><td>'+l.user+'</td><td>'+l.action+'</td><td>'+l.ip+'</td><td style="font-size:9px">'+l.browser+'</td><td style="color:'+sc+'">'+l.status+'</td></tr>'}).join('')||'<tr><td colspan="6">No logs</td></tr>'}}catch(e){}
}
function copyEndpoint(ep,param,example){
  const url=location.origin+'/api/key-bronx/'+ep+'?key=YOUR_KEY&'+param+'='+example;
  navigator.clipboard.writeText(url).then(()=>showToast('✅ Copied!')).catch(()=>showToast('⚠ Copy failed','error'));
}
loadDashboardStats();
</script></body></html>`;
    }catch(e){return `<html><body style="background:#090B12;color:#EF4444;padding:30px"><h1>ERROR</h1><p>${e.message}</p></body></html>`}
}

// ============================================
// DOCS PAGE
// ============================================
function renderDocs(){
    const cards=Object.entries(endpoints).map(([n,e])=>`<div class="card"><span style="background:rgba(124,58,237,0.15);color:#A78BFA;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700">GET</span><b style="color:#fff;font-size:16px;margin-left:8px">/${n}</b><p style="color:var(--text-muted);font-size:11px;margin:8px 0">${e.d}</p><code style="display:block;background:rgba(5,5,15,0.8);color:#A78BFA;padding:10px;border-radius:8px;font-size:10px;font-family:'Space Grotesk',monospace">GET /api/key-bronx/${n}?key=YOUR_KEY&${e.p}=${e.e}</code></div>`).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>BRONX V200 | API DOCS</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
${CYBERPUNK_CSS}
<style>nav .brand{animation:rainbowShift 3s linear infinite}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}</style></head><body>
<div class="grid-bg"></div>
<nav class="topnav"><a href="/" class="brand">🛡️ BRONX V200</a><div class="nav-links"><a href="/">Home</a><a href="/admin">Admin</a></div></nav>
<div class="container"><div style="text-align:center;padding:40px 20px"><h1 style="font-family:'Orbitron',sans-serif;font-size:clamp(28px,6vw,48px);background:var(--gradient-rainbow);-webkit-background-clip:text;-webkit-text-fill-color:transparent">📚 API Documentation</h1><p style="color:var(--text-muted);margin-top:8px">BRONX OSINT V200 ULTRA</p></div><div class="grid">${cards}</div></div></body></html>`;
}

// ============================================
// HOME PAGE
// ============================================
function renderHome(){
    const vapi=customAPIs.filter(a=>a.visible);
    let cards='';
    Object.entries(endpoints).forEach(([n,e])=>{
        cards+=`<div class="card" onclick="copyEndpoint('${esc(n)}','${esc(e.p)}','${esc(e.e)}')" style="cursor:pointer;border-top:2px solid var(--accent-primary);padding:18px">
            <span style="font-size:22px">${e.i}</span><b style="color:#fff;font-size:14px;display:block;margin:6px 0">/${esc(n)}</b>
            <small style="color:var(--text-muted);font-size:9px;display:block;margin-bottom:8px">${e.d}</small>
            <code style="font-size:8px;color:#A78BFA;background:rgba(5,5,15,0.6);padding:4px 8px;border-radius:6px">${e.p}=${e.e}</code>
        </div>`;
    });
    vapi.forEach(a=>{
        cards+=`<div class="card" onclick="copyCustomEp('${esc(a.endpoint)}','${esc(a.param)}','${esc(a.example)}')" style="cursor:pointer;border-top:2px solid #8B5CF6;padding:18px">
            <span style="font-size:22px">🔧</span><b style="color:#fff;font-size:14px;display:block;margin:6px 0">/${esc(a.endpoint)}</b>
            <small style="color:var(--text-muted);font-size:9px;display:block;margin-bottom:8px">Custom API</small>
            <code style="font-size:8px;color:#A78BFA;background:rgba(5,5,15,0.6);padding:4px 8px;border-radius:6px">${a.param}=${a.example||'v'}</code>
        </div>`;
    });
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>BRONX OSINT V200 ULTRA</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
${CYBERPUNK_CSS}
<style>nav .logo{animation:rainbowShift 3s linear infinite}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.hero h1{animation:rainbowShift 4s linear infinite;background-size:400% 400%}</style></head><body>
<canvas id="particles-canvas"></canvas><canvas id="snowfall-canvas"></canvas>
<nav class="topnav"><a href="/" class="brand" style="font-size:14px;font-weight:900;letter-spacing:6px;background:var(--gradient-rainbow);background-size:300% 300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent">🛡️ BRONX V200</a><div class="nav-links"><a href="/docs">📚 DOCS</a> <a href="/admin">🔐 ADMIN</a></div></nav>
<header style="text-align:center;padding:50px 20px 20px;position:relative;z-index:10"><h1 style="font-size:clamp(32px,8vw,60px);font-weight:900;background:var(--gradient-rainbow);background-size:400% 400%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-family:'Orbitron',sans-serif">BRONX OSINT V200</h1><p style="color:var(--text-muted);font-size:12px;letter-spacing:5px;margin-top:6px">CYBERPUNK EDITION · FAKE IP · SNOWFALL · LIVE MONITOR</p></header>
<div class="container"><div class="grid">${cards}</div></div>
<footer style="text-align:center;padding:24px;border-top:1px solid var(--border-color);position:relative;z-index:10"><span style="font-weight:900;background:var(--gradient-primary);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-family:'Orbitron',sans-serif">BRONX OSINT V200 ULTRA 🛡️</span></footer>
<script>
const eps=${JSON.stringify(endpoints)};
function copyEndpoint(n,p,e){navigator.clipboard.writeText(location.origin+'/api/key-bronx/'+n+'?key=YOUR_KEY&'+p+'='+e)}
function copyCustomEp(n,p,e){navigator.clipboard.writeText(location.origin+'/api/custom/'+n+'?key=YOUR_KEY&'+p+'='+(e||'v'))}
const pc=document.getElementById('particles-canvas'),pctx=pc.getContext('2d');pc.width=window.innerWidth;pc.height=window.innerHeight;
const parts=[];for(let i=0;i<80;i++)parts.push({x:Math.random()*pc.width,y:Math.random()*pc.height,s:Math.random()*2+.5,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,o:Math.random()*.6+.1});
function ap(){pctx.clearRect(0,0,pc.width,pc.height);parts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=pc.width;if(p.x>pc.width)p.x=0;if(p.y<0)p.y=pc.height;if(p.y>pc.height)p.y=0;pctx.beginPath();pctx.arc(p.x,p.y,p.s,0,Math.PI*2);pctx.fillStyle='rgba(124,58,237,'+p.o+')';pctx.fill()});requestAnimationFrame(ap)}ap();
const sc=document.getElementById('snowfall-canvas'),sctx=sc.getContext('2d');sc.width=window.innerWidth;sc.height=window.innerHeight;
const snow=[];for(let i=0;i<60;i++)snow.push({x:Math.random()*sc.width,y:Math.random()*sc.height,s:Math.random()*3+1,sp:Math.random()*1+.3,w:Math.random()*.5-.25,o:Math.random()*.5+.1});
function as(){sctx.clearRect(0,0,sc.width,sc.height);snow.forEach(s=>{s.y+=s.sp;s.x+=s.w;if(s.y>sc.height){s.y=-5;s.x=Math.random()*sc.width}if(s.x<0)s.x=sc.width;if(s.x>sc.width)s.x=0;sctx.beginPath();sctx.arc(s.x,s.y,s.s,0,Math.PI*2);sctx.fillStyle='rgba(200,210,255,'+s.o+')';sctx.fill()});requestAnimationFrame(as)}as();
</script></body></html>`;
}

const PORT = process.env.PORT || 3000;
(async function(){
    initHardcodedKeys();
    if(!loadFromDisk()){if(customAPIs.length===0)initCustomAPIs()}
    if(!keyStorage[MASTER_API_KEY])keyStorage[MASTER_API_KEY]=createMasterKey();
    scheduleSave();
    app.listen(PORT,()=>{
        console.log('🛡️ BRONX OSINT V200 ULTRA CYBERPUNK ONLINE!');
        console.log('🌃 Particle System ACTIVE');
        console.log('❄️ Snowfall Effect ACTIVE');
        console.log('🔒 Fake IP Rotation ACTIVE');
        console.log('📊 Live Monitor ACTIVE');
        console.log('🚀 PORT: '+PORT);
    });
})();
module.exports = app;
