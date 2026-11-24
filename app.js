// 3地点お天気ナビ（tenki.jp版）
// 予報データは GitHub Actions が tenki.jp（日本気象協会）から毎時取得して
// weather.json に保存したものを読み込む。地点は places.json で管理する。
const $ = (id) => document.getElementById(id);
const weatherCards = $("weatherCards");

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmtTemp(v){return Number.isFinite(v)?`${Math.round(v)}°`:"--";}
function fmtProb(v){return Number.isFinite(v)?`${v}%`:"--%";}

// tenki.jpの天気テキスト（晴れ・曇のち雨・雪など）から絵文字を選ぶ
function emojiFor(text){
  const t=String(text||"");
  if(t.includes("雷"))return "⛈️";
  if(t.includes("雪"))return t.includes("大雪")?"❄️":"🌨️";
  if(t.includes("雨"))return (t.includes("小雨")||t.includes("にわか"))?"🌦️":"🌧️";
  if(t.includes("霧"))return "🌫️";
  const hare=t.includes("晴"), kumo=t.includes("曇")||t.includes("くもり");
  if(hare&&kumo)return "⛅";
  if(hare)return "☀️";
  if(kumo)return "☁️";
  return "🌡️";
}
function maxProb(day){
  const slots=(day?.precipSlots||[]).filter(Number.isFinite);
  return slots.length?Math.max(...slots):null;
}
function hourLabel(h){return `${String(h===24?0:h).padStart(2,"0")}時`;}
function currentHourEntry(place){
  const nowH=new Date().getHours();
  const target=nowH===0?24:nowH;
  return place.hourly.find(e=>e.hour===target)||place.hourly[place.hourly.length-1]||null;
}
function renderError(place){
  return `<article class="weather-card"><h2>${esc(place?.name||"地点")}</h2><p class="error">天気を取得できませんでした。通信環境を確認して、更新ボタンを押してください。</p></article>`;
}
function renderCard(place){
  const today=place.today, tomorrow=place.tomorrow;
  const cur=currentHourEntry(place);
  const curLabel=cur?.weather||today.telop;
  const curEmoji=emojiFor(curLabel);
  const todayProb=maxProb(today);
  const nowH=new Date().getHours();
  const fromHour=nowH===0?1:nowH;
  const hourItems=place.hourly.filter(e=>e.hour>=fromHour).map(e=>
    `<div class="hour"><div class="hour-time">${hourLabel(e.hour)}</div><div class="hour-icon">${emojiFor(e.weather)}</div><div class="hour-temp">${fmtTemp(e.temp)}</div><div class="hour-rain">☔ ${fmtProb(e.prob)}</div></div>`
  ).join("");
  const dayRow=(label,md,telop,max,min,prob)=>
    `<div class="day"><span class="day-name">${esc(label)}<br><small>${esc(md)}</small></span><span class="day-icon" title="${esc(telop)}">${emojiFor(telop)}</span><span class="day-range">${fmtTemp(max)} / ${fmtTemp(min)}</span><span class="day-rain">☔ ${fmtProb(prob)}</span></div>`;
  const mdOf=(dateStr)=>{const d=new Date(dateStr+"T12:00:00");return d.toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"});};
  let days=dayRow("今日",mdOf(today.date),today.telop,today.max,today.min,todayProb);
  if(tomorrow)days+=dayRow("明日",mdOf(tomorrow.date),tomorrow.telop,tomorrow.max,tomorrow.min,maxProb(tomorrow));
  for(const d of (place.daily||[])){
    const m=/(\d+)月(\d+)日\((.)\)/.exec(d.dateLabel||"");
    const label=m?m[3]:"", md=m?`${m[1]}/${m[2]}`:"";
    days+=dayRow(label,md,d.telop,d.max,d.min,d.prob);
    if((days.match(/class="day"/g)||[]).length>=7)break;
  }
  return `<article class="weather-card">
    <div class="card-head"><div><h2 class="place-name">${esc(place.name)}</h2><p class="area">${esc(place.admin||"設定地点")}</p></div><div class="rain-pill">☔ 今日 ${fmtProb(todayProb)}</div></div>
    <div class="current-row"><div class="weather-emoji">${curEmoji}</div><div><div class="temperature">${fmtTemp(cur?.temp)}</div><div class="condition">${esc(curLabel)} · 今日は${esc(today.telop)}</div><div class="minmax">最高 ${fmtTemp(today.max)}　最低 ${fmtTemp(today.min)}</div></div></div>
    <div class="hint">湿度 ${cur&&Number.isFinite(cur.humidity)?Math.round(cur.humidity)+"%":"--"}　・　風 ${esc(cur?.windDir||"")} ${cur&&Number.isFinite(cur.windSpeed)?cur.windSpeed+"m/s":"--"}（今日の最大風速 ${esc(today.wind||"--")}）</div>
    <div class="divider"></div><h3 class="subheading">今日の時間帯別予報</h3><div class="hourly">${hourItems}</div>
    <div class="divider"></div><h3 class="subheading">7日間の予報 <small>（最高 / 最低気温・降水確率）</small></h3><div class="daily">${days}</div>
    <p class="hint">出典：<a href="${esc(place.url)}" target="_blank" rel="noreferrer">tenki.jp ${esc(place.name)}のページ</a></p>
  </article>`;
}
async function refresh(){
  $("loading").hidden=false;$("refreshBtn").disabled=true;
  try{
    const res=await fetch(`./weather.json?t=${Date.now()}`,{cache:"no-store"});
    if(!res.ok)throw new Error("fetch error");
    const data=await res.json();
    weatherCards.innerHTML=data.places.map(p=>{try{return renderCard(p);}catch(e){return renderError(p);}}).join("");
    const upd=new Date(data.updated);
    $("updatedAt").textContent=`最終更新：${upd.toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})} ${upd.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}（tenki.jpのデータ）`;
  }catch(e){
    weatherCards.innerHTML=`<article class="weather-card"><p class="error">天気を取得できませんでした。通信環境を確認して、更新ボタンを押してください。</p></article>`;
    $("updatedAt").textContent="天気を読み込めませんでした";
  }
  $("loading").hidden=true;$("refreshBtn").disabled=false;
}
$("refreshBtn").addEventListener("click",refresh);
$("settingsToggle").addEventListener("click",()=>{
  const body=$("settingsBody"),opening=body.hidden;
  body.hidden=!opening;$("settingsToggle").textContent=opening?"閉じる −":"確認する ＋";
  $("settingsToggle").setAttribute("aria-expanded",String(opening));
});
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
refresh();
