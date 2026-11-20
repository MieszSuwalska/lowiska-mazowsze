/* Łowiska Mazowsze — ręczne odświeżanie prognoz tylko na tym urządzeniu.
   Nie używa tokenu GitHub ani prywatnego generatora. */
(function () {
  "use strict";
  const button = document.getElementById("manual-refresh");
  const message = document.getElementById("manual-refresh-message");
  if (!button || !message) return;

  const places = [
    {lat:52.36761, lon:20.84485},
    {lat:52.67423, lon:21.58988},
    {lat:52.44798, lon:20.79188}
  ];
  const hours = [8,10,12,14];
  const weekdays = ["niedz.","pon.","wt.","śr.","czw.","pt.","sob."];
  const format = v => v.toFixed(1).replace(".", ",");
  const dayOf = date => new Intl.DateTimeFormat("sv-SE", {
    timeZone:"Europe/Warsaw", year:"numeric", month:"2-digit", day:"2-digit"
  }).format(date);
  const localStamp = () => new Intl.DateTimeFormat("pl-PL", {
    timeZone:"Europe/Warsaw", day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:false
  }).format(new Date());
  const addDays = (day, n) => {
    const d = new Date(day + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate()+n);
    return d.toISOString().slice(0,10);
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const dayLabel = day => {
    const d = new Date(day+"T12:00:00Z");
    return weekdays[d.getUTCDay()]+" "+day.slice(8,10)+"."+day.slice(5,7);
  };
  function classify(x) {
    if (!x) return ["unknown","Brak danych",[]];
    const [t,w,g,r,secondary] = x, causes=[];
    const conflict=Number.isFinite(secondary) && (r>0)!==(secondary>0);
    if(t<6) causes.push("Temperatura poniżej 6°C");
    if(conflict)causes.push("Rozbieżne prognozy: ICON "+format(r)+" mm, ECMWF "+format(secondary)+" mm");
    else if(r>0)causes.push("Opady według ICON"+(Number.isFinite(secondary)&&secondary>0?" i ECMWF":""));
    if(w>7 || g>=10) causes.push("Silny wiatr lub porywy");
    else if(w>4) causes.push("Podwyższony wiatr");
    if(t<6 || w>7 || g>=10 || (r>0&&!conflict)) return ["bad","Wyklucza",causes];
    if(conflict) return ["warn","Prognozy sprzeczne",causes];
    if(w>4) return ["warn","Zagrożenie",causes];
    return ["good","W normie",causes];
  }
  function sample(hourly, day, start) {
    const ts1=day+"T"+String(start).padStart(2,"0")+":00";
    const ts2=day+"T"+String(start+1).padStart(2,"0")+":00";
    const i=hourly.time.indexOf(ts1), j=hourly.time.indexOf(ts2);
    if(i<0 || j<0) return null;
    const take=k=>{
      if(!Array.isArray(hourly[k])) return null;
      const a=hourly[k][i],b=hourly[k][j];
      return Number.isFinite(a)&&Number.isFinite(b)?[a,b]:null;
    };
    const t=take("temperature_2m"),w=take("wind_speed_10m");
    const g=take("wind_gusts_10m"),r=take("precipitation");
    let secondary=null;
    const alt=hourly.ecmwf;
    if(alt&&Array.isArray(alt.time)&&Array.isArray(alt.precipitation)) {
      const i2=alt.time.indexOf(ts1),j2=alt.time.indexOf(ts2);
      if(i2>=0&&j2>=0&&Number.isFinite(alt.precipitation[i2])&&Number.isFinite(alt.precipitation[j2]))secondary=alt.precipitation[i2]+alt.precipitation[j2];
    }
    return t&&w&&g&&r ? [(t[0]+t[1])/2,(w[0]+w[1])/2,Math.max(...g),r[0]+r[1],secondary] : null;
  }
  function mini(start,x) {
    const [state,caption] = classify(x);
    const tip=x
      ? String(start).padStart(2,"0")+":00–"+String(start+2).padStart(2,"0")+
        ":00 | Temp.: "+format(x[0])+"°C | Wiatr: "+format(x[1])+
        " m/s | Porywy: "+format(x[2])+" m/s | ICON: "+format(x[3])+" mm | ECMWF: "+(Number.isFinite(x[4])?format(x[4])+" mm":"brak danych")
      : "Brak danych";
    return '<div class="mini-slot mini-'+state+'" title="'+escape(tip)+'"><div class="mini-time">'+
      String(start).padStart(2,"0")+"–"+String(start+2).padStart(2,"0")+
      '</div><div class="mini-caption txt-'+state+'">'+caption+'</div></div>';
  }
  function metric(label,value,state) {
    return '<div class="metric txt-'+state+'"><strong>'+label+':</strong> '+escape(value)+'</div>';
  }
  function slot(start,x) {
    const [state,caption,causes] = classify(x);
    let html='<article class="slot slot-'+state+'"><div class="slot-time">'+
      String(start).padStart(2,"0")+':00–'+String(start+2).padStart(2,"0")+':00</div>';
    if(!x) {
      html+='<div class="metric txt-unknown">Brak prognozy godzinowej; ocena niemożliwa.</div>';
    } else {
      const [t,w,g,r,secondary]=x;
      const conflict=Number.isFinite(secondary)&&(r>0)!==(secondary>0);
      html+=metric("Temperatura",format(t)+"°C",t<6?"bad":"good");
      html+=metric("Wiatr",format(w)+" m/s",w>7||g>=10?"bad":w>4?"warn":"good");
      html+=metric("Porywy",format(g)+" m/s",g>=10?"bad":w>4?"warn":"good");
      html+=metric("Opady ICON",format(r)+" mm / 2 godz.",conflict?"warn":r>0?"bad":"good");
      html+=metric("Opady ECMWF",Number.isFinite(secondary)?format(secondary)+" mm / 2 godz.":"brak danych",conflict?"warn":!Number.isFinite(secondary)?"unknown":secondary>0?"bad":"good");
      if(r>0) {
        const kind=r>=5?"bardzo duże":r>=2?"duże":r>=0.5?"umiarkowane":"małe";
        html+='<div class="metric txt-'+(conflict?"warn":"bad")+'"><strong>ICON przewiduje: '+kind+' opady</strong></div>';
      }
    }
    html+='<div class="slot-status txt-'+state+'"><i class="dot '+state+'"></i>'+caption+'</div>';
    if(causes.length) html+='<div class="reason">'+escape(causes.join("; "))+'</div>';
    return html+'</article>';
  }
  function dayCard(day,slots,open) {
    const states=slots.map(x=>classify(x)[0]);
    const state=states.includes("bad")?"bad":states.includes("unknown")?"unknown":
      states.includes("warn")?"warn":"good";
    const summary=state==="bad"?"Występują warunki wykluczające":
      state==="unknown"?"Brak pełnej prognozy":
      state==="warn"?"Występują zagrożenia lub rozbieżności prognoz":"Wszystko w normie";
    return '<details class="day-card day-'+state+'"'+(open?' open':'')+
      '><summary class="day-head"><div class="day-top"><span class="day-badge badge-'+state+'">'+
      dayLabel(day)+'</span><span class="day-summary txt-'+state+'">'+summary+
      '</span></div><div class="mini-grid">'+hours.map((h,i)=>mini(h,slots[i])).join("")+
      '</div></summary><div class="day-details"><div class="slot-grid">'+
      hours.map((h,i)=>slot(h,slots[i])).join("")+'</div></div></details>';
  }
  async function getForecast(place) {
    async function one(model,variables) {
      const url=new URL("https://api.open-meteo.com/v1/forecast");
      url.search=new URLSearchParams({
        latitude:String(place.lat),longitude:String(place.lon),
        hourly:variables,models:model,
        wind_speed_unit:"ms",timezone:"Europe/Warsaw",forecast_days:"3"
      }).toString();
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
      try {
        const res=await fetch(url.toString(),{cache:"no-store",signal:controller.signal});
        if(!res.ok)throw Error(model+" HTTP "+res.status);
        const data=await res.json();
        if(!data.hourly||!Array.isArray(data.hourly.time))throw Error("Brak danych "+model);
        return data.hourly;
      }finally{clearTimeout(timeout);}
    }
    const main=await one("icon_eu","temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m");
    let ecmwf=null;
    try {ecmwf=await one("ecmwf_ifs025","precipitation");}
    catch(err){console.warn("ECMWF niedostępny",err);}
    return {...main,ecmwf};
  }
  async function refresh() {
    button.disabled=true;
    button.textContent="Pobieranie…";
    message.textContent="Pobieram aktualne dane Open-Meteo dla trzech łowisk…";
    message.className="manual-feedback";
    try {
      const forecasts=await Promise.all(places.map(getForecast));
      const sections=Array.from(document.querySelectorAll("main > section.box"))
        .filter(el=>/^([123])\.\s/.test(el.querySelector("h2")?.textContent||""));
      if(sections.length!==3) throw Error("Nie znaleziono trzech łowisk w raporcie.");
      const base=dayOf(new Date());
      // Całość obliczamy przed podmianą, aby w przypadku błędu nie zostawić pół raportu.
      const htmls=forecasts.map((hourly,i)=>{
        const oldOpen=Array.from(sections[i].querySelectorAll(".day-card")).map(el=>el.open);
        return [0,1,2].map(j=>{
          const day=addDays(base,j);
          return dayCard(day,hours.map(h=>sample(hourly,day,h)),Boolean(oldOpen[j]));
        }).join("");
      });
      if(!htmls.some(s=>s.includes('slot-'))) throw Error("Nie otrzymano prognozy.");
      sections.forEach((sec,i)=>{sec.querySelector(".days").innerHTML=htmls[i];});
      const meta=document.querySelector(".meta");
      if(meta) {
        meta.setAttribute("data-report-day",base);
        const tags=meta.querySelectorAll(".tag");
        if(tags[1])tags[1].textContent="Dni: "+base+" – "+addDays(base,2);
        if(tags[2])tags[2].textContent="Dane pobrano ręcznie: "+localStamp()+" CET/CEST";
      }
      const warning=document.getElementById("stale-warning");
      if(warning)warning.hidden=true;
      const source=document.querySelector('a[href="https://open-meteo.com/en/docs"]');
      if(source&&source.parentElement)
        source.parentElement.innerHTML='<a href="https://open-meteo.com/en/docs">Open-Meteo — prognozy godzinowe</a> · pobrano ręcznie '+escape(localStamp());
      message.textContent="✓ Aktualne prognozy pobrane dla 3 łowisk: "+localStamp()+". Wyniki są widoczne na tym urządzeniu; nie zmieniają raportu na GitHub.";
      message.className="manual-feedback ok";
    } catch(error) {
      message.textContent="Nie udało się pobrać nowych danych ("+error.message+"). Pozostawiono ostatni opublikowany raport. Spróbuj ponownie.";
      message.className="manual-feedback error";
    } finally {
      button.disabled=false;
      button.textContent="↻ Odśwież";
    }
  }
  button.addEventListener("click",refresh);
  // Niezależnie od harmonogramu GitHub pobierz dane przy otwarciu strony.
  // Ponów po powrocie do aplikacji, gdy od poprzedniej próby minęło 30 minut.
  let lastAttempt=0;
  async function autoRefresh() {
    if(button.disabled || Date.now()-lastAttempt<30*60*1000)return;
    lastAttempt=Date.now();
    await refresh();
  }
  if(document.readyState==="complete")autoRefresh();
  else window.addEventListener("load",autoRefresh,{once:true});
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="visible")autoRefresh();
  });
})();