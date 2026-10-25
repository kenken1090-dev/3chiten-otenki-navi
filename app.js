const DEFAULT_PLACES = [
  { name: "八千代市", admin: "千葉県", latitude: 35.722, longitude: 140.099 },
  { name: "志村坂上", admin: "東京都板橋区", latitude: 35.776, longitude: 139.694 },
  { name: "京橋（東京）", admin: "東京都中央区", latitude: 35.676, longitude: 139.771 }
];
const STORE_KEY = "three-place-weather-v1";
let places = loadPlaces();
let activeInput = null;

const $ = (id) => document.getElementById(id);
const weatherCards = $("weatherCards");
const weatherText = {
  0:["快晴","☀️"],1:["おおむね晴れ","🌤️"],2:["晴れ時々くもり","⛅"],3:["くもり","☁️"],
  45:["霧","🌫️"],48:["霧氷を伴う霧","🌫️"],51:["弱い霧雨","🌦️"],53:["霧雨","🌦️"],55:["強い霧雨","🌧️"],
  56:["凍る弱い霧雨","🌧️"],57:["凍る霧雨","🌧️"],61:["弱い雨","🌦️"],63:["雨","🌧️"],65:["強い雨","🌧️"],
  66:["凍る弱い雨","🌧️"],67:["凍る雨","🌧️"],71:["弱い雪","🌨️"],73:["雪","🌨️"],75:["大雪","❄️"],
  77:["雪あられ","🌨️"],80:["にわか雨","🌦️"],81:["強いにわか雨","🌧️"],82:["激しいにわか雨","⛈️"],
  85:["にわか雪","🌨️"],86:["強いにわか雪","❄️"],95:["雷雨","⛈️"],96:["ひょうを伴う雷雨","⛈️"],99:["強いひょうを伴う雷雨","⛈️"]
};
function condition(code){return weatherText[code] || ["天気情報なし","🌡️"];}
function loadPlaces(){
  try { const saved=JSON.parse(localStorage.getItem(STORE_KEY)); if(Array.isArray(saved)&&saved.length===3&&saved.every(p=>p.latitude!=null&&p.longitude!=null))return saved; } catch(e){}
  return DEFAULT_PLACES.map(p=>({...p}));
}
function savePlaces(){localStorage.setItem(STORE_KEY,JSON.stringify(places));}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmtTemp(v){return Number.isFinite(v)?`${Math.round(v)}°`:"--";}
function dayLabel(date,index){
  if(index===0)return "今日"; if(index===1)return "明日";
  return new Date(date+"T12:00:00").toLocaleDateString("ja-JP",{weekday:"short"});
}
function hourLabel(dateTime){
  const d=new Date(dateTime);
  return `${String(d.getHours()).padStart(2,"0")}時`;
}
function renderError(place,error){
  return `<article class="weather-card"><h2>${esc(place.name)}</h2><p class="error">天気を取得できませんでした。通信環境を確認して、更新ボタンを押してください。</p></article>`;
}
async function getWeather(place){
  const params=new URLSearchParams({
    latitude:place.latitude,longitude:place.longitude,timezone:"Asia/Tokyo",forecast_days:"7",
    current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    hourly:"temperature_2m,precipitation_probability,weather_code",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  });
  const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if(!response.ok)throw new Error("API error");
  return response.json();
}
function renderCard(place,data,index){
  const cur=data.current, d=data.daily, h=data.hourly;
  const [label,emoji]=condition(cur.weather_code);
  const todayMax=d.temperature_2m_max?.[0], todayMin=d.temperature_2m_min?.[0];
  const now=new Date();
  const currentHour=now.getHours();
  let hourItems=[];
  for(let i=0;i<h.time.length;i++){
    const dt=new Date(h.time[i]);
    if(dt.toDateString()===now.toDateString() && dt.getHours()>=currentHour){
      const [hl,he]=condition(h.weather_code[i]);
      hourItems.push(`<div class="hour"><div class="hour-time">${hourLabel(h.time[i])}</div><div class="hour-icon">${he}</div><div class="hour-temp">${fmtTemp(h.temperature_2m[i])}</div><div class="hour-rain">☔ ${h.precipitation_probability[i]??"--"}%</div></div>`);
    }
  }
  if(hourItems.length===0){
    for(let i=0;i<Math.min(8,h.time.length);i++){
      const [hl,he]=condition(h.weather_code[i]);
      hourItems.push(`<div class="hour"><div class="hour-time">${hourLabel(h.time[i])}</div><div class="hour-icon">${he}</div><div class="hour-temp">${fmtTemp(h.temperature_2m[i])}</div><div class="hour-rain">☔ ${h.precipitation_probability[i]??"--"}%</div></div>`);
    }
  }
  const days=d.time.map((date,i)=>{
    const [dl,de]=condition(d.weather_code[i]);
    return `<div class="day"><span class="day-name">${dayLabel(date,i)}<br><small>${new Date(date+"T12:00:00").toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})}</small></span><span class="day-icon" title="${esc(dl)}">${de}</span><span class="day-range">${fmtTemp(d.temperature_2m_max[i])} / ${fmtTemp(d.temperature_2m_min[i])}</span><span class="day-rain">☔ ${d.precipitation_probability_max?.[i]??"--"}%</span></div>`;
  }).join("");
  return `<article class="weather-card">
    <div class="card-head"><div><h2 class="place-name">${esc(place.name)}</h2><p class="area">${esc(place.admin||"設定地点")}</p></div><div class="rain-pill">☔ 今日 ${d.precipitation_probability_max?.[0]??"--"}%</div></div>
    <div class="current-row"><div class="weather-emoji">${emoji}</div><div><div class="temperature">${fmtTemp(cur.temperature_2m)}</div><div class="condition">${esc(label)} · 体感 ${fmtTemp(cur.apparent_temperature)}</div><div class="minmax">最高 ${fmtTemp(todayMax)}　最低 ${fmtTemp(todayMin)}</div></div></div>
    <div class="hint">湿度 ${Math.round(cur.relative_humidity_2m??0)}%　・　風速 ${Math.round(cur.wind_speed_10m??0)} km/h</div>
    <div class="divider"></div><h3 class="subheading">今日の時間帯別予報</h3><div class="hourly">${hourItems.join("")}</div>
    <div class="divider"></div><h3 class="subheading">7日間の予報 <small>（最高 / 最低気温・降水確率）</small></h3><div class="daily">${days}</div>
  </article>`;
}
async function refresh(){
  $("loading").hidden=false;$("refreshBtn").disabled=true;
  weatherCards.innerHTML="";
  const results=await Promise.all(places.map(async(place,index)=>{
    try{return {html:renderCard(place,await getWeather(place),index)}}
    catch(e){return {html:renderError(place,e)}}
  }));
  weatherCards.innerHTML=results.map(r=>r.html).join("");
  $("updatedAt").textContent=`最終更新：${new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}`;
  $("loading").hidden=true;$("refreshBtn").disabled=false;
}
$("refreshBtn").addEventListener("click",refresh);
$("settingsToggle").addEventListener("click",()=>{
  const body=$("settingsBody"),opening=body.hidden;
  body.hidden=!opening;$("settingsToggle").textContent=opening?"閉じる −":"変更する ＋";
  $("settingsToggle").setAttribute("aria-expanded",String(opening));
  if(opening)places.forEach((p,i)=>{$(`place${i}`).value=p.name;});
});
["place0","place1","place2"].forEach((id,i)=>{
  $(id).addEventListener("focus",()=>{activeInput=i;});
  $(id).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();searchPlace($(id).value,i);}});
  $(id).addEventListener("change",()=>{if($(id).value.trim())searchPlace($(id).value,i);});
});
async function searchPlace(query,index){
  if(!query.trim())return;
  const box=$("searchResults");box.hidden=false;box.innerHTML='<div class="result-btn">場所を検索中…</div>';
  try{
    const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=ja&format=json`;
    const res=await fetch(url);const json=await res.json();
    if(!json.results?.length){box.innerHTML='<div class="result-btn">候補が見つかりませんでした。市区町村名などで検索してください。</div>';return;}
    box.innerHTML=json.results.map((r,i)=>`<button class="result-btn" data-index="${i}">${esc(r.name)}<small>${esc([r.admin1,r.admin2,r.country].filter(Boolean).join(" · "))}</small></button>`).join("");
    [...box.querySelectorAll("button")].forEach((btn,i)=>btn.addEventListener("click",()=>{
      const r=json.results[i];places[index]={name:r.name,admin:[r.admin1,r.admin2].filter(Boolean).join(" "),latitude:r.latitude,longitude:r.longitude};
      savePlaces();box.hidden=true;box.innerHTML="";refresh();
      $(`place${index}`).value=r.name;
    }));
  }catch(e){box.innerHTML='<div class="result-btn">検索できませんでした。通信環境を確認してください。</div>';}
}
$("resetBtn").addEventListener("click",()=>{
  places=DEFAULT_PLACES.map(p=>({...p}));savePlaces();
  places.forEach((p,i)=>{const input=$(`place${i}`);if(input)input.value=p.name;});
  $("searchResults").hidden=true;refresh();
});
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
refresh();
