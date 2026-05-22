(function(){
"use strict";
var $=function(id){return document.getElementById(id)};
var addInp=$("add-ticker-input"),addBtn=$("add-ticker-btn"),addSt=$("add-ticker-status");
var wlEl=$("watchlist"),mainT=$("main-title"),compN=$("company-name"),lastUp=$("last-updated");
var autoTog=$("auto-refresh-toggle"),cdEl=$("refresh-countdown"),compTog=$("compare-toggle");
var chartT=$("chart-title"),mCanvas=$("stock-chart"),vCanvas=$("volume-chart"),toastC=$("toast-container");
var sbTog=$("sidebar-toggle"),sb=$("sidebar"),aqList=$("ai-quick-list");
var sP=$("s-price"),sCh=$("s-change"),sM=$("s-mcap"),sPe=$("s-pe"),sEps=$("s-eps"),s52h=$("s-52h"),s52l=$("s-52l"),sVol=$("s-vol");
var aiAct=$("ai-action"),aiConf=$("ai-confidence");
var abBuy=$("ai-bar-buy"),abHold=$("ai-bar-hold"),abSell=$("ai-bar-sell");
var abBuyV=$("ai-bar-buy-val"),abHoldV=$("ai-bar-hold-val"),abSellV=$("ai-bar-sell-val");
var aiRisk=$("ai-risk-val"),iRsi=$("ind-rsi"),iMacd=$("ind-macd"),iSig=$("ind-signal");
var iBb=$("ind-bb"),iS20=$("ind-sma20"),iS50=$("ind-sma50"),iMom=$("ind-mom"),iVol=$("ind-vol");
var bRL=$("buy-reasons-list"),sRL=$("sell-reasons-list"),bRB=$("buy-reasons-block"),sRB=$("sell-reasons-block");
var fGrid=$("fund-grid"),tWrap=$("targets-wrapper"),rsiNeedle=$("rsi-needle");

var wl=["AAPL","MSFT","GOOGL","TSLA","AMZN"],active="AAPL",quotes={},hCache={},bSigs={};
var mChart=null,vChart=null,simChart=null,rInt=null,cd=30,cdT=null,cmpMode=false;

function fmt(n){return "$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
function fB(n){if(n==null)return"—";if(n>=1e12)return"$"+(n/1e12).toFixed(2)+"T";if(n>=1e9)return"$"+(n/1e9).toFixed(2)+"B";if(n>=1e6)return"$"+(n/1e6).toFixed(1)+"M";return"$"+Number(n).toLocaleString()}
function fV(v){if(v>=1e9)return(v/1e9).toFixed(1)+"B";if(v>=1e6)return(v/1e6).toFixed(1)+"M";if(v>=1e3)return(v/1e3).toFixed(1)+"K";return String(v)}
function fPct(v){return v!=null?(v*100).toFixed(2)+"%":"—"}
function tNow(){return new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
function toast(m,t){var e=document.createElement("div");e.className="toast "+(t||"error");e.textContent=m;toastC.appendChild(e);setTimeout(function(){e.classList.add("fadeOut")},3e3);setTimeout(function(){e.remove()},3400)}

function drawSpark(cv,d,up){var c=cv.getContext("2d"),w=cv.width=cv.offsetWidth*2,h=cv.height=cv.offsetHeight*2;c.clearRect(0,0,w,h);if(!d||d.length<2)return;var mn=Math.min.apply(null,d),mx=Math.max.apply(null,d),r=mx-mn||1;c.beginPath();c.strokeStyle=up?"#10b981":"#ef4444";c.lineWidth=2;for(var i=0;i<d.length;i++){var x=(i/(d.length-1))*w,y=h-((d[i]-mn)/r)*h*.8-h*.1;i===0?c.moveTo(x,y):c.lineTo(x,y)}c.stroke()}

function renderWL(){wlEl.innerHTML="";wl.forEach(function(s){var q=quotes[s]||{},sg=bSigs[s],up=(q.change||0)>=0;var c=document.createElement("div");c.className="watch-card"+(s===active?" active":"");var badge="";if(sg)badge='<span class="watch-ai-badge '+sg.action.toLowerCase()+'">'+sg.action+"</span>";c.innerHTML='<div class="watch-card-info"><div class="watch-ticker">'+s+badge+'</div><div class="watch-price">'+(q.price?fmt(q.price):"…")+'</div></div><span class="watch-change '+(up?"up":"down")+'">'+(q.change_pct!=null?(up?"+":"")+q.change_pct.toFixed(2)+"%":"—")+'</span><canvas class="watch-spark"></canvas><button class="watch-remove">&times;</button>';c.addEventListener("click",function(e){if(!e.target.classList.contains("watch-remove"))selTicker(s)});c.querySelector(".watch-remove").addEventListener("click",function(e){e.stopPropagation();remTicker(s)});wlEl.appendChild(c);var sc=c.querySelector(".watch-spark");if(q.sparkline&&q.sparkline.length>1)setTimeout(function(){drawSpark(sc,q.sparkline,up)},20)})}

function renderAIQ(){aqList.innerHTML="";var sk=Object.keys(bSigs).sort(function(a,b){return bSigs[b].confidence-bSigs[a].confidence});sk.forEach(function(s){var x=bSigs[s],cls=x.action==="BUY"?"buy-item":x.action==="SELL"?"sell-item":"hold-item";var e=document.createElement("div");e.className="ai-quick-item "+cls;e.innerHTML="<span>"+s+" — "+x.action+'</span><span class="ai-quick-conf">'+x.confidence+"%</span>";aqList.appendChild(e)})}

function selTicker(s){active=s;mainT.textContent=s;renderWL();fetchHist(s);fetchAI(s);fetchFund(s)}

// ══ ADD TICKER — skip validation, directly fetch stock data ══
async function addTicker(sym){
    sym=sym.trim().toUpperCase();if(!sym)return;
    if(wl.includes(sym)){toast(sym+" already in watchlist","error");return}
    if(wl.length>=10){toast("Max 10 tickers","error");return}
    addSt.textContent="Checking "+sym+"…";addSt.className="add-status validating";addBtn.disabled=true;
    try{
        var res=await fetch("/api/stock?ticker="+encodeURIComponent(sym));
        var json=await res.json();
        if(!res.ok||json.error){
            var hint="";if(sym.indexOf(".")===-1)hint=" Try adding .NS for Indian stocks (e.g. RELIANCE.NS)";
            addSt.textContent=(json.error||"Not found.")+hint;addSt.className="add-status error";addBtn.disabled=false;return;
        }
        // Valid — add it
        hCache[sym]=json;wl.push(sym);addInp.value="";
        addSt.textContent="✓ Added "+sym;addSt.className="add-status success";
        fetchQuotes();selTicker(sym);fetchBatch();
        toast(sym+" added to watchlist","success");
        setTimeout(function(){addSt.textContent="";addSt.className="add-status"},3e3);
    }catch(e){addSt.textContent="Network error";addSt.className="add-status error"}
    addBtn.disabled=false;
}

function remTicker(s){wl=wl.filter(function(x){return x!==s});delete quotes[s];delete hCache[s];delete bSigs[s];if(active===s){active=wl[0]||"";if(active)selTicker(active)}renderWL();renderAIQ()}

async function fetchQuotes(){if(!wl.length)return;try{var r=await fetch("/api/quote?tickers="+encodeURIComponent(wl.join(",")));var j=await r.json();if(j.quotes)Object.keys(j.quotes).forEach(function(s){if(!j.quotes[s].error)quotes[s]=j.quotes[s]});renderWL();updQS();lastUp.textContent="Updated "+tNow()}catch(e){}}
function updQS(){var q=quotes[active];if(!q)return;sP.textContent=fmt(q.price);var up=q.change>=0;sCh.textContent=(up?"+":"")+q.change.toFixed(2)+" ("+(up?"+":"")+q.change_pct.toFixed(2)+"%)";sCh.className="stat-value "+(up?"positive":"negative")}

async function fetchHist(sym){chartT.textContent="Loading "+sym+"…";try{var r=await fetch("/api/stock?ticker="+encodeURIComponent(sym));var j=await r.json();if(!r.ok){toast(j.error||"Error","error");return}hCache[sym]=j;renderMC();renderVC(j);if(j.volumes&&j.volumes.length)sVol.textContent=fV(j.volumes[j.volumes.length-1])}catch(e){toast("Network error","error")}}

async function fetchAI(sym){try{var r=await fetch("/api/analysis?ticker="+encodeURIComponent(sym));var a=await r.json();if(a.error)return;aiAct.textContent=a.action;aiAct.className="ai-action-badge "+a.action.toLowerCase();aiConf.textContent="Confidence: "+a.confidence+"%";abBuy.style.width=a.buy_pct+"%";abBuyV.textContent=a.buy_pct+"%";abHold.style.width=a.hold_pct+"%";abHoldV.textContent=a.hold_pct+"%";abSell.style.width=a.sell_pct+"%";abSellV.textContent=a.sell_pct+"%";aiRisk.textContent=a.risk_level;aiRisk.className="ai-risk-badge "+a.risk_level.toLowerCase();var i=a.indicators||{};iRsi.textContent=i.rsi!=null?i.rsi:"—";iRsi.style.color=i.rsi<30?"#10b981":i.rsi>70?"#ef4444":"#f1f5f9";if(rsiNeedle)rsiNeedle.style.left=(i.rsi||50)+"%";iMacd.textContent=i.macd?i.macd.macd:"—";iSig.textContent=i.macd?i.macd.signal:"—";iBb.textContent=i.bollinger?(i.bollinger.position*100).toFixed(0)+"%":"—";iS20.textContent=i.sma_20!=null?"$"+i.sma_20:"—";iS50.textContent=i.sma_50!=null?"$"+i.sma_50:"—";iMom.textContent=i.momentum_10d!=null?i.momentum_10d+"%":"—";iMom.style.color=i.momentum_10d>0?"#10b981":i.momentum_10d<0?"#ef4444":"#f1f5f9";iVol.textContent=a.volatility!=null?a.volatility+"%":"—";bRL.innerHTML="";sRL.innerHTML="";(a.reasons_buy||[]).forEach(function(r){var l=document.createElement("li");l.textContent=r;bRL.appendChild(l)});(a.reasons_sell||[]).forEach(function(r){var l=document.createElement("li");l.textContent=r;sRL.appendChild(l)});bRB.style.display=(a.reasons_buy&&a.reasons_buy.length)?"block":"none";sRB.style.display=(a.reasons_sell&&a.reasons_sell.length)?"block":"none"}catch(e){}}

async function fetchFund(sym){try{var r=await fetch("/api/fundamentals?ticker="+encodeURIComponent(sym));var f=await r.json();if(f.error)return;compN.textContent=f.name||"";sM.textContent=fB(f.market_cap);sPe.textContent=f.pe_ratio!=null?f.pe_ratio.toFixed(2):"—";sEps.textContent=f.eps!=null?"$"+f.eps.toFixed(2):"—";s52h.textContent=f.fifty_two_week_high!=null?fmt(f.fifty_two_week_high):"—";s52l.textContent=f.fifty_two_week_low!=null?fmt(f.fifty_two_week_low):"—";
    fGrid.innerHTML="";[["Sector",f.sector],["Industry",f.industry],["Forward P/E",f.forward_pe!=null?f.forward_pe.toFixed(2):"—"],["PEG",f.peg_ratio!=null?f.peg_ratio.toFixed(2):"—"],["P/B",f.price_to_book!=null?f.price_to_book.toFixed(2):"—"],["Beta",f.beta!=null?f.beta.toFixed(2):"—"],["Div Yield",fPct(f.dividend_yield)],["Div Rate",f.dividend_rate!=null?"$"+f.dividend_rate.toFixed(2):"—"],["Revenue",fB(f.revenue)],["EBITDA",fB(f.ebitda)],["Net Income",fB(f.net_income)],["FCF",fB(f.free_cash_flow)],["Margin",fPct(f.profit_margin)],["Rev Growth",fPct(f.revenue_growth)],["ROE",fPct(f.return_on_equity)],["D/E",f.debt_to_equity!=null?f.debt_to_equity.toFixed(1):"—"],["50D Avg",f.fifty_day_avg!=null?fmt(f.fifty_day_avg):"—"],["200D Avg",f.two_hundred_day_avg!=null?fmt(f.two_hundred_day_avg):"—"],["Avg Vol",f.avg_volume!=null?fV(f.avg_volume):"—"],["Earn Growth",fPct(f.earnings_growth)]].forEach(function(p){var d=document.createElement("div");d.className="fund-item";d.innerHTML='<span class="fund-label">'+p[0]+'</span><span class="fund-val">'+p[1]+"</span>";fGrid.appendChild(d)});
    tWrap.innerHTML="";if(f.target_low!=null&&f.target_high!=null){var cp=quotes[active]?quotes[active].price:0;[["Low",fmt(f.target_low)],["Mean",fmt(f.target_mean)],["High",fmt(f.target_high)],["Analysts",f.num_analysts||"—"],["Wall St",(f.recommendation||"—").toUpperCase()]].forEach(function(r){var d=document.createElement("div");d.className="target-row";d.innerHTML='<span class="target-label">'+r[0]+'</span><span class="target-val">'+r[1]+"</span>";tWrap.appendChild(d)});var rng=f.target_high-f.target_low||1;var bd=document.createElement("div");bd.className="target-bar";bd.innerHTML='<div class="target-bar-fill" style="width:100%"></div>';if(cp>=f.target_low&&cp<=f.target_high){var pos=((cp-f.target_low)/rng)*100;bd.innerHTML+='<div class="target-marker" style="left:'+pos+'%"></div>'}tWrap.appendChild(bd)}}catch(e){}}

async function fetchBatch(){if(!wl.length)return;try{var r=await fetch("/api/batch_analysis?tickers="+encodeURIComponent(wl.join(",")));var j=await r.json();if(j.analyses){bSigs=j.analyses;renderWL();renderAIQ()}}catch(e){}}

var pal=[{l:"#3b82f6",f:"rgba(59,130,246,.06)"},{l:"#f59e0b",f:"rgba(245,158,11,.06)"},{l:"#10b981",f:"rgba(16,185,129,.06)"},{l:"#ef4444",f:"rgba(239,68,68,.06)"},{l:"#8b5cf6",f:"rgba(139,92,246,.06)"},{l:"#06b6d4",f:"rgba(6,182,212,.06)"},{l:"#ec4899",f:"rgba(236,72,153,.06)"},{l:"#f97316",f:"rgba(249,115,22,.06)"}];

function renderMC(){if(mChart){mChart.destroy();mChart=null}var d=hCache[active];if(!d)return;var lb=d.dates.map(function(x){var p=x.split("-");return p[1]+"/"+p[2]});var ds=[];
    if(cmpMode){var i=0;wl.forEach(function(s){var h=hCache[s];if(!h)return;var c=pal[i%pal.length];ds.push({label:s,data:h.prices,borderColor:c.l,backgroundColor:c.f,borderWidth:s===active?2.5:1.5,pointRadius:0,pointHoverRadius:4,fill:false,tension:.3});i++});chartT.textContent="Comparison"}else{ds.push({label:active+" Price",data:d.prices,borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,.06)",borderWidth:2,pointRadius:0,pointHoverRadius:5,pointHoverBackgroundColor:"#3b82f6",fill:true,tension:.3,order:1});ds.push({label:"50-Day SMA",data:d.sma,borderColor:"#f59e0b",borderWidth:2,borderDash:[6,4],pointRadius:0,pointHoverRadius:4,fill:false,tension:.3,order:0,spanGaps:false});chartT.textContent=active+" — Price & SMA"}
    mChart=new Chart(mCanvas.getContext("2d"),{type:"line",data:{labels:lb,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"top",align:"end",labels:{color:"#94a3b8",font:{family:"Inter",size:10,weight:"500"},usePointStyle:true,pointStyle:"line",padding:12}},tooltip:{backgroundColor:"#1e293b",titleColor:"#f1f5f9",bodyColor:"#cbd5e1",borderColor:"#334155",borderWidth:1,cornerRadius:8,padding:8,callbacks:{label:function(c){var v=c.parsed.y;return v==null?null:" "+c.dataset.label+": $"+v.toLocaleString("en-US",{minimumFractionDigits:2})}}}},scales:{x:{grid:{color:"rgba(148,163,184,.04)"},ticks:{color:"#64748b",font:{family:"Inter",size:9},maxTicksLimit:12,maxRotation:0}},y:{grid:{color:"rgba(148,163,184,.04)"},ticks:{color:"#64748b",font:{family:"Inter",size:9},callback:function(v){return"$"+v.toLocaleString()}}}},animation:{duration:500,easing:"easeOutQuart"}}})}

function renderVC(d){if(vChart){vChart.destroy();vChart=null}if(!d.volumes||!d.volumes.length)return;var lb=d.dates.map(function(x){var p=x.split("-");return p[1]+"/"+p[2]});var cl=d.prices.map(function(p,i){return i===0?"rgba(59,130,246,.4)":p>=d.prices[i-1]?"rgba(16,185,129,.5)":"rgba(239,68,68,.5)"});vChart=new Chart(vCanvas.getContext("2d"),{type:"bar",data:{labels:lb,datasets:[{label:"Volume",data:d.volumes,backgroundColor:cl,borderRadius:2,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:"#1e293b",titleColor:"#f1f5f9",bodyColor:"#cbd5e1",borderColor:"#334155",borderWidth:1,cornerRadius:8,callbacks:{label:function(c){return" Vol: "+fV(c.parsed.y)}}}},scales:{x:{display:false},y:{grid:{color:"rgba(148,163,184,.04)"},ticks:{color:"#64748b",font:{size:8},callback:function(v){return fV(v)}}}},animation:{duration:300}}})}

// ══ Tabs ══
document.querySelectorAll(".tab-btn").forEach(function(btn){btn.addEventListener("click",function(){document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.remove("active")});document.querySelectorAll(".tab-content").forEach(function(c){c.classList.remove("active")});btn.classList.add("active");$("tab-"+btn.dataset.tab).classList.add("active")})});

// ══ Portfolio Simulator ══
$("sim-run-btn").addEventListener("click",async function(){var btn=this;btn.disabled=true;btn.textContent="Simulating…";var tk=$("sim-ticker").value.trim().toUpperCase()||active;var amt=parseFloat($("sim-amount").value)||10000;var mo=$("sim-months").value;try{var r=await fetch("/api/portfolio_sim?ticker="+encodeURIComponent(tk)+"&amount="+amt+"&months="+mo);var j=await r.json();if(j.error){toast(j.error,"error");btn.disabled=false;btn.textContent="Simulate";return}$("sim-results").style.display="block";$("sim-investment").textContent=fmt(j.investment);$("sim-current-value").textContent=fmt(j.current_value);var pEl=$("sim-profit");pEl.textContent=(j.profit>=0?"+":"")+fmt(j.profit);pEl.className="sim-stat-value "+(j.profit>=0?"positive":"negative");var rEl=$("sim-return");rEl.textContent=(j.return_pct>=0?"+":"")+j.return_pct+"%";rEl.className="sim-stat-value "+(j.return_pct>=0?"positive":"negative");$("sim-shares").textContent=j.shares+" shares";
    if(simChart){simChart.destroy();simChart=null}var lb=j.dates.map(function(x){var p=x.split("-");return p[1]+"/"+p[2]});simChart=new Chart($("sim-chart").getContext("2d"),{type:"line",data:{labels:lb,datasets:[{label:"Portfolio Value",data:j.portfolio_values,borderColor:j.profit>=0?"#10b981":"#ef4444",backgroundColor:j.profit>=0?"rgba(16,185,129,.08)":"rgba(239,68,68,.08)",borderWidth:2,pointRadius:0,pointHoverRadius:5,fill:true,tension:.3},{label:"Initial Investment",data:j.portfolio_values.map(function(){return j.investment}),borderColor:"#64748b",borderWidth:1,borderDash:[5,5],pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{labels:{color:"#94a3b8",font:{family:"Inter",size:10},usePointStyle:true,pointStyle:"line"}},tooltip:{backgroundColor:"#1e293b",titleColor:"#f1f5f9",bodyColor:"#cbd5e1",borderColor:"#334155",borderWidth:1,cornerRadius:8,callbacks:{label:function(c){return" "+c.dataset.label+": $"+c.parsed.y.toLocaleString("en-US",{minimumFractionDigits:2})}}}},scales:{x:{grid:{color:"rgba(148,163,184,.04)"},ticks:{color:"#64748b",font:{size:9},maxTicksLimit:10,maxRotation:0}},y:{grid:{color:"rgba(148,163,184,.04)"},ticks:{color:"#64748b",font:{size:9},callback:function(v){return"$"+v.toLocaleString()}}}},animation:{duration:600}}})}catch(e){toast("Failed to simulate","error")}btn.disabled=false;btn.textContent="Simulate"});

// ══ Peer Comparison ══
$("peers-load-btn").addEventListener("click",async function(){var btn=this;btn.disabled=true;btn.textContent="Loading…";try{var r=await fetch("/api/peers?tickers="+encodeURIComponent(wl.join(",")));var j=await r.json();if(!j.peers){btn.disabled=false;btn.textContent="Load Comparison";return}var wrap=$("peers-table-wrap");var html='<table class="peers-table"><thead><tr><th>Ticker</th><th>Price</th><th>6M Chg</th><th>Mkt Cap</th><th>P/E</th><th>EPS</th><th>Beta</th><th>Div Yld</th><th>52W H</th><th>52W L</th></tr></thead><tbody>';Object.keys(j.peers).forEach(function(s){var p=j.peers[s];if(p.error)return;var chg=p.change_6m!=null?((p.change_6m>=0?"+":"")+p.change_6m+"%"):"—";var chgCls=p.change_6m>=0?"pos":"neg";html+="<tr><td><strong>"+s+"</strong></td><td>"+(p.price!=null?fmt(p.price):"—")+'</td><td class="'+chgCls+'">'+chg+"</td><td>"+fB(p.market_cap)+"</td><td>"+(p.pe_ratio!=null?p.pe_ratio.toFixed(2):"—")+"</td><td>"+(p.eps!=null?"$"+p.eps.toFixed(2):"—")+"</td><td>"+(p.beta!=null?p.beta.toFixed(2):"—")+"</td><td>"+fPct(p.dividend_yield)+"</td><td>"+(p["52w_high"]!=null?fmt(p["52w_high"]):"—")+"</td><td>"+(p["52w_low"]!=null?fmt(p["52w_low"]):"—")+"</td></tr>"});html+="</tbody></table>";wrap.innerHTML=html}catch(e){toast("Failed to load peers","error")}btn.disabled=false;btn.textContent="Load Comparison"});

// ══ Auto-refresh ══
function startAR(){stopAR();cd=30;cdEl.textContent="30s";rInt=setInterval(function(){fetchQuotes();if(active)fetchHist(active);cd=30},3e4);cdT=setInterval(function(){cd--;if(cd<0)cd=30;cdEl.textContent=cd+"s"},1e3)}
function stopAR(){clearInterval(rInt);clearInterval(cdT);cdEl.textContent="off"}
async function togCmp(){cmpMode=!cmpMode;compTog.classList.toggle("active",cmpMode);if(cmpMode){await Promise.all(wl.map(function(s){return hCache[s]?Promise.resolve():fetchHist(s)}))}renderMC()}

addBtn.addEventListener("click",function(){addTicker(addInp.value)});
addInp.addEventListener("keydown",function(e){if(e.key==="Enter")addTicker(addInp.value)});
autoTog.addEventListener("change",function(){autoTog.checked?startAR():stopAR()});
compTog.addEventListener("click",togCmp);
sbTog.addEventListener("click",function(){sb.classList.toggle("open")});

async function init(){await fetchQuotes();await fetchHist(active);fetchAI(active);fetchFund(active);fetchBatch();startAR()}
window.addEventListener("load",init);
})();
