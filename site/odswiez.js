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
    const [t,w,g,r] = x, causes=[];
    if(t<6) causes.push("Temperatura poniżej 6°C");
    if(r>0) causes.push("Prognozowane opady");
    if(w>7 || g>=10) causes.push("Silny wiatr lub porywy");
    else if(w>4) causes.push("Podwyższony wiatr");
    if(t<6 || r>0 || w>7 || g>=10) return ["bad","Wyklucza",causes];
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
    return t&&w&&g&&r ? [(t[0]+t[1])/2,(w[0]+w[1])/2,Math.max(...g),r[0]+r[1]] : null;
  }
  function mini(start,x) {
    const [state,caption] = classify(x);
    const tip=x
      ? String(start).padStart(2,"0")+":00–"+String(start+2).padStart(2,"0")+
        ":00 | Temp.: "+format(x[0])+"°C | Wiatr: "+format(x[1])+
        " m/s | Porywy: "+format(x[2])+" m/s | Opady: "+format(x[3])+" mm / 2 godz."
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
      const [t,w,g,r]=x;
      html+=metric("Temperatura",format(t)+"°C",t<6?"bad":"good");
      html+=metric("Wiatr",format(w)+" m/s",w>7||g>=10?"bad":w>4?"warn":"good");
      html+=metric("Porywy",format(g)+" m/s",g>=10?"bad":w>4?"warn":"good");
      html+=metric("Opady",format(r)+" mm / 2 godz.",r>0?"bad":"good");
      if(r>0) {
        const kind=r>=5?"bardzo duże":r>=2?"duże":r>=0.5?"umiarkowane":"małe";
        html+='<div class="metric txt-bad"><strong>Deszcz: '+kind+' opady</strong></div>';
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
      state==="warn"?"Występują zagrożenia":"Wszystko w normie";
    return '<details class="day-card day-'+state+'"'+(open?' open':'')+
      '><summary class="day-head"><div class="day-top"><span class="day-badge badge-'+state+'">'+
      dayLabel(day)+'</span><span class="day-summary txt-'+state+'">'+summary+
      '</span></div><div class="mini-grid">'+hours.map((h,i)=>mini(h,slots[i])).join("")+
      '</div></summary><div class="day-details"><div class="slot-grid">'+
      hours.map((h,i)=>slot(h,slots[i])).join("")+'</div></div></details>';
  }
  async function getForecast(place) {
    const url=new URL("https://api.open-meteo.com/v1/forecast");
    url.search=new URLSearchParams({
      latitude:String(place.lat), longitude:String(place.lon),
      hourly:"temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m",
      wind_speed_unit:"ms",timezone:"Europe/Warsaw",forecast_days:"3"
    }).toString();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),25000);
    try {
      const response=await fetch(url.toString(),{cache:"no-store",signal:controller.signal});
      if(!response.ok) throw Error("Open-Meteo HTTP "+response.status);
      const data=await response.json();
      const h=data.hourly;
      if(!h || !Array.isArray(h.time) || !h.time.length) throw Error("Brak danych godzinowych");
      return h;
    } finally {clearTimeout(timeout);}
  }
  async function refresh() {
    button.disabled=true;
    button.textContent="Pobieranie prognozy…";
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
      button.textContent="↻ Pobierz aktualną prognozę";
    }
  }
  button.addEventListener("click",refresh);
})();